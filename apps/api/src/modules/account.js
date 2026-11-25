// Customer account: download my data, delete my account, and my reviews.
// Under India's DPDP Act 2023 a person can ask for their data and for it to be erased. Order and invoice records are
// kept because GST law requires them (8 years), but they're detached from the person's identity.
import { z } from 'zod';
import { DomainError } from '../../../../packages/shared/src/index.js';
import { requireAuth, SESSION_COOKIE, LEGACY_COOKIE_PATHS, cookieOptions } from '../http/middleware.js';
import { transaction, toPaise } from '../lib/db.js';
import { audit } from '../lib/audit.js';
import { verifyPassword } from '../lib/security.js';

const m = toPaise;
const OPEN_ORDER = ['AWAITING_PAYMENT', 'CONFIRMED', 'PARTIALLY_SHIPPED', 'SHIPPED'];
const OPEN_RETURN = ['REQUESTED', 'APPROVED', 'PICKUP_SCHEDULED', 'RECEIVED'];

/** Why this account can't be deleted yet, or null when it can. */
export async function deletionBlockers(db, userId) {
  const [user, openOrders, openReturns, pendingRefunds] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, include: { roles: true, sellerMemberships: true, orgMemberships: true } }),
    db.order.count({ where: { userId, status: { in: OPEN_ORDER } } }),
    db.returnRequest.count({ where: { userId, status: { in: OPEN_RETURN } } }),
    db.refund.count({ where: { order: { userId }, status: 'PENDING_PROVIDER' } }),
  ]);
  const reasons = [];
  if (user.roles.length) reasons.push('Staff accounts are removed by the Admin.');
  if (user.sellerMemberships.length) reasons.push('You’re part of a seller store. Close the store or leave its team first.');
  if (user.orgMemberships.length) reasons.push('You’re part of a business account. Leave it or transfer ownership first.');
  if (openOrders) reasons.push(`You have ${openOrders} order${openOrders === 1 ? '' : 's'} still in progress. Wait until ${openOrders === 1 ? 'it is' : 'they are'} delivered or cancelled.`);
  if (openReturns) reasons.push('You have a return in progress.');
  if (pendingRefunds) reasons.push('A refund to you is still being paid. We’ll finish it first.');
  return reasons;
}

