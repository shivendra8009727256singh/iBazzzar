// Stock control. Every change locks the affected inventory_balances rows (SELECT … FOR UPDATE, in id order to avoid
// deadlocks), and the database CHECK constraint (0 <= reserved <= onHand) is the last line of defence against overselling.
import { DomainError } from '../../../../packages/shared/src/index.js';

/** Locks and returns balances for the listings, keyed by listingId. Creates a zero balance for listings that have none. */
export async function lockBalances(tx, listingIds) {
  const ids = [...new Set(listingIds)].sort();
  if (!ids.length) return new Map();
  const rows = await tx.$queryRaw`
    SELECT b.id, b."listingId", b."onHand", b.reserved
    FROM inventory_balances b
    WHERE b."listingId" = ANY(${ids}::uuid[])
    ORDER BY b.id
    FOR UPDATE`;
  return new Map(rows.map((r) => [r.listingId, { id: r.id, onHand: Number(r.onHand), reserved: Number(r.reserved) }]));
}

export const available = (balance) => (balance ? balance.onHand - balance.reserved : 0);

/** Holds stock for unpaid order lines until payment or expiry. */
export async function reserve(tx, lines, expiresAt) {
  const balances = await lockBalances(tx, lines.map((l) => l.listingId));
  const wanted = new Map();
  for (const l of lines) wanted.set(l.listingId, (wanted.get(l.listingId) || 0) + l.quantity);
  for (const [listingId, qty] of wanted) {
    const b = balances.get(listingId);
    if (available(b) < qty) throw new DomainError(`Only ${Math.max(0, available(b))} left of ${lines.find((l) => l.listingId === listingId)?.name ?? 'an item'} in your cart`, 409);
  }
  for (const [listingId, qty] of wanted) {
    await tx.inventoryBalance.update({ where: { id: balances.get(listingId).id }, data: { reserved: { increment: qty } } });
  }
  for (const l of lines) {
    await tx.inventoryReservation.create({ data: { listingId: l.listingId, orderItemId: l.orderItemId, quantity: l.quantity, expiresAt } });
  }
}

/** Takes stock straight out of on-hand (COD and credit-terms orders, which confirm immediately). */
export async function deduct(tx, lines, reference) {
  const balances = await lockBalances(tx, lines.map((l) => l.listingId));
  for (const l of lines) {
    const b = balances.get(l.listingId);
    if (available(b) < l.quantity) throw new DomainError(`Only ${Math.max(0, available(b))} left of ${l.name ?? 'an item'}`, 409);
    b.onHand -= l.quantity;
    await tx.inventoryBalance.update({ where: { id: b.id }, data: { onHand: { decrement: l.quantity } } });
    await tx.stockMovement.create({ data: { listingId: l.listingId, delta: -l.quantity, reason: 'SALE', reference } });
  }
}

/** Payment received: reserved units leave the warehouse for good. */
export async function consumeReservations(tx, orderId, reference) {
  const reservations = await tx.inventoryReservation.findMany({ where: { orderItem: { orderId }, status: 'ACTIVE' } });
  const balances = await lockBalances(tx, reservations.map((r) => r.listingId));
  for (const r of reservations) {
    await tx.inventoryBalance.update({ where: { id: balances.get(r.listingId).id }, data: { onHand: { decrement: r.quantity }, reserved: { decrement: r.quantity } } });
    await tx.inventoryReservation.update({ where: { id: r.id }, data: { status: 'CONSUMED' } });
    await tx.stockMovement.create({ data: { listingId: r.listingId, delta: -r.quantity, reason: 'SALE', reference } });
  }
}

/** Unpaid order cancelled or expired: reserved units go back on sale. Optionally limited to some order items. */
export async function releaseReservations(tx, orderId, orderItemIds) {
  const reservations = await tx.inventoryReservation.findMany({
    where: { orderItem: { orderId }, status: 'ACTIVE', ...(orderItemIds ? { orderItemId: { in: orderItemIds } } : {}) },
  });
  const balances = await lockBalances(tx, reservations.map((r) => r.listingId));
  for (const r of reservations) {
    await tx.inventoryBalance.update({ where: { id: balances.get(r.listingId).id }, data: { reserved: { decrement: r.quantity } } });
    await tx.inventoryReservation.update({ where: { id: r.id }, data: { status: 'RELEASED' } });
  }
  return reservations.length;
}

/** Sold units come back into stock (seller cancelled after payment, or a returned parcel was received in good condition). */
export async function restock(tx, lines, reason, reference) {
  const balances = await lockBalances(tx, lines.map((l) => l.listingId));
  for (const l of lines) {
    const b = balances.get(l.listingId);
    if (!b) continue;
    await tx.inventoryBalance.update({ where: { id: b.id }, data: { onHand: { increment: l.quantity } } });
    await tx.stockMovement.create({ data: { listingId: l.listingId, delta: l.quantity, reason, reference } });
  }
}

/** Seller stock adjustment (goods received, count correction). Never lets on-hand drop below what is reserved. */
export async function adjust(tx, listingId, delta, reason, actorId, note) {
  const balances = await lockBalances(tx, [listingId]);
  const b = balances.get(listingId);
  if (!b) throw new DomainError('This listing has no stock record', 404);
  if (b.onHand + delta < b.reserved) {
    throw new DomainError(`You can reduce stock by at most ${b.onHand - b.reserved}; the rest is held for unpaid orders`, 409);
  }
  await tx.inventoryBalance.update({ where: { id: b.id }, data: { onHand: { increment: delta } } });
  await tx.stockMovement.create({ data: { listingId, delta, reason, reference: note ?? null, actorId } });
  return { onHand: b.onHand + delta, reserved: b.reserved };
}
