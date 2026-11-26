// Business buying money views: credit and dues, monthly statements, spend by person and department, and the
// scheduled reminders for dues and expiring quotations. All amounts are integer paise; months are IST calendar months.
import { Prisma } from '@prisma/client';
import { DomainError, money } from '../../../../packages/shared/src/index.js';
import { toPaise } from '../lib/db.js';
import { notify } from '../lib/audit.js';
import { notifyCustomer } from '../lib/email.js';

const DAY = 86_400_000;
const IST = 5.5 * 3_600_000;
/** Payment states that mean the money has been received. */
export const RECEIVED = ['PAID', 'DEMO_SIMULATED', 'COD_COLLECTED', 'REFUNDED', 'PARTIALLY_REFUNDED'];
/** A credit order is "due soon" this many days before its due date. */
export const DUE_SOON_DAYS = 3;

/** Start (inclusive) and end (exclusive) of an IST calendar month, from "YYYY-MM". Defaults to the current month. */
export function monthWindow(month, now = new Date()) {
  const ist = new Date(now.getTime() + IST);
  const [y, mo] = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month.split('-').map(Number) : [ist.getUTCFullYear(), ist.getUTCMonth() + 1];
  const from = new Date(Date.UTC(y, mo - 1, 1) - IST);
  const to = new Date(Date.UTC(y, mo, 1) - IST);
  if (from > now) throw new DomainError('Choose this month or an earlier one', 400);
  return { month: `${y}-${String(mo).padStart(2, '0')}`, from, to };
}


/** Whole days until the due date (negative once overdue), counted in IST calendar days. */
export function daysLeft(dueAt, now = new Date()) {
  const d = (x) => Math.floor((x.getTime() + IST) / DAY);
  return d(dueAt) - d(now);
}
const dueState = (left) => (left < 0 ? 'OVERDUE' : left <= DUE_SOON_DAYS ? 'DUE_SOON' : 'OPEN');

// ───────────── Credit and dues ─────────────

/** Credit position of a business account: limit, what is owed, what is overdue and each open credit order. */
export async function creditSummary(db, organizationId, now = new Date()) {
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { creditApproved: true, allowedTerms: true, creditLimitPaise: true } });
  if (!org) throw new DomainError('Business account not found', 404);
  const [open, recent] = await Promise.all([
    db.order.findMany({
      where: { organizationId, paymentStatus: 'ON_TERMS', status: { not: 'CANCELLED' } }, orderBy: { paymentDueAt: 'asc' },
      select: { id: true, number: true, createdAt: true, paymentDueAt: true, totalPaise: true, userId: true, purchaseOrder: { select: { number: true } }, user: { select: { name: true } } },
    }),
    db.order.findMany({
      where: { organizationId, paymentMethod: 'CREDIT_TERMS', paymentStatus: { in: RECEIVED } }, orderBy: { paidAt: 'desc' }, take: 10,
      select: { id: true, number: true, paidAt: true, paymentDueAt: true, totalPaise: true, paymentRef: true },
    }),
  ]);
  const items = open.map((o) => {
    const left = o.paymentDueAt ? daysLeft(o.paymentDueAt, now) : null;
    return {
      orderId: o.id, number: o.number, purchaseOrder: o.purchaseOrder?.number ?? null, placedBy: o.user.name, placedById: o.userId,
      orderedAt: o.createdAt, dueAt: o.paymentDueAt, amountPaise: toPaise(o.totalPaise), daysLeft: left, state: left == null ? 'OPEN' : dueState(left),
    };
  });
  const sum = (list) => list.reduce((t, x) => t + x.amountPaise, 0);
  const outstanding = sum(items);
  const overdue = items.filter((i) => i.state === 'OVERDUE');
  const soon = items.filter((i) => i.state === 'DUE_SOON');
  const limit = toPaise(org.creditLimitPaise);
  return {
    creditApproved: org.creditApproved, terms: org.allowedTerms, limitPaise: limit,
    outstandingPaise: outstanding, availablePaise: org.creditApproved ? Math.max(0, limit - outstanding) : 0,
    usedPercent: limit ? Math.min(100, Math.round((outstanding / limit) * 100)) : 0,
    overduePaise: sum(overdue), overdueCount: overdue.length, dueSoonPaise: sum(soon), dueSoonCount: soon.length,
    nextDue: items.find((i) => i.state !== 'OVERDUE') ?? null,
    open: items,
    recentlyPaid: recent.map((o) => ({
      orderId: o.id, number: o.number, paidAt: o.paidAt, dueAt: o.paymentDueAt, amountPaise: toPaise(o.totalPaise), reference: o.paymentRef,
      late: !!(o.paidAt && o.paymentDueAt && daysLeft(o.paymentDueAt, o.paidAt) < 0),
    })),
  };
}

