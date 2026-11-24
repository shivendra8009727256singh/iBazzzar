// Customer email through a transactional outbox.
//
// queueEmail() writes a row in the same database transaction as the change it describes (an order confirmed,
// a parcel shipped …), so an email is never sent for something that rolled back. dispatchEmails() sends pending
// rows afterwards, retrying with back-off, and is safe to run from several API instances at once.
import { notify } from './audit.js';

let siteOrigin = process.env.WEB_ORIGIN || 'http://127.0.0.1:3000';
/** Called once at start-up so links in emails point at the real site. */
export function configureEmail({ origin }) { if (origin) siteOrigin = origin.replace(/\/$/, ''); }

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Plain-text and HTML versions of a simple branded message. */
export function renderEmail({ heading, body, lines = [], cta, brand = 'IBazzzar' }) {
  const url = cta?.link ? (cta.link.startsWith('http') ? cta.link : `${siteOrigin}${cta.link}`) : null;
  const text = [heading, '', body, ...(lines.length ? ['', ...lines.map((l) => `• ${l}`)] : []), ...(url ? ['', `${cta.label}: ${url}`] : []), '', `— ${brand}`, `You receive this because of activity on your ${brand} account.`].join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:#f5f6f2;font-family:Arial,Helvetica,sans-serif;color:#14251b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f2;padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #dfe4da;border-radius:14px;overflow:hidden">
<tr><td style="background:#092c20;padding:18px 24px;color:#e7be67;font-size:20px;font-weight:bold;letter-spacing:.5px">${esc(brand)}</td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 12px;font-size:20px;color:#092c20">${esc(heading)}</h1>
<p style="margin:0 0 14px;font-size:15px;line-height:1.55">${esc(body)}</p>
${lines.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border-top:1px solid #edf0ea">${lines.map((l) => `<tr><td style="padding:8px 0;border-bottom:1px solid #edf0ea;font-size:14px">${esc(l)}</td></tr>`).join('')}</table>` : ''}
${url ? `<a href="${esc(url)}" style="display:inline-block;background:#174b37;color:#ffffff;text-decoration:none;font-weight:bold;padding:11px 18px;border-radius:9px;font-size:14px">${esc(cta.label)}</a>` : ''}
</td></tr>
<tr><td style="padding:14px 24px;background:#fcfaf4;color:#5b6b62;font-size:12px">You receive this because of activity on your ${esc(brand)} account.</td></tr>
</table></td></tr></table></body></html>`;
  return { text, html };
}

/** Adds an email to the outbox. Addresses that can't receive mail (deleted accounts, .invalid) are skipped. */
export async function queueEmail(db, { userId = null, to = null, kind, subject, heading, body, lines, cta }) {
  let address = to;
  if (!address && userId) {
    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, status: true } });
    if (!user || user.status === 'DELETED') return null;
    address = user.email;
  }
  if (!address || /\.invalid$/i.test(address)) return null;
  const site = await db.setting.findUnique({ where: { key: 'site' } });
  const { text, html } = renderEmail({ heading: heading ?? subject, body, lines, cta, brand: site?.value?.siteName || 'IBazzzar' });
  return db.emailOutbox.create({ data: { userId, to: address, kind, subject, text, html } });
}

/** In-app notification plus the same message by email: used for the updates a customer must not miss. */
export async function notifyCustomer(db, userId, { title, body, link = null, kind, lines, subject }) {
  await notify(db, userId, { title, body, link });
  await queueEmail(db, { userId, kind, subject: subject ?? title, heading: title, body, lines, cta: link ? { label: 'View details', link } : undefined });
}

const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000];

/**
 * Sends up to `batch` due emails. Rows are claimed with FOR UPDATE SKIP LOCKED so concurrent dispatchers never send
 * the same email twice; a row stuck in SENDING (process died mid-send) is retried after 10 minutes.
 */
export async function dispatchEmails(prisma, mailer, { batch = 20, logger } = {}) {
  if (!mailer?.configured) return { sent: 0, failed: 0 };
  const claimed = await prisma.$queryRaw`
    UPDATE email_outbox SET status = 'SENDING', attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM email_outbox
      WHERE (status = 'PENDING' AND "sendAfter" <= now()) OR (status = 'SENDING' AND "sendAfter" <= now() - interval '10 minutes')
      ORDER BY "createdAt" LIMIT ${batch} FOR UPDATE SKIP LOCKED
    ) RETURNING id, "to", subject, text, html, attempts`;
  let sent = 0;
  let failed = 0;
  for (const m of claimed) {
    try {
      const result = await mailer.send({ to: m.to, subject: m.subject, text: m.text, html: m.html ?? undefined });
      // The development mailer only logs; record that honestly instead of claiming delivery.
      const delivered = result?.delivered !== false;
      await prisma.emailOutbox.update({ where: { id: m.id }, data: { status: delivered ? 'SENT' : 'SKIPPED', sentAt: new Date(), lastError: delivered ? null : 'Logged by the development mailer, not delivered' } });
      sent++;
    } catch (error) {
      const giveUp = m.attempts > BACKOFF_MS.length;
      await prisma.emailOutbox.update({ where: { id: m.id }, data: { status: giveUp ? 'FAILED' : 'PENDING', lastError: String(error?.message ?? error).slice(0, 500), sendAfter: new Date(Date.now() + (BACKOFF_MS[m.attempts - 1] ?? 0)) } });
      failed++;
      logger?.warn?.(`Email to ${m.to} failed (attempt ${m.attempts}): ${error?.message ?? error}`);
    }
  }
  return { sent, failed };
}
