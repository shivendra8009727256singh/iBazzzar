// Email delivery adapter.
// - console: development only; messages are logged so links can be clicked locally. Never reports "delivered".
// - smtp:    any SMTP provider (SES, Postmark, Zoho, Gmail Workspace) via SMTP_URL.
// - none:    email is switched off; flows that need email return a clear "not available" error.
export async function createMailer(mail, logger) {
  if (mail.provider === 'smtp') {
    const { default: nodemailer } = await import('nodemailer');
    const transport = nodemailer.createTransport(mail.smtpUrl);
    return {
      configured: true,
      provider: 'smtp',
      async send({ to, subject, text, html }) {
        const info = await transport.sendMail({ from: mail.from, to, subject, text, html });
        return { delivered: true, id: info.messageId };
      },
    };
  }
  if (mail.provider === 'console') {
    return {
      configured: true,
      provider: 'console',
      async send({ to, subject, text }) {
        logger?.warn({ to, subject, text }, 'DEV MAILER: email not sent, logged instead');
        return { delivered: false, logged: true };
      },
    };
  }
  return {
    configured: false,
    provider: 'none',
    async send() {
      throw Object.assign(new Error('Email delivery is not configured'), { status: 503 });
    },
  };
}

/** Minimal branded HTML wrapper for transactional emails. */
export function emailHtml({ heading, body, actionLabel, actionUrl }) {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  return `<!doctype html><html><body style="margin:0;background:#F8F4E8;font-family:Arial,sans-serif;color:#14251B">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;border:1px solid #DFE4DA">
<tr><td style="background:#092C20;color:#E7BE67;padding:20px 28px;font-size:20px;font-weight:bold;border-radius:12px 12px 0 0">iBazzzar</td></tr>
<tr><td style="padding:28px"><h1 style="font-size:20px;margin:0 0 12px">${esc(heading)}</h1><p style="font-size:15px;line-height:1.6;margin:0 0 20px">${esc(body)}</p>
${actionUrl ? `<a href="${esc(actionUrl)}" style="display:inline-block;background:#092C20;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold">${esc(actionLabel)}</a>` : ''}
<p style="font-size:12px;color:#66766D;margin:24px 0 0">If you didn’t expect this email, you can ignore it.</p></td></tr></table></td></tr></table></body></html>`;
}