/** Overdue credit blocks new credit purchases until it is cleared. */
export async function assertNoOverdue(db, organizationId, now = new Date()) {
  const overdue = await db.order.aggregate({
    where: { organizationId, paymentStatus: 'ON_TERMS', status: { not: 'CANCELLED' }, paymentDueAt: { lt: new Date(Math.floor((now.getTime() + IST) / DAY) * DAY - IST) } },
    _sum: { totalPaise: true }, _count: { _all: true },
  });
  if (overdue._count._all) {
    throw new DomainError(`${money(toPaise(overdue._sum.totalPaise))} on credit is overdue. Please clear it before buying on credit again, or pay online or by bank transfer.`, 409);
  }
}

// ───────────── Monthly statement ─────────────

/**
 * Statement for one month: every order placed, every payment received and the credit balance movement.
 * Credit balance = credit-terms orders not yet paid (cancelled orders never count).
 *   closing = opening + credit purchases in the month − credit payments in the month
 */
export async function statement(db, organizationId, { month, now = new Date() }) {
  const w = monthWindow(month, now);
  const credit = { organizationId, paymentMethod: 'CREDIT_TERMS', status: { not: 'CANCELLED' } };
  const owedAt = (at) => ({ ...credit, createdAt: { lt: at }, OR: [{ paidAt: null }, { paidAt: { gte: at } }] });
  const [org, orders, payments, opening, closing] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { legalName: true, tradeName: true, gstin: true, registeredAddress: true, allowedTerms: true, creditLimitPaise: true } }),
    db.order.findMany({
      where: { organizationId, createdAt: { gte: w.from, lt: w.to } }, orderBy: { createdAt: 'asc' },
      select: { id: true, number: true, createdAt: true, status: true, paymentMethod: true, paymentStatus: true, paymentDueAt: true, totalPaise: true, taxPaise: true, user: { select: { name: true } }, department: { select: { name: true } }, purchaseOrder: { select: { number: true } } },
    }),
    db.order.findMany({
      where: { organizationId, paidAt: { gte: w.from, lt: w.to }, paymentStatus: { in: RECEIVED } }, orderBy: { paidAt: 'asc' },
      select: { id: true, number: true, paidAt: true, paymentMethod: true, paymentRef: true, paymentDueAt: true, totalPaise: true },
    }),
    db.order.aggregate({ where: owedAt(w.from), _sum: { totalPaise: true } }),
    db.order.aggregate({ where: owedAt(w.to < now ? w.to : now), _sum: { totalPaise: true } }),
  ]);
  const live = orders.filter((o) => o.status !== 'CANCELLED');
  const sum = (list, k = 'totalPaise') => list.reduce((t, x) => t + toPaise(x[k]), 0);
  const creditBought = sum(live.filter((o) => o.paymentMethod === 'CREDIT_TERMS'));
  const creditPaid = sum(payments.filter((p) => p.paymentMethod === 'CREDIT_TERMS'));
  const asOf = w.to < now ? w.to : now;
  const overdue = await db.order.aggregate({
    where: { ...credit, paymentDueAt: { lt: asOf }, OR: [{ paidAt: null }, { paidAt: { gte: asOf } }], createdAt: { lt: asOf } },
    _sum: { totalPaise: true }, _count: { _all: true },
  });
  return {
    month: w.month, from: w.from, to: new Date(w.to.getTime() - 1), generatedAt: now,
    business: org && { legalName: org.legalName, tradeName: org.tradeName, gstin: org.gstin, address: org.registeredAddress, terms: org.allowedTerms, creditLimitPaise: toPaise(org.creditLimitPaise) },
    summary: {
      orders: live.length, purchasesPaise: sum(live), gstPaise: sum(live, 'taxPaise'), cancelled: orders.length - live.length,
      paymentsPaise: sum(payments), payments: payments.length,
      openingBalancePaise: toPaise(opening._sum.totalPaise ?? 0), creditPurchasesPaise: creditBought, creditPaymentsPaise: creditPaid,
      closingBalancePaise: toPaise(closing._sum.totalPaise ?? 0), overduePaise: toPaise(overdue._sum.totalPaise ?? 0), overdueCount: overdue._count._all,
    },
    orders: orders.map((o) => ({
      id: o.id, number: o.number, date: o.createdAt, status: o.status, paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus,
      dueAt: o.paymentMethod === 'CREDIT_TERMS' ? o.paymentDueAt : null, amountPaise: toPaise(o.totalPaise), gstPaise: toPaise(o.taxPaise),
      placedBy: o.user.name, department: o.department?.name ?? null, purchaseOrder: o.purchaseOrder?.number ?? null,
    })),
    payments: payments.map((p) => ({
      orderId: p.id, number: p.number, date: p.paidAt, method: p.paymentMethod, reference: p.paymentRef, amountPaise: toPaise(p.totalPaise),
      late: p.paymentMethod === 'CREDIT_TERMS' && !!p.paymentDueAt && daysLeft(p.paymentDueAt, p.paidAt) < 0,
    })),
  };
}

