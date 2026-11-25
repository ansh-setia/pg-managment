import { Router } from 'express';
import crypto from 'crypto';
import { Tenant, Payment, MeterReading, Complaint, MenuDay, FoodSkip, MenuRating, Settlement, Bed, Leave } from '../models.js';
import { config } from '../config.js';
import { ensureDues, getSettings, receiptNo, createRazorpayOrder, verifyRazorpaySignature } from '../billing.js';
import { sendWhatsApp } from '../notify.js';
import { HttpError, isDate, isMonth, monthStr, todayStr, weekDates, wrap } from '../util.js';

const r = Router();

async function me(req) {
  const t = await Tenant.findOne({ user: req.user._id, status: { $in: ['active', 'notice'] } }).populate('room bed');
  if (!t) throw new HttpError(404, 'Tenant record not found. Please contact the manager.');
  return t;
}
const monthParam = (q) => {
  const m = q || monthStr();
  if (!isMonth(m)) throw new HttpError(400, 'Invalid month format');
  return m;
};

// ---- Screen 1: rent ----
r.get('/dashboard', wrap(async (req, res) => {
  const t = await me(req);
  const month = monthParam(req.query.month);
  await ensureDues(month, t._id);
  const payments = await Payment.find({ tenant: t._id, month }).sort({ kind: 1 });
  const dueTotal = payments.reduce((s, p) => {
    const paid = p.paidAmount || (p.status === 'paid' ? p.total : 0);
    return s + Math.max(0, p.total - paid);
  }, 0);
  const history = await Payment.find({ tenant: t._id, status: { $in: ['paid', 'partial'] }, month: { $ne: month } }).sort({ paidAt: -1 }).limit(6);
  res.json({
    tenant: {
      id: t._id,
      name: t.name,
      room: t.room?.number,
      bed: t.bed?.label,
      rent: t.rent,
      food: t.foodCharge,
      deposit: t.deposit,
      status: t.status,
      notice: t.notice,
    },
    month,
    payments: payments.map((p) => ({
      _id: p._id,
      month: p.month,
      kind: p.kind,
      rent: p.rent,
      food: p.food,
      electricity: p.electricity,
      total: p.total,
      paidAmount: p.paidAmount || (p.status === 'paid' ? p.total : 0),
      balanceRemaining: Math.max(0, p.total - (p.paidAmount || (p.status === 'paid' ? p.total : 0))),
      status: p.status,
      dueDate: p.dueDate,
      paidAt: p.paidAt,
      receiptNo: p.receiptNo,
      transactions: p.transactions || [],
    })),
    dueTotal,
    paid: payments.length > 0 && dueTotal === 0,
    history,
  });
}));

r.post('/pay/order', wrap(async (req, res) => {
  const t = await me(req);
  const month = monthParam(req.body.month);
  const dues = await Payment.find({ tenant: t._id, month, status: { $in: ['due', 'partial'] } });
  if (!dues.length) throw new HttpError(400, 'No outstanding dues for this month');
  const total = dues.reduce((s, p) => s + Math.max(0, p.total - (p.paidAmount || 0)), 0);
  const rz = config.razorpay;
  let mode, orderId;
  if (rz.keyId && rz.keySecret) {
    mode = 'razorpay';
    orderId = (await createRazorpayOrder(total * 100, `${t._id}-${month}`.slice(0, 40), rz)).id;
  } else {
    if (!config.allowMock) throw new HttpError(503, 'Payment gateway is not configured');
    mode = 'mock';
    orderId = 'mock_' + crypto.randomUUID();
  }
  await Payment.updateMany({ _id: { $in: dues.map((d) => d._id) } }, { gatewayOrderId: orderId });
  const s = await getSettings();
  res.json({ mode, orderId, amount: total * 100, keyId: rz.keyId, name: s.name, phone: t.phone });
}));

