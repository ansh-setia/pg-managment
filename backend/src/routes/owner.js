import { Router } from 'express';
import { Block, Room, Bed, Tenant, Payment, Setting } from '../models.js';
import { ensureDues, getSettings } from '../billing.js';
import { sendWhatsApp } from '../notify.js';
import { HttpError, daysLate, daysSince, isMonth, monthStr, wrap } from '../util.js';

const r = Router(); // role: malik only

// ---- Screen 8: rent + deposit ----
r.get('/summary', wrap(async (req, res) => {
  const month = req.query.month || monthStr();
  if (!isMonth(month)) throw new HttpError(400, 'Month galat hai');
  await ensureDues(month);
  const [payments, beds, tenants] = await Promise.all([
    Payment.find({ month }).populate({ path: 'tenant', populate: { path: 'room', select: 'number' } }),
    Bed.find(),
    Tenant.find({ status: { $in: ['active', 'notice'] } }),
  ]);
  const sumCollected = (arr) => arr.reduce((s, p) => s + (p.paidAmount != null ? p.paidAmount : (p.status === 'paid' ? p.total : 0)), 0);
  const sumPending = (arr) => arr.reduce((s, p) => s + Math.max(0, p.total - (p.paidAmount != null ? p.paidAmount : (p.status === 'paid' ? p.total : 0))), 0);
  const pendingPayments = payments.filter((p) => p.status === 'due' || p.status === 'partial');
  const overdue = pendingPayments
    .filter((p) => p.dueDate < new Date())
    .sort((a, b) => a.dueDate - b.dueDate)
    .map((p) => {
      const remaining = Math.max(0, p.total - (p.paidAmount || 0));
      return {
        paymentId: p._id,
        tenant: p.tenant?.name,
        room: p.tenant?.room?.number,
        amount: remaining,
        total: p.total,
        paidAmount: p.paidAmount || 0,
        status: p.status,
        daysLate: daysLate(p.dueDate),
        reminderSentAt: p.reminderSentAt,
      };
    });
  res.json({
    month,
    collected: sumCollected(payments),
    pending: sumPending(payments),
    pendingPeople: new Set(pendingPayments.map((p) => String(p.tenant?._id))).size,
    deposits: tenants.reduce((s, t) => s + t.deposit, 0),
    beds: { total: beds.length, occupied: beds.filter((b) => b.status !== 'vacant').length },
    overdue,
  });
}));

r.post('/remind', wrap(async (req, res) => {
  const month = req.body.month || monthStr();
  if (!isMonth(month)) throw new HttpError(400, 'Month galat hai');
  const q = { month, status: { $in: ['due', 'partial'] }, dueDate: { $lt: new Date() } };
  if (req.body.paymentId) q._id = req.body.paymentId;
  const list = await Payment.find(q).populate('tenant');
  let sent = 0;
  for (const p of list) {
    if (!req.body.paymentId && p.reminderSentAt && Date.now() - p.reminderSentAt < 24 * 3600 * 1000) continue;
    const balance = Math.max(0, p.total - (p.paidAmount || 0));
    await sendWhatsApp(p.tenant.phone, 'rent_reminder', { name: p.tenant.name, amount: balance, daysLate: daysLate(p.dueDate) });
    p.reminderSentAt = new Date();
    await p.save();
    sent++;
  }
  res.json({ sent });
}));

r.get('/deposits', wrap(async (_req, res) => {
  const list = await Tenant.find({ status: { $in: ['active', 'notice'] } }).populate('room', 'number').sort({ deposit: -1 });
  res.json(list.map((t) => ({ id: t._id, name: t.name, room: t.room?.number, deposit: t.deposit, since: t.joinedOn })));
}));

