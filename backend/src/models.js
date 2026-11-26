import mongoose from 'mongoose';
const { Schema } = mongoose;
const ref = (name) => ({ type: Schema.Types.ObjectId, ref: name });

export const User = mongoose.model('User', new Schema({
  phone: { type: String, required: true, unique: true },
  name: String,
  role: { type: String, enum: ['tenant', 'manager', 'malik'], required: true },
  active: { type: Boolean, default: true },
}, { timestamps: true }));

const otpSchema = new Schema({
  phone: { type: String, unique: true },
  hash: String,
  attempts: { type: Number, default: 0 },
  createdAt: Date,
  expiresAt: Date,
});
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const OtpCode = mongoose.model('OtpCode', otpSchema);

export const DEFAULT_SHARING_TIERS = [
  { sharingType: 1, name: 'Single Room', rent: 12000, deposit: 24000, maintenance: 1500, bookingAmount: 2000 },
  { sharingType: 2, name: '2-Sharing', rent: 7500, deposit: 15000, maintenance: 1000, bookingAmount: 1500 },
  { sharingType: 3, name: '3-Sharing', rent: 6000, deposit: 12000, maintenance: 1000, bookingAmount: 1000 },
  { sharingType: 4, name: '4-Sharing', rent: 5000, deposit: 10000, maintenance: 800, bookingAmount: 1000 },
];

export const Setting = mongoose.model('Setting', new Schema({
  key: { type: String, default: 'pg', unique: true },
  name: { type: String, default: 'Your PG' },
  ratePerUnit: { type: Number, default: 9 },
  dueDay: { type: Number, default: 5, min: 1, max: 28 },
  contactPhone: { type: String, default: '' },
  sharingDefaults: [{
    sharingType: { type: Number, required: true },
    name: { type: String, default: '' },
    rent: { type: Number, default: 0 },
    deposit: { type: Number, default: 0 },
    maintenance: { type: Number, default: 0 },
    bookingAmount: { type: Number, default: 0 },
  }],
}));

export const Workspace = mongoose.model('Workspace', new Schema({
  owner: { ...ref('User'), required: true },
  name: { type: String, default: 'My Workspace' },
}, { timestamps: true }));

export const Property = mongoose.model('Property', new Schema({
  name: { type: String, required: true, trim: true },
  workspace: ref('Workspace'),
  owner: ref('User'),
  address: { type: String, default: '' },
  city: { type: String, default: '' },
  contactPhone: { type: String, default: '' },
  status: { type: String, enum: ['active', 'archived'], default: 'active' },
  description: { type: String, default: '' },
}, { timestamps: true }));

export const Block = mongoose.model('Block', new Schema({
  property: ref('Property'),
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
}, { timestamps: true }));

const roomSchema = new Schema({
  property: ref('Property'),
  block: ref('Block'),
  number: { type: String, required: true },
  floor: { type: Number, default: 0 },
  sharingType: { type: Number, default: 2, min: 1, max: 15 },
  initialReading: { type: Number, default: 0 },
}, { timestamps: true });
roomSchema.index({ block: 1, number: 1 }, { unique: true });
export const Room = mongoose.model('Room', roomSchema);

export const Bed = mongoose.model('Bed', new Schema({
  room: { ...ref('Room'), required: true },
  label: { type: String, required: true },
  rent: { type: Number, default: 7500 },
  status: { type: String, enum: ['vacant', 'occupied', 'notice'], default: 'vacant' },
  vacantSince: Date,
}));

export const Tenant = mongoose.model('Tenant', new Schema({
  user: ref('User'),
  name: { type: String, required: true },
  phone: { type: String, required: true },
  room: ref('Room'),
  bed: ref('Bed'),
  rent: { type: Number, required: true },
  foodCharge: { type: Number, default: 0 },
  deposit: { type: Number, default: 0 },
  bookingAmount: { type: Number, default: 0 },
  joinedOn: { type: Date, default: Date.now },
  status: { type: String, enum: ['invited', 'active', 'notice', 'left'], default: 'active' },
  inviteToken: { type: String, index: true },
  aadhaarNumber: String,
  permanentAddress: String,
  collegeOrOffice: String,
  parent: {
    fatherName: String,
    fatherPhone: String,
    motherName: String,
    motherPhone: String,
    parentAddress: String,
  },
  noticeDate: Date,
  notice: {
    requestedAt: Date,
    vacatingDate: Date,
    reason: { type: String, default: 'other' },
    note: String,
    status: { type: String, enum: ['active', 'cancelled', 'completed'], default: 'active' },
    cancelledAt: Date,
  },
  leftOn: Date,
  docs: {
    idProof: String,
    photo: String,
    agreement: String,
    policeVerification: { type: String, enum: ['pending', 'submitted', 'done'], default: 'pending' },
  },
}, { timestamps: true }));

