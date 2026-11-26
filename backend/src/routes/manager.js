import { Router } from 'express';
import crypto from 'crypto';
import {
  Room,
  Bed,
  Tenant,
  User,
  MeterReading,
  Complaint,
  MenuDay,
  FoodSkip,
  Payment,
  Settlement,
  Leave,
  Property,
  ManagerAssignment,
  Workspace,
} from '../models.js';
import { addElectricity, getSettings, ensureDues, receiptNo, settlementNo, recordPaymentTransaction } from '../billing.js';
import { sendWhatsApp } from '../notify.js';
import { ensureDefaultWorkspaceAndProperties, getEffectivePermissions, hasManagerPermission } from '../workspace.js';
import { HttpError, isDate, isMonth, monthStr, normPhone, todayStr, wrap } from '../util.js';

const r = Router(); // mounted for roles: manager, malik

// Helper to get all authorized property IDs for the current user
export async function getAuthorizedPropertyIds(user) {
  if (user.role === 'malik') {
    const wsData = await ensureDefaultWorkspaceAndProperties(user);
    const props = await Property.find({ workspace: wsData.workspace._id, status: 'active' });
    return props.map((p) => p._id);
  }
  const assignments = await ManagerAssignment.find({
    manager: user._id,
    status: 'active',
  });
  return assignments.map((a) => a.property);
}

// -----------------------------------------------------------------------------
// GET /api/manager/properties - Manager's assigned properties with permissions
// -----------------------------------------------------------------------------
r.get('/properties', wrap(async (req, res) => {
  if (req.user.role === 'malik') {
    const wsData = await ensureDefaultWorkspaceAndProperties(req.user);
    const props = await Property.find({ workspace: wsData.workspace._id, status: 'active' });
    return res.json({
      properties: props.map((p) => ({
        id: p._id,
        name: p.name,
        address: p.address,
        city: p.city,
        isPrimary: true,
        designation: 'primary',
        permissionPreset: 'full',
        permissions: getEffectivePermissions({ permissionPreset: 'full' }),
      })),
      isOwner: true,
    });
  }

  const now = new Date();
  const assignments = await ManagerAssignment.find({
    manager: req.user._id,
    status: 'active',
  }).populate('property', 'name address city contactPhone status');

  const validAssignments = [];
  for (const ass of assignments) {
    if (!ass.property || ass.property.status !== 'active') continue;
    if (ass.validUntil && ass.validUntil < now) {
      ass.status = 'expired';
      await ass.save();
      continue;
    }
    validAssignments.push({
      id: ass.property._id,
      name: ass.property.name,
      address: ass.property.address,
      city: ass.property.city,
      isPrimary: ass.isPrimary,
      designation: ass.designation,
      permissionPreset: ass.permissionPreset,
      permissions: getEffectivePermissions(ass),
    });
  }

  res.json({
    properties: validAssignments,
    isOwner: false,
  });
}));

const monthParam = (q) => {
  const m = q || monthStr();
  if (!isMonth(m)) throw new HttpError(400, 'Month galat hai');
  return m;
};

// ---- Screen 5: meter readings ----
r.get('/rooms', wrap(async (req, res) => {
  const month = monthParam(req.query.month);
  const [rooms, readings, tenants, settings] = await Promise.all([
    Room.find().sort({ number: 1 }),
    MeterReading.find({ month }),
    Tenant.find({ status: { $in: ['active', 'notice'] } }),
    getSettings(),
  ]);
  const out = [];
  for (const room of rooms) {
    const cur = readings.find((x) => String(x.room) === String(room._id));
    let previous = cur?.previous;
    if (previous == null) {
      const last = await MeterReading.findOne({ room: room._id, month: { $lt: month } }).sort({ month: -1 });
      previous = last ? last.current : room.initialReading;
    }
    out.push({
      id: room._id, number: room.number, previous,
      current: cur?.current ?? null, units: cur?.units ?? null, total: cur?.total ?? null,
      photo: cur?.photo, sent: !!cur?.sentAt,
      people: tenants.filter((t) => String(t.room) === String(room._id)).length,
    });
  }
  res.json({ month, rate: settings.ratePerUnit, rooms: out });
}));