export function registerAccount(app, { prisma, config }) {
  /** Everything IBazzzar holds about the signed-in person, as a JSON file. */
  app.get('/api/account/export', requireAuth, async (req, res) => {
    const id = req.user.id;
    const [user, addresses, orders, reviews, tickets, notifications, wishlist, sessions] = await Promise.all([
      prisma.user.findUnique({ where: { id }, select: { name: true, email: true, phone: true, createdAt: true, emailVerifiedAt: true, marketingOptIn: true, termsAcceptedAt: true } }),
      prisma.address.findMany({ where: { userId: id } }),
      prisma.order.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, include: { items: { select: { name: true, variantLabel: true, quantity: true, totalPaise: true } }, refunds: { select: { amountPaise: true, status: true, createdAt: true } } } }),
      prisma.review.findMany({ where: { userId: id }, include: { product: { select: { name: true } } } }),
      prisma.supportTicket.findMany({ where: { userId: id }, include: { messages: { select: { author: true, body: true, createdAt: true } } } }),
      prisma.notification.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 500, select: { title: true, body: true, createdAt: true, read: true } }),
      prisma.wishlistItem.findMany({ where: { userId: id }, include: { product: { select: { name: true } } } }),
      prisma.session.findMany({ where: { userId: id }, select: { createdAt: true, userAgent: true, ip: true } }),
    ]);
    const data = {
      exportedAt: new Date().toISOString(),
      note: 'Your IBazzzar data. Amounts are in rupees. Payment card details are never stored by IBazzzar.',
      profile: user,
      addresses: addresses.map(({ id: _id, userId: _u, organizationId: _o, ...a }) => a),
      orders: orders.map((o) => ({ number: o.number, placedAt: o.createdAt, status: o.status, payment: o.paymentStatus, method: o.paymentMethod, total: m(o.totalPaise) / 100, deliveryAddress: o.shippingAddress, items: o.items.map((i) => ({ ...i, totalPaise: undefined, total: m(i.totalPaise) / 100 })), refunds: o.refunds.map((r) => ({ amount: m(r.amountPaise) / 100, status: r.status, at: r.createdAt })) })),
      reviews: reviews.map((r) => ({ product: r.product.name, rating: r.rating, title: r.title, body: r.body, status: r.status, at: r.createdAt })),
      supportTickets: tickets.map((t) => ({ number: t.number, subject: t.subject, status: t.status, at: t.createdAt, messages: t.messages })),
      notifications, wishlist: wishlist.map((w) => w.product.name), signedInDevices: sessions,
    };
    await audit(prisma, { actorId: id, action: 'user.data-exported', entityType: 'user', entityId: id });
    res.set({ 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="ibazzzar-my-data-${new Date().toISOString().slice(0, 10)}.json"` }).send(JSON.stringify(data, null, 2));
  });

  app.get('/api/account/deletion', requireAuth, async (req, res) => {
    const reasons = await deletionBlockers(prisma, req.user.id);
    res.json({ canDelete: !reasons.length, reasons });
  });

  /** Deletes the account: personal details are removed, order records stay for tax law without the person's identity. */
  app.post('/api/account/delete', requireAuth, async (req, res) => {
    const input = z.object({ password: z.string().min(1, 'Enter your password'), confirm: z.literal('DELETE', { message: 'Type DELETE to confirm' }), reason: z.string().trim().max(300).optional() }).parse(req.body);
    if (!await verifyPassword(input.password, req.user.passwordHash)) throw new DomainError('Your password is incorrect', 401, { password: 'This password is incorrect' });
    const id = req.user.id;
    await transaction(prisma, async (tx) => {
      const reasons = await deletionBlockers(tx, id);
      if (reasons.length) throw new DomainError(reasons[0], 409, { reasons });
      const email = req.user.email;
      await tx.address.deleteMany({ where: { userId: id } });
      await tx.wishlistItem.deleteMany({ where: { userId: id } });
      await tx.cart.deleteMany({ where: { userId: id } });
      await tx.notification.deleteMany({ where: { userId: id } });
      await tx.newsletterSubscription.deleteMany({ where: { email } });
      await tx.emailOutbox.deleteMany({ where: { userId: id, status: { in: ['PENDING', 'FAILED'] } } });
      await tx.review.updateMany({ where: { userId: id }, data: { authorName: 'Former customer' } });
      await tx.session.deleteMany({ where: { userId: id } });
      await tx.user.update({
        where: { id },
        data: { name: 'Deleted customer', email: `deleted+${id}@deleted.invalid`, phone: null, passwordHash: 'deleted$locked', status: 'DELETED', deletedAt: new Date(), marketingOptIn: false, emailVerifiedAt: null, failedLogins: 0, lockedUntil: null },
      });
      await audit(tx, { actorId: id, action: 'user.deleted-self', entityType: 'user', entityId: id, metadata: { reason: input.reason ?? null } });
    });
    res.clearCookie(SESSION_COOKIE, { ...cookieOptions(config), maxAge: undefined });
    for (const path of LEGACY_COOKIE_PATHS) res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: config.production, path });
    res.json({ ok: true });
  });

  /** My reviews, and delivered products still waiting for one. */
  app.get('/api/account/reviews', requireAuth, async (req, res) => {
    const id = req.user.id;
    const [reviews, delivered] = await Promise.all([
      prisma.review.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, include: { product: { select: { id: true, name: true, slug: true, media: { take: 1, orderBy: { sortOrder: 'asc' }, select: { url: true } } } } } }),
      prisma.orderItem.findMany({ where: { order: { userId: id }, sellerOrder: { status: 'DELIVERED' } }, orderBy: { order: { createdAt: 'desc' } }, select: { catalogProductId: true, name: true, image: true, orderId: true, order: { select: { number: true, createdAt: true } } } }),
    ]);
    const reviewed = new Set(reviews.map((r) => r.catalogProductId));
    const pending = [];
    for (const d of delivered) {
      if (reviewed.has(d.catalogProductId) || pending.some((p) => p.productId === d.catalogProductId)) continue;
      pending.push({ productId: d.catalogProductId, name: d.name, image: d.image, orderId: d.orderId, orderNumber: d.order.number, orderedAt: d.order.createdAt });
    }
    res.json({
      reviews: reviews.map((r) => ({ id: r.id, rating: r.rating, title: r.title, body: r.body, images: r.images, helpfulCount: r.helpfulCount, status: r.status, createdAt: r.createdAt, product: { id: r.product.id, name: r.product.name, slug: r.product.slug, image: r.product.media[0]?.url ?? null } })),
      pending,
    });
  });
}
