import { Workspace, Property, Block, Room, User, ManagerAssignment, ActivityLog, Setting, PERMISSION_PRESETS } from './models.js';

/**
 * Ensures that the owner has a workspace and at least one default property,
 * associating any unassigned blocks and rooms to the default property,
 * and ensuring existing managers have valid assignments.
 */
export async function ensureDefaultWorkspaceAndProperties(ownerUser) {
  if (!ownerUser) return null;

  let ws = await Workspace.findOne({ owner: ownerUser._id });
  if (!ws) {
    ws = await Workspace.create({
      owner: ownerUser._id,
      name: `${ownerUser.name || 'Owner'}'s Workspace`,
    });
  }

  let properties = await Property.find({ workspace: ws._id, status: 'active' }).sort({ createdAt: 1 });
  if (properties.length === 0) {
    const setting = await Setting.findOne({ key: 'pg' });
    const def = await Property.create({
      workspace: ws._id,
      owner: ownerUser._id,
      name: setting?.name || 'Unistayz Main PG',
      address: 'Main Campus Road',
      city: 'Delhi',
      contactPhone: setting?.contactPhone || ownerUser.phone,
      status: 'active',
      description: 'Primary Property',
    });
    properties = [def];

    // Link existing unassigned blocks and rooms to this primary property
    await Block.updateMany({ $or: [{ property: null }, { property: { $exists: false } }] }, { property: def._id });
    await Room.updateMany({ $or: [{ property: null }, { property: { $exists: false } }] }, { property: def._id });
  }

  // Ensure any existing manager user has an active assignment on the primary property
  const existingManagers = await User.find({ role: 'manager', active: true });
  for (const mgr of existingManagers) {
    const hasAss = await ManagerAssignment.findOne({ manager: mgr._id, property: properties[0]._id });
    if (!hasAss) {
      await ManagerAssignment.create({
        manager: mgr._id,
        property: properties[0]._id,
        workspace: ws._id,
        owner: ownerUser._id,
        permissionPreset: 'full',
        customPermissions: PERMISSION_PRESETS.full,
        isPrimary: true,
        designation: 'primary',
        status: 'active',
        assignedBy: ownerUser._id,
      });
    }
  }

  return { workspace: ws, properties };
}

/**
 * Resolves effective permissions for a manager assignment.
 */
export function getEffectivePermissions(assignment) {
  if (!assignment) return null;
  const preset = assignment.permissionPreset || 'full';
  if (preset === 'custom' && assignment.customPermissions) {
    return assignment.customPermissions;
  }
  return PERMISSION_PRESETS[preset] || PERMISSION_PRESETS.full;
}

/**
 * Verifies if a user has permission to perform an action on a property.
 * Returns true/false.
 */
export async function hasManagerPermission(user, propertyId, category, action) {
  if (!user) return false;
  if (user.role === 'malik') return true;
  if (user.role !== 'manager') return false;

  const now = new Date();
  const assignment = await ManagerAssignment.findOne({
    manager: user._id,
    property: propertyId,
    status: 'active',
  });

  if (!assignment) return false;

  // Check temporal validity
  if (assignment.validFrom && assignment.validFrom > now) return false;
  if (assignment.validUntil && assignment.validUntil < now) {
    assignment.status = 'expired';
    await assignment.save();
    return false;
  }

  const permissions = getEffectivePermissions(assignment);
  if (!permissions) return false;

  if (category && action) {
    return !!permissions[category]?.[action];
  }
  return true;
}

/**
 * Log an audit action.
 */
export async function logActivity({ workspace, property, performedBy, targetUser, actionType, description, details }) {
  try {
    await ActivityLog.create({
      workspace,
      property,
      performedBy,
      targetUser,
      actionType,
      description: description || actionType,
      details: details || {},
      timestamp: new Date(),
    });
  } catch (err) {
    console.error('Failed to write activity log:', err.message);
  }
}
