import { Router } from 'express';
import crypto from 'crypto';
import { Bed, Tenant, Room, User, Payment, Leave } from '../models.js';
import { getSettings, ensureDues, recordPaymentTransaction } from '../billing.js';
import { signToken } from '../auth.js';
import { sendWhatsApp } from '../notify.js';
import { HttpError, daysSince, wrap } from '../util.js';

const r = Router();

// ---- Public Bed Vacancy List ----
r.get('/vacancy', wrap(async (_req, res) => {
  const [s, beds] = await Promise.all([
    getSettings(),
    Bed.find({ status: 'vacant' }).populate({ path: 'room', populate: { path: 'block' } }).sort({ label: 1 }),
  ]);
  res.json({
    pg: s.name,
    contactPhone: s.contactPhone,
    beds: beds.map((b) => ({
      label: b.label,
      room: b.room?.number,
      floor: b.room?.floor ?? 0,
      block: b.room?.block?.name || 'Main Wing',
      sharingType: b.room?.sharingType || 2,
      rent: b.rent,
      daysVacant: daysSince(b.vacantSince),
    })),
  });
}));

// ---- Onboarding: Step 1 Fetch Invite Info ----
r.get('/onboard/:token', wrap(async (req, res) => {
  const tenant = await Tenant.findOne({ inviteToken: req.params.token })
    .populate({ path: 'room', populate: { path: 'block' } })
    .populate('bed');
  if (!tenant || tenant.status === 'left') {
    throw new HttpError(404, 'Ye onboarding invite link expire ho chuka hai ya galat hai');
  }
  const settings = await getSettings();
  res.json({
    pg: settings.name,
    name: tenant.name,
    phone: tenant.phone,
    room: tenant.room?.number,
    floor: tenant.room?.floor,
    block: tenant.room?.block?.name || 'Main Wing',
    bed: tenant.bed?.label,
    rent: tenant.rent,
    deposit: tenant.deposit,
    bookingAmount: tenant.bookingAmount || 2000,
    status: tenant.status,
    parent: tenant.parent || {},
    aadhaarNumber: tenant.aadhaarNumber || '',
    permanentAddress: tenant.permanentAddress || '',
    collegeOrOffice: tenant.collegeOrOffice || '',
    docs: tenant.docs || {},
  });
}));

// ---- Onboarding: Step 2 Submit Police Verification & Parent Details ----
r.post('/onboard/:token/submit', wrap(async (req, res) => {
  const { aadhaarNumber, permanentAddress, collegeOrOffice, parent = {}, docs = {} } = req.body;
  const tenant = await Tenant.findOne({ inviteToken: req.params.token }).populate('bed room');
  if (!tenant || tenant.status === 'left') {
    throw new HttpError(404, 'Onboarding record not found');
  }

  if (!aadhaarNumber?.trim()) throw new HttpError(400, 'Aadhaar card number is required');
  if (!parent.fatherName?.trim() || !parent.fatherPhone?.trim()) {
    throw new HttpError(400, 'Parent full name and mobile number are required');
  }

  tenant.aadhaarNumber = aadhaarNumber.trim();
  tenant.permanentAddress = String(permanentAddress || '').trim();
  tenant.collegeOrOffice = String(collegeOrOffice || '').trim();
  tenant.parent = {
    fatherName: String(parent.fatherName || '').trim(),
    fatherPhone: String(parent.fatherPhone || '').trim(),
    motherName: String(parent.motherName || '').trim(),
    motherPhone: String(parent.motherPhone || '').trim(),
    parentAddress: String(parent.parentAddress || permanentAddress || '').trim(),
  };

  if (docs.idProof) tenant.docs.idProof = docs.idProof;
  if (docs.photo) tenant.docs.photo = docs.photo;
  tenant.docs.policeVerification = 'submitted';
  await tenant.save();

  // Create initial dues for current month
  const month = new Date().toISOString().slice(0, 7);
  await ensureDues(month, tenant._id);
  let payment = await Payment.findOne({ tenant: tenant._id, month });
  if (!payment) {
    payment = await Payment.create({
      tenant: tenant._id,
      month,
      kind: 'rent',
      rent: tenant.rent,
      food: tenant.foodCharge || 0,
      total: tenant.rent + (tenant.foodCharge || 0),
      status: 'due',
      dueDate: new Date(Date.now() + 5 * 86400000),
    });
  }

  res.json({
    ok: true,
    message: 'Verification and parent details saved successfully!',
    paymentId: payment._id,
    totalDue: payment.total || (tenant.rent + tenant.deposit),
    deposit: tenant.deposit,
    rent: tenant.rent,
    bookingAmount: tenant.bookingAmount || 2000,
  });
}));