r.post('/pay/confirm', wrap(async (req, res) => {
  const t = await me(req);
  const month = monthParam(req.body.month);
  const { orderId, paymentId, signature } = req.body;
  const dues = await Payment.find({ tenant: t._id, month, status: { $in: ['due', 'partial'] }, gatewayOrderId: orderId });
  if (!dues.length) throw new HttpError(400, 'Payment order not found or already paid');
  const rz = config.razorpay;
  if (rz.keyId && rz.keySecret) {
    if (!verifyRazorpaySignature(orderId, paymentId, signature, rz.keySecret)) throw new HttpError(400, 'Payment verification failed');
  } else if (!(config.allowMock && String(orderId).startsWith('mock_'))) {
    throw new HttpError(400, 'Mock payment is not allowed');
  }
  const rcpt = receiptNo(month);
  for (const p of dues) {
    const remaining = p.total - (p.paidAmount || 0);
    p.paidAmount = p.total;
    p.status = 'paid';
    p.paidAt = new Date();
    p.method = rz.keyId ? 'razorpay' : 'mock';
    p.gatewayPaymentId = paymentId;
    p.receiptNo = rcpt;
    if (!p.transactions) p.transactions = [];
    p.transactions.push({
      amount: remaining,
      paidAt: new Date(),
      method: 'online',
      reference: paymentId || orderId,
      receiptNo: rcpt,
      note: 'Online payment via App',
    });
    await p.save();
  }
  const total = dues.reduce((s, p) => s + p.total, 0);
  await sendWhatsApp(t.phone, 'rent_receipt', { name: t.name, month, amount: total, receiptNo: rcpt });
  res.json({ ok: true, receiptNo: rcpt });
}));

r.post('/notice', wrap(async (req, res) => {
  const t = await me(req);
  const { vacatingDate, reason = 'personal', note = '' } = req.body;
  if (!vacatingDate) throw new HttpError(400, 'Vacating date is required');
  const vDate = new Date(vacatingDate);
  if (isNaN(vDate.getTime()) || vDate < new Date()) {
    throw new HttpError(400, 'Please select a valid future date');
  }
  t.status = 'notice';
  t.noticeDate = new Date();
  t.notice = {
    requestedAt: new Date(),
    vacatingDate: vDate,
    reason,
    note,
    status: 'active',
  };
  await t.save();
  if (t.bed) await Bed.updateOne({ _id: t.bed._id }, { status: 'notice' });
  res.json({ ok: true, notice: t.notice });
}));

r.get('/settlement', wrap(async (req, res) => {
  const s = await Settlement.findOne({ user: req.user._id }).sort({ createdAt: -1 });
  if (!s) throw new HttpError(404, 'Settlement statement not found');
  const settings = await getSettings();
  res.json({ pg: settings.name, settlement: s });
}));

// ---- Leave & Night Out Pass ----
r.post('/leave', wrap(async (req, res) => {
  const t = await me(req);
  const { startDate, endDate, reason, destination = 'Home' } = req.body;
  if (!startDate || !endDate) throw new HttpError(400, 'Start and end dates are required');
  if (!reason?.trim()) throw new HttpError(400, 'Please provide a reason for leave');

  const sDate = new Date(startDate);
  const eDate = new Date(endDate);
  if (isNaN(sDate.getTime()) || isNaN(eDate.getTime()) || eDate < sDate) {
    throw new HttpError(400, 'Please select valid start and end dates');
  }

  const parentPhone = t.parent?.fatherPhone || t.parent?.motherPhone;
  if (!parentPhone) {
    throw new HttpError(400, 'Parent phone number is not configured in your profile. Please ask manager to update it.');
  }

  const approvalToken = crypto.randomBytes(16).toString('hex');
  const leave = await Leave.create({
    tenant: t._id,
    startDate: sDate,
    endDate: eDate,
    reason: reason.trim(),
    destination: destination.trim(),
    parentPhone,
    parentName: t.parent?.fatherName || t.parent?.motherName || 'Parent',
    approvalToken,
    parentStatus: 'pending',
  });

  await sendWhatsApp(parentPhone, 'leave_approval_request', {
    wardName: t.name,
    dates: `${sDate.toLocaleDateString('en-IN')} to ${eDate.toLocaleDateString('en-IN')}`,
    reason,
    approvalToken,
  });

  res.status(201).json({
    ok: true,
    leave,
    approvalToken,
    approvalPath: `/parent-approval/${approvalToken}`,
  });
}));

