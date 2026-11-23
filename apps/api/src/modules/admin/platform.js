// Admin: homepage CMS, pages, banners, media library, broadcasts, reports, audit log and platform settings.
import express from 'express';
import { z } from 'zod';
import { DomainError, can } from '../../../../../packages/shared/src/index.js';
import { uuid, shippingSettingsSchema } from '../../../../../packages/validation/src/index.js';
import { requireStaff } from '../../http/middleware.js';
import { transaction, toPaise } from '../../lib/db.js';
import { audit, notify } from '../../lib/audit.js';
import { pageParams, toCsv, rupees, ilike, slugify } from '../../lib/http.js';
import { processImage, MAX_IMAGE_BYTES } from '../../services/media.js';
import { getSetting, putSetting } from '../../services/settings.js';

const m = toPaise;
const reason = z.string().trim().min(5, 'Please give a short reason (at least 5 characters)').max(300);
const internalLink = z.string().trim().regex(/^\/[^/]/, 'Links must be a page on IBazzzar, like /deals').max(200);

export const HOME_SECTIONS = {
  announcement: 'Announcement bar',
  hero: 'Homepage hero',
  wholesale: 'Wholesale hub',
  sell: 'Sell on IBazzzar',
};

export function registerAdminPlatform(app, { prisma, storage }) {
  const cms = requireStaff('cms.manage');

  // ───────────── Homepage sections (optimistic versioning prevents two editors overwriting each other) ─────────────
  app.get('/api/admin/cms', cms, async (_req, res) => {
    const [sections, pages, banners, featured] = await Promise.all([
      prisma.homeSection.findMany(),
      prisma.cmsPage.findMany({ orderBy: { slug: 'asc' } }),
      prisma.banner.findMany({ orderBy: [{ placement: 'asc' }, { sortOrder: 'asc' }] }),
      prisma.catalogProduct.findMany({ where: { featured: true }, select: { id: true, name: true, status: true } }),
    ]);
    res.json({
      sections: Object.entries(HOME_SECTIONS).map(([id, label]) => {
        const s = sections.find((x) => x.id === id);
        return { id, label, heading: s?.heading ?? '', body: s?.body ?? '', data: s?.data ?? {}, published: s?.published ?? false, version: s?.version ?? 0, updatedAt: s?.updatedAt ?? null };
      }),
      pages, banners, featured,
    });
  });

  app.put('/api/admin/cms/:id', cms, async (req, res) => {
    const id = z.enum(Object.keys(HOME_SECTIONS)).parse(req.params.id);
    const input = z.object({
      heading: z.string().trim().min(3).max(150), body: z.string().trim().min(3).max(2000), published: z.boolean().default(true),
      data: z.object({ ctaLabel: z.string().trim().max(40).optional(), ctaLink: internalLink.optional(), imageUrl: z.string().max(300).optional() }).default({}),
      version: z.number().int().min(0),
    }).parse(req.body);
    const section = await transaction(prisma, async (tx) => {
      const old = await tx.homeSection.findUnique({ where: { id } });
      if ((old?.version ?? 0) !== input.version) throw new DomainError('Someone else changed this section. Reload to see the latest version before saving.', 409);
      const { version, ...data } = input;
      const s = await tx.homeSection.upsert({ where: { id }, create: { id, ...data, version: 1, updatedBy: req.user.id }, update: { ...data, version: version + 1, updatedBy: req.user.id } });
      await audit(tx, { actorId: req.user.id, action: 'cms.section-updated', entityType: 'home_section', entityId: id, metadata: { version: s.version, previous: old ? { heading: old.heading, body: old.body } : null } });
      return s;
    });
    res.json({ section });
  });

  app.put('/api/admin/pages/:slug', cms, async (req, res) => {
    const slug = z.string().regex(/^[a-z0-9-]{2,60}$/).parse(req.params.slug);
    const input = z.object({ title: z.string().trim().min(3).max(120), body: z.string().trim().min(10).max(50000), published: z.boolean().default(true), version: z.number().int().min(0) }).parse(req.body);
    const page = await transaction(prisma, async (tx) => {
      const old = await tx.cmsPage.findUnique({ where: { slug } });
      if ((old?.version ?? 0) !== input.version) throw new DomainError('Someone else changed this page. Reload before saving.', 409);
      const { version, ...data } = input;
      const p = await tx.cmsPage.upsert({ where: { slug }, create: { slug, ...data, version: 1, updatedBy: req.user.id }, update: { ...data, version: version + 1, updatedBy: req.user.id } });
      await audit(tx, { actorId: req.user.id, action: 'cms.page-updated', entityType: 'cms_page', entityId: slug, metadata: { version: p.version } });
      return p;
    });
    res.json({ page });
  });

  const bannerInput = z.object({
    placement: z.enum(['home', 'home-secondary', 'deals', 'wholesale', 'category']), title: z.string().trim().min(3).max(100), subtitle: z.string().trim().max(200).nullable().optional(),
    imageUrl: z.string().max(300), alt: z.string().trim().min(3).max(150), link: internalLink.nullable().optional(),
    startsAt: z.iso.datetime().nullable().optional(), endsAt: z.iso.datetime().nullable().optional(), sortOrder: z.number().int().min(0).max(100).default(0), active: z.boolean().default(true),
  });
  const bannerData = (b) => ({
    ...b,
    ...('startsAt' in b ? { startsAt: b.startsAt ? new Date(b.startsAt) : null } : {}),
    ...('endsAt' in b ? { endsAt: b.endsAt ? new Date(b.endsAt) : null } : {}),
  });
  app.post('/api/admin/banners', cms, async (req, res) => {
    const banner = await prisma.banner.create({ data: bannerData(bannerInput.parse(req.body)) });
    await audit(prisma, { actorId: req.user.id, action: 'banner.created', entityType: 'banner', entityId: banner.id });
    res.status(201).json({ banner });
  });
  app.patch('/api/admin/banners/:id', cms, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const parsed = bannerInput.partial().parse(req.body);
    // Only fields actually sent are changed; schema defaults must not reset the others.
    for (const k of Object.keys(parsed)) if (!(k in (req.body ?? {}))) delete parsed[k];
    const banner = await prisma.banner.update({ where: { id }, data: bannerData(parsed) });
    await audit(prisma, { actorId: req.user.id, action: 'banner.updated', entityType: 'banner', entityId: id });
    res.json({ banner });
  });
  app.delete('/api/admin/banners/:id', cms, async (req, res) => {
    const id = uuid.parse(req.params.id);
    await prisma.banner.delete({ where: { id } });
    await audit(prisma, { actorId: req.user.id, action: 'banner.deleted', entityType: 'banner', entityId: id });
    res.json({ ok: true });
  });

  /** Platform artwork (hero scenes, category art, banners). Re-encoded like seller photos. */
  app.post('/api/admin/media', requireStaff('media.manage'), express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: MAX_IMAGE_BYTES }), async (req, res) => {
    const image = await processImage(req.body, { minSize: 400, maxSize: 2400 });
    const stored = await storage.put(image.data, image.mime);
    const asset = await prisma.mediaAsset.create({ data: { ownerType: 'PLATFORM', uploadedBy: req.user.id, storageKey: stored.key, url: stored.url, mime: image.mime, width: image.width, height: image.height, bytes: image.data.length, originalName: String(req.get('x-file-name') || '').slice(0, 120) || null } });
    await audit(prisma, { actorId: req.user.id, action: 'media.platform-uploaded', entityType: 'media', entityId: asset.id });
    res.status(201).json({ media: asset });
  });

  // ───────────── Media library ─────────────
  app.get('/api/admin/media', requireStaff('media.manage'), async (req, res) => {
    const paging = pageParams(req.query, { size: 60 });
    const where = req.query.owner ? { ownerType: String(req.query.owner) } : {};
    const [rows, total] = await Promise.all([
      prisma.mediaAsset.findMany({ where, orderBy: { createdAt: 'desc' }, skip: paging.skip, take: paging.take, include: { store: { select: { name: true } } } }),
      prisma.mediaAsset.count({ where }),
    ]);
    const usage = await prisma.productMedia.findMany({ where: { url: { in: rows.map((r) => r.url) } }, include: { product: { select: { id: true, name: true } } } });
    res.json({ media: rows.map((a) => ({ id: a.id, url: a.url, ownerType: a.ownerType, seller: a.store?.name ?? null, width: a.width, height: a.height, bytes: a.bytes, mime: a.mime, createdAt: a.createdAt, usedBy: usage.filter((u) => u.url === a.url).map((u) => u.product) })), total, page: paging.page, pages: Math.max(1, Math.ceil(total / paging.take)) });
  });
  app.delete('/api/admin/media/:id', requireStaff('media.manage'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const { reason: why } = z.object({ reason }).parse(req.body ?? {});
    const removed = await transaction(prisma, async (tx) => {
      const asset = await tx.mediaAsset.findUnique({ where: { id } });
      if (!asset) throw new DomainError('File not found', 404);
      // Products that used the image lose it and go back to review, so a removed photo can't stay live.
      const uses = await tx.productMedia.findMany({ where: { url: asset.url } });
      await tx.productMedia.deleteMany({ where: { url: asset.url } });
      await tx.catalogProduct.updateMany({ where: { id: { in: uses.map((u) => u.catalogProductId) } }, data: { status: 'CHANGES_REQUESTED' } });
      await tx.mediaAsset.delete({ where: { id } });
      if (asset.storeId) {
        const owners = await tx.sellerMember.findMany({ where: { storeId: asset.storeId, role: 'OWNER' } });
        for (const o of owners) await notify(tx, o.userId, { title: 'A product photo was removed', body: why, link: '/seller/products' });
      }
      await audit(tx, { actorId: req.user.id, action: 'media.removed', entityType: 'media', entityId: id, metadata: { reason: why, products: uses.length } });
      return asset;
    });
    await storage.remove(removed.storageKey);
    res.json({ ok: true });
  });

  // ───────────── Broadcast notifications ─────────────
  const audiences = {
    ALL: {}, CUSTOMERS: { roles: { none: {} }, sellerMemberships: { none: {} } },
    SELLERS: { sellerMemberships: { some: {} } }, BUSINESSES: { orgMemberships: { some: {} } }, STAFF: { roles: { some: {} } },
  };
  app.post('/api/admin/notifications', requireStaff('notifications.send'), async (req, res) => {
    const body = z.object({ audience: z.enum(Object.keys(audiences)), title: z.string().trim().min(3).max(100), body: z.string().trim().min(5).max(500), link: internalLink.optional() }).parse(req.body);
    const recipients = await prisma.user.findMany({ where: { status: 'ACTIVE', ...audiences[body.audience] }, select: { id: true }, take: 20000 });
    for (let i = 0; i < recipients.length; i += 1000) {
      await prisma.notification.createMany({ data: recipients.slice(i, i + 1000).map((u) => ({ userId: u.id, title: body.title, body: body.body, link: body.link ?? null })) });
    }
    await audit(prisma, { actorId: req.user.id, action: 'notification.broadcast', entityType: 'notification', entityId: body.audience, metadata: { recipients: recipients.length, title: body.title } });
    res.status(201).json({ sent: recipients.length });
  });

  // ───────────── Reports ─────────────
  const reports = {
    orders: { cap: 'orders.view', rows: async (from, to) => (await prisma.order.findMany({ where: { createdAt: { gte: from, lt: to } }, orderBy: { createdAt: 'desc' }, take: 50000, include: { user: { select: { name: true } }, _count: { select: { items: true } } } })).map((o) => ({ order: o.number, date: o.createdAt, customer: o.user.name, status: o.status, payment_status: o.paymentStatus, payment_method: o.paymentMethod, mode: o.mode, items: o._count.items, subtotal_inr: rupees(m(o.subtotalPaise)), discount_inr: rupees(m(o.discountPaise)), shipping_inr: rupees(m(o.shippingPaise)), gst_inr: rupees(m(o.taxPaise)), total_inr: rupees(m(o.totalPaise)), coupon: o.couponCode ?? '', place_of_supply: o.placeOfSupply, pincode: o.shippingAddress?.pincode, demo: o.demo ? 'yes' : 'no' })) },
    gst: { cap: 'finance.view', rows: async (from, to) => (await prisma.orderItem.findMany({ where: { order: { createdAt: { gte: from, lt: to }, status: { notIn: ['AWAITING_PAYMENT', 'CANCELLED'] } } }, take: 100000, include: { order: { select: { number: true, createdAt: true, placeOfSupply: true, billingGstin: true } }, sellerOrder: { include: { store: { select: { name: true, gstin: true } }, invoice: true } } } })).map((i) => ({ invoice: i.sellerOrder.invoice?.number ?? '', order: i.order.number, date: i.order.createdAt, seller: i.sellerOrder.store.name, seller_gstin: i.sellerOrder.store.gstin ?? '', buyer_gstin: i.order.billingGstin ?? '', place_of_supply: i.order.placeOfSupply, hsn: i.hsnCode ?? '', item: i.name, quantity: i.quantity, gst_rate: (i.taxRateBps / 100).toFixed(2), taxable_inr: rupees(m(i.taxablePaise)), cgst_inr: rupees(m(i.cgstPaise)), sgst_inr: rupees(m(i.sgstPaise)), igst_inr: rupees(m(i.igstPaise)), total_inr: rupees(m(i.totalPaise)) })) },
    ledger: { cap: 'finance.view', rows: async (from, to) => (await prisma.settlementEntry.findMany({ where: { createdAt: { gte: from, lt: to } }, orderBy: { createdAt: 'desc' }, take: 100000, include: { store: { select: { name: true } } } })).map((e) => ({ date: e.createdAt, seller: e.store.name, entry: e.kind, amount_inr: rupees(m(e.amountPaise)), status: e.status, note: e.note ?? '', demo: e.demo ? 'yes' : 'no' })) },
    users: { cap: 'users.view', rows: async (from, to) => (await prisma.user.findMany({ where: { createdAt: { gte: from, lt: to } }, orderBy: { createdAt: 'desc' }, take: 100000, include: { roles: true } })).map((u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone ?? '', roles: u.roles.map((r) => r.role).join(' '), status: u.status, email_verified: u.emailVerifiedAt ? 'yes' : 'no', marketing_opt_in: u.marketingOptIn ? 'yes' : 'no', joined: u.createdAt })) },
    products: { cap: 'catalogue.manage', rows: async () => (await prisma.sellerListing.findMany({ take: 100000, include: { store: { select: { name: true } }, inventory: true, variant: { include: { product: { include: { brand: true, category: true } } } } } })).map((l) => ({ sku: l.sku, product: l.variant.product.name, variant: l.variant.label, brand: l.variant.product.brand.name, category: l.variant.product.category.name, seller: l.store.name, status: l.status, price_inr: rupees(m(l.pricePaise)), mrp_inr: rupees(m(l.mrpPaise)), on_hand: l.inventory.reduce((s, b) => s + b.onHand, 0), reserved: l.inventory.reduce((s, b) => s + b.reserved, 0), moq: l.moq })) },
  };
  app.get('/api/admin/reports/:kind', requireStaff('reports.view'), async (req, res) => {
    const report = reports[req.params.kind];
    if (!report) throw new DomainError('Report not found', 404);
    if (!can(req.staffRoles, report.cap)) throw new DomainError('Your staff role doesn’t include this report', 403);
    const { from, to } = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() }).parse(req.query);
    const start = from ? new Date(`${from}T00:00:00+05:30`) : new Date(Date.now() - 90 * 86_400_000);
    const end = to ? new Date(new Date(`${to}T00:00:00+05:30`).getTime() + 86_400_000) : new Date(Date.now() + 60_000);
    await audit(prisma, { actorId: req.user.id, action: 'report.exported', entityType: 'report', entityId: req.params.kind, metadata: { from: start, to: end } });
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="ibazzzar-${req.params.kind}-${new Date().toISOString().slice(0, 10)}.csv"` })
      .send('﻿' + toCsv(await report.rows(start, end)));
  });

  app.get('/api/admin/audit', requireStaff('audit.view'), async (req, res) => {
    const paging = pageParams(req.query, { size: 50 });
    const q = String(req.query.q || '').trim();
    const where = q ? { OR: [{ action: ilike(q) }, { entityId: { contains: q } }, { entityType: ilike(q) }] } : {};
    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: paging.skip, take: paging.take }),
      prisma.auditLog.count({ where }),
    ]);
    const people = new Map((await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.actorId).filter((x) => /^[0-9a-f-]{36}$/.test(x ?? '')) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    res.json({ entries: rows.map((r) => ({ ...r, actor: r.actorId ? people.get(r.actorId) ?? r.actorId : 'System' })), total, page: paging.page, pages: Math.max(1, Math.ceil(total / paging.take)) });
  });

  // ───────────── Settings ─────────────
  const settingsCap = requireStaff('settings.manage');
  app.get('/api/admin/settings', settingsCap, async (_req, res) => {
    res.json({ platform: await getSetting(prisma, 'platform'), commission: await getSetting(prisma, 'commission'), shipping: await getSetting(prisma, 'shipping'), bank: await getSetting(prisma, 'bank') });
  });
  const schemas = {
    platform: z.object({ returnWindowDays: z.number().int().min(0).max(90), lowStockThreshold: z.number().int().min(0).max(10000), paymentWindowMinutes: z.number().int().min(5).max(1440), bankTransferWindowDays: z.number().int().min(1).max(30) }).partial(),
    commission: z.object({ rateBps: z.number().int().min(0).max(5000, 'Commission can be at most 50%') }),
    shipping: shippingSettingsSchema,
    bank: z.object({ accountName: z.string().trim().max(120), accountNumber: z.string().trim().regex(/^\d{9,18}$/), ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/), bankName: z.string().trim().max(100), note: z.string().trim().max(300) }).partial(),
  };
  app.put('/api/admin/settings/:key', settingsCap, async (req, res) => {
    const key = z.enum(Object.keys(schemas)).parse(req.params.key);
    if ((key === 'commission' || key === 'bank') && !can(req.staffRoles, 'finance.manage')) throw new DomainError('Only finance can change this', 403);
    const patch = schemas[key].parse(req.body);
    const value = await putSetting(prisma, key, patch, req.user.id);
    await audit(prisma, { actorId: req.user.id, action: `settings.${key}-updated`, entityType: 'setting', entityId: key, metadata: patch });
    res.json({ [key]: value });
  });

  app.get('/api/admin/pages', cms, async (_req, res) => res.json({ pages: await prisma.cmsPage.findMany({ orderBy: { slug: 'asc' } }) }));
  app.post('/api/admin/pages', cms, async (req, res) => {
    const { title } = z.object({ title: z.string().trim().min(3).max(120) }).parse(req.body);
    const page = await prisma.cmsPage.create({ data: { slug: slugify(title), title, body: 'Write this page.', published: false, updatedBy: req.user.id } });
    res.status(201).json({ page });
  });
}