// ---- Screen 9: beds & hierarchy ----
r.get('/blocks', wrap(async (_req, res) => {
  const blocks = await Block.find().sort({ name: 1 });
  const rooms = await Room.find();
  const beds = await Bed.find();
  const out = blocks.map((blk) => {
    const blkRooms = rooms.filter((r) => String(r.block) === String(blk._id));
    const blkRoomIds = new Set(blkRooms.map((r) => String(r._id)));
    const blkBeds = beds.filter((b) => blkRoomIds.has(String(b.room)));
    return {
      id: blk._id,
      name: blk.name,
      description: blk.description,
      roomCount: blkRooms.length,
      bedCount: blkBeds.length,
    };
  });
  res.json(out);
}));

r.post('/blocks', wrap(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) throw new HttpError(400, 'Block ka naam zaroori hai');
  const existing = await Block.findOne({ name: new RegExp(`^${name}$`, 'i') });
  if (existing) throw new HttpError(409, 'Ye block pehle se bana hai');
  const block = await Block.create({ name, description: String(req.body.description || '').trim() });
  res.status(201).json(block);
}));

r.delete('/blocks/:id', wrap(async (req, res) => {
  const hasRooms = await Room.exists({ block: req.params.id });
  if (hasRooms) throw new HttpError(400, 'Is block mein rooms hain, pehle unhe delete karo');
  const b = await Block.findByIdAndDelete(req.params.id);
  if (!b) throw new HttpError(404, 'Block nahi mila');
  res.json({ ok: true });
}));

r.get('/hierarchy', wrap(async (_req, res) => {
  let [blocks, rooms, beds, tenants, settings] = await Promise.all([
    Block.find().sort({ name: 1 }),
    Room.find().populate('block').sort({ floor: 1, number: 1 }),
    Bed.find().sort({ label: 1 }),
    Tenant.find({ status: { $in: ['active', 'notice'] } }),
    getSettings(),
  ]);

  if (!blocks.length) {
    const def = await Block.create({ name: 'Main Wing', description: 'Primary Building' });
    blocks = [def];
    await Room.updateMany({ block: null }, { block: def._id });
  }

  const occMap = new Map(tenants.map((t) => [String(t.bed), {
    id: t._id,
    name: t.name,
    phone: t.phone,
    status: t.status,
    notice: t.status === 'notice' ? t.notice : null,
  }]));
  const bedList = beds.map((b) => {
    const occ = occMap.get(String(b._id));
    return {
      id: b._id,
      roomId: String(b.room),
      label: b.label,
      rent: b.rent,
      status: b.status,
      tenant: occ?.name || null,
      tenantId: occ?.id || null,
      notice: occ?.notice || null,
      daysVacant: b.status === 'vacant' ? daysSince(b.vacantSince) : null,
    };
  });

  const roomList = rooms.map((r) => {
    const roomBeds = bedList.filter((b) => b.roomId === String(r._id));
    return {
      id: r._id,
      number: r.number,
      floor: r.floor ?? 0,
      sharingType: r.sharingType || (roomBeds.length || 2),
      blockId: r.block?._id || r.block || null,
      blockName: r.block?.name || 'Main Wing',
      initialReading: r.initialReading || 0,
      beds: roomBeds,
      totalBeds: roomBeds.length,
      vacantBeds: roomBeds.filter((b) => b.status === 'vacant').length,
    };
  });

  res.json({
    blocks: blocks.map((blk) => ({ id: blk._id, name: blk.name, description: blk.description })),
    rooms: roomList,
    sharingDefaults: settings.sharingDefaults || [],
  });
}));

