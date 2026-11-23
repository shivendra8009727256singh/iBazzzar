// Support, notifications, newsletter, CMS pages, banners and media delivery.
import { z } from 'zod';
import { DomainError } from '../../../../packages/shared/src/index.js';
import { ticketSchema, uuid } from '../../../../packages/validation/src/index.js';
import { requireAuth, requireStaff } from '../http/middleware.js';
import { transaction } from '../lib/db.js';
import { audit, notify } from '../lib/audit.js';
import { sha256, randomToken } from '../lib/security.js';
import { nextNumber } from '../lib/sequence.js';
import { pageParams } from '../lib/http.js';

export const ticketView = (t) => ({
  id: t.id, number: t.number, subject: t.subject, orderId: t.orderId, status: t.status, createdAt: t.createdAt, updatedAt: t.updatedAt,
  customer: t.user ? { id: t.user.id, name: t.user.name, email: t.user.email } : undefined,
  messages: (t.messages ?? []).map((msg) => ({ id: msg.id, from: msg.author, authorName: msg.authorName, body: msg.body, at: msg.createdAt })),
});

export function registerCommunity(app, { prisma, storage, limits, mailer }) {
  // ───────────── Support ─────────────
  app.get('/api/support/tickets', requireAuth, async (req, res) => {
    const tickets = await prisma.supportTicket.findMany({ where: { userId: req.user.id }, orderBy: { updatedAt: 'desc' }, take: 50, include: { messages: { orderBy: { createdAt: 'asc' } } } });
    res.json({ tickets: tickets.map(ticketView) });
  });

  app.post('/api/support/tickets', requireAuth, limits.write, async (req, res) => {
    const input = ticketSchema.parse(req.body);
    if (input.orderId) {
      const o = await prisma.order.findUnique({ where: { id: input.orderId }, select: { userId: true } });
      if (!o || o.userId !== req.user.id) throw new DomainError('Order not found', 404);
    }
    if (await prisma.supportTicket.count({ where: { userId: req.user.id, status: { not: 'CLOSED' } } }) >= 10) throw new DomainError('You have 10 open requests. Please continue in one of them.', 409);
    const ticket = await transaction(prisma, async (tx) => {
      const t = await tx.supportTicket.create({
        data: { number: await nextNumber(tx, 'ticket', 'SUP', { width: 5 }), userId: req.user.id, subject: input.subject, orderId: input.orderId ?? null, messages: { create: { author: 'CUSTOMER', authorId: req.user.id, authorName: req.user.name, body: input.message } } },
        include: { messages: true },
      });
      await audit(tx, { actorId: req.user.id, action: 'ticket.created', entityType: 'ticket', entityId: t.id });
      return t;
    });
    res.status(201).json({ ticket: ticketView(ticket) });
  });

  async function reply(req, from) {
    const { message } = z.object({ message: z.string().trim().min(2).max(5000) }).parse(req.body);
    const id = uuid.parse(req.params.id);
    return transaction(prisma, async (tx) => {
      const t = await tx.supportTicket.findUnique({ where: { id } });
      if (!t || (from === 'CUSTOMER' && t.userId !== req.user.id)) throw new DomainError('Request not found', 404);
      if (t.status === 'CLOSED') throw new DomainError('This request is closed. Please open a new one if you still need help.', 409);
      await tx.supportMessage.create({ data: { ticketId: id, author: from, authorId: req.user.id, authorName: from === 'SUPPORT' ? 'IBazzzar support' : req.user.name, body: message } });
      const updated = await tx.supportTicket.update({ where: { id }, data: { status: from === 'SUPPORT' ? 'AWAITING_CUSTOMER' : 'OPEN' }, include: { messages: { orderBy: { createdAt: 'asc' } }, user: true } });
      if (from === 'SUPPORT') await notify(tx, t.userId, { title: 'Support replied', body: t.subject, link: '/account/support' });
      return updated;
    });
  }
  app.post('/api/support/tickets/:id/messages', requireAuth, async (req, res) => res.json({ ticket: ticketView(await reply(req, 'CUSTOMER')) }));

  const support = requireStaff('support.manage');
  app.get('/api/support/queue', support, async (req, res) => {
    const paging = pageParams(req.query, { size: 30 });
    const where = req.query.status ? { status: String(req.query.status) } : { status: { not: 'CLOSED' } };
    const [rows, total] = await Promise.all([
      prisma.supportTicket.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: paging.skip, take: paging.take, include: { user: { select: { id: true, name: true, email: true } }, messages: { orderBy: { createdAt: 'asc' } } } }),
      prisma.supportTicket.count({ where }),
    ]);
    res.json({ tickets: rows.map(ticketView), total, page: paging.page, pages: Math.max(1, Math.ceil(total / paging.take)) });
  });
  app.post('/api/support/queue/:id/messages', support, async (req, res) => res.json({ ticket: ticketView(await reply(req, 'SUPPORT')) }));
  app.patch('/api/support/queue/:id', support, async (req, res) => {
    const { status } = z.object({ status: z.enum(['OPEN', 'CLOSED']) }).parse(req.body);
    const id = uuid.parse(req.params.id);
    const ticket = await prisma.supportTicket.update({ where: { id }, data: { status }, include: { messages: { orderBy: { createdAt: 'asc' } }, user: true } });
    await audit(prisma, { actorId: req.user.id, action: `ticket.${status.toLowerCase()}`, entityType: 'ticket', entityId: id });
    res.json({ ticket: ticketView(ticket) });
  });

  // ───────────── Notifications ─────────────
  app.get('/api/notifications', requireAuth, async (req, res) => {
    const [notifications, unread] = await Promise.all([
      prisma.notification.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.notification.count({ where: { userId: req.user.id, read: false } }),
    ]);
    res.json({ notifications, unread });
  });
  app.post('/api/notifications/read', requireAuth, async (req, res) => {
    const { ids } = z.object({ ids: z.array(uuid).max(100).optional() }).parse(req.body ?? {});
    await prisma.notification.updateMany({ where: { userId: req.user.id, read: false, ...(ids ? { id: { in: ids } } : {}) }, data: { read: true } });
    res.json({ ok: true });
  });

  // ───────────── Newsletter ─────────────
  app.post('/api/newsletter', limits.auth, async (req, res) => {
    const { email } = z.object({ email: z.email().toLowerCase().max(254), consent: z.literal(true, { message: 'Please tick the box to agree to receive emails' }) }).parse(req.body);
    const token = randomToken();
    await prisma.newsletterSubscription.upsert({
      where: { email },
      create: { email, consentAt: new Date(), unsubscribeHash: sha256(token) },
      update: { consentAt: new Date(), unsubscribeHash: sha256(token), unsubscribedAt: null },
    });
    // The unsubscribe link goes in every email; returning it here also lets the page offer "undo" immediately.
    res.status(201).json({ message: mailer.configured ? 'You’re subscribed. Watch your inbox for deals and new arrivals.' : 'You’re on the list. Emails will start once our mailing service is live.', unsubscribeToken: token });
  });
  app.post('/api/newsletter/unsubscribe', async (req, res) => {
    const { token } = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).parse(req.body);
    await prisma.newsletterSubscription.updateMany({ where: { unsubscribeHash: sha256(token), unsubscribedAt: null }, data: { unsubscribedAt: new Date() } });
    res.json({ ok: true, message: 'You’ve been unsubscribed.' });
  });

  // ───────────── Content ─────────────
  app.get('/api/pages/:slug', async (req, res) => {
    const page = await prisma.cmsPage.findFirst({ where: { slug: String(req.params.slug).slice(0, 80), published: true } });
    if (!page) throw new DomainError('Page not found', 404);
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ page: { slug: page.slug, title: page.title, body: page.body, updatedAt: page.updatedAt } });
  });
  app.get('/api/banners', async (req, res) => {
    const now = new Date();
    const placement = String(req.query.placement || 'home').slice(0, 40);
    const banners = await prisma.banner.findMany({
      where: { placement, active: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }] },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ banners: banners.map((b) => ({ id: b.id, title: b.title, subtitle: b.subtitle, imageUrl: b.imageUrl, alt: b.alt, link: b.link })) });
  });

  app.get('/api/media/:file', async (req, res) => {
    const key = String(req.params.file);
    const data = await storage.get(key);
    if (!data) throw new DomainError('File not found', 404);
    res.set({
      'Content-Type': key.endsWith('.pdf') ? 'application/pdf' : 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
      'X-Content-Type-Options': 'nosniff',
      ...(key.endsWith('.pdf') ? { 'Content-Disposition': 'attachment' } : {}),
    }).send(data);
  });
}
