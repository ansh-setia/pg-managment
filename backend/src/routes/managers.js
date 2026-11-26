import { Router } from 'express';
import crypto from 'crypto';
import {
  User,
  Property,
  Workspace,
  Block,
  Room,
  Bed,
  ManagerAssignment,
  ManagerInvitation,
  ActivityLog,
  PERMISSION_PRESETS,
} from '../models.js';
import {
  ensureDefaultWorkspaceAndProperties,
  getEffectivePermissions,
  logActivity,
} from '../workspace.js';
import { HttpError, normPhone, wrap } from '../util.js';

const r = Router(); // mounted on /api/owner

// -----------------------------------------------------------------------------
// Middleware: Ensure owner workspace and default properties
// -----------------------------------------------------------------------------
const useWorkspace = async (req) => {
  const wsData = await ensureDefaultWorkspaceAndProperties(req.user);
  req.workspace = wsData.workspace;
  return wsData;
};

// -----------------------------------------------------------------------------
// 1. GET /api/owner/properties - List all properties with manager & bed stats
// -----------------------------------------------------------------------------
r.get('/properties', wrap(async (req, res) => {
  const { workspace } = await useWorkspace(req);
  const properties = await Property.find({ workspace: workspace._id, status: 'active' }).sort({ createdAt: 1 });

  const propIds = properties.map((p) => p._id);
  const [blocks, rooms, beds, assignments] = await Promise.all([
    Block.find({ property: { $in: propIds } }),
    Room.find({ property: { $in: propIds } }),
    Bed.find().populate({ path: 'room', populate: { path: 'property' } }),
    ManagerAssignment.find({ property: { $in: propIds }, status: 'active' }).populate('manager', 'name phone'),
  ]);

  const out = properties.map((p) => {
    const pRooms = rooms.filter((rm) => String(rm.property) === String(p._id));
    const pRoomIds = new Set(pRooms.map((rm) => String(rm._id)));
    const pBeds = beds.filter((b) => b.room && pRoomIds.has(String(b.room._id || b.room)));
    const pBlocks = blocks.filter((blk) => String(blk.property) === String(p._id));
    const pAssignments = assignments.filter((a) => String(a.property) === String(p._id));

    const primaryAss = pAssignments.find((a) => a.isPrimary);
    const supportingAss = pAssignments.filter((a) => !a.isPrimary);

    return {
      id: p._id,
      name: p.name,
      address: p.address,
      city: p.city,
      contactPhone: p.contactPhone,
      status: p.status,
      blocksCount: pBlocks.length,
      roomsCount: pRooms.length,
      totalBeds: pBeds.length,
      occupiedBeds: pBeds.filter((b) => b.status === 'occupied').length,
      vacantBeds: pBeds.filter((b) => b.status === 'vacant').length,
      noticeBeds: pBeds.filter((b) => b.status === 'notice').length,
      primaryManager: primaryAss?.manager
        ? { id: primaryAss.manager._id, name: primaryAss.manager.name, phone: primaryAss.manager.phone }
        : null,
      supportingManagers: supportingAss.map((a) => ({
        id: a.manager?._id,
        name: a.manager?.name,
        phone: a.manager?.phone,
        designation: a.designation,
      })),
      isManaged: pAssignments.length > 0,
      totalManagers: pAssignments.length,
    };
  });

  res.json({ properties: out });
}));