// ---- Onboarding: Step 3 Part/Full Payment & Account Activation ----
r.post('/onboard/:token/pay', wrap(async (req, res) => {
  const { paymentId, amount, method = 'online', reference = '' } = req.body;
  const tenant = await Tenant.findOne({ inviteToken: req.params.token }).populate('user room bed');
  if (!tenant || tenant.status === 'left') {
    throw new HttpError(404, 'Tenant record not found');
  }

  const amt = Number(amount);
  if (!amt || amt <= 0) throw new HttpError(400, 'Please select a valid payment amount');

  let payRecordId = paymentId;
  if (!payRecordId) {
    let p = await Payment.findOne({ tenant: tenant._id }).sort({ createdAt: -1 });
    if (!p) {
      const month = new Date().toISOString().slice(0, 7);
      p = await Payment.create({
        tenant: tenant._id,
        month,
        kind: 'rent',
        rent: tenant.rent,
        food: tenant.foodCharge || 0,
        total: tenant.rent + (tenant.foodCharge || 0),
        status: 'due',
        dueDate: new Date(Date.now() + 5 * 86400000),
      });
    }
    payRecordId = p._id;
  }

  // Record installment
  const result = await recordPaymentTransaction(payRecordId, {
    amount: amt,
    method: method === 'online' ? 'online' : 'upi_owner',
    reference: reference || `ONBOARD-${Date.now()}`,
    note: 'Initial Onboarding / Booking Token',
  });

  // Activate tenant & Bed
  tenant.status = 'active';
  tenant.joinedOn = new Date();
  await tenant.save();

  await Bed.updateOne({ _id: tenant.bed._id }, { status: 'occupied', vacantSince: null });
  await User.updateOne({ _id: tenant.user._id }, { active: true });

  await sendWhatsApp(tenant.phone, 'welcome', { name: tenant.name });

  res.json({
    ok: true,
    token: signToken(tenant.user),
    user: { id: tenant.user._id, name: tenant.name, role: 'tenant' },
    receiptNo: result.transaction.receiptNo,
    balanceRemaining: result.balanceRemaining,
    paidAmount: result.transaction.amount,
  });
}));

// ---- Public Parent Leave Approval ----
r.get('/leave-approval/:token', wrap(async (req, res) => {
  const leave = await Leave.findOne({ approvalToken: req.params.token })
    .populate({ path: 'tenant', populate: { path: 'room bed' } });
  if (!leave) throw new HttpError(404, 'Leave request not found');

  const settings = await getSettings();
  res.json({
    pg: settings.name,
    id: leave._id,
    wardName: leave.tenant?.name,
    wardPhone: leave.tenant?.phone,
    room: leave.tenant?.room?.number,
    bed: leave.tenant?.bed?.label,
    startDate: leave.startDate,
    endDate: leave.endDate,
    reason: leave.reason,
    destination: leave.destination,
    parentName: leave.parentName,
    parentPhone: leave.parentPhone,
    parentStatus: leave.parentStatus,
    parentActionAt: leave.parentActionAt,
    parentRemarks: leave.parentRemarks,
  });
}));

r.post('/leave-approval/:token/action', wrap(async (req, res) => {
  const { action, remarks = '' } = req.body;
  if (!['approved', 'rejected'].includes(action)) {
    throw new HttpError(400, 'Please select a valid action (approved / rejected)');
  }

  const leave = await Leave.findOne({ approvalToken: req.params.token }).populate('tenant');
  if (!leave) throw new HttpError(404, 'Leave request not found');

  leave.parentStatus = action;
  leave.parentActionAt = new Date();
  leave.parentRemarks = String(remarks || '').trim();
  await leave.save();

  // Notify student
  await sendWhatsApp(leave.tenant.phone, 'leave_parent_decision', {
    name: leave.tenant.name,
    status: action === 'approved' ? 'Approved by Parent (Awaiting Manager confirmation)' : 'Rejected by Parent',
    remarks,
  });

  // If approved by parent, notify manager so they can confirm with parent
  if (action === 'approved') {
    const manager = await User.findOne({ role: 'manager' });
    if (manager?.phone) {
      await sendWhatsApp(manager.phone, 'leave_parent_approved_alert', {
        studentName: leave.tenant.name,
        parentPhone: leave.parentPhone,
        dates: `${new Date(leave.startDate).toLocaleDateString('en-IN')} to ${new Date(leave.endDate).toLocaleDateString('en-IN')}`,
      });
    }
  }

  res.json({ ok: true, status: leave.parentStatus, managerStatus: leave.managerStatus });
}));

export default r;
