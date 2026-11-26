import { Router } from 'express';
import { Block, Room, Bed, Tenant, Payment, Setting, Property } from '../models.js';
import { ensureDues, getSettings } from '../billing.js';
import { sendWhatsApp } from '../notify.js';
import { ensureDefaultWorkspaceAndProperties } from '../workspace.js';
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
  if (!name) throw new HttpError(400, 'Block name is required');
  const existing = await Block.findOne({ name: new RegExp(`^${name}$`, 'i') });
  if (existing) throw new HttpError(409, 'A block with this name already exists');

  const wsData = await ensureDefaultWorkspaceAndProperties(req.user);
  const targetPropId = req.body.propertyId || wsData?.properties[0]?._id;

  const block = await Block.create({
    property: targetPropId,
    name,
    description: String(req.body.description || '').trim(),
  });
  res.status(201).json(block);
}));

export function generateRoomNumber(prefix, floor, roomIndex) {
  const p = (prefix || '').trim();
  const pad = String(roomIndex).padStart(2, '0');
  if (floor === 0) {
    return `${p}0${pad}`;
  }
  return `${p}${floor}${pad}`;
}

r.post('/blocks/bulk', wrap(async (req, res) => {
  const { name, description = '', prefix, defaultBeds = 2, bedRent, initialReading = 0, floors = [] } = req.body;
  const blockName = String(name || '').trim();
  if (!blockName) throw new HttpError(400, 'Block name is required');

  const bedsPerRoom = Number(defaultBeds);
  if (!bedsPerRoom || bedsPerRoom < 1 || bedsPerRoom > 15) {
    throw new HttpError(400, 'Default beds per room must be between 1 and 15');
  }

  if (!Array.isArray(floors) || floors.length === 0) {
    throw new HttpError(400, 'At least one floor configuration is required');
  }

  // Validate floor counts
  for (const fl of floors) {
    const rCount = Number(fl.rooms);
    if (!rCount || rCount < 1 || rCount > 100) {
      throw new HttpError(400, `Invalid room count for Floor ${fl.floor ?? 'unknown'}. Must be between 1 and 100.`);
    }
  }

  // Check unique block name
  const existingBlock = await Block.findOne({ name: new RegExp(`^${blockName}$`, 'i') });
  if (existingBlock) throw new HttpError(409, `A block named "${blockName}" already exists`);

  // Compute prefix
  let cleanPrefix = String(prefix || '').trim();
  if (!cleanPrefix) {
    cleanPrefix = blockName.replace(/^Block\s+/i, '').replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'A';
  }

  // Determine rent
  const settings = await getSettings();
  const tier = settings.sharingDefaults?.find((s) => s.sharingType === bedsPerRoom);
  const finalRent = Number(bedRent) || tier?.rent || (bedsPerRoom === 1 ? 12000 : bedsPerRoom === 2 ? 7500 : bedsPerRoom === 3 ? 6000 : 5000);

  // Generate room numbers and check collisions
  const roomDefs = [];
  const roomNumbers = [];
  for (const fl of floors) {
    const floorNum = Number(fl.floor ?? 0);
    const count = Number(fl.rooms);
    for (let rIdx = 1; rIdx <= count; rIdx++) {
      const roomNo = generateRoomNumber(cleanPrefix, floorNum, rIdx);
      roomNumbers.push(roomNo);
      roomDefs.push({
        number: roomNo,
        floor: floorNum,
        sharingType: bedsPerRoom,
        initialReading: Number(initialReading || 0),
      });
    }
  }

  // Check duplicates in payload
  const uniqueInPayload = new Set(roomNumbers);
  if (uniqueInPayload.size !== roomNumbers.length) {
    throw new HttpError(400, 'Generated room numbers contain duplicates. Check floor numbers.');
  }

  // Check collisions in database
  const conflicts = await Room.find({ number: { $in: roomNumbers } }).populate('block');
  if (conflicts.length > 0) {
    const sample = conflicts.slice(0, 3).map((c) => `Room ${c.number} (${c.block?.name || 'existing block'})`).join(', ');
    throw new HttpError(409, `Room numbers already exist in PG: ${sample}. Please choose a different block name or prefix.`);
  }

  // Atomic creation with rollback guarantee
  const wsData = await ensureDefaultWorkspaceAndProperties(req.user);
  const targetPropId = req.body.propertyId || wsData?.properties[0]?._id;

  const block = await Block.create({
    property: targetPropId,
    name: blockName,
    description: String(description || '').trim(),
  });

  let createdRoomIds = [];
  try {
    const roomsToInsert = roomDefs.map((rd) => ({
      property: block.property,
      block: block._id,
      number: rd.number,
      floor: rd.floor,
      sharingType: rd.sharingType,
      initialReading: rd.initialReading,
    }));
    const createdRooms = await Room.insertMany(roomsToInsert);
    createdRoomIds = createdRooms.map((r) => r._id);

    const bedsToInsert = [];
    const now = new Date();
    for (const rm of createdRooms) {
      for (let b = 1; b <= rm.sharingType; b++) {
        bedsToInsert.push({
          room: rm._id,
          label: `${rm.number}-${b}`,
          rent: finalRent,
          status: 'vacant',
          vacantSince: now,
        });
      }
    }
    const createdBeds = await Bed.insertMany(bedsToInsert);

    res.status(201).json({
      ok: true,
      block,
      stats: {
        floors: floors.length,
        rooms: createdRooms.length,
        beds: createdBeds.length,
      },
    });
  } catch (err) {
    // Rollback completely
    if (createdRoomIds.length > 0) {
      await Bed.deleteMany({ room: { $in: createdRoomIds } });
      await Room.deleteMany({ _id: { $in: createdRoomIds } });
    }
    await Block.findByIdAndDelete(block._id);
    throw err;
  }
}));