// -----------------------------------------------------------------------------
// 2. POST /api/owner/properties - Create a new PG property (with optional inline manager)
// -----------------------------------------------------------------------------
r.post('/properties', wrap(async (req, res) => {
  const { workspace } = await useWorkspace(req);
  const { name, address, city, contactPhone, description, managerId, managerPhone, managerName, isPrimary } = req.body;

  const propName = String(name || '').trim();
  if (!propName) throw new HttpError(400, 'Property name is required');

  const exists = await Property.findOne({ workspace: workspace._id, name: new RegExp(`^${propName}$`, 'i'), status: 'active' });
  if (exists) throw new HttpError(409, `A property named "${propName}" already exists in your workspace`);

  const property = await Property.create({
    workspace: workspace._id,
    owner: req.user._id,
    name: propName,
    address: String(address || '').trim(),
    city: String(city || '').trim(),
    contactPhone: String(contactPhone || req.user.phone).trim(),
    description: String(description || '').trim(),
    status: 'active',
  });

  let assignedManager = null;
  // Inline manager allotment
  if (managerId) {
    const mgr = await User.findById(managerId);
    if (mgr && mgr.role === 'manager') {
      assignedManager = await ManagerAssignment.create({
        manager: mgr._id,
        property: property._id,
        workspace: workspace._id,
        owner: req.user._id,
        permissionPreset: 'full',
        customPermissions: PERMISSION_PRESETS.full,
        isPrimary: isPrimary !== false,
        designation: isPrimary !== false ? 'primary' : 'supporting',
        status: 'active',
        assignedBy: req.user._id,
      });
      await logActivity({
        workspace: workspace._id,
        property: property._id,
        performedBy: req.user._id,
        targetUser: mgr._id,
        actionType: 'property_assigned',
        description: `Assigned manager ${mgr.name} to new property ${property.name}`,
      });
    }
  } else if (managerPhone && managerName) {
    // Inline invite new manager
    const cleanPhone = normPhone(managerPhone);
    let mgr = await User.findOne({ phone: cleanPhone });
    if (!mgr) {
      mgr = await User.create({
        phone: cleanPhone,
        name: String(managerName).trim(),
        role: 'manager',
        active: true,
      });
    }

    assignedManager = await ManagerAssignment.create({
      manager: mgr._id,
      property: property._id,
      workspace: workspace._id,
      owner: req.user._id,
      permissionPreset: 'full',
      customPermissions: PERMISSION_PRESETS.full,
      isPrimary: isPrimary !== false,
      designation: isPrimary !== false ? 'primary' : 'supporting',
      status: 'active',
      assignedBy: req.user._id,
    });
  }

  await logActivity({
    workspace: workspace._id,
    property: property._id,
    performedBy: req.user._id,
    actionType: 'property_created',
    description: `Created property ${property.name}`,
  });

  res.status(201).json({ ok: true, property, assignment: assignedManager });
}));

// -----------------------------------------------------------------------------
// 3. GET /api/owner/managers - Comprehensive Managers Dashboard Data
// -----------------------------------------------------------------------------
r.get('/managers', wrap(async (req, res) => {
  const { workspace, properties } = await useWorkspace(req);
  const propIds = properties.map((p) => p._id);
  const propMap = new Map(properties.map((p) => [String(p._id), p]));

  // Find all assignments under this workspace
  const assignments = await ManagerAssignment.find({
    workspace: workspace._id,
    property: { $in: propIds },
  }).populate('manager', 'name phone email active createdAt');

  // Find pending invitations
  const invitations = await ManagerInvitation.find({
    workspace: workspace._id,
    status: 'pending',
    expiresAt: { $gt: new Date() },
  }).populate('propertyAssignments.property', 'name');

  // Group assignments by manager
  const managerMap = new Map();

  for (const ass of assignments) {
    if (!ass.manager) continue;
    const mId = String(ass.manager._id);
    if (!managerMap.has(mId)) {
      managerMap.set(mId, {
        id: ass.manager._id,
        name: ass.manager.name,
        phone: ass.manager.phone,
        email: ass.manager.email || '',
        active: ass.manager.active,
        createdAt: ass.manager.createdAt,
        assignments: [],
      });
    }
    const prop = propMap.get(String(ass.property));
    managerMap.get(mId).assignments.push({
      id: ass._id,
      propertyId: ass.property,
      propertyName: prop?.name || 'Unknown PG',
      permissionPreset: ass.permissionPreset,
      customPermissions: ass.customPermissions,
      isPrimary: ass.isPrimary,
      designation: ass.designation,
      status: ass.status,
      validFrom: ass.validFrom,
      validUntil: ass.validUntil,
      suspendedAt: ass.suspendedAt,
    });
  }

  // Format manager cards
  const managers = Array.from(managerMap.values()).map((mgr) => {
    const activeAss = mgr.assignments.filter((a) => a.status === 'active');
    const isSuspended = mgr.assignments.some((a) => a.status === 'suspended') && activeAss.length === 0;

    let status = 'active';
    if (!mgr.active || isSuspended) status = 'suspended';
    else if (activeAss.length === 0) status = 'unassigned';

    // Primary designation
    const isPrimaryAny = activeAss.some((a) => a.isPrimary);

    // Permission role display
    let permissionRole = 'Full Manager';
    if (activeAss.every((a) => a.permissionPreset === 'caretaker')) permissionRole = 'Caretaker';
    else if (activeAss.some((a) => a.permissionPreset === 'custom')) permissionRole = 'Custom Access';

    return {
      id: mgr.id,
      name: mgr.name,
      phone: mgr.phone,
      email: mgr.email,
      status,
      assignedProperties: activeAss.map((a) => ({
        id: a.propertyId,
        name: a.propertyName,
        isPrimary: a.isPrimary,
        designation: a.designation,
        permissionPreset: a.permissionPreset,
      })),
      allAssignments: mgr.assignments,
      assignedCount: activeAss.length,
      permissionRole,
      isPrimary: isPrimaryAny,
      createdAt: mgr.createdAt,
    };
  });

  // Calculate high-level metrics
  const activeManagersCount = managers.filter((m) => m.status === 'active').length;
  const managedPropsSet = new Set(
    assignments.filter((a) => a.status === 'active').map((a) => String(a.property))
  );
  const managedPropertiesCount = managedPropsSet.size;
  const unassignedPropertiesCount = Math.max(0, properties.length - managedPropertiesCount);

  // Summary object
  const summary = {
    totalManagers: managers.length,
    activeManagers: activeManagersCount,
    managedProperties: managedPropertiesCount,
    unassignedProperties: unassignedPropertiesCount,
    totalProperties: properties.length,
  };

  res.json({
    summary,
    managers,
    properties: properties.map((p) => ({
      id: p._id,
      name: p.name,
      address: p.address,
      city: p.city,
      isManaged: managedPropsSet.has(String(p._id)),
    })),
    invitations: invitations.map((inv) => ({
      id: inv._id,
      name: inv.name,
      phone: inv.phone,
      email: inv.email,
      token: inv.token,
      expiresAt: inv.expiresAt,
      properties: inv.propertyAssignments.map((pa) => pa.property?.name).filter(Boolean),
    })),
  });
}));