r.post('/readings', wrap(async (req, res) => {
  const month = monthParam(req.body.month);
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const { ratePerUnit } = await getSettings();
  const saved = [];
  for (const it of items) {
    const room = await Room.findById(it.roomId);
    if (!room || it.current === '' || it.current == null) continue;
    const current = Number(it.current);
    if (!Number.isFinite(current)) throw new HttpError(400, `Room ${room.number}: reading must be a valid number`);
    let existing = await MeterReading.findOne({ room: room._id, month });
    if (existing?.sentAt) throw new HttpError(409, `Room ${room.number}: bill for this month has already been sent`);
    let previous = existing?.previous;
    if (previous == null) {
      const last = await MeterReading.findOne({ room: room._id, month: { $lt: month } }).sort({ month: -1 });
      previous = last ? last.current : room.initialReading;
    }
    if (current < previous) throw new HttpError(400, `Room ${room.number}: current reading cannot be lower than previous (${previous})`);
    const units = current - previous;
    const doc = await MeterReading.findOneAndUpdate(
      { room: room._id, month },
      { previous, current, units, rate: ratePerUnit, total: Math.round(units * ratePerUnit), ...(it.photo ? { photo: it.photo } : {}) },
      { upsert: true, new: true },
    );
    saved.push(doc);
  }
  res.json({ saved: saved.length });
}));

r.post('/readings/send', wrap(async (req, res) => {
  const month = monthParam(req.body.month);
  const readings = await MeterReading.find({ month, sentAt: null }).populate('room');
  let sent = 0;
  const noTenants = [];
  for (const rd of readings) {
    const tenants = await Tenant.find({ room: rd.room._id, status: { $in: ['active', 'notice'] } });
    if (!tenants.length) { noTenants.push(rd.room.number); continue; }
    const base = Math.floor(rd.total / tenants.length);
    let extra = rd.total - base * tenants.length; // spread leftover rupees, so shares always add up
    rd.shares = tenants.map((t) => ({ tenant: t._id, amount: base + (extra-- > 0 ? 1 : 0) }));
    rd.sentAt = new Date();
    await rd.save();
    for (const s of rd.shares) {
      const t = tenants.find((x) => String(x._id) === String(s.tenant));
      await addElectricity(t, month, s.amount);
      await sendWhatsApp(t.phone, 'electricity_bill', { month, units: rd.units, share: s.amount });
    }
    sent++;
  }
  res.json({ sent, skippedEmptyRooms: noTenants });
}));

// ---- Screen 6: complaints ----
r.get('/complaints', wrap(async (req, res) => {
  const list = await Complaint.find().sort({ createdAt: -1 }).limit(100).populate('room').populate('tenant', 'name');
  const counts = { new: 0, in_progress: 0, done: 0 };
  list.forEach((c) => counts[c.status]++);
  res.json({ counts, items: list });
}));

r.patch('/complaints/:id', wrap(async (req, res) => {
  const { status } = req.body;
  if (!['new', 'in_progress', 'done'].includes(status)) throw new HttpError(400, 'Invalid complaint status');
  const c = await Complaint.findById(req.params.id).populate('tenant');
  if (!c) throw new HttpError(404, 'Complaint not found');
  if (c.status !== status) {
    c.status = status;
    c.history.push({ status });
    await c.save();
    if (status === 'done') await sendWhatsApp(c.tenant.phone, 'complaint_done', { category: c.category });
  }
  res.json(c);
}));

// ---- Screen 7: tenants ----
r.get('/tenants', wrap(async (_req, res) => {
  res.json(await Tenant.find({ status: { $in: ['invited', 'active', 'notice'] } }).populate('room bed').sort({ createdAt: -1 }));
}));

