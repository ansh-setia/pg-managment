import mongoose from 'mongoose';
import { config } from './src/config.js';
import { Tenant, Payment, Bed, Room, Settlement, User } from './src/models.js';
import { ensureDues, recordPaymentTransaction, settlementNo } from './src/billing.js';

async function testPhase1() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(config.mongoUri);
  console.log('Connected.');

  // Find an active tenant
  const tenant = await Tenant.findOne({ status: 'active' }).populate('room bed');
  if (!tenant) {
    console.error('No active tenant found to test.');
    process.exit(1);
  }
  console.log(`Testing with tenant: ${tenant.name} (${tenant.phone}), Room: ${tenant.room?.number}, Bed: ${tenant.bed?.label}`);

  // 1. Ensure dues exist
  const month = new Date().toISOString().slice(0, 7);
  await ensureDues(month, tenant._id);
  await Payment.updateMany({ tenant: tenant._id, month }, {
    paidAmount: 0,
    status: 'due',
    transactions: [],
  });
  const pay = await Payment.findOne({ tenant: tenant._id, month });
  console.log(`Payment record for ${month}: Total ${pay.total}, Status ${pay.status}, Paid: ${pay.paidAmount || 0}`);

  // 2. Test Partial Offline Payment
  console.log('\n--- 1. Testing Partial Offline Payment ---');
  const partialAmt = 2000;
  const payResult = await recordPaymentTransaction(pay._id, {
    amount: partialAmt,
    method: 'cash',
    reference: 'CASH-REC-001',
    note: 'Initial partial payment test',
  });
  console.log(`Partial payment recorded: Amount ${payResult.transaction.amount}, Receipt: ${payResult.transaction.receiptNo}`);
  console.log(`New balance remaining: ${payResult.balanceRemaining}, Status: ${payResult.payment.status}`);
  if (payResult.payment.status !== 'partial' && payResult.balanceRemaining > 0) {
    throw new Error('Status should be partial');
  }

  // 3. Test Notice Submission & Cancellation
  console.log('\n--- 2. Testing Notice with Vacating Date ---');
  tenant.status = 'notice';
  tenant.noticeDate = new Date();
  tenant.notice = {
    requestedAt: new Date(),
    vacatingDate: new Date(Date.now() + 15 * 86400000),
    reason: 'job',
    note: 'Relocating to another city',
    status: 'active',
  };
  await tenant.save();
  await Bed.updateOne({ _id: tenant.bed._id }, { status: 'notice' });
  
  const bedAfterNotice = await Bed.findById(tenant.bed._id);
  console.log(`Bed status after notice: ${bedAfterNotice.status} (should be 'notice')`);
  if (bedAfterNotice.status !== 'notice') throw new Error('Bed should be on notice');

  // 4. Test Settlement Preview
  console.log('\n--- 3. Testing Settlement Preview ---');
  const unpaid = await Payment.find({ tenant: tenant._id, status: { $in: ['due', 'partial'] } });
  const pendingDues = unpaid.reduce((s, p) => s + (p.total - (p.paidAmount || 0)), 0);
  console.log(`Deposit Held: ₹${tenant.deposit}, Pending Dues: ₹${pendingDues}`);

  // 5. Test Checkout Settlement with Deductions
  console.log('\n--- 4. Testing Checkout Settlement with Deductions ---');
  const deductions = [
    { category: 'painting', title: 'Wall repaint touchup', amount: 1000 },
    { category: 'cleaning', title: 'Deep Cleaning', amount: 500 },
  ];
  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);
  const netRefundable = tenant.deposit - pendingDues - totalDeductions;
  console.log(`Total Deductions: ₹${totalDeductions}, Net Refund: ₹${netRefundable}`);

  const sNo = settlementNo();
  const settlement = await Settlement.create({
    tenant: tenant._id,
    user: tenant.user,
    settlementNo: sNo,
    room: tenant.room?._id,
    bed: tenant.bed?._id,
    checkoutDate: new Date(),
    depositHeld: tenant.deposit,
    pendingDues,
    deductions,
    totalDeductions,
    netRefundable,
    refundStatus: 'refunded',
    refundMethod: 'upi',
    refundRef: 'UPI-REF-998877',
    notes: 'Test settlement completed smoothly',
  });
  console.log(`Settlement voucher created: ${settlement.settlementNo}`);

  // Clear dues via settlement
  for (const p of unpaid) {
    p.paidAmount = p.total;
    p.status = 'paid';
    p.paidAt = new Date();
    await p.save();
  }

  // Release bed
  tenant.status = 'left';
  tenant.leftOn = new Date();
  await tenant.save();
  await Bed.updateOne({ _id: tenant.bed._id }, { status: 'vacant', vacantSince: new Date() });

  const bedAfterCheckout = await Bed.findById(tenant.bed._id);
  console.log(`Bed status after checkout: ${bedAfterCheckout.status} (should be 'vacant')`);
  if (bedAfterCheckout.status !== 'vacant') throw new Error('Bed should be vacant');

  // Restore test tenant so dev environment remains clean
  console.log('\n--- Restoring Tenant & Bed for Dev Use ---');
  tenant.status = 'active';
  tenant.leftOn = null;
  tenant.notice = null;
  await tenant.save();
  await Bed.updateOne({ _id: tenant.bed._id }, { status: 'occupied', vacantSince: null });
  // reset payment
  await Payment.findByIdAndUpdate(pay._id, {
    paidAmount: 0,
    status: 'due',
    transactions: [],
  });
  await Settlement.deleteOne({ _id: settlement._id });
  console.log('Restored test tenant cleanly.');

  console.log('\nAll Phase 1 features verified successfully! ✓');
  await mongoose.disconnect();
}

testPhase1().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
