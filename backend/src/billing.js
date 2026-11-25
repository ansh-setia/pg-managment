import { Setting, Tenant, Payment, DEFAULT_SHARING_TIERS } from './models.js';
import { dueDateFor, monthStart, nextMonth } from './util.js';
import crypto from 'crypto';

export async function getSettings() {
  let s = await Setting.findOne({ key: 'pg' });
  if (!s) {
    s = await Setting.create({ key: 'pg', sharingDefaults: DEFAULT_SHARING_TIERS });
  } else if (!s.sharingDefaults || s.sharingDefaults.length === 0) {
    s.sharingDefaults = DEFAULT_SHARING_TIERS;
    await s.save();
  }
  return s;
}

export const receiptNo = (month) => `RCP-${month.replace('-', '')}-${crypto.randomInt(100000, 999999)}`;
export const settlementNo = () => `SET-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${crypto.randomInt(1000, 9999)}`;

export async function recordPaymentTransaction(paymentId, { amount, method, reference, note, recordedBy }) {
  const payment = await Payment.findById(paymentId).populate('tenant');
  if (!payment) throw new Error('Payment record nahi mila');
  const amt = Number(amount);
  if (!(amt > 0)) throw new Error('Amount sahi daalo');

  const curPaid = payment.paidAmount || (payment.status === 'paid' ? payment.total : 0);
  const remaining = payment.total - curPaid;
  if (amt > remaining) throw new Error(`Maximum baaki amount ₹${remaining} hai`);

  const recNo = receiptNo(payment.month);
  const newPaid = curPaid + amt;
  const isComplete = newPaid >= payment.total;

  const tx = {
    amount: amt,
    paidAt: new Date(),
    method: method || 'cash',
    reference: reference || '',
    receiptNo: recNo,
    recordedBy: recordedBy || null,
    note: note || '',
  };

  if (!payment.transactions) payment.transactions = [];
  payment.transactions.push(tx);
  payment.paidAmount = newPaid;
  if (isComplete) {
    payment.status = 'paid';
    payment.paidAt = new Date();
    payment.receiptNo = recNo;
    payment.method = method || payment.method;
  } else {
    payment.status = 'partial';
  }

  await payment.save();
  return { payment, transaction: tx, balanceRemaining: Math.max(0, payment.total - newPaid) };
}

const rentOps = (tenants, month, dueDay) =>
  tenants.map((t) => ({
    updateOne: {
      filter: { tenant: t._id, month, kind: 'rent' },
      update: {
        $setOnInsert: {
          rent: t.rent,
          food: t.foodCharge,
          electricity: 0,
          total: t.rent + t.foodCharge,
          status: 'due',
          dueDate: dueDateFor(month, dueDay),
        },
      },
      upsert: true,
    },
  }));

// Idempotent: creates the month's rent entry for every active tenant who joined before the month ended.
export async function ensureDues(month, onlyTenant) {
  const { dueDay } = await getSettings();
  const filter = onlyTenant
    ? { _id: onlyTenant }
    : { status: { $in: ['active', 'notice'] }, joinedOn: { $lt: monthStart(nextMonth(month)) } };
  const tenants = await Tenant.find(filter);
  if (tenants.length) await Payment.bulkWrite(rentOps(tenants, month, dueDay), { ordered: false });
}

// Electricity for readings of month M is billed together with rent of month M+1.
export async function addElectricity(tenant, billMonth, amount) {
  if (!amount) return;
  const month = nextMonth(billMonth);
  const { dueDay } = await getSettings();
  await ensureDues(month, tenant._id);
  const merged = await Payment.findOneAndUpdate(
    { tenant: tenant._id, month, kind: 'rent', status: 'due', gatewayOrderId: null },
    { $inc: { electricity: amount, total: amount } },
  );
  if (merged) return;
  // Rent already paid (or payment in progress): bill electricity separately.
  await Payment.findOneAndUpdate(
    { tenant: tenant._id, month, kind: 'electricity', status: 'due' },
    { $inc: { electricity: amount, total: amount }, $setOnInsert: { rent: 0, food: 0, dueDate: dueDateFor(month, dueDay) } },
    { upsert: true },
  );
}

export async function createRazorpayOrder(amountPaise, receipt, { keyId, keySecret }) {
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64'),
    },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt }),
  });
  if (!res.ok) throw new Error('Razorpay order nahi bana: ' + (await res.text()));
  return res.json();
}

export const verifyRazorpaySignature = (orderId, paymentId, signature, secret) => {
  const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