// -----------------------------------------------------------------------------
// 4. GET /api/owner/managers/lookup - Real-time lookup by phone
// -----------------------------------------------------------------------------
r.get('/managers/lookup', wrap(async (req, res) => {
  const { workspace } = await useWorkspace(req);
  const phone = normPhone(req.query.phone);
  if (!phone || phone.length < 10) {
    return res.json({ exists: false });
  }

  const user = await User.findOne({ phone });
  if (!user) {
    return res.json({ exists: false, inWorkspace: false });
  }

  // Check if they already have assignments in this workspace
  const assignments = await ManagerAssignment.find({
    workspace: workspace._id,
    manager: user._id,
    status: 'active',
  });

  res.json({
    exists: true,
    inWorkspace: assignments.length > 0 || user.role === 'manager',
    name: user.name,
    phone: user.phone,
    email: user.email || '',
    role: user.role,
    active: user.active,
    currentPropertyIds: assignments.map((a) => String(a.property)),
  });
}));

// -----------------------------------------------------------------------------
// 5. POST /api/owner/managers - Smart Add / Invite Manager
// -----------------------------------------------------------------------------
r.post('/managers', wrap(async (req, res) => {
  const { workspace, properties } = await useWorkspace(req);
  const {
    phone,
    name,
    email,
    propertyAssignments = [],
    permissionPreset = 'full',
    customPermissions,
    isPrimary = false,
  } = req.body;

  const cleanPhone = normPhone(phone);
  if (!cleanPhone || cleanPhone.length !== 10) {
    throw new HttpError(400, 'Valid 10-digit mobile number is required');
  }

  const managerName = String(name || '').trim();
  if (!managerName) throw new HttpError(400, 'Manager name is required');

  if (!Array.isArray(propertyAssignments) || propertyAssignments.length === 0) {
    throw new HttpError(400, 'Please select at least one property to assign');
  }

  // Validate property IDs belong to this workspace
  const propIdSet = new Set(properties.map((p) => String(p._id)));
  for (const pa of propertyAssignments) {
    const pid = String(pa.propertyId || pa);
    if (!propIdSet.has(pid)) {
      throw new HttpError(400, `Invalid property selection: ${pid}`);
    }
  }

  // Find or create user
  let user = await User.findOne({ phone: cleanPhone });
  const isNewUser = !user;
  if (!user) {
    user = await User.create({
      phone: cleanPhone,
      name: managerName,
      role: 'manager',
      active: true,
    });
  } else {
    // If existing user was not active or name updated
    if (!user.active) user.active = true;
    if (managerName && user.name !== managerName) user.name = managerName;
    if (user.role !== 'malik') user.role = 'manager';
    await user.save();
  }

  // Create assignments
  const createdAssignments = [];
  const now = new Date();

  for (const pa of propertyAssignments) {
    const pid = String(pa.propertyId || pa);
    const primary = pa.isPrimary !== undefined ? Boolean(pa.isPrimary) : Boolean(isPrimary);
    const preset = pa.permissionPreset || permissionPreset || 'full';
    const cPerms = pa.customPermissions || customPermissions || PERMISSION_PRESETS[preset] || PERMISSION_PRESETS.full;
    const designation = pa.designation || (primary ? 'primary' : 'supporting');

    // If setting as primary, demote any previous primary manager on this property to supporting
    if (primary) {
      await ManagerAssignment.updateMany(
        { property: pid, isPrimary: true, status: 'active' },
        { isPrimary: false, designation: 'supporting' }
      );
    }

    // Upsert assignment for this manager and property
    let ass = await ManagerAssignment.findOne({ manager: user._id, property: pid });
    if (ass) {
      ass.status = 'active';
      ass.permissionPreset = preset;
      ass.customPermissions = cPerms;
      ass.isPrimary = primary;
      ass.designation = designation;
      ass.validFrom = pa.validFrom || now;
      ass.validUntil = pa.validUntil || null;
      ass.assignedBy = req.user._id;
      ass.suspendedAt = null;
      ass.revokedAt = null;
      await ass.save();
    } else {
      ass = await ManagerAssignment.create({
        manager: user._id,
        property: pid,
        workspace: workspace._id,
        owner: req.user._id,
        permissionPreset: preset,
        customPermissions: cPerms,
        isPrimary: primary,
        designation,
        status: 'active',
        validFrom: pa.validFrom || now,
        validUntil: pa.validUntil || null,
        assignedBy: req.user._id,
      });
    }
    createdAssignments.push(ass);
  }

  // Create Invitation record if new or invited
  const token = crypto.randomBytes(24).toString('hex');
  const invite = await ManagerInvitation.create({
    workspace: workspace._id,
    owner: req.user._id,
    phone: cleanPhone,
    name: managerName,
    email: String(email || '').trim(),
    token,
    status: isNewUser ? 'pending' : 'accepted',
    propertyAssignments: createdAssignments.map((a) => ({
      property: a.property,
      isPrimary: a.isPrimary,
      designation: a.designation,
      permissionPreset: a.permissionPreset,
      customPermissions: a.customPermissions,
    })),
    expiresAt: new Date(Date.now() + 7 * 86400000),
    acceptedAt: isNewUser ? null : new Date(),
  });

  await logActivity({
    workspace: workspace._id,
    performedBy: req.user._id,
    targetUser: user._id,
    actionType: isNewUser ? 'manager_invited' : 'manager_assigned',
    description: `Assigned manager ${user.name} (${user.phone}) to ${createdAssignments.length} properties`,
    details: { propertiesCount: createdAssignments.length },
  });

  res.status(201).json({
    ok: true,
    manager: { id: user._id, name: user.name, phone: user.phone },
    assignments: createdAssignments,
    inviteToken: token,
    inviteLink: `${req.protocol}://${req.get('host')}/onboard/${token}`,
    message: `Manager ${user.name} assigned to ${createdAssignments.length} properties ✓`,
  });
}));