const paymentSchema = new Schema({
  tenant: { ...ref('Tenant'), required: true },
  month: { type: String, required: true },
  kind: { type: String, enum: ['rent', 'electricity'], default: 'rent' },
  rent: { type: Number, default: 0 },
  food: { type: Number, default: 0 },
  electricity: { type: Number, default: 0 },
  total: { type: Number, required: true },
  paidAmount: { type: Number, default: 0 },
  status: { type: String, enum: ['due', 'partial', 'paid'], default: 'due' },
  dueDate: Date,
  paidAt: Date,
  method: String,
  receiptNo: String,
  gatewayOrderId: { type: String, default: null },
  gatewayPaymentId: String,
  reminderSentAt: Date,
  transactions: [{
    amount: { type: Number, required: true },
    paidAt: { type: Date, default: Date.now },
    method: { type: String, enum: ['cash', 'upi_owner', 'cheque', 'neft', 'online'], default: 'cash' },
    reference: String,
    receiptNo: String,
    recordedBy: ref('User'),
    note: String,
  }],
}, { timestamps: true });
paymentSchema.index({ tenant: 1, month: 1, kind: 1 }, { unique: true });
export const Payment = mongoose.model('Payment', paymentSchema);

export const Settlement = mongoose.model('Settlement', new Schema({
  tenant: { ...ref('Tenant'), required: true },
  user: ref('User'),
  settlementNo: { type: String, required: true, unique: true },
  room: ref('Room'),
  bed: ref('Bed'),
  checkoutDate: { type: Date, default: Date.now },
  depositHeld: { type: Number, required: true },
  pendingDues: { type: Number, default: 0 },
  deductions: [{
    category: { type: String, enum: ['damage', 'cleaning', 'painting', 'notice_penalty', 'other'], default: 'other' },
    title: String,
    amount: Number,
  }],
  totalDeductions: { type: Number, default: 0 },
  netRefundable: { type: Number, required: true },
  refundStatus: { type: String, enum: ['refunded', 'collected_extra', 'pending'], default: 'refunded' },
  refundMethod: { type: String, enum: ['cash', 'upi', 'bank_transfer'], default: 'upi' },
  refundRef: String,
  settledBy: ref('User'),
  notes: String,
}, { timestamps: true }));

const readingSchema = new Schema({
  room: { ...ref('Room'), required: true },
  month: { type: String, required: true },
  previous: Number,
  current: Number,
  units: Number,
  rate: Number,
  total: Number,
  photo: String,
  sentAt: Date,
  shares: [{ tenant: ref('Tenant'), amount: Number }],
}, { timestamps: true });
readingSchema.index({ room: 1, month: 1 }, { unique: true });
export const MeterReading = mongoose.model('MeterReading', readingSchema);

export const Complaint = mongoose.model('Complaint', new Schema({
  tenant: ref('Tenant'),
  room: ref('Room'),
  category: { type: String, enum: ['ac', 'wifi', 'water', 'cleaning', 'other'], required: true },
  text: { type: String, default: '' },
  photo: String,
  status: { type: String, enum: ['new', 'in_progress', 'done'], default: 'new' },
  history: [{ status: String, at: { type: Date, default: Date.now } }],
}, { timestamps: true }));

export const MenuDay = mongoose.model('MenuDay', new Schema({
  date: { type: String, unique: true },
  nashta: String,
  lunch: String,
  dinner: String,
}));

const skipSchema = new Schema({
  tenant: ref('Tenant'),
  date: String,
  reason: { type: String, default: 'manual' }, // 'manual' | 'leave'
  leave: ref('Leave'),
}, { timestamps: true });
skipSchema.index({ tenant: 1, date: 1 }, { unique: true });
export const FoodSkip = mongoose.model('FoodSkip', skipSchema);

const ratingSchema = new Schema({
  tenant: ref('Tenant'),
  date: String,
  meal: { type: String, enum: ['nashta', 'lunch', 'dinner'] },
  stars: { type: Number, min: 1, max: 5 },
});
ratingSchema.index({ tenant: 1, date: 1, meal: 1 }, { unique: true });
export const MenuRating = mongoose.model('MenuRating', ratingSchema);