r.post('/tenants/quick-allot', wrap(async (req, res) => {
  const { name, bedId, rent: customRent, deposit: customDeposit, bookingAmount = 2000 } = req.body;
  const phone = normPhone(req.body.phone);
  if (!name?.trim() || phone.length !== 10) throw new HttpError(400, 'Name and 10-digit mobile number are required');
  if (!bedId) throw new HttpError(400, 'Please select a bed');

  const bed = await Bed.findOneAndUpdate({ _id: bedId, status: 'vacant' }, { status: 'occupied', vacantSince: null }, { new: true }).populate('room');
  if (!bed) throw new HttpError(409, 'This bed is no longer available');

  try {
    let user = await User.findOne({ phone });
    if (user && user.role !== 'tenant') throw new HttpError(409, 'This number belongs to a staff member');
    if (user && (await Tenant.exists({ user: user._id, status: { $in: ['invited', 'active', 'notice'] } }))) {
      throw new HttpError(409, 'This tenant is already assigned to an active bed');
    }

    if (user) { user.active = true; user.name = name.trim(); await user.save(); }
    else user = await User.create({ phone, name: name.trim(), role: 'tenant' });

    const rent = Number(customRent || bed.rent || 7500);
    const deposit = Number(customDeposit != null ? customDeposit : (rent * 2));
    const inviteToken = crypto.randomBytes(16).toString('hex');

    const tenant = await Tenant.create({
      user: user._id,
      name: name.trim(),
      phone,
      room: bed.room?._id,
      bed: bed._id,
      rent,
      deposit,
      bookingAmount: Number(bookingAmount || 2000),
      status: 'invited',
      inviteToken,
      docs: { policeVerification: 'pending' },
    });

    await sendWhatsApp(phone, 'onboarding_invite', {
      name: tenant.name,
      room: bed.room?.number,
      bed: bed.label,
      inviteToken,
    });

    res.status(201).json({
      ok: true,
      tenant,
      inviteToken,
      invitePath: `/onboard/${inviteToken}`,
    });
  } catch (e) {
    await Bed.updateOne({ _id: bed._id }, { status: 'vacant', vacantSince: new Date() });
    throw e;
  }
}));

// ---- Leaves Management (Parent Approvals & Manager Confirmation) ----
r.get('/leaves', wrap(async (_req, res) => {
  const list = await Leave.find().populate({ path: 'tenant', populate: { path: 'room bed' } }).sort({ createdAt: -1 });
  res.json(list);
}));

export async function autoSkipFoodForLeave(leave) {
  const sStr = typeof leave.startDate === 'string' ? leave.startDate.slice(0, 10) : new Date(leave.startDate).toISOString().slice(0, 10);
  const eStr = typeof leave.endDate === 'string' ? leave.endDate.slice(0, 10) : new Date(leave.endDate).toISOString().slice(0, 10);

  const dates = [];
  let cur = new Date(sStr + 'T00:00:00Z');
  const stop = new Date(eStr + 'T00:00:00Z');
  while (cur <= stop) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  const tenantId = leave.tenant?._id || leave.tenant;
  for (const date of dates) {
    await FoodSkip.updateOne(
      { tenant: tenantId, date },
      { $set: { tenant: tenantId, date, reason: 'leave', leave: leave._id } },
      { upsert: true }
    );
  }
  return dates;
}

r.post('/leaves/:id/decide', wrap(async (req, res) => {
  const { action, remarks = '' } = req.body;
  if (!['approved', 'denied'].includes(action)) {
    throw new HttpError(400, 'Please select a valid action (approved / denied)');
  }

  const l = await Leave.findById(req.params.id).populate('tenant');
  if (!l) throw new HttpError(404, 'Leave request not found');

  l.managerStatus = action;
  l.managerActionAt = new Date();
  l.managerRemarks = String(remarks || '').trim();
  await l.save();

  // Automatic food skipping when leave is approved
  if (action === 'approved') {
    await autoSkipFoodForLeave(l);
  } else if (action === 'denied') {
    await FoodSkip.deleteMany({ leave: l._id });
  }

  // Notify student via WhatsApp
  if (l.tenant?.phone) {
    const sDate = new Date(l.startDate).toLocaleDateString('en-IN');
    const eDate = new Date(l.endDate).toLocaleDateString('en-IN');
    if (action === 'approved') {
      await sendWhatsApp(l.tenant.phone, 'leave_manager_approved', {
        name: l.tenant.name,
        dates: `${sDate} to ${eDate}`,
        destination: l.destination,
        remarks: l.managerRemarks || 'Leave pass approved by manager (Food auto-skipped)',
      });
    } else {
      await sendWhatsApp(l.tenant.phone, 'leave_manager_denied', {
        name: l.tenant.name,
        dates: `${sDate} to ${eDate}`,
        reason: l.managerRemarks || 'Leave pass denied by manager',
      });
    }
  }

  res.json({ ok: true, leave: l });
}));

