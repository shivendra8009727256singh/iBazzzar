'use client';
// Opens Razorpay Checkout (test mode) for an order and confirms the payment on the server.
// The server verifies the signature; the browser never decides that an order is paid.
import { post } from '@/lib/api';

type RazorpayOrder = { key: string; providerOrderId: string; amount: number; currency: string; name: string; description: string; prefill: Record<string, string | null> };
type RazorpayResult = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
declare global { interface Window { Razorpay?: new (opts: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: { error?: { description?: string } }) => void) => void } } }

function loadScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the payment window. Check your connection and try again.'));
    document.body.appendChild(s);
  });
}

export async function payOnline(orderId: string): Promise<'paid' | 'dismissed'> {
  const order = await post<RazorpayOrder>(`/orders/${orderId}/payment`);
  await loadScript();
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: order.key, order_id: order.providerOrderId, amount: order.amount, currency: order.currency, name: order.name, description: order.description,
      prefill: order.prefill, theme: { color: '#092c20' },
      handler: async (r: RazorpayResult) => {
        try { await post(`/orders/${orderId}/payment/verify`, r); resolve('paid'); } catch (e) { reject(e); }
      },
      modal: { ondismiss: () => resolve('dismissed') },
    });
    rzp.on('payment.failed', (r) => reject(new Error(r.error?.description || 'The payment failed. You can try again.')));
    rzp.open();
  });
}

export const payDemo = (orderId: string) => post(`/orders/${orderId}/demo-payment`);
