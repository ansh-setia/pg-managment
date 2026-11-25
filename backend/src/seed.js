import mongoose from 'mongoose';
import { config } from './config.js';
import { User, Room, Bed, Tenant, MenuDay, Setting, Payment, MeterReading, Complaint, Block, DEFAULT_SHARING_TIERS } from './models.js';
import { ensureDues, receiptNo } from './billing.js';
import { monthStr, prevMonth, weekDates } from './util.js';

await mongoose.connect(config.mongoUri);
const reset = process.argv.includes('--reset');
if ((await User.countDocuments()) && !reset) {
  console.log('Database already has data. Run `npm run seed -- --reset` to wipe and re-seed.');
  process.exit(0);
}
if (reset) await Promise.all([User, Room, Bed, Tenant, MenuDay, Setting, Payment, MeterReading, Complaint, Block].map((m) => m.deleteMany({})));

await Setting.create({
  key: 'pg',
  name: 'Demo PG',
  ratePerUnit: 9,
  dueDay: 5,
  contactPhone: '9000000001',
  sharingDefaults: DEFAULT_SHARING_TIERS,
});

await User.create([
  { phone: '9000000001', name: 'Property Owner', role: 'malik' },
  { phone: '9000000002', name: 'Property Manager', role: 'manager' },
]);

const blockA = await Block.create({ name: 'Block A (Boys)', description: 'Main Wing' });
const blockB = await Block.create({ name: 'Block B (Girls)', description: 'Annex Wing' });

const roomDefs = [
  { block: blockA._id, number: '101', floor: 1, sharingType: 2, rent: 7500, initialReading: 1000 },
  { block: blockA._id, number: '102', floor: 1, sharingType: 2, rent: 7500, initialReading: 1000 },
  { block: blockA._id, number: '103', floor: 1, sharingType: 1, rent: 12000, initialReading: 1000 },
  { block: blockA._id, number: '201', floor: 2, sharingType: 3, rent: 6000, initialReading: 1000 },
  { block: blockA._id, number: '202', floor: 2, sharingType: 2, rent: 7500, initialReading: 1000 },
  { block: blockB._id, number: '301', floor: 1, sharingType: 2, rent: 7500, initialReading: 1000 },
  { block: blockB._id, number: '302', floor: 1, sharingType: 4, rent: 5000, initialReading: 1000 },
];
const rooms = await Room.insertMany(roomDefs);

const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const beds = [];
for (const room of rooms) {
  for (let s = 0; s < room.sharingType; s++) {
    beds.push({
      room: room._id,
      label: `${room.number}-${letters[s]}`,
      rent: room.rent,
      status: 'vacant',
      vacantSince: new Date(Date.now() - 6 * 86400000),
    });
  }
}
const bedDocs = await Bed.insertMany(beds);

const people = [['Rahul Sharma', '9000000011'], ['Neha Patel', '9000000012'], ['Amit Kumar', '9000000013'], ['Vikram Tomar', '9000000014'], ['Sana Khan', '9000000015']];
const m = monthStr();
for (const [i, [name, phone]] of people.entries()) {
  const bed = bedDocs[i];
  const user = await User.create({ phone, name, role: 'tenant' });
  const t = await Tenant.create({
    user: user._id, name, phone, room: bed.room, bed: bed._id, rent: bed.rent, foodCharge: 1000, deposit: bed.rent * 2,
    joinedOn: new Date(Date.now() - 90 * 86400000), docs: { policeVerification: 'done' },
  });
  await Bed.updateOne({ _id: bed._id }, { status: i === 4 ? 'notice' : 'occupied', vacantSince: null });
  if (i === 4) await Tenant.updateOne({ _id: t._id }, { status: 'notice', noticeDate: new Date() });
  // last month paid
  await ensureDues(prevMonth(m), t._id);
  await Payment.updateMany({ tenant: t._id, month: prevMonth(m) }, { status: 'paid', paidAt: new Date(Date.now() - 35 * 86400000), method: 'seed', receiptNo: receiptNo(prevMonth(m)) });
}
await MeterReading.create({ room: rooms[0]._id, month: prevMonth(m), previous: 1000, current: 1180, units: 180, rate: 9, total: 1620 });

const meals = [['Poha + chai', 'Rajma chawal, roti, salad', 'Paneer, dal, roti, kheer'], ['Aloo paratha + dahi', 'Chole, rice, roti', 'Mix veg, dal, roti'], ['Idli sambar', 'Kadhi chawal, roti', 'Matar paneer, roti, rice']];
for (const [i, d] of weekDates().entries()) {
  const [nashta, lunch, dinner] = meals[i % meals.length];
  await MenuDay.create({ date: d, nashta, lunch, dinner });
}
console.log('Seeded with Block -> Floor -> Room -> Bed hierarchy and sharing defaults.');
await mongoose.disconnect();