r.patch('/leaves/:id/acknowledge', wrap(async (req, res) => {
  const l = await Leave.findById(req.params.id);
  if (!l) throw new HttpError(404, 'Leave request not found');
  l.managerStatus = 'approved';
  l.managerActionAt = new Date();
  await l.save();
  await autoSkipFoodForLeave(l);
  res.json({ ok: true, leave: l });
}));

r.get('/beds/vacant', wrap(async (_req, res) => {
  const [beds, settings] = await Promise.all([
    Bed.find({ status: 'vacant' }).populate({ path: 'room', populate: { path: 'block' } }).sort({ label: 1 }),
    getSettings(),
  ]);
  const defaults = settings.sharingDefaults || [];
  const list = beds.map((b) => {
    const sharingType = b.room?.sharingType || 2;
    const tier = defaults.find((d) => d.sharingType === sharingType);
    return {
      _id: b._id,
      label: b.label,
      rent: b.rent,
      deposit: tier?.deposit || (b.rent * 2),
      maintenance: tier?.maintenance || 1000,
      bookingAmount: tier?.bookingAmount || 1500,
      room: {
        _id: b.room?._id,
        number: b.room?.number,
        floor: b.room?.floor ?? 0,
        sharingType,
        block: b.room?.block?.name || 'Main Wing',
      },
    };
  });
  res.json(list);
}));

r.post('/tenants', wrap(async (req, res) => {
  const { name, bedId, docs = {} } = req.body;
  const phone = normPhone(req.body.phone);
  const rent = Number(req.body.rent), deposit = Number(req.body.deposit || 0), foodCharge = Number(req.body.foodCharge || 0);
  if (!name?.trim() || phone.length !== 10) throw new HttpError(400, 'Name and 10-digit mobile number are required');
  if (!(rent > 0) || deposit < 0 || foodCharge < 0) throw new HttpError(400, 'Please enter valid rent and deposit');
  if (!docs.idProof) throw new HttpError(400, 'Please upload ID proof');

  let user = await User.findOne({ phone });
  if (user && user.role !== 'tenant') throw new HttpError(409, 'This number belongs to a staff member');
  if (user && (await Tenant.exists({ user: user._id, status: { $in: ['active', 'notice'] } }))) {
    throw new HttpError(409, 'This tenant is already assigned to an active bed');
  }

  // Claim the bed atomically so two managers can't give it to two people.
  const bed = await Bed.findOneAndUpdate({ _id: bedId, status: 'vacant' }, { status: 'occupied', vacantSince: null }, { new: true });
  if (!bed) throw new HttpError(409, 'This bed is no longer vacant');
  try {
    if (user) { user.active = true; user.name = name.trim(); await user.save(); }
    else user = await User.create({ phone, name: name.trim(), role: 'tenant' });
    const tenant = await Tenant.create({
      user: user._id, name: name.trim(), phone, room: bed.room, bed: bed._id, rent, deposit, foodCharge,
      docs: {
        idProof: docs.idProof, photo: docs.photo, agreement: docs.agreement,
        policeVerification: docs.policeVerification === 'done' ? 'done' : 'pending',
      },
    });
    await sendWhatsApp(phone, 'welcome', { name: tenant.name });
    res.status(201).json(tenant);
  } catch (e) {
    await Bed.updateOne({ _id: bed._id }, { status: 'vacant', vacantSince: new Date() });
    throw e;
  }
}));

// ---- Payments (Offline / Partial) ----
r.post('/payments/record-offline', wrap(async (req, res) => {
  const { paymentId, amount, method = 'cash', reference = '', note = '' } = req.body;
  if (!paymentId) throw new HttpError(400, 'Payment ID is required');
  if (!['cash', 'upi_owner', 'cheque', 'neft'].includes(method)) {
    throw new HttpError(400, 'Please select a valid payment method (cash, upi_owner, cheque, neft)');
  }
  const result = await recordPaymentTransaction(paymentId, {
    amount,
    method,
    reference,
    note,
    recordedBy: req.user?._id,
  });
  const t = result.payment.tenant;
  if (t?.phone) {
    await sendWhatsApp(t.phone, 'payment_receipt', {
      name: t.name,
      amount,
      receiptNo: result.transaction.receiptNo,
      balance: result.balanceRemaining,
    });
  }
  res.json(result);
}));