export const Leave = mongoose.model('Leave', new Schema({
  tenant: { ...ref('Tenant'), required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  reason: { type: String, required: true },
  destination: { type: String, default: 'Home' },
  parentPhone: { type: String, required: true },
  parentName: { type: String, default: 'Parent' },
  approvalToken: { type: String, required: true, index: true },
  parentStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  parentActionAt: Date,
  parentRemarks: String,
  managerStatus: { type: String, enum: ['pending', 'approved', 'denied', 'acknowledged'], default: 'pending' },
  managerActionAt: Date,
  managerRemarks: String,
}, { timestamps: true }));

export const PERMISSION_PRESETS = {
  full: {
    finances: {
      viewFinancials: true,
      recordPayments: true,
      sendReminders: true,
      viewPaymentHistory: true,
      viewDeposits: false, // Owner-exclusive restricted
      recordElectricity: true,
    },
    roomsAndBeds: {
      viewOccupancy: true,
      manageRooms: true,
      manageBeds: true,
      allotBeds: true,
    },
    tenants: {
      viewTenants: true,
      onboardTenants: true,
      manageVerification: true,
      issueNotices: true,
      initiateCheckout: true,
    },
    dailyOperations: {
      approveOutpasses: true,
      manageMaintenance: true,
      sendAnnouncements: true,
    },
  },
  caretaker: {
    finances: {
      viewFinancials: false,
      recordPayments: false,
      sendReminders: false,
      viewPaymentHistory: false,
      viewDeposits: false,
      recordElectricity: true,
    },
    roomsAndBeds: {
      viewOccupancy: true,
      manageRooms: false,
      manageBeds: false,
      allotBeds: false,
    },
    tenants: {
      viewTenants: true,
      onboardTenants: false,
      manageVerification: false,
      issueNotices: false,
      initiateCheckout: false,
    },
    dailyOperations: {
      approveOutpasses: true,
      manageMaintenance: true,
      sendAnnouncements: true,
    },
  },
};

const assignmentSchema = new Schema({
  manager: { ...ref('User'), required: true },
  property: { ...ref('Property'), required: true },
  workspace: ref('Workspace'),
  owner: { ...ref('User'), required: true },
  permissionPreset: { type: String, enum: ['full', 'caretaker', 'custom'], default: 'full' },
  customPermissions: {
    finances: {
      viewFinancials: { type: Boolean, default: true },
      recordPayments: { type: Boolean, default: true },
      sendReminders: { type: Boolean, default: true },
      viewPaymentHistory: { type: Boolean, default: true },
      viewDeposits: { type: Boolean, default: false },
      recordElectricity: { type: Boolean, default: true },
    },
    roomsAndBeds: {
      viewOccupancy: { type: Boolean, default: true },
      manageRooms: { type: Boolean, default: true },
      manageBeds: { type: Boolean, default: true },
      allotBeds: { type: Boolean, default: true },
    },
    tenants: {
      viewTenants: { type: Boolean, default: true },
      onboardTenants: { type: Boolean, default: true },
      manageVerification: { type: Boolean, default: true },
      issueNotices: { type: Boolean, default: true },
      initiateCheckout: { type: Boolean, default: true },
    },
    dailyOperations: {
      approveOutpasses: { type: Boolean, default: true },
      manageMaintenance: { type: Boolean, default: true },
      sendAnnouncements: { type: Boolean, default: true },
    },
  },
  isPrimary: { type: Boolean, default: false },
  designation: { type: String, enum: ['primary', 'supporting', 'temporary'], default: 'supporting' },
  status: { type: String, enum: ['active', 'suspended', 'expired'], default: 'active' },
  validFrom: { type: Date, default: Date.now },
  validUntil: Date,
  assignedBy: ref('User'),
  suspendedAt: Date,
  revokedAt: Date,
}, { timestamps: true });
assignmentSchema.index({ manager: 1, property: 1 });
assignmentSchema.index({ property: 1, isPrimary: 1 });
export const ManagerAssignment = mongoose.model('ManagerAssignment', assignmentSchema);

export const ManagerInvitation = mongoose.model('ManagerInvitation', new Schema({
  workspace: ref('Workspace'),
  owner: { ...ref('User'), required: true },
  phone: { type: String, required: true },
  name: { type: String, required: true },
  email: { type: String, default: '' },
  token: { type: String, required: true, unique: true, index: true },
  status: { type: String, enum: ['pending', 'accepted', 'expired', 'cancelled'], default: 'pending' },
  propertyAssignments: [{
    property: ref('Property'),
    isPrimary: { type: Boolean, default: false },
    designation: { type: String, default: 'supporting' },
    permissionPreset: { type: String, default: 'full' },
    customPermissions: Schema.Types.Mixed,
    validFrom: Date,
    validUntil: Date,
  }],
  expiresAt: { type: Date, required: true },
  acceptedAt: Date,
}, { timestamps: true }));

export const ActivityLog = mongoose.model('ActivityLog', new Schema({
  workspace: ref('Workspace'),
  property: ref('Property'),
  performedBy: ref('User'),
  targetUser: ref('User'),
  actionType: { type: String, required: true },
  entityType: { type: String, default: 'manager_assignment' },
  entityId: Schema.Types.ObjectId,
  description: { type: String, default: '' },
  details: Schema.Types.Mixed,
  timestamp: { type: Date, default: Date.now },
}, { timestamps: true }));