// -----------------------------------------------------------------------------
// 6. PUT /api/owner/managers/:id/properties - Manage Properties (Target 3 clicks)
// -----------------------------------------------------------------------------
r.put('/managers/:id/properties', wrap(async (req, res) => {
  const { workspace, properties } = await useWorkspace(req);
  const manager = await User.findById(req.params.id);
  if (!manager) throw new HttpError(404, 'Manager not found');

  const { properties: requestedProps = [] } = req.body;
  const propIdSet = new Set(properties.map((p) => String(p._id)));

  // Requested property IDs map
  const requestedMap = new Map();
  for (const item of requestedProps) {
    const pid = typeof item === 'string' ? item : item.propertyId;
    if (propIdSet.has(String(pid))) {
      requestedMap.set(String(pid), typeof item === 'object' ? item : {});
    }
  }

  // Current active assignments for this manager
  const currentAss = await ManagerAssignment.find({
    workspace: workspace._id,
    manager: manager._id,
    status: 'active',
  });
  const currentMap = new Map(currentAss.map((a) => [String(a.property), a]));

  const added = [];
  const removed = [];
  const retained = [];
  const now = new Date();

  // 1. Remove assignments for properties not in requestedMap
  for (const [pid, ass] of currentMap.entries()) {
    if (!requestedMap.has(pid)) {
      ass.status = 'expired';
      ass.revokedAt = now;
      await ass.save();
      removed.push(pid);
    }
  }

  // 2. Add or update assignments
  for (const [pid, cfg] of requestedMap.entries()) {
    const isPrimary = Boolean(cfg.isPrimary);
    const preset = cfg.permissionPreset || 'full';
    const cPerms = cfg.customPermissions || PERMISSION_PRESETS[preset] || PERMISSION_PRESETS.full;
    const designation = cfg.designation || (isPrimary ? 'primary' : 'supporting');

    if (isPrimary) {
      // Demote previous primary on this property
      await ManagerAssignment.updateMany(
        { property: pid, isPrimary: true, status: 'active', manager: { $ne: manager._id } },
        { isPrimary: false, designation: 'supporting' }
      );
    }

    if (currentMap.has(pid)) {
      // Retained and updated
      const ass = currentMap.get(pid);
      ass.isPrimary = isPrimary;
      ass.designation = designation;
      if (cfg.permissionPreset) ass.permissionPreset = preset;
      if (cfg.customPermissions) ass.customPermissions = cPerms;
      if (cfg.validUntil !== undefined) ass.validUntil = cfg.validUntil;
      await ass.save();
      retained.push(pid);
    } else {
      // Newly added assignment
      let ass = await ManagerAssignment.findOne({ manager: manager._id, property: pid });
      if (ass) {
        ass.status = 'active';
        ass.isPrimary = isPrimary;
        ass.designation = designation;
        ass.permissionPreset = preset;
        ass.customPermissions = cPerms;
        ass.validFrom = cfg.validFrom || now;
        ass.validUntil = cfg.validUntil || null;
        ass.revokedAt = null;
        ass.suspendedAt = null;
        await ass.save();
      } else {
        await ManagerAssignment.create({
          manager: manager._id,
          property: pid,
          workspace: workspace._id,
          owner: req.user._id,
          permissionPreset: preset,
          customPermissions: cPerms,
          isPrimary,
          designation,
          status: 'active',
          validFrom: cfg.validFrom || now,
          validUntil: cfg.validUntil || null,
          assignedBy: req.user._id,
        });
      }
      added.push(pid);
    }
  }

  await logActivity({
    workspace: workspace._id,
    performedBy: req.user._id,
    targetUser: manager._id,
    actionType: 'properties_updated',
    description: `Updated property assignments for ${manager.name}: +${added.length}, -${removed.length}, retained ${retained.length}`,
    details: { added, removed, retained },
  });

  res.json({
    ok: true,
    stats: { added: added.length, removed: removed.length, retained: retained.length, total: requestedMap.size },
    message: `Assignments updated for ${manager.name} (${requestedMap.size} properties) ✓`,
  });
}));

