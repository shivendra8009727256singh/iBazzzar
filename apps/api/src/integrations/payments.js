// Razorpay adapter (test mode only — config refuses live keys). Network calls have timeouts and never trust the browser:
// payment is confirmed only through a verified checkout signature or a verified webhook, and amounts are re-checked.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { DomainError } from '../../../../packages/shared/src/index.js';
import { verifyHmac } from '../lib/security.js';

export function createPayments({ keyId, keySecret, webhookSecret }, { fetchImpl = fetch } = {}) {
  const configured = !!(keyId && keySecret);
  const auth = () => `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;

  async function call(path, body) {
    if (!configured) throw new DomainError('Online payments are not configured yet', 503);
    let response;
    try {
      response = await fetchImpl(`https://api.razorpay.com/v1${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth() },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new DomainError('The payment provider could not be reached. Please try again.', 502);
    }
    if (!response.ok) throw new DomainError('The payment provider declined the request. Please try again.', 502);
    return response.json();
  }

  return {
    provider: 'razorpay',
    configured,
    webhookConfigured: !!webhookSecret,
    publicKey: keyId,
    mode: configured ? 'test' : 'not-configured',

    createOrder: ({ amountPaise, receipt }) => call('/orders', { amount: amountPaise, currency: 'INR', receipt }),

    refund: ({ paymentId, amountPaise, notes }) => call(`/payments/${encodeURIComponent(paymentId)}/refund`, { amount: amountPaise, notes }),

    /** Signature returned to the browser by Razorpay Checkout: HMAC(order_id|payment_id, key_secret). */
    verifyCheckoutSignature({ orderId, paymentId, signature }) {
      if (!configured || !/^[a-f0-9]{64}$/i.test(signature || '')) return false;
      const expected = createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest();
      return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
    },

    verifyWebhook: (rawBody, signature) => verifyHmac(rawBody, signature, webhookSecret),
  };
}