r.get('/leaves', wrap(async (req, res) => {
  const t = await me(req);
  const leaves = await Leave.find({ tenant: t._id }).sort({ createdAt: -1 });
  res.json(leaves);
}));

r.get('/receipt/:receiptNo', wrap(async (req, res) => {
  const t = await me(req);
  const items = await Payment.find({ tenant: t._id, receiptNo: req.params.receiptNo, status: 'paid' });
  if (!items.length) throw new HttpError(404, 'Receipt not found');
  const s = await getSettings();
  res.json({
    pg: s.name, receiptNo: req.params.receiptNo, tenant: t.name, room: t.room?.number, bed: t.bed?.label,
    month: items[0].month, paidAt: items[0].paidAt, method: items[0].method,
    rent: items.reduce((a, p) => a + p.rent, 0), food: items.reduce((a, p) => a + p.food, 0),
    electricity: items.reduce((a, p) => a + p.electricity, 0), total: items.reduce((a, p) => a + p.total, 0),
  });
}));

// ---- Screen 2: electricity bill ----
r.get('/bill', wrap(async (req, res) => {
  const t = await me(req);
  const q = { room: t.room._id, sentAt: { $ne: null }, 'shares.tenant': t._id };
  if (req.query.month) q.month = monthParam(req.query.month);
  const reading = await MeterReading.findOne(q).sort({ month: -1 });
  if (!reading) return res.json({ reading: null });
  const share = reading.shares.find((s) => String(s.tenant) === String(t._id))?.amount || 0;
  res.json({
    reading: {
      month: reading.month, room: t.room.number, previous: reading.previous, current: reading.current,
      units: reading.units, rate: reading.rate, total: reading.total, people: reading.shares.length,
      share, photo: reading.photo, readAt: reading.updatedAt,
    },
  });
}));

// ---- Screen 3: complaints ----
r.post('/complaints', wrap(async (req, res) => {
  const t = await me(req);
  const { category, text = '', photo } = req.body;
  if (!['ac', 'wifi', 'water', 'cleaning', 'other'].includes(category)) throw new HttpError(400, 'Please select a valid category');
  const c = await Complaint.create({
    tenant: t._id, room: t.room._id, category, text: String(text).slice(0, 500), photo,
    history: [{ status: 'new' }],
  });
  res.status(201).json(c);
}));

r.get('/complaints', wrap(async (req, res) => {
  const t = await me(req);
  res.json(await Complaint.find({ tenant: t._id }).sort({ createdAt: -1 }).limit(20));
}));

// ---- Screen 4: food menu ----
r.get('/menu', wrap(async (req, res) => {
  const t = await me(req);
  const dates = weekDates();
  const [days, skips, ratings] = await Promise.all([
    MenuDay.find({ date: { $in: dates } }),
    FoodSkip.find({ tenant: t._id, date: { $in: dates } }),
    MenuRating.find({ tenant: t._id, date: { $in: dates } }),
  ]);
  res.json({
    today: todayStr(),
    days: dates.map((d) => ({
      date: d,
      ...(days.find((x) => x.date === d)?.toObject() || {}),
      skipped: skips.some((s) => s.date === d),
      ratings: Object.fromEntries(ratings.filter((x) => x.date === d).map((x) => [x.meal, x.stars])),
    })),
  });
}));

r.post('/menu/skip', wrap(async (req, res) => {
  const t = await me(req);
  const { date, skip } = req.body;
  if (!isDate(date) || date < todayStr()) throw new HttpError(400, 'Cannot skip past dates');
  if (skip === false) await FoodSkip.deleteOne({ tenant: t._id, date });
  else await FoodSkip.updateOne({ tenant: t._id, date }, { $setOnInsert: { date } }, { upsert: true });
  res.json({ ok: true });
}));

r.post('/menu/rate', wrap(async (req, res) => {
  const t = await me(req);
  const { date, meal, stars } = req.body;
  if (!isDate(date) || date > todayStr() || !['nashta', 'lunch', 'dinner'].includes(meal) || !(stars >= 1 && stars <= 5)) {
    throw new HttpError(400, 'Invalid meal rating');
  }
  await MenuRating.updateOne({ tenant: t._id, date, meal }, { stars: Math.round(stars) }, { upsert: true });
  res.json({ ok: true });
}));

export default r;