// -----------------------------------------------------------------------------
// 7. PATCH /api/owner/managers/:id/permissions - Change permission preset
// -----------------------------------------------------------------------------
r.patch('/managers/:id/permissions', wrap(async (req, res) => {
  const { workspace } = await useWorkspace(req);
  const manager = await User.findById(req.params.id);
  if (!manager) throw new HttpError(404, 'Manager not found');

  const { propertyId, permissionPreset = 'full', customPermissions } = req.body;
  const filter = { workspace: workspace._id, manager: manager._id, status: 'active' };
  if (propertyId) filter.property = propertyId;

  const cPerms = customPermissions || PERMISSION_PRESETS[permissionPreset] || PERMISSION_PRESETS.full;
  await ManagerAssignment.updateMany(filter, {
    permissionPreset,
    customPermissions: cPerms,
  });

  await logActivity({
    workspace: workspace._id,
    property: propertyId || undefined,
    performedBy: req.user._id,
    targetUser: manager._id,
    actionType: 'permissions_updated',
    description: `Changed permission preset to ${permissionPreset} for ${manager.name}`,
  });

  res.json({ ok: true, message: `Permissions updated to ${permissionPreset} for ${manager.name} ✓` });
}));

// -----------------------------------------------------------------------------
// 8. POST /api/owner/managers/:id/suspend - Suspend Manager
// -----------------------------------------------------------------------------
r.post('/managers/:id/suspend', wrap(async (req, res) => {
  const { workspace } = await useWorkspace(req);
  const manager = await User.findById(req.params.id);
  if (!manager) throw new HttpError(404, 'Manager not found');

  const now = new Date();
  await ManagerAssignment.updateMany(
    { workspace: workspace._id, manager: manager._id, status: 'active' },
    { status: 'suspended', suspendedAt: now }
  );

  await logActivity({
    workspace: workspace._id,
    performedBy: req.user._id,
    targetUser: manager._id,
    actionType: 'manager_suspended',
    description: `Suspended access for ${manager.name}`,
  });

  res.json({ ok: true, message: `Access suspended for ${manager.name} ✓` });
}));

