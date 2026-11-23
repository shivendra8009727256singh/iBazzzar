/** Appends an audit entry. Pass the transaction client so the entry commits or rolls back with the change it records. */
export function audit(db, { actorId = null, action, entityType, entityId, metadata = {}, ip = null }) {
  return db.auditLog.create({ data: { actorId, action, entityType, entityId: String(entityId), metadata, ip } });
}

/** In-app notification. */
export function notify(db, userId, { title, body, link = null }) {
  if (!userId) return null;
  return db.notification.create({ data: { userId, title, body, link } });
}

/** Notifies every owner of a seller store. */
export async function notifyStoreOwners(db, storeId, message) {
  const owners = await db.sellerMember.findMany({ where: { storeId, role: 'OWNER' }, select: { userId: true } });
  for (const { userId } of owners) await notify(db, userId, message);
}

/** Notifies owners and approvers of a business account. */
export async function notifyOrgApprovers(db, organizationId, message, { except } = {}) {
  const people = await db.organizationMember.findMany({ where: { organizationId, role: { in: ['OWNER', 'APPROVER'] } }, select: { userId: true } });
  for (const { userId } of people) if (userId !== except) await notify(db, userId, message);
}