r.get('/payments/due', wrap(async (req, res) => {
  const month = req.query.month || monthStr();
  await ensureDues(month);
  const list = await Payment.find({
    status: { $in: ['due', 'partial'] },
  }).populate({ path: 'tenant', populate: { path: 'room bed' } }).sort({ month: -1, dueDate: 1 });

  res.json(list.map((p) => {
    const paid = p.paidAmount || 0;
    return {
      id: p._id,
      tenantId: p.tenant?._id,
      tenantName: p.tenant?.name,
      tenantPhone: p.tenant?.phone,
      room: p.tenant?.room?.number,
      bed: p.tenant?.bed?.label,
      month: p.month,
      kind: p.kind,
      total: p.total,
      paidAmount: paid,
      balanceRemaining: Math.max(0, p.total - paid),
      status: p.status,
      dueDate: p.dueDate,
      transactions: p.transactions || [],
    };
  }));
}));

// ---- Notice & Checkout ----
r.post('/tenants/:id/notice', wrap(async (req, res) => {
  const { vacatingDate, reason = 'personal', note = '' } = req.body;
  const t = await Tenant.findById(req.params.id);
  if (!t || t.status === 'left') throw new HttpError(404, 'Active tenant not found');
  t.status = 'notice';
  t.noticeDate = new Date();
  t.notice = {
    requestedAt: new Date(),
    vacatingDate: vacatingDate ? new Date(vacatingDate) : new Date(Date.now() + 30 * 86400000),
    reason,
    note,
    status: 'active',
  };
  await t.save();
  await Bed.updateOne({ _id: t.bed }, { status: 'notice' });
  await sendWhatsApp(t.phone, 'notice_received', { name: t.name, vacatingDate: t.notice.vacatingDate });
  res.json(t);
}));

r.post('/tenants/:id/cancel-notice', wrap(async (req, res) => {
  const t = await Tenant.findById(req.params.id);
  if (!t || t.status !== 'notice') throw new HttpError(404, 'No tenant found on notice');
  t.status = 'active';
  if (t.notice) {
    t.notice.status = 'cancelled';
    t.notice.cancelledAt = new Date();
  }
  await t.save();
  await Bed.updateOne({ _id: t.bed }, { status: 'occupied' });
  res.json({ ok: true, tenant: t });
}));

r.get('/tenants/:id/settlement-preview', wrap(async (req, res) => {
  const t = await Tenant.findById(req.params.id).populate('room bed');
  if (!t) throw new HttpError(404, 'Tenant not found');

  const unpaidPayments = await Payment.find({
    tenant: t._id,
    status: { $in: ['due', 'partial'] },
  });

  const pendingDues = unpaidPayments.reduce((s, p) => s + (p.total - (p.paidAmount || 0)), 0);

  res.json({
    tenant: { id: t._id, name: t.name, phone: t.phone, joinedOn: t.joinedOn, deposit: t.deposit },
    room: t.room ? { number: t.room.number, floor: t.room.floor } : null,
    bed: t.bed ? { label: t.bed.label } : null,
    depositHeld: t.deposit,
    pendingDues,
    unpaidPayments: unpaidPayments.map((p) => ({
      id: p._id,
      month: p.month,
      kind: p.kind,
      total: p.total,
      paid: p.paidAmount || 0,
      due: p.total - (p.paidAmount || 0),
    })),
  });
}));