// -----------------------------------------------------------------------------
// 9. POST /api/owner/managers/:id/reactivate - Reactivate Manager
// -----------------------------------------------------------------------------
r.post('/managers/:id/reactivate', wrap(async (req, res) => {
  const { workspace } = await useWorkspace(req);
  const manager = await User.findById(req.params.id);
  if (!manager) throw new HttpError(404, 'Manager not found');

  await ManagerAssignment.updateMany(
    { workspace: workspace._id, manager: manager._id, status: 'suspended' },
    { status: 'active', suspendedAt: null }
  );

  await logActivity({
    workspace: workspace._id,
    performedBy: req.user._id,
    targetUser: manager._id,
    actionType: 'manager_reactivated',
    description: `Reactivated access for ${manager.name}`,
  });

  res.json({ ok: true, message: `Access restored for ${manager.name} ✓` });
}));

// -----------------------------------------------------------------------------
// 10. DELETE /api/owner/managers/:id - Remove Manager from Workspace
// -----------------------------------------------------------------------------
r.delete('/managers/:id', wrap(async (req, res) => {
  const { workspace } = await useWorkspace(req);
  const manager = await User.findById(req.params.id);
  if (!manager) throw new HttpError(404, 'Manager not found');

  const now = new Date();
  await ManagerAssignment.updateMany(
    { workspace: workspace._id, manager: manager._id },
    { status: 'expired', revokedAt: now }
  );

  await logActivity({
    workspace: workspace._id,
    performedBy: req.user._id,
    targetUser: manager._id,
    actionType: 'manager_removed',
    description: `Removed manager ${manager.name} from workspace`,
  });

  res.json({ ok: true, message: `Manager ${manager.name} removed from your workspace ✓` });
}));