// ───────────── Spend by person and department ─────────────

/** Committed spend (orders not cancelled and not left unpaid) per team member and per department for a month. */
export async function spend(db, organizationId, { month, now = new Date() }) {
  const w = monthWindow(month, now);
  const committed = Prisma.sql`o."organizationId" = ${organizationId}::uuid AND o.status <> 'CANCELLED'
    AND o."paymentStatus" NOT IN ('UNPAID') AND o."createdAt" >= ${w.from} AND o."createdAt" < ${w.to}`;
  const [members, departments, byUser, byDept, total, trend] = await Promise.all([
    db.organizationMember.findMany({ where: { organizationId }, include: { user: { select: { id: true, name: true, email: true } }, department: { select: { id: true, name: true } } } }),
    db.orgDepartment.findMany({ where: { organizationId }, orderBy: { name: 'asc' } }),
    db.$queryRaw`SELECT o."userId" AS id, COUNT(*)::int AS orders, COALESCE(SUM(o."totalPaise"), 0)::bigint AS spend FROM orders o WHERE ${committed} GROUP BY 1`,
    db.$queryRaw`SELECT o."departmentId" AS id, COUNT(*)::int AS orders, COALESCE(SUM(o."totalPaise"), 0)::bigint AS spend FROM orders o WHERE ${committed} GROUP BY 1`,
    db.$queryRaw`SELECT COUNT(*)::int AS orders, COALESCE(SUM(o."totalPaise"), 0)::bigint AS spend FROM orders o WHERE ${committed}`,
    db.$queryRaw`SELECT to_char(date_trunc('month', o."createdAt" AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM') AS month, COALESCE(SUM(o."totalPaise"), 0)::bigint AS spend
      FROM orders o WHERE o."organizationId" = ${organizationId}::uuid AND o.status <> 'CANCELLED' AND o."paymentStatus" NOT IN ('UNPAID')
      AND o."createdAt" >= ${new Date(w.from.getTime() - 150 * DAY)} AND o."createdAt" < ${w.to} GROUP BY 1 ORDER BY 1`,
  ]);
  const u = new Map(byUser.map((r) => [r.id, r]));
  const d = new Map(byDept.map((r) => [r.id, r]));
  const n = (v) => Number(v ?? 0);
  const people = members.map((m) => ({ id: m.user.id, name: m.user.name, email: m.user.email, role: m.role, department: m.department?.name ?? null, orders: u.get(m.user.id)?.orders ?? 0, spendPaise: n(u.get(m.user.id)?.spend) }));
  // Orders placed by people who have since left the team stay in the totals.
  const formerIds = byUser.filter((r) => !members.some((m) => m.user.id === r.id));
  const former = formerIds.length ? await db.user.findMany({ where: { id: { in: formerIds.map((r) => r.id) } }, select: { id: true, name: true } }) : [];
  for (const f of former) people.push({ id: f.id, name: `${f.name} (left the team)`, email: '', role: 'FORMER', department: null, orders: u.get(f.id).orders, spendPaise: n(u.get(f.id).spend) });
  const depts = departments.map((x) => {
    const budget = toPaise(x.monthlyBudgetPaise); const spent = n(d.get(x.id)?.spend);
    return { id: x.id, name: x.name, budgetPaise: budget, orders: d.get(x.id)?.orders ?? 0, spendPaise: spent, usedPercent: budget ? Math.round((spent / budget) * 100) : null, overBudget: budget > 0 && spent > budget };
  });
  if (d.get(null)) depts.push({ id: null, name: 'No department', budgetPaise: 0, orders: d.get(null).orders, spendPaise: n(d.get(null).spend), usedPercent: null, overBudget: false });
  return {
    month: w.month, totalPaise: n(total[0]?.spend), orders: total[0]?.orders ?? 0,
    people: people.sort((a, b) => b.spendPaise - a.spendPaise), departments: depts,
    trend: trend.map((t) => ({ month: t.month, spendPaise: n(t.spend) })),
  };
}

// ───────────── Scheduled reminders ─────────────

/** Records that a reminder was sent; false when it already had been (so each reminder goes out once). */
async function claim(tx, kind, entityId) {
  const rows = await tx.$queryRaw`INSERT INTO sent_reminders (kind, "entityId") VALUES (${kind}, ${entityId}::uuid) ON CONFLICT DO NOTHING RETURNING kind`;
  return rows.length > 0;
}