r.delete('/blocks/:id', wrap(async (req, res) => {
  const hasRooms = await Room.exists({ block: req.params.id });
  if (hasRooms) throw new HttpError(400, 'This block still contains rooms. Please delete or move them first.');
  const b = await Block.findByIdAndDelete(req.params.id);
  if (!b) throw new HttpError(404, 'Block not found');
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

  const wsData = await ensureDefaultWorkspaceAndProperties(_req.user);
  const properties = await Property.find({ workspace: wsData?.workspace?._id, status: 'active' }).sort({ createdAt: 1 });

  res.json({
    properties: properties.map((p) => ({ id: p._id, name: p.name, address: p.address, city: p.city })),
    blocks: blocks.map((blk) => ({ id: blk._id, name: blk.name, description: blk.description, propertyId: blk.property })),
    rooms: roomList,
    sharingDefaults: settings.sharingDefaults || [],
  });
}));

r.post('/rooms', wrap(async (req, res) => {
  let { blockId, floor, number, sharingType, rent, initialReading } = req.body;
  number = String(number || '').trim();
  if (!number) throw new HttpError(400, 'Room number is required');
  floor = Number(floor ?? 0);
  sharingType = Number(sharingType || 2);
  if (sharingType < 1 || sharingType > 15) throw new HttpError(400, 'Sharing type must be between 1 and 15');

  let block;
  if (blockId) {
    block = await Block.findById(blockId);
    if (!block) throw new HttpError(404, 'Block not found');
  } else {
    block = (await Block.findOne()) || (await Block.create({ name: 'Main Wing', description: 'Primary Building' }));
  }

  const exists = await Room.findOne({ block: block._id, number });
  if (exists) throw new HttpError(409, `Room ${number} already exists in this block`);

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
  if (hasOccupants) throw new HttpError(400, 'This room still has occupied or on-notice beds. Please check out tenants first.');
  await Bed.deleteMany({ room: req.params.id });
  const rm = await Room.findByIdAndDelete(req.params.id);
  if (!rm) throw new HttpError(404, 'Room not found');
  res.json({ ok: true });
}));