r.post('/rooms', wrap(async (req, res) => {
  let { blockId, floor, number, sharingType, rent, initialReading } = req.body;
  number = String(number || '').trim();
  if (!number) throw new HttpError(400, 'Room number zaroori hai');
  floor = Number(floor ?? 0);
  sharingType = Number(sharingType || 2);
  if (sharingType < 1 || sharingType > 15) throw new HttpError(400, 'Sharing type 1 se 15 ke beech honi chahiye');

  let block;
  if (blockId) {
    block = await Block.findById(blockId);
    if (!block) throw new HttpError(404, 'Block nahi mila');
  } else {
    block = (await Block.findOne()) || (await Block.create({ name: 'Main Wing', description: 'Primary Building' }));
  }

  const exists = await Room.findOne({ block: block._id, number });
  if (exists) throw new HttpError(409, `Room ${number} is block mein pehle se hai`);

  const settings = await getSettings();
  const defaultTier = settings.sharingDefaults?.find((s) => s.sharingType === sharingType);
  const bedRent = Number(rent) || defaultTier?.rent || 7500;

  const room = await Room.create({
    block: block._id,
    number,
    floor,
    sharingType,
    initialReading: Number(initialReading || 0),
  });

  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const beds = [];
  for (let i = 0; i < sharingType; i++) {
    const suffix = i < 26 ? letters[i] : `${i + 1}`;
    beds.push({
      room: room._id,
      label: `${number}-${suffix}`,
      rent: bedRent,
      status: 'vacant',
      vacantSince: new Date(),
    });
  }
  const createdBeds = await Bed.insertMany(beds);
  res.status(201).json({ room, beds: createdBeds });
}));

r.delete('/rooms/:id', wrap(async (req, res) => {
  const beds = await Bed.find({ room: req.params.id });
  const hasOccupants = beds.some((b) => b.status !== 'vacant');
  if (hasOccupants) throw new HttpError(400, 'Is room ke beds par active ya notice tenant hain, pehle checkout karo');
  await Bed.deleteMany({ room: req.params.id });
  const rm = await Room.findByIdAndDelete(req.params.id);
  if (!rm) throw new HttpError(404, 'Room nahi mila');
  res.json({ ok: true });
}));

r.get('/beds', wrap(async (_req, res) => {
  const beds = await Bed.find().populate({ path: 'room', populate: { path: 'block' } }).sort({ label: 1 });
  const occ = await Tenant.find({ status: { $in: ['active', 'notice'] } }, 'bed name');
  const items = beds.map((b) => ({
    id: b._id,
    label: b.label,
    room: b.room?.number,
    floor: b.room?.floor ?? 0,
    block: b.room?.block?.name || 'Main Wing',
    sharingType: b.room?.sharingType || 2,
    rent: b.rent,
    status: b.status,
    tenant: occ.find((t) => String(t.bed) === String(b._id))?.name,
    daysVacant: b.status === 'vacant' ? daysSince(b.vacantSince) : null,
  }));
  const vacant = items.filter((b) => b.status === 'vacant');
  res.json({
    items,
    counts: { occupied: items.filter((b) => b.status === 'occupied').length, vacant: vacant.length, notice: items.filter((b) => b.status === 'notice').length },
    vacantRent: vacant.reduce((s, b) => s + b.rent, 0),
  });
}));

// ---- settings ----
r.get('/settings', wrap(async (_req, res) => res.json(await getSettings())));
r.put('/settings', wrap(async (req, res) => {
  const { name, ratePerUnit, dueDay, contactPhone, sharingDefaults } = req.body;
  const upd = {};
  if (name != null) upd.name = String(name).slice(0, 60);
  if (ratePerUnit != null) {
    if (!(Number(ratePerUnit) > 0)) throw new HttpError(400, 'Rate sahi daalo');
    upd.ratePerUnit = Number(ratePerUnit);
  }
  if (dueDay != null) {
    if (!(dueDay >= 1 && dueDay <= 28)) throw new HttpError(400, 'Due date 1 se 28 ke beech rakho');
    upd.dueDay = Number(dueDay);
  }
  if (contactPhone != null) upd.contactPhone = String(contactPhone).replace(/\D/g, '').slice(-10);
  if (Array.isArray(sharingDefaults)) {
    upd.sharingDefaults = sharingDefaults.map((d) => ({
      sharingType: Number(d.sharingType),
      name: String(d.name || `${d.sharingType}-Sharing`),
      rent: Number(d.rent || 0),
      deposit: Number(d.deposit || 0),
      maintenance: Number(d.maintenance || 0),
      bookingAmount: Number(d.bookingAmount || 0),
    }));
  }
  res.json(await Setting.findOneAndUpdate({ key: 'pg' }, upd, { new: true, upsert: true }));
}));

export default r;