r.post('/tenants/:id/checkout-settle', wrap(async (req, res) => {
  const { deductions = [], refundMethod = 'upi', refundRef = '', notes = '' } = req.body;
  const t = await Tenant.findById(req.params.id).populate('room bed');
  if (!t || t.status === 'left') throw new HttpError(404, 'Active or notice tenant not found');

  const unpaidPayments = await Payment.find({ tenant: t._id, status: { $in: ['due', 'partial'] } });
  const pendingDues = unpaidPayments.reduce((s, p) => s + (p.total - (p.paidAmount || 0)), 0);
  const totalDeductions = (deductions || []).reduce((s, d) => s + Number(d.amount || 0), 0);
  const netRefundable = t.deposit - pendingDues - totalDeductions;

  const sNo = settlementNo();
  const settlement = await Settlement.create({
    tenant: t._id,
    user: t.user,
    settlementNo: sNo,
    room: t.room?._id,
    bed: t.bed?._id,
    checkoutDate: new Date(),
    depositHeld: t.deposit,
    pendingDues,
    deductions: deductions.map((d) => ({
      category: d.category || 'other',
      title: d.title || 'Deduction',
      amount: Number(d.amount || 0),
    })),
    totalDeductions,
    netRefundable,
    refundStatus: netRefundable >= 0 ? 'refunded' : 'collected_extra',
    refundMethod,
    refundRef,
    settledBy: req.user?._id,
    notes,
  });

  // Mark unpaid payments as cleared via deposit adjustment
  for (const p of unpaidPayments) {
    const remaining = p.total - (p.paidAmount || 0);
    p.paidAmount = p.total;
    p.status = 'paid';
    p.paidAt = new Date();
    p.receiptNo = receiptNo(p.month);
    if (!p.transactions) p.transactions = [];
    p.transactions.push({
      amount: remaining,
      paidAt: new Date(),
      method: 'cash',
      reference: `Settlement ${sNo}`,
      receiptNo: p.receiptNo,
      recordedBy: req.user?._id,
      note: 'Deposit adjustment at checkout',
    });
    await p.save();
  }

  // Free bed and close tenant
  t.status = 'left';
  t.leftOn = new Date();
  if (t.notice) t.notice.status = 'completed';
  await t.save();

  if (t.bed) {
    await Bed.updateOne({ _id: t.bed._id }, { status: 'vacant', vacantSince: new Date() });
  }
  await User.updateOne({ _id: t.user }, { active: false });

  await sendWhatsApp(t.phone, 'checkout_settlement', {
    name: t.name,
    settlementNo: sNo,
    deposit: t.deposit,
    dues: pendingDues,
    deductions: totalDeductions,
    netRefund: netRefundable,
  });

  res.json({ ok: true, settlement });
}));

r.get('/settlements/:no', wrap(async (req, res) => {
  const s = await Settlement.findOne({ settlementNo: req.params.no })
    .populate('tenant', 'name phone joinedOn')
    .populate('room', 'number floor')
    .populate('bed', 'label');
  if (!s) throw new HttpError(404, 'Settlement statement not found');
  const settings = await getSettings();
  res.json({ pg: settings.name, settlement: s });
}));

r.post('/tenants/:id/checkout', wrap(async (req, res) => {
  // Legacy route redirecting to quick settlement
  const t = await Tenant.findOneAndUpdate({ _id: req.params.id, status: { $in: ['active', 'notice'] } }, { status: 'left', leftOn: new Date() }, { new: true });
  if (!t) throw new HttpError(404, 'Tenant not found');
  await Bed.updateOne({ _id: t.bed }, { status: 'vacant', vacantSince: new Date() });
  await User.updateOne({ _id: t.user }, { active: false });
  res.json({ ok: true, deposit: t.deposit });
}));

// ---- menu (managers publish it, tenants read it) ----
r.get('/menu', wrap(async (req, res) => {
  const from = isDate(req.query.from) ? req.query.from : todayStr();
  res.json(await MenuDay.find({ date: { $gte: from } }).sort({ date: 1 }).limit(14));
}));

r.put('/menu/:date', wrap(async (req, res) => {
  if (!isDate(req.params.date)) throw new HttpError(400, 'Invalid date format');
  const pick = (k) => String(req.body[k] || '').slice(0, 200);
  const d = await MenuDay.findOneAndUpdate({ date: req.params.date }, { nashta: pick('nashta'), lunch: pick('lunch'), dinner: pick('dinner') }, { upsert: true, new: true });
  res.json(d);
}));

r.get('/food-count', wrap(async (req, res) => {
  const date = isDate(req.query.date) ? req.query.date : todayStr();
  const [skips, total] = await Promise.all([
    FoodSkip.find({ date }).populate({ path: 'tenant', populate: { path: 'room bed' } }),
    Tenant.countDocuments({ status: { $in: ['active', 'notice'] } })
  ]);
  const skipped = skips.length;
  const leaveSkips = skips.filter((s) => s.reason === 'leave').length;
  res.json({
    date,
    skipped,
    eating: Math.max(0, total - skipped),
    total,
    leaveSkips,
    manualSkips: skipped - leaveSkips,
  });
}));

export default r;