r.put('/rooms/:id', wrap(async (req, res) => {
  const { number, floor, initialReading, blockId, beds: updatedBeds } = req.body;
  const room = await Room.findById(req.params.id);
  if (!room) throw new HttpError(404, 'Room not found');

  // Check unique room number if changing
  const cleanNumber = String(number || '').trim();
  if (cleanNumber && cleanNumber !== room.number) {
    const targetBlockId = blockId || room.block;
    const exists = await Room.findOne({ _id: { $ne: room._id }, block: targetBlockId, number: cleanNumber });
    if (exists) throw new HttpError(409, `Room ${cleanNumber} already exists in this block`);
    room.number = cleanNumber;
  }

  if (floor !== undefined) {
    const fNum = Number(floor);
    if (!isNaN(fNum)) room.floor = fNum;
  }

  if (initialReading !== undefined) {
    const ir = Number(initialReading);
    if (!isNaN(ir)) room.initialReading = Math.max(0, ir);
  }

  if (blockId && String(blockId) !== String(room.block)) {
    const blk = await Block.findById(blockId);
    if (!blk) throw new HttpError(404, 'Block not found');
    room.block = blk._id;
  }

  // Process beds if provided
  if (Array.isArray(updatedBeds)) {
    const existingBeds = await Bed.find({ room: room._id });
    const existingMap = new Map(existingBeds.map((b) => [String(b._id), b]));
    const retainedIds = new Set();

    for (let idx = 0; idx < updatedBeds.length; idx++) {
      const bData = updatedBeds[idx];
      const bedId = bData.id || bData._id;

      if (bedId && existingMap.has(String(bedId))) {
        // Update existing bed
        const bed = existingMap.get(String(bedId));
        if (bData.label !== undefined && String(bData.label).trim()) {
          bed.label = String(bData.label).trim();
        }
        if (bData.rent !== undefined) {
          const rVal = Number(bData.rent);
          if (rVal >= 0) bed.rent = rVal;
        }
        await bed.save();
        retainedIds.add(String(bed._id));
      } else if (bData.isNew || !bedId) {
        // Create new bed
        const label = String(bData.label || `${room.number}-${idx + 1}`).trim();
        const rent = Number(bData.rent) >= 0 ? Number(bData.rent) : 7500;
        const newBed = await Bed.create({
          room: room._id,
          label,
          rent,
          status: 'vacant',
          vacantSince: new Date(),
        });
        retainedIds.add(String(newBed._id));
      }
    }

    // Delete any existing beds that were omitted in updatedBeds
    for (const b of existingBeds) {
      if (!retainedIds.has(String(b._id))) {
        if (b.status !== 'vacant') {
          throw new HttpError(400, `Cannot remove Bed ${b.label} because it is currently occupied or on notice.`);
        }
        await Bed.findByIdAndDelete(b._id);
      }
    }

    const totalActiveBeds = await Bed.countDocuments({ room: room._id });
    room.sharingType = Math.max(1, totalActiveBeds);
  }

  await room.save();
  const freshBeds = await Bed.find({ room: room._id }).sort({ label: 1 });
  res.json({ ok: true, room, beds: freshBeds });
}));

r.post('/rooms/:id/beds', wrap(async (req, res) => {
  const room = await Room.findById(req.params.id);
  if (!room) throw new HttpError(404, 'Room not found');

  const existingBeds = await Bed.find({ room: room._id });
  const count = existingBeds.length;
  const label = String(req.body.label || `${room.number}-${count + 1}`).trim();
  const rent = Number(req.body.rent) >= 0 ? Number(req.body.rent) : (existingBeds[0]?.rent || 7500);

  const bed = await Bed.create({
    room: room._id,
    label,
    rent,
    status: 'vacant',
    vacantSince: new Date(),
  });

  room.sharingType = count + 1;
  await room.save();

  res.status(201).json({ ok: true, bed, room });
}));

r.patch('/beds/:id', wrap(async (req, res) => {
  const bed = await Bed.findById(req.params.id);
  if (!bed) throw new HttpError(404, 'Bed not found');

  const { rent, label } = req.body;
  if (rent !== undefined) {
    const rVal = Number(rent);
    if (rVal >= 0) bed.rent = rVal;
  }
  if (label !== undefined && String(label).trim()) {
    bed.label = String(label).trim();
  }
  await bed.save();
  res.json({ ok: true, bed });
}));

r.delete('/beds/:id', wrap(async (req, res) => {
  const bed = await Bed.findById(req.params.id);
  if (!bed) throw new HttpError(404, 'Bed not found');
  if (bed.status !== 'vacant') {
    throw new HttpError(400, `Cannot delete Bed ${bed.label} as it is currently occupied or on notice.`);
  }

  const roomId = bed.room;
  await Bed.findByIdAndDelete(bed._id);

  if (roomId) {
    const remaining = await Bed.countDocuments({ room: roomId });
    await Room.findByIdAndUpdate(roomId, { sharingType: Math.max(1, remaining) });
  }

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
    if (!(Number(ratePerUnit) > 0)) throw new HttpError(400, 'Please enter a valid rate per unit');
    upd.ratePerUnit = Number(ratePerUnit);
  }
  if (dueDay != null) {
    if (!(dueDay >= 1 && dueDay <= 28)) throw new HttpError(400, 'Due date must be between the 1st and 28th of the month');
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