// -----------------------------------------------------------------------------
// 11. POST /api/owner/managers/replace - Transactional Manager Replacement
// -----------------------------------------------------------------------------
r.post('/managers/replace', wrap(async (req, res) => {
  const { workspace, properties } = await useWorkspace(req);
  const { propertyId, oldManagerId, newManagerId, action = 'demote_to_supporting' } = req.body;

  const prop = properties.find((p) => String(p._id) === String(propertyId));
  if (!prop) throw new HttpError(404, 'Property not found');

  const [oldMgr, newMgr] = await Promise.all([
    User.findById(oldManagerId),
    User.findById(newManagerId),
  ]);
  if (!oldMgr || !newMgr) throw new HttpError(404, 'Managers not found');

  // Handle old manager
  if (action === 'remove_old') {
    await ManagerAssignment.updateOne(
      { workspace: workspace._id, property: prop._id, manager: oldMgr._id },
      { status: 'expired', revokedAt: new Date(), isPrimary: false }
    );
  } else {
    // Demote to supporting
    await ManagerAssignment.updateOne(
      { workspace: workspace._id, property: prop._id, manager: oldMgr._id },
      { isPrimary: false, designation: 'supporting' }
    );
  }

  // Set new manager as primary
  let newAss = await ManagerAssignment.findOne({ workspace: workspace._id, property: prop._id, manager: newMgr._id });
  if (newAss) {
    newAss.status = 'active';
    newAss.isPrimary = true;
    newAss.designation = 'primary';
    await newAss.save();
  } else {
    await ManagerAssignment.create({
      manager: newMgr._id,
      property: prop._id,
      workspace: workspace._id,
      owner: req.user._id,
      permissionPreset: 'full',
      customPermissions: PERMISSION_PRESETS.full,
      isPrimary: true,
      designation: 'primary',
      status: 'active',
      assignedBy: req.user._id,
    });
  }

  await logActivity({
    workspace: workspace._id,
    property: prop._id,
    performedBy: req.user._id,
    targetUser: newMgr._id,
    actionType: 'primary_manager_replaced',
    description: `Replaced ${oldMgr.name} with ${newMgr.name} as primary manager of ${prop.name}`,
    details: { oldManager: oldMgr.name, newManager: newMgr.name, action },
  });

  res.json({
    ok: true,
    message: `${newMgr.name} is now the primary manager of ${prop.name} ✓`,
  });
}));

// -----------------------------------------------------------------------------
// 12. GET /api/owner/managers/:id/activity - Audit Logs
// -----------------------------------------------------------------------------
r.get('/managers/:id/activity', wrap(async (req, res) => {
  const { workspace } = await useWorkspace(req);
  const logs = await ActivityLog.find({
    workspace: workspace._id,
    $or: [{ targetUser: req.params.id }, { performedBy: req.params.id }],
  })
    .populate('property', 'name')
    .populate('performedBy', 'name phone')
    .populate('targetUser', 'name phone')
    .sort({ timestamp: -1 })
    .limit(50);

  res.json({ logs });
}));

// -----------------------------------------------------------------------------
// 13. POST /api/owner/managers/bulk - Bulk Operations
// -----------------------------------------------------------------------------
r.post('/managers/bulk', wrap(async (req, res) => {
  const { workspace } = await useWorkspace(req);
  const { action, managerIds = [], propertyIds = [], permissionPreset = 'full' } = req.body;

  if (!Array.isArray(managerIds) || managerIds.length === 0) {
    throw new HttpError(400, 'Please select at least one manager');
  }

  const now = new Date();
  if (action === 'suspend') {
    await ManagerAssignment.updateMany(
      { workspace: workspace._id, manager: { $in: managerIds }, status: 'active' },
      { status: 'suspended', suspendedAt: now }
    );
    return res.json({ ok: true, message: `Suspended ${managerIds.length} managers ✓` });
  }

  if (action === 'remove') {
    await ManagerAssignment.updateMany(
      { workspace: workspace._id, manager: { $in: managerIds } },
      { status: 'expired', revokedAt: now }
    );
    return res.json({ ok: true, message: `Removed ${managerIds.length} managers ✓` });
  }

  if (action === 'assign_properties') {
    if (!Array.isArray(propertyIds) || propertyIds.length === 0) {
      throw new HttpError(400, 'Please select at least one property');
    }
    const preset = permissionPreset || 'full';
    const cPerms = PERMISSION_PRESETS[preset] || PERMISSION_PRESETS.full;

    let total = 0;
    for (const mId of managerIds) {
      for (const pId of propertyIds) {
        await ManagerAssignment.findOneAndUpdate(
          { manager: mId, property: pId },
          {
            $set: {
              workspace: workspace._id,
              owner: req.user._id,
              status: 'active',
              permissionPreset: preset,
              customPermissions: cPerms,
              assignedBy: req.user._id,
              revokedAt: null,
              suspendedAt: null,
            },
          },
          { upsert: true }
        );
        total++;
      }
    }
    return res.json({ ok: true, message: `Created/updated ${total} property assignments ✓` });
  }

  throw new HttpError(400, `Unknown bulk action: ${action}`);
}));

export default r;
