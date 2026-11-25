export const formatMoney = (paise: number | null | undefined) =>
  paise == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: paise % 100 ? 2 : 0 }).format(paise / 100);

export const formatDate = (value: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  value ? new Date(value).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', ...opts }) : '—';

export const formatDateTime = (value: string | Date | null | undefined) =>
  value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export const label = (status: string | null | undefined) =>
  status === 'DEMO_SIMULATED' ? 'Processed' : status ? status.replaceAll('_', ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()) : '';

export const percentOff = (price: number, mrp: number) => (mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0);

export const pct = (bps: number) => `${(bps / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`;

export const rupeesToPaise = (value: string | number) => Math.round(Number(value) * 100);

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

export const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'gold'> = {
  APPROVED: 'success', ACTIVE: 'success', CONFIRMED: 'info', DELIVERED: 'success', PAID: 'success', CAPTURED: 'success', PROCESSED: 'success',
  REFUNDED: 'success', LIVE: 'success', COD_COLLECTED: 'success', CONFIRMED_BY_SELLER: 'info', ORDERED: 'success', ACCEPTED: 'success', VERIFIED: 'success',
  PENDING: 'warning', AWAITING_PAYMENT: 'warning', PENDING_APPROVAL: 'warning', REQUESTED: 'warning', OPEN: 'info', QUOTED: 'info', PACKED: 'info',
  SHIPPED: 'info', PARTIALLY_SHIPPED: 'info', IN_TRANSIT: 'info', OUT_FOR_DELIVERY: 'info', PICKED_UP: 'info', CREATED: 'neutral', UNPAID: 'warning',
  COD_PENDING: 'gold', ON_TERMS: 'gold', BANK_TRANSFER_PENDING: 'warning', PENDING_PROVIDER: 'warning', DEMO_SIMULATED: 'success', SCHEDULED: 'info',
  AWAITING_CUSTOMER: 'info', RECEIVED: 'info', CHANGES_REQUESTED: 'warning', PAUSED: 'neutral', ENDED: 'neutral', USED_UP: 'neutral',
  REJECTED: 'danger', CANCELLED: 'danger', SUSPENDED: 'danger', FAILED: 'danger', FAILED_DELIVERY: 'danger', EXPIRED: 'neutral', WITHDRAWN: 'neutral', CLOSED: 'neutral',
  PARTIALLY_REFUNDED: 'gold', RETURNED: 'neutral',
};

export const ORDER_STATUS_TEXT: Record<string, string> = {
  AWAITING_PAYMENT: 'Awaiting payment', CONFIRMED: 'Confirmed', PARTIALLY_SHIPPED: 'Partly shipped', SHIPPED: 'Shipped', DELIVERED: 'Delivered', CANCELLED: 'Cancelled',
};

export const PAYMENT_TEXT: Record<string, string> = {
  UNPAID: 'Unpaid', PAID: 'Paid', COD_PENDING: 'Pay on delivery', COD_COLLECTED: 'Paid on delivery', BANK_TRANSFER_PENDING: 'Awaiting bank transfer',
  ON_TERMS: 'On credit terms', DEMO_SIMULATED: 'Paid', REFUNDED: 'Refunded', PARTIALLY_REFUNDED: 'Partly refunded',
};