/**
 * Dues and quotation reminders. Safe to run often and from several processes: each reminder is claimed in the
 * same transaction that sends it.
 *  - Credit: 3 days before the due date, on the due date, 1 day overdue and 7 days overdue (to the buyer by email,
 *    and to the account's owners and approvers in the app).
 *  - Quotations: 24 hours before an open quotation expires; expired quotations are marked EXPIRED.
 */
export async function runB2bReminders(prisma, now = new Date()) {
  const result = { creditReminders: 0, quoteReminders: 0, quotesExpired: 0 };
  const dueOrders = await prisma.order.findMany({
    where: { paymentStatus: 'ON_TERMS', status: { not: 'CANCELLED' }, paymentDueAt: { not: null, lt: new Date(now.getTime() + (DUE_SOON_DAYS + 1) * DAY) } },
    select: { id: true, number: true, userId: true, organizationId: true, paymentDueAt: true, totalPaise: true },
    take: 500,
  });
  for (const o of dueOrders) {
    const left = daysLeft(o.paymentDueAt, now);
    const kind = left <= -7 ? 'credit.overdue-7' : left <= -1 ? 'credit.overdue' : left === 0 ? 'credit.due-today' : left <= DUE_SOON_DAYS ? 'credit.due-soon' : null;
    if (!kind) continue;
    const amount = money(toPaise(o.totalPaise));
    const due = o.paymentDueAt.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
    const text = {
      'credit.due-soon': [`Payment due in ${left} day${left === 1 ? '' : 's'}`, `${amount} for order ${o.number} is due on ${due}.`],
      'credit.due-today': ['Payment due today', `${amount} for order ${o.number} is due today (${due}).`],
      'credit.overdue': ['Payment overdue', `${amount} for order ${o.number} was due on ${due}. New credit purchases are paused until it is paid.`],
      'credit.overdue-7': ['Payment overdue by a week', `${amount} for order ${o.number} has been overdue since ${due}. Please pay now to keep your credit terms.`],
    }[kind];
    const sent = await prisma.$transaction(async (tx) => {
      if (!(await claim(tx, kind, o.id))) return false;
      await notifyCustomer(tx, o.userId, { kind: `b2b.${kind}`, title: text[0], body: text[1], link: '/business/credit' });
      const leads = await tx.organizationMember.findMany({ where: { organizationId: o.organizationId, role: { in: ['OWNER', 'APPROVER'] }, userId: { not: o.userId } }, select: { userId: true } });
      for (const l of leads) await notify(tx, l.userId, { title: text[0], body: text[1], link: '/business/credit' });
      return true;
    });
    if (sent) result.creditReminders++;
  }

  const quotes = await prisma.quotation.findMany({
    where: { status: 'OPEN' },
    select: { id: true, store: { select: { name: true } }, request: { select: { rfq: { select: { id: true, title: true, userId: true, status: true } } } }, revisions: { orderBy: { revision: 'desc' }, take: 1, select: { id: true, validUntil: true, totalPaise: true } } },
    take: 1000,
  });
  for (const q of quotes) {
    const rev = q.revisions[0];
    const rfq = q.request.rfq;
    if (!rev || !['OPEN', 'QUOTED'].includes(rfq.status)) continue;
    if (rev.validUntil <= now) {
      const done = await prisma.$transaction(async (tx) => {
        const { count } = await tx.quotation.updateMany({ where: { id: q.id, status: 'OPEN' }, data: { status: 'EXPIRED' } });
        if (!count) return false;
        if (await claim(tx, 'quote.expired', rev.id)) await notify(tx, rfq.userId, { title: 'Quotation expired', body: `${q.store.name}’s quote for “${rfq.title}” has expired. Ask them for a fresh quote in the conversation.`, link: `/business/rfqs/${rfq.id}` });
        return true;
      });
      if (done) result.quotesExpired++;
    } else if (rev.validUntil.getTime() - now.getTime() <= DAY) {
      const sent = await prisma.$transaction(async (tx) => {
        if (!(await claim(tx, 'quote.expiring', rev.id))) return false;
        await notifyCustomer(tx, rfq.userId, { kind: 'b2b.quote-expiring', title: 'Quotation expires soon', body: `${q.store.name}’s quote of ${money(toPaise(rev.totalPaise))} for “${rfq.title}” expires within 24 hours. Accept it or ask for an extension.`, link: `/business/rfqs/${rfq.id}` });
        return true;
      });
      if (sent) result.quoteReminders++;
    }
  }
  return result;
}


