'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, ShoppingCart, Hourglass, PackageCheck, Truck, CircleCheckBig, XCircle } from 'lucide-react';
import { indianStates } from '@ibazzzar/shared';
import { api, del, patch, post } from '@/lib/api';
import type { Order } from '@/lib/types';
import { formatDate, formatDateTime, formatMoney, label, PAYMENT_TEXT, ORDER_STATUS_TEXT, rupeesToPaise, pct } from '@/lib/format';
import { Alert, Badge, Button, ConfirmButton, Field, Input, Modal, Select, StatusBadge, Textarea, Checkbox } from '../ui';
import { ActionButton, DataTable, Drawer, Loadable, SummaryCards, MiniStats, NotesPanel, Panel, Section, Table, Timeline, attempt, useAdminTable, useOpenParam, useUrlState, type Column, type ListResponse } from './kit';
import type { Can } from './people';

const ORDER_STATUSES = ['AWAITING_PAYMENT', 'CONFIRMED', 'PARTIALLY_SHIPPED', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
const METHODS: [string, string][] = [['ONLINE', 'Online'], ['COD', 'Cash on delivery'], ['BANK_TRANSFER', 'Bank transfer'], ['CREDIT_TERMS', 'Credit terms']];

// ───────────── Orders ─────────────
type OrderRow = { id: string; number: string; createdAt: string; status: string; paymentStatus: string; paymentMethod: string; mode: string; totalPaise: number; items: number; couponCode: string | null; customerId: string; customer: string; email: string; organization: string | null; state: string | null; parcels: { seller: string; status: string }[]; demo: boolean };
type Parcel = Order['parcels'][number] & { refundablePaise: number; actions: { pack: boolean; ship: boolean; cancel: boolean } };
type Order360 = {
  order: Omit<Order, 'parcels'> & { parcels: Parcel[] };
  customer: { id: string; name: string; email: string; phone: string | null; orders: number };
  organization: { id: string; legalName: string } | null;
  payments: { id: string; providerOrderId: string; status: string; amountPaise: number; transactions: { id: string; status: string; method: string | null; source: string; amountPaise: number; at: string }[] }[];
  tickets: { id: string; number: string; subject: string; status: string }[];
  notes: { id: string; body: string; authorName: string; authorId: string; createdAt: string }[];
  actions: { cancelUnpaid: boolean; editAddress: boolean; confirmBankTransfer: boolean; recordTermsPayment: boolean; refund: boolean };
};

export function Orders({ can }: { can: Can }) {
  const list = useAdminTable<ListResponse & { orders: OrderRow[]; totalValuePaise: number }>('/admin/orders', ['status', 'payment', 'method', 'mode', 'store', 'user', 'organization', 'coupon', 'min', 'max']);
  const { get, set } = useUrlState();
  const [open, setOpen] = useOpenParam();
  const scoped = get('user') || get('store') || get('organization');
  const columns: Column<OrderRow>[] = [
    { key: 'number', label: 'Order', sort: 'number', always: true, render: (o) => <><p className="font-semibold whitespace-nowrap">{o.number}</p><p className="text-xs text-muted">{formatDateTime(o.createdAt)}</p></> },
    { key: 'customer', label: 'Customer', render: (o) => <><p className="text-sm">{o.customer}</p><p className="text-xs text-muted">{o.organization ?? o.email}</p></> },
    { key: 'mode', label: 'Channel', render: (o) => (o.mode === 'BUSINESS' ? <Badge tone="info">B2B</Badge> : <Badge tone="neutral">B2C</Badge>) },
    { key: 'parcels', label: 'Parcels', render: (o) => <span className="text-sm">{o.parcels.map((p) => `${p.seller}: ${label(p.status).toLowerCase()}`).join('; ')}</span> },
    { key: 'payment', label: 'Payment', render: (o) => <><StatusBadge status={o.paymentStatus} text={PAYMENT_TEXT[o.paymentStatus]} /><span className="block text-xs text-muted mt-0.5">{label(o.paymentMethod)}</span></> },
    { key: 'coupon', label: 'Coupon', hidden: true, render: (o) => o.couponCode ?? '—' },
    { key: 'state', label: 'State', hidden: true, render: (o) => o.state ?? '—' },
    { key: 'status', label: 'Status', render: (o) => <><StatusBadge status={o.status} text={ORDER_STATUS_TEXT[o.status]} /></> },
    { key: 'total', label: 'Total', sort: 'total', className: 'text-right', render: (o) => <span className="font-semibold">{formatMoney(o.totalPaise)}</span> },
  ];
  return (
    <Section title="Orders" description="Every order and its seller parcels. Open an order to act on it: every action asks for a reason and is recorded.">
      {scoped && <Alert tone="info">Showing orders for one {get('user') ? 'customer' : get('store') ? 'seller' : 'business'}. <button className="underline font-semibold" onClick={() => set({ user: null, store: null, organization: null })}>Show all orders</button></Alert>}
      <div className="h-3" />
      <SummaryCards kind="orders" cards={[
        { key: 'ALL', label: 'All orders', icon: ShoppingCart, tone: 'green', params: { status: null } },
        { key: 'AWAITING_PAYMENT', label: 'Awaiting payment', icon: Hourglass, tone: 'amber', params: { status: 'AWAITING_PAYMENT' } },
        { key: 'CONFIRMED', label: 'To ship', icon: PackageCheck, tone: 'blue', params: { status: 'CONFIRMED' } },
        { key: 'SHIPPED', label: 'In transit', icon: Truck, tone: 'violet', params: { status: 'SHIPPED' } },
        { key: 'DELIVERED', label: 'Delivered', icon: CircleCheckBig, tone: 'green', params: { status: 'DELIVERED' } },
        { key: 'CANCELLED', label: 'Cancelled', icon: XCircle, tone: 'red', params: { status: 'CANCELLED' } },
      ]} />
      <DataTable tableId="orders" query={list} rows={list.data?.orders} columns={columns} onOpen={(o) => setOpen(o.id)} search="Order number, customer, phone or payment ID"
        filters={[
          { key: 'status', label: 'Status', options: ORDER_STATUSES.map((s) => [s, ORDER_STATUS_TEXT[s]]) },
          { key: 'payment', label: 'Payment', options: Object.entries(PAYMENT_TEXT) },
          { key: 'method', label: 'Method', options: METHODS },
          { key: 'mode', label: 'Channel', options: [['RETAIL', 'B2C retail'], ['BUSINESS', 'B2B business']] },
        ]}
        toolbar={<AmountFilter />}
        summary={list.data && <p className="text-sm text-muted mb-3">Value of the {list.data.total.toLocaleString('en-IN')} orders shown: <strong className="text-ink">{formatMoney(list.data.totalValuePaise)}</strong></p>}
        bulk={can('orders.manage') ? { endpoint: '/admin/orders/bulk', actions: [{ id: 'cancel-unpaid', label: 'Cancel unpaid orders', danger: true, reason: 'required', confirm: 'Only orders still awaiting payment are cancelled; others are skipped. Customers are told why.' }] } : undefined} />
      {open && <OrderDrawer id={open} can={can} onClose={() => { setOpen(null); list.refetch(); }} />}
    </Section>
  );
}

function AmountFilter() {
  const { get, set } = useUrlState();
  const [min, setMin] = useState(get('min'));
  const [max, setMax] = useState(get('max'));
  return (
    <details className="relative">
      <summary className={`btn btn-outline btn-sm min-h-[40px] list-none cursor-pointer ${get('min') || get('max') ? 'border-forest text-forest' : ''}`}>₹ Amount</summary>
      <form className="absolute right-0 z-30 mt-2 w-60 card p-3 shadow-lift grid gap-2" onSubmit={(e) => { e.preventDefault(); set({ min, max }); }}>
        <div className="grid grid-cols-2 gap-2"><label className="text-xs font-semibold text-muted">Min ₹<input className="input mt-1 min-h-[36px]" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} /></label><label className="text-xs font-semibold text-muted">Max ₹<input className="input mt-1 min-h-[36px]" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} /></label></div>
        <div className="flex gap-2"><Button size="sm" type="submit">Apply</Button><Button size="sm" variant="ghost" type="button" onClick={() => { setMin(''); setMax(''); set({ min: null, max: null }); }}>Clear</Button></div>
      </form>
    </details>
  );
}

function OrderDrawer({ id, can, onClose }: { id: string; can: Can; onClose: () => void }) {
  const { data, refetch, error } = useQuery({ queryKey: ['admin', 'order', id], queryFn: () => api<Order360>(`/admin/orders/${id}`) });
  const o = data?.order;
  const manage = can('orders.manage');
  const finance = can('finance.manage');
  const done = () => refetch();
  return (
    <Drawer open onClose={onClose} wide title={o ? `Order ${o.number}` : 'Loading…'} subtitle={o ? `Placed ${formatDateTime(o.createdAt)} · ${o.mode === 'BUSINESS' ? 'Business order' : 'Retail order'}` : undefined}
      badges={o && <><StatusBadge status={o.status} text={ORDER_STATUS_TEXT[o.status]} /><StatusBadge status={o.paymentStatus} text={PAYMENT_TEXT[o.paymentStatus]} /><Badge tone="neutral">{label(o.paymentMethod)}</Badge>{o.couponCode && <Badge tone="info">Coupon {o.couponCode}</Badge>}</>}
      actions={data && o && <>
        {manage && <ActionButton label="Message customer" title="Message the customer" body="Sent to their notifications and by email." reason={false} confirmLabel="Send" fields={(st, set) => <>
          <Field label="Subject"><Input value={st.subject ?? ''} onChange={(e) => set({ subject: e.target.value })} placeholder="Delivery update" /></Field>
          <Field label="Message"><Textarea rows={5} value={st.body ?? ''} onChange={(e) => set({ body: e.target.value })} /></Field>
        </>} onSubmit={(v) => post<{ emailed: boolean }>(`/admin/orders/${id}/message`, { subject: v.subject, body: v.body }).then((r) => { if (!r.emailed) toast.info('Sent in the app; email could not be sent'); })} />}
        {manage && data.actions.editAddress && <AddressAction order={o} onDone={done} />}
        {manage && data.actions.cancelUnpaid && <ActionButton danger label="Cancel order" title="Cancel this unpaid order?" reasonLabel="Reason (sent to the customer)" onSubmit={(v) => post(`/admin/orders/${id}/cancel`, { reason: v.reason }).then(done)} />}
        {finance && data.actions.confirmBankTransfer && <ActionButton label="Confirm bank transfer" title="Confirm the bank transfer" body="Only after matching the UTR on the bank statement." reason={false} confirmLabel="Confirm payment" fields={(st, set) => <Field label="Bank UTR / reference"><Input value={st.utr ?? ''} onChange={(e) => set({ utr: e.target.value.toUpperCase() })} /></Field>} onSubmit={(v) => post(`/admin/orders/${id}/bank-transfer`, { utr: v.utr }).then(done)} />}
        {finance && data.actions.recordTermsPayment && <ActionButton label="Record credit payment" title="Record payment of this credit order" body="When the business has paid its invoice." reason={false} confirmLabel="Record payment" fields={(st, set) => <Field label="Bank UTR or cheque number"><Input value={st.reference ?? ''} onChange={(e) => set({ reference: e.target.value.toUpperCase() })} /></Field>} onSubmit={(v) => post(`/admin/orders/${id}/terms-payment`, { reference: v.reference }).then(done)} />}
      </>}>
      {error && <Alert>{(error as Error).message}</Alert>}
      {data && o && <>
        <MiniStats items={[['Total', formatMoney(o.totalPaise)], ['GST', formatMoney(o.taxPaise)], ['Delivery', formatMoney(o.shippingPaise), o.codFeePaise ? `COD fee ${formatMoney(o.codFeePaise)}` : undefined], ['Discount', formatMoney(o.discountPaise)]]} />
        <div className="grid gap-4 md:grid-cols-2">
          <Panel title="Customer">
            <p className="font-semibold"><Link href={`/admin/customers?open=${data.customer.id}`} className="hover:underline">{data.customer.name}</Link></p>
            <p className="text-sm text-muted">{data.customer.email}{data.customer.phone ? ` · ${data.customer.phone}` : ''}</p>
            <p className="text-sm text-muted">{data.customer.orders} orders in total</p>
            {data.organization && <p className="text-sm mt-1">Business: <Link href={`/admin/organizations?open=${data.organization.id}`} className="font-semibold hover:underline">{data.organization.legalName}</Link></p>}
            {o.billingGstin && <p className="text-sm">Billing GSTIN <span className="font-mono">{o.billingGstin}</span></p>}
          </Panel>
          <Panel title="Delivery address">
            {o.address ? <p className="text-sm">{o.address.name}<br />{o.address.line1}{o.address.line2 ? `, ${o.address.line2}` : ''}<br />{o.address.city}, {o.address.state} {o.address.pincode}<br />{o.address.phone}</p> : <p className="text-sm text-muted">—</p>}
          </Panel>
        </div>
        {o.parcels.map((p) => (
          <Panel key={p.id} title={`Parcel from ${p.sellerName}`} actions={<StatusBadge status={p.status} />}>
            <ul className="grid gap-1.5 text-sm">{p.items.map((i) => <li key={i.id} className="flex justify-between gap-3"><span>{i.name} · {i.variantLabel} × {i.quantity}<span className="text-muted"> · GST {pct(i.taxRateBps)}</span></span><span className="font-semibold">{formatMoney(i.totalPaise)}</span></li>)}</ul>
            <p className="text-sm text-muted mt-2">Parcel total {formatMoney(p.totalPaise)} incl. delivery {formatMoney(p.shippingPaise)}{p.invoiceNumber ? ` · Invoice ${p.invoiceNumber}` : ''}{p.estimatedDeliveryAt ? ` · Expected ${formatDate(p.estimatedDeliveryAt)}` : ''}</p>
            {p.shipments.map((s) => <div key={s.id} className="mt-2 rounded-lg bg-cream px-3 py-2 text-sm"><p className="font-semibold">{s.carrier} · <span className="font-mono">{s.trackingRef}</span> · {label(s.status)}</p>{s.events.length > 0 && <p className="text-xs text-muted">{s.events.map((e) => `${label(e.status)} ${formatDateTime(e.at)}`).join(' → ')}</p>}</div>)}
            {(manage || finance) && <div className="flex flex-wrap gap-2 mt-3 border-t border-line pt-3">
              {manage && p.actions.pack && <ActionButton label="Mark packed" title="Mark this parcel packed for the seller?" body="Use when the seller can’t update it themselves. The seller is told." onSubmit={(v) => post(`/admin/orders/${id}/parcels/${p.id}/pack`, { reason: v.reason }).then(done)} />}
              {manage && p.actions.ship && <ActionButton label="Ship" title="Ship this parcel for the seller" body="Books a sandbox shipment, or records a courier the seller booked." confirmLabel="Mark shipped" fields={(st, set) => <>
                <Field label="Courier"><Select value={st.mode ?? 'MANUAL'} onChange={(e) => set({ mode: e.target.value })}><option value="MANUAL">Seller-booked courier</option><option value="SANDBOX">Sandbox courier (test)</option></Select></Field>
                {(st.mode ?? 'MANUAL') === 'MANUAL' && <div className="grid gap-3 sm:grid-cols-2"><Field label="Courier name"><Input value={st.carrier ?? ''} onChange={(e) => set({ carrier: e.target.value })} /></Field><Field label="Tracking number"><Input value={st.trackingRef ?? ''} onChange={(e) => set({ trackingRef: e.target.value })} /></Field></div>}
              </>} onSubmit={(v) => post(`/admin/orders/${id}/parcels/${p.id}/ship`, { reason: v.reason, mode: v.mode ?? 'MANUAL', ...(v.carrier ? { carrier: v.carrier } : {}), ...(v.trackingRef ? { trackingRef: v.trackingRef } : {}) }).then(done)} />}
              {manage && p.actions.cancel && <ActionButton danger label="Cancel parcel" title="Cancel this parcel?" body="Stock goes back to the seller. If the customer paid online, a refund for this parcel is created automatically." reasonLabel="Reason (sent to the customer and seller)" onSubmit={(v) => post(`/admin/orders/${id}/parcels/${p.id}/cancel`, { reason: v.reason }).then(done)} />}
              {finance && data.actions.refund && p.refundablePaise > 0 && <ActionButton label="Refund" title={`Refund part of this parcel`} body={`Up to ${formatMoney(p.refundablePaise)} can still be refunded. It is paid out from Refunds.`} confirmLabel="Create refund" reasonLabel="Reason (shown to the customer)" fields={(st, set) => <Field label="Amount (₹)"><Input inputMode="decimal" value={st.amount ?? ''} onChange={(e) => set({ amount: e.target.value })} placeholder={(p.refundablePaise / 100).toFixed(2)} /></Field>} onSubmit={(v) => post(`/admin/orders/${id}/refund`, { parcelId: p.id, amountPaise: rupeesToPaise(v.amount || '0'), reason: v.reason }).then(done)} />}
            </div>}
          </Panel>
        ))}
        {(o.refunds.length > 0 || o.returns.length > 0) && (
          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Refunds">{o.refunds.length ? <ul className="grid gap-1.5 text-sm">{o.refunds.map((r) => <li key={r.id} className="flex justify-between gap-2"><span>{r.reason}<span className="block text-xs text-muted">{formatDate(r.createdAt)}</span></span><span className="text-right"><strong>{formatMoney(r.amountPaise)}</strong><br /><StatusBadge status={r.status} /></span></li>)}</ul> : <p className="text-sm text-muted">None.</p>}</Panel>
            <Panel title="Returns">{o.returns.length ? <ul className="grid gap-1.5 text-sm">{o.returns.map((r) => <li key={r.id} className="flex justify-between gap-2"><span>“{r.reason}”<span className="block text-xs text-muted">{formatDate(r.createdAt)}</span></span><StatusBadge status={r.status} /></li>)}</ul> : <p className="text-sm text-muted">None.</p>}</Panel>
          </div>
        )}
        {data.payments.length > 0 && <Panel title="Payment attempts"><ul className="grid gap-1.5 text-sm">{data.payments.map((p) => <li key={p.id}><span className="font-mono text-xs">{p.providerOrderId}</span> · <StatusBadge status={p.status} /> · {formatMoney(p.amountPaise)}{p.transactions.map((t) => <span key={t.id} className="block text-xs text-muted pl-3">{t.id} · {label(t.status)} · {t.method ?? 'method unknown'} · via {t.source.toLowerCase()} · {formatDateTime(t.at)}</span>)}</li>)}</ul></Panel>}
        {data.tickets.length > 0 && <Panel title="Support tickets"><ul className="grid gap-1 text-sm">{data.tickets.map((t) => <li key={t.id} className="flex justify-between"><span>{t.number} · {t.subject}</span><StatusBadge status={t.status} /></li>)}</ul></Panel>}
        <NotesPanel entityType="order" entityId={id} initial={data.notes} />
        <Panel title="History"><Timeline items={[...o.history].reverse().map((h, i) => ({ id: String(i), title: label(h.status), note: h.note ?? undefined, at: h.at }))} /></Panel>
      </>}
    </Drawer>
  );
}

function AddressAction({ order, onDone }: { order: Order360['order']; onDone: () => void }) {
  const a = order.address;
  return (
    <ActionButton label="Edit address" title="Change the delivery address" body={`Only before shipping, and within ${a?.state ?? 'the same state'}: GST was charged for that state.`} confirmLabel="Save address"
      fields={(st, set) => {
        const v = (k: string, d = '') => st[k] ?? (a as Record<string, string> | null)?.[k] ?? d;
        return <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Recipient"><Input value={v('name')} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Mobile"><Input inputMode="numeric" value={v('phone')} onChange={(e) => set({ phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} /></Field>
          <Field label="Building and street" className="sm:col-span-2"><Input value={v('line1')} onChange={(e) => set({ line1: e.target.value })} /></Field>
          <Field label="Area / landmark" className="sm:col-span-2"><Input value={v('line2')} onChange={(e) => set({ line2: e.target.value })} /></Field>
          <Field label="City"><Input value={v('city')} onChange={(e) => set({ city: e.target.value })} /></Field>
          <Field label="PIN code"><Input inputMode="numeric" value={v('pincode')} onChange={(e) => set({ pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })} /></Field>
          <Field label="State" className="sm:col-span-2"><Select value={v('state')} onChange={(e) => set({ state: e.target.value })}>{indianStates.map((s: { name: string }) => <option key={s.name}>{s.name}</option>)}</Select></Field>
        </div>;
      }}
      onSubmit={(v) => {
        const base = (a ?? {}) as Record<string, string>;
        const pick = (k: string) => v[k] ?? base[k];
        return patch(`/admin/orders/${order.id}/address`, { name: pick('name'), phone: pick('phone'), line1: pick('line1'), ...(pick('line2') ? { line2: pick('line2') } : {}), city: pick('city'), state: pick('state'), pincode: pick('pincode'), reason: v.reason }).then(onDone);
      }} />
  );
}

// ───────────── B2B ─────────────
export function B2B() {
  const { get, set } = useUrlState();
  const q = get('q');
  const [text, setText] = useState(q);
  const query = useQuery({ queryKey: ['admin', 'b2b', q], queryFn: () => api<{ rfqs: { id: string; number: string; title: string; status: string; organizationId: string; organization: string; items: number; sellers: number; createdAt: string }[]; quotations: { id: string; status: string; seller: string; rfq: string; title: string; revision: number; totalPaise: number | null; updatedAt: string }[]; purchaseOrders: { id: string; number: string; status: string; organizationId: string; organization: string; seller: string; totalPaise: number; paymentTerms: string; createdAt: string }[] }>(`/admin/b2b${q ? `?q=${encodeURIComponent(q)}` : ''}`) });
  return (
    <Section title="B2B: RFQs, quotations and POs" description="Business procurement across the marketplace. Open a buyer to see their credit and history.">
      <form className="flex gap-2 mb-4" onSubmit={(e) => { e.preventDefault(); set({ q: text.trim() }); }}><Input className="max-w-xs min-h-[40px]" aria-label="Search B2B" placeholder="RFQ, PO number, buyer or seller" value={text} onChange={(e) => setText(e.target.value)} /><Button variant="outline" type="submit">Search</Button></form>
      <Loadable query={query}>{(d) => (
        <div className="grid gap-6">
          <section><h2 className="text-lg mb-2">Purchase orders</h2><Table head={['PO', 'Buyer', 'Seller', 'Terms', 'Status', 'Total']} empty={!d.purchaseOrders.length}>{d.purchaseOrders.map((p) => <tr key={p.id}><td>{p.number}<span className="block text-xs text-muted">{formatDate(p.createdAt)}</span></td><td><Link href={`/admin/organizations?open=${p.organizationId}`} className="hover:underline">{p.organization}</Link></td><td>{p.seller}</td><td>{label(p.paymentTerms)}</td><td><StatusBadge status={p.status} /></td><td>{formatMoney(p.totalPaise)}</td></tr>)}</Table></section>
          <section><h2 className="text-lg mb-2">RFQs</h2><Table head={['RFQ', 'Buyer', 'Items', 'Sellers asked', 'Status']} empty={!d.rfqs.length}>{d.rfqs.map((r) => <tr key={r.id}><td>{r.title}<span className="block text-xs text-muted">{r.number} · {formatDate(r.createdAt)}</span></td><td><Link href={`/admin/organizations?open=${r.organizationId}`} className="hover:underline">{r.organization}</Link></td><td>{r.items}</td><td>{r.sellers}</td><td><StatusBadge status={r.status} /></td></tr>)}</Table></section>
          <section><h2 className="text-lg mb-2">Quotations</h2><Table head={['RFQ', 'Seller', 'Revision', 'Total', 'Status']} empty={!d.quotations.length}>{d.quotations.map((x) => <tr key={x.id}><td>{x.rfq} · {x.title}</td><td>{x.seller}</td><td>{x.revision}</td><td>{x.totalPaise == null ? '—' : formatMoney(x.totalPaise)}</td><td><StatusBadge status={x.status} /></td></tr>)}</Table></section>
        </div>
      )}</Loadable>
    </Section>
  );
}

// ───────────── Payments & refunds ─────────────
export function Payments() {
  const query = useQuery({ queryKey: ['admin', 'payments'], queryFn: () => api<{ provider: string; webhook: string; totals: Record<string, { count: number; amountPaise: number }>; intents: { id: string; order: string; orderId: string; providerOrderId: string; status: string; amountPaise: number; createdAt: string; payments: string[] }[]; events: { id: string; type: string; outcome: string; receivedAt: string }[]; anomalies: { id: string; action: string; entityId: string; metadata: Record<string, unknown>; createdAt: string }[] }>('/admin/payments') });
  return (
    <Section title="Payments" description="Razorpay runs in test mode only until live payments are approved. Mismatched or late payments are flagged here, never applied automatically.">
      <Loadable query={query}>{(d) => (
        <div className="grid gap-6">
          <div className="flex flex-wrap gap-2"><Badge tone={d.provider.startsWith('Razorpay') ? 'success' : 'warning'}>Provider: {d.provider}</Badge><Badge tone={d.webhook === 'Configured' ? 'success' : 'warning'}>Webhook: {d.webhook}</Badge></div>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">{Object.entries(d.totals).map(([k, v]) => <Link key={k} href={`/admin/orders?payment=${k}`} className="card p-4 hover:shadow-lift"><p className="text-sm text-muted">{PAYMENT_TEXT[k] ?? label(k)}</p><p className="font-bold text-lg">{formatMoney(v.amountPaise)}</p><p className="text-xs text-muted">{v.count} orders</p></Link>)}</div>
          {d.anomalies.length > 0 && <Alert tone="warning" title={`${d.anomalies.length} payment anomalies need review`}><ul className="mt-1">{d.anomalies.map((a) => <li key={a.id}><Link className="underline" href={`/admin/orders?open=${a.entityId}`}>{a.action === 'payment.mismatch' ? 'Amount mismatch' : 'Paid after cancellation — refund needed'} · order {a.entityId.slice(0, 8)}</Link> · {formatDateTime(a.createdAt)}</li>)}</ul></Alert>}
          <section><h2 className="text-lg mb-2">Payment attempts</h2><Table head={['Order', 'Provider order', 'Amount', 'Status', 'Payments']} empty={!d.intents.length}>{d.intents.map((i) => <tr key={i.id}><td><Link href={`/admin/orders?open=${i.orderId}`} className="hover:underline">{i.order}</Link><span className="block text-xs text-muted">{formatDateTime(i.createdAt)}</span></td><td className="font-mono text-xs">{i.providerOrderId}</td><td>{formatMoney(i.amountPaise)}</td><td><StatusBadge status={i.status} /></td><td className="font-mono text-xs">{i.payments.join(', ') || '—'}</td></tr>)}</Table></section>
          <section><h2 className="text-lg mb-2">Webhook events</h2><Table head={['Event', 'Type', 'Outcome', 'Received']} empty={!d.events.length}>{d.events.map((e) => <tr key={e.id}><td className="font-mono text-xs">{e.id}</td><td>{e.type}</td><td>{label(e.outcome)}</td><td>{formatDateTime(e.receivedAt)}</td></tr>)}</Table></section>
        </div>
      )}</Loadable>
    </Section>
  );
}

type RefundRow = { id: string; orderId: string; order: string; paymentRef: string | null; paymentMethod: string; seller: string; amountPaise: number; reason: string; status: string; providerRef: string | null; createdAt: string; processedAt: string | null };
export function Refunds({ can }: { can: Can }) {
  const list = useAdminTable<ListResponse & { refunds: RefundRow[]; providerRefundsAvailable: boolean; totalValuePaise: number }>('/admin/refunds', ['status', 'store']);
  const [manual, setManual] = useState<{ id: string; ref: string } | null>(null);
  const process = async (id: string, mode: 'PROVIDER' | 'MANUAL', reference?: string) => { if (await attempt(() => post(`/admin/refunds/${id}/process`, { mode, ...(reference ? { reference } : {}) }), 'Refund processed')) { setManual(null); list.refetch(); } };
  const columns: Column<RefundRow>[] = [
    { key: 'order', label: 'Order', always: true, render: (r) => <><Link href={`/admin/orders?open=${r.orderId}`} className="font-semibold hover:underline">{r.order}</Link><span className="block text-xs text-muted">{label(r.paymentMethod)}</span></> },
    { key: 'seller', label: 'Seller', render: (r) => r.seller },
    { key: 'reason', label: 'Reason', render: (r) => <span className="text-sm">{r.reason}</span> },
    { key: 'date', label: 'Created', sort: 'newest', render: (r) => formatDate(r.createdAt) },
    { key: 'amount', label: 'Amount', sort: 'amount', className: 'text-right', render: (r) => <span className="font-semibold">{formatMoney(r.amountPaise)}</span> },
    { key: 'status', label: 'Status', render: (r) => <><StatusBadge status={r.status} />{r.providerRef && <span className="block text-xs font-mono text-muted">{r.providerRef}</span>}</> },
    { key: 'act', label: 'Action', always: true, render: (r) => (can('finance.manage') && r.status === 'PENDING_PROVIDER' ? <span className="flex flex-wrap gap-2">{list.data?.providerRefundsAvailable && r.paymentRef?.startsWith('pay_') && <ConfirmButton variant="primary" title="Refund through Razorpay?" body={`${formatMoney(r.amountPaise)} goes back to the customer’s original payment method.`} confirmLabel="Issue refund" onConfirm={() => process(r.id, 'PROVIDER')}>Razorpay</ConfirmButton>}<Button size="sm" variant="outline" onClick={() => setManual({ id: r.id, ref: '' })}>Record manual</Button></span> : null) },
  ];
  return (
    <Section title="Refunds" description="Refunds come from approved returns, seller cancellations and staff refunds. Issue them through Razorpay, or record a bank transfer (needed for cash-on-delivery orders).">
      <DataTable tableId="refunds" query={list} rows={list.data?.refunds} columns={columns} search="Order, reason or reference"
        filters={[{ key: 'status', label: 'Status', options: [['PENDING_PROVIDER', 'To pay'], ['PROCESSED', 'Processed'], ['FAILED', 'Failed']] }]}
        summary={list.data && <p className="text-sm text-muted mb-3">Total of the refunds shown: <strong className="text-ink">{formatMoney(list.data.totalValuePaise)}</strong></p>} />
      <Modal open={!!manual} onOpenChange={(o) => !o && setManual(null)} title="Record a refund made outside IBazzzar" description="Enter the Razorpay refund ID or bank UTR. IBazzzar does not move money here.">
        {manual && <div className="grid gap-3"><Field label="Refund ID or UTR"><Input value={manual.ref} onChange={(e) => setManual({ ...manual, ref: e.target.value })} /></Field><Button onClick={() => process(manual.id, 'MANUAL', manual.ref)}>Record refund</Button></div>}
      </Modal>
    </Section>
  );
}

type FinanceData = { balances: { storeId: string; seller: string; payoutHold: boolean; payoutHoldReason: string | null; commissionBps: number | null; payoutAccount: { accountLast4: string; ifsc: string; verified: boolean } | null; salesPaise: number; shippingPaise: number; commissionPaise: number; refundsPaise: number; paidOutPaise: number; payablePaise: number }[]; ledger: { id: string; storeId: string; seller: string; kind: string; amountPaise: number; note: string | null; demo: boolean; createdAt: string }[]; payouts: { id: string; seller: string; amountPaise: number; providerRef: string; createdAt: string }[] };
export function Finance({ can }: { can: Can }) {
  const { get, set } = useUrlState();
  const store = get('store');
  const query = useQuery({ queryKey: ['admin', 'finance', store], queryFn: () => api<FinanceData>(`/admin/finance${store ? `?store=${store}` : ''}`) });
  const [payout, setPayout] = useState<{ storeId: string; seller: string; max: number; amount: string; ref: string } | null>(null);
  const canManage = can('finance.manage');
  const record = async () => { if (!payout) return; if (await attempt(() => post('/admin/payouts', { storeId: payout.storeId, amountPaise: rupeesToPaise(payout.amount), providerRef: payout.ref.trim() }), 'Payout recorded')) { setPayout(null); query.refetch(); } };
  return (
    <Section title="Commissions & settlements" description="Seller balances from the append-only ledger. Record a payout only after the money has actually been sent; it can never exceed the payable balance, and held sellers can’t be paid.">
      <Loadable query={query}>{(d) => (
        <div className="grid gap-6">
          <Table head={['Seller', 'Sales + delivery', 'Commission', 'Refunds', 'Paid out', 'Payable', '']} empty={!d.balances.length}>
            {d.balances.map((b) => <tr key={b.storeId} className={b.payoutHold ? 'bg-danger-bg/40' : undefined}>
              <td><Link href={`/admin/sellers?open=${b.storeId}`} className="font-semibold hover:underline">{b.seller}</Link><span className="block text-xs text-muted">{b.payoutAccount ? `••••${b.payoutAccount.accountLast4} ${b.payoutAccount.verified ? '· verified' : '· unverified'}` : 'No bank account'}{b.commissionBps != null ? ` · ${pct(b.commissionBps)} commission` : ''}</span>{b.payoutHold && <Badge tone="danger" className="mt-1">On hold: {b.payoutHoldReason}</Badge>}</td>
              <td>{formatMoney(b.salesPaise + b.shippingPaise)}</td><td>{formatMoney(b.commissionPaise)}</td><td>{formatMoney(b.refundsPaise)}</td><td>{formatMoney(b.paidOutPaise)}</td><td className="font-bold">{formatMoney(b.payablePaise)}</td>
              <td><span className="flex gap-1">{canManage && b.payablePaise >= 100 && <Button size="sm" variant="outline" disabled={!b.payoutAccount?.verified || b.payoutHold} title={b.payoutHold ? 'Release the hold first' : !b.payoutAccount?.verified ? 'Verify the bank account first' : undefined} onClick={() => setPayout({ storeId: b.storeId, seller: b.seller, max: b.payablePaise, amount: String(b.payablePaise / 100), ref: '' })}>Record payout</Button>}<Button size="sm" variant="ghost" onClick={() => set({ store: b.storeId })}>Ledger</Button></span></td>
            </tr>)}
          </Table>
          <section>
            <div className="flex items-center justify-between mb-2"><h2 className="text-lg">Ledger{store ? ` · ${d.balances.find((b) => b.storeId === store)?.seller ?? 'one seller'}` : ''}</h2>{store && <Button size="sm" variant="ghost" onClick={() => set({ store: null })}>Show all sellers</Button>}</div>
            <Table head={['Date', 'Seller', 'Entry', 'Amount']} empty={!d.ledger.length}>{d.ledger.map((e) => <tr key={e.id}><td>{formatDate(e.createdAt)}</td><td>{e.seller}</td><td>{label(e.kind)}<span className="block text-xs text-muted">{e.note}</span></td><td className={e.amountPaise < 0 ? 'text-danger' : 'text-success'}>{formatMoney(e.amountPaise)}</td></tr>)}</Table>
          </section>
          {d.payouts.length > 0 && <section><h2 className="text-lg mb-2">Payouts</h2><Table head={['Date', 'Seller', 'Reference', 'Amount']}>{d.payouts.map((p) => <tr key={p.id}><td>{formatDate(p.createdAt)}</td><td>{p.seller}</td><td className="font-mono text-xs">{p.providerRef}</td><td className="font-semibold">{formatMoney(p.amountPaise)}</td></tr>)}</Table></section>}
        </div>
      )}</Loadable>
      <Modal open={!!payout} onOpenChange={(o) => !o && setPayout(null)} title={`Record payout to ${payout?.seller}`} description={payout ? `Payable balance ${formatMoney(payout.max)}` : undefined}>
        {payout && <div className="grid gap-3"><Field label="Amount (₹)"><Input inputMode="decimal" value={payout.amount} onChange={(e) => setPayout({ ...payout, amount: e.target.value })} /></Field><Field label="Razorpay payout ID or bank UTR" hint="pout_… or the 12–22 character UTR"><Input value={payout.ref} onChange={(e) => setPayout({ ...payout, ref: e.target.value.trim() })} /></Field><Button onClick={record}>Record payout</Button></div>}
      </Modal>
    </Section>
  );
}

// ───────────── Shipping & returns ─────────────
export function Shipping({ can }: { can: Can }) {
  const { get, set } = useUrlState();
  const status = get('status');
  const query = useQuery({ queryKey: ['admin', 'shipping', status], queryFn: () => api<{ provider: string; counts: Record<string, number>; awaitingDispatch: number; shipments: { id: string; provider: string; carrier: string; trackingRef: string; status: string; seller: string; order: string; orderId: string; pincode: string; lastEvent: { status: string; occurredAt: string } | null; updatedAt: string }[] }>(`/admin/shipping${status ? `?status=${status}` : ''}`) });
  const step = async (id: string, next: string) => { if (await attempt(() => post(`/admin/shipments/${id}/events`, { status: next }))) query.refetch(); };
  const NEXT: Record<string, string> = { CREATED: 'PICKED_UP', PICKED_UP: 'IN_TRANSIT', IN_TRANSIT: 'OUT_FOR_DELIVERY', OUT_FOR_DELIVERY: 'DELIVERED' };
  return (
    <Section title="Shipping" description="Sandbox shipments can be advanced here to test the full flow. Seller-booked couriers are updated by the seller.">
      <Loadable query={query}>{(d) => (
        <div className="grid gap-5">
          <Alert tone="info">{d.provider}</Alert>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/orders?status=CONFIRMED" className="badge badge-warning">{d.awaitingDispatch} parcels awaiting dispatch</Link>
            <button className={`badge ${!status ? 'badge-info' : 'badge-neutral'}`} onClick={() => set({ status: null })}>All</button>
            {Object.entries(d.counts).map(([k, v]) => <button key={k} className={`badge ${status === k ? 'badge-info' : 'badge-neutral'}`} onClick={() => set({ status: k })}>{label(k)}: {v}</button>)}
          </div>
          <Table head={['Shipment', 'Order', 'Seller', 'PIN', 'Last update', 'Status', '']} empty={!d.shipments.length}>
            {d.shipments.map((s) => <tr key={s.id}><td>{s.carrier}<span className="block text-xs font-mono text-muted">{s.trackingRef}</span></td><td><Link href={`/admin/orders?open=${s.orderId}`} className="hover:underline">{s.order}</Link></td><td>{s.seller}</td><td>{s.pincode}</td><td className="text-sm">{formatDateTime(s.lastEvent?.occurredAt ?? s.updatedAt)}</td><td><StatusBadge status={s.status} /></td><td>{can('shipping.manage') && s.provider === 'SANDBOX' && NEXT[s.status] && <Button size="sm" variant="outline" onClick={() => step(s.id, NEXT[s.status])}>Mark {label(NEXT[s.status]).toLowerCase()}</Button>}</td></tr>)}
          </Table>
        </div>
      )}</Loadable>
    </Section>
  );
}

type ReturnRow = { id: string; orderId: string; order: string; customer: string; seller: string; status: string; reason: string; note: string | null; refundPaise: number; createdAt: string; items: { name: string; quantity: number }[] };
export function Returns() {
  const list = useAdminTable<ListResponse & { returns: ReturnRow[] }>('/admin/returns', ['status', 'store']);
  const act = async (url: string, body: object = {}) => { if (await attempt(() => post(url, body), 'Saved')) list.refetch(); };
  const columns: Column<ReturnRow>[] = [
    { key: 'items', label: 'Return', always: true, render: (r) => <><p className="text-sm font-semibold">{r.items.map((i) => `${i.name} × ${i.quantity}`).join(', ')}</p><p className="text-xs text-muted">“{r.reason}”</p></> },
    { key: 'order', label: 'Order', render: (r) => <Link href={`/admin/orders?open=${r.orderId}`} className="hover:underline">{r.order}</Link> },
    { key: 'customer', label: 'Customer', render: (r) => r.customer },
    { key: 'seller', label: 'Seller', render: (r) => r.seller },
    { key: 'date', label: 'Requested', sort: 'newest', render: (r) => formatDate(r.createdAt) },
    { key: 'refund', label: 'Refund', sort: 'refund', className: 'text-right', render: (r) => formatMoney(r.refundPaise) },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'act', label: 'Action', always: true, render: (r) => <span className="flex flex-wrap gap-2">{r.status === 'REQUESTED' && <><Button size="sm" onClick={() => act(`/admin/returns/${r.id}/decision`, { decision: 'APPROVED' })}>Approve</Button><ConfirmButton danger title="Decline return?" reason={{ label: 'Reason for the customer' }} confirmLabel="Decline" onConfirm={(note) => act(`/admin/returns/${r.id}/decision`, { decision: 'REJECTED', note })}>Decline</ConfirmButton></>}{r.status === 'APPROVED' && <ConfirmButton title="Mark received?" body="Stock is restored and the refund created." confirmLabel="Mark received" onConfirm={() => act(`/admin/returns/${r.id}/receive`)}>Mark received</ConfirmButton>}</span> },
  ];
  return (
    <Section title="Returns" description="Step in when a seller doesn’t respond or a customer disputes a decision.">
      <DataTable tableId="returns" query={list} rows={list.data?.returns} columns={columns} search="Order, reason or customer" filters={[{ key: 'status', label: 'Status', options: [['REQUESTED', 'Requested'], ['APPROVED', 'Approved'], ['RECEIVED', 'Received'], ['REFUNDED', 'Refunded'], ['REJECTED', 'Declined']] }]} />
    </Section>
  );
}

// ───────────── Promotions ─────────────
type Promo = { id: string; name: string; description: string; discountBps: number; startsAt: string; endsAt: string; state: string; active: boolean; items: number; listings: { id: string; sku: string; name: string; variant: string }[] };
type PromoForm = { id?: string; name: string; description: string; discount: string; start: string; end: string; ids: string[] };
const localInput = (iso: string) => { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };

export function Promotions() {
  const query = useQuery({ queryKey: ['admin', 'promotions'], queryFn: () => api<{ promotions: Promo[] }>('/admin/promotions') });
  const [form, setForm] = useState<PromoForm | null>(null);
  const [find, setFind] = useState('');
  const products = useQuery({ queryKey: ['admin', 'promo-products', find], queryFn: () => api<{ products: { listingId: string; name: string; sellerName: string; pricePaise: number }[] }>(`/products?limit=60&inStock=true${find ? `&q=${encodeURIComponent(find)}` : ''}`), enabled: !!form });
  const save = async () => {
    if (!form) return;
    const body = { name: form.name, description: form.description, discountBps: Math.round(Number(form.discount) * 100), startsAt: new Date(form.start).toISOString(), endsAt: new Date(form.end).toISOString(), listingIds: form.ids };
    if (await attempt(() => (form.id ? patch(`/admin/promotions/${form.id}`, body) : post('/admin/promotions', body)), form.id ? 'Deal updated' : 'Deal scheduled')) { setForm(null); query.refetch(); }
  };
  return (
    <Section title="Flash deals" description="Real start and end times; the storefront countdown follows them exactly. Sellers are notified when their product is included or the deal changes." actions={<Button onClick={() => setForm({ name: '', description: '', discount: '10', start: '', end: '', ids: [] })}><Plus size={15} />New deal</Button>}>
      <Loadable query={query}>{(d) => (
        <Table head={['Deal', 'Discount', 'Runs', 'Products', 'State', '']} empty={!d.promotions.length}>
          {d.promotions.map((p) => <tr key={p.id}><td className="font-semibold">{p.name}<span className="block text-xs text-muted font-normal">{p.description}</span></td><td>{pct(p.discountBps)}</td><td className="text-sm">{formatDateTime(p.startsAt)} – {formatDateTime(p.endsAt)}</td><td>{p.items}</td><td><StatusBadge status={p.state} /></td>
            <td><span className="flex flex-wrap gap-1">
              {p.state !== 'ENDED' && <Button size="sm" variant="ghost" onClick={() => setForm({ id: p.id, name: p.name, description: p.description, discount: String(p.discountBps / 100), start: localInput(p.startsAt), end: localInput(p.endsAt), ids: p.listings.map((l) => l.id) })}>Edit</Button>}
              {p.state !== 'ENDED' && <Button size="sm" variant="outline" onClick={async () => { if (await attempt(() => patch(`/admin/promotions/${p.id}`, { active: !p.active }), p.active ? 'Paused' : 'Resumed')) query.refetch(); }}>{p.active ? 'Pause' : 'Resume'}</Button>}
              {p.state !== 'LIVE' && <ConfirmButton variant="ghost" danger title={`Delete “${p.name}”?`} body="Past orders keep the price they paid." confirmLabel="Delete" onConfirm={async () => { if (await attempt(() => del(`/admin/promotions/${p.id}`), 'Deleted')) query.refetch(); }}><Trash2 size={14} /></ConfirmButton>}
            </span></td></tr>)}
        </Table>
      )}</Loadable>
      <Modal open={!!form} onOpenChange={(o) => !o && setForm(null)} title={form?.id ? 'Edit flash deal' : 'Schedule a flash deal'} wide>
        {form && <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field><Field label="Discount %"><Input inputMode="decimal" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} /></Field></div>
          <Field label="Description"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Starts"><Input type="datetime-local" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></Field><Field label="Ends"><Input type="datetime-local" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></Field></div>
          <fieldset>
            <legend className="label mb-2">Products ({form.ids.length} selected)</legend>
            <Input className="mb-2 min-h-[38px]" aria-label="Find products" placeholder="Find products…" value={find} onChange={(e) => setFind(e.target.value)} />
            <div className="max-h-60 overflow-y-auto grid gap-1">{products.data?.products.map((p) => <label key={p.listingId} className="flex items-center gap-2 text-sm"><input type="checkbox" className="checkbox mt-0" checked={form.ids.includes(p.listingId)} onChange={(e) => setForm({ ...form, ids: e.target.checked ? [...form.ids, p.listingId] : form.ids.filter((x) => x !== p.listingId) })} />{p.name} · {p.sellerName} · {formatMoney(p.pricePaise)}</label>)}</div>
          </fieldset>
          <Button onClick={save}>{form.id ? 'Save deal' : 'Schedule deal'}</Button>
        </div>}
      </Modal>
    </Section>
  );
}

// ───────────── Coupons ─────────────
type Coupon = { id: string; code: string; description: string; kind: string; value: number; maxDiscountPaise: number | null; minOrderPaise: number; mode: string; startsAt: string; endsAt: string; usageLimit: number | null; perUserLimit: number; used: number; active: boolean; public: boolean; state: string; orders: number; discountGivenPaise: number; revenuePaise: number; createdAt: string };
type CouponForm = Record<string, string | boolean> & { id?: string };
export function Coupons() {
  const list = useAdminTable<ListResponse & { coupons: Coupon[] }>('/admin/coupons', ['state', 'mode']);
  const [f, setF] = useState<CouponForm | null>(null);
  const save = async () => {
    if (!f) return;
    const body = { code: f.code, description: f.description, kind: f.kind, value: f.kind === 'PERCENT' ? Number(f.value) : rupeesToPaise(String(f.value)), maxDiscountPaise: f.max ? rupeesToPaise(String(f.max)) : null, minOrderPaise: rupeesToPaise(String(f.min || 0)), mode: f.mode, startsAt: new Date(String(f.start)).toISOString(), endsAt: new Date(String(f.end)).toISOString(), usageLimit: f.limit ? Number(f.limit) : null, perUserLimit: Number(f.perUser || 1), public: !!f.public };
    if (await attempt(() => (f.id ? patch(`/admin/coupons/${f.id}`, body) : post('/admin/coupons', body)), f.id ? 'Coupon updated' : 'Coupon created')) { setF(null); list.refetch(); }
  };
  const editForm = (c: Coupon): CouponForm => ({ id: c.id, code: c.code, description: c.description, kind: c.kind, value: c.kind === 'PERCENT' ? String(c.value) : String(c.value / 100), max: c.maxDiscountPaise ? String(c.maxDiscountPaise / 100) : '', min: String(c.minOrderPaise / 100), mode: c.mode, start: localInput(c.startsAt), end: localInput(c.endsAt), limit: c.usageLimit ? String(c.usageLimit) : '', perUser: String(c.perUserLimit), public: c.public, used: String(c.used) });
  const columns: Column<Coupon>[] = [
    { key: 'code', label: 'Code', sort: 'code', always: true, render: (c) => <><span className="font-mono font-bold">{c.code}</span>{c.public && <Badge tone="info" className="ml-2">Public</Badge>}<span className="block text-xs text-muted">{c.description}</span></> },
    { key: 'offer', label: 'Offer', render: (c) => <span className="text-sm">{c.kind === 'PERCENT' ? `${c.value}%` : formatMoney(c.value)} off{c.maxDiscountPaise ? ` up to ${formatMoney(c.maxDiscountPaise)}` : ''}{c.minOrderPaise ? ` · min ${formatMoney(c.minOrderPaise)}` : ''}<span className="block text-xs text-muted">{c.mode === 'ANY' ? 'All orders' : c.mode === 'RETAIL' ? 'Personal orders' : 'Business orders'}</span></span> },
    { key: 'valid', label: 'Valid', sort: 'ends', render: (c) => <span className="text-sm">{formatDate(c.startsAt)} – {formatDate(c.endsAt)}</span> },
    { key: 'used', label: 'Used', sort: 'used', className: 'text-right', render: (c) => <>{c.used}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</> },
    { key: 'orders', label: 'Paid orders', className: 'text-right', render: (c) => <Link href={`/admin/orders?coupon=${c.code}`} className="hover:underline">{c.orders}</Link> },
    { key: 'discount', label: 'Discount given', className: 'text-right', render: (c) => formatMoney(c.discountGivenPaise) },
    { key: 'revenue', label: 'Revenue', className: 'text-right', hidden: true, render: (c) => formatMoney(c.revenuePaise) },
    { key: 'state', label: 'State', render: (c) => <StatusBadge status={c.state} /> },
    { key: 'act', label: 'Action', always: true, render: (c) => <span className="flex gap-1">
      <Button size="sm" variant="ghost" onClick={() => setF(editForm(c))}>Edit</Button>
      {c.state !== 'ENDED' && <Button size="sm" variant="outline" onClick={async () => { if (await attempt(() => patch(`/admin/coupons/${c.id}`, { active: !c.active }), c.active ? 'Paused' : 'Activated')) list.refetch(); }}>{c.active ? 'Pause' : 'Activate'}</Button>}
      {!c.used && <ConfirmButton variant="ghost" danger title={`Delete ${c.code}?`} confirmLabel="Delete" onConfirm={async () => { if (await attempt(() => del(`/admin/coupons/${c.id}`), 'Deleted')) list.refetch(); }}><Trash2 size={14} /></ConfirmButton>}
    </span> },
  ];
  const used = f?.id && Number(f.used) > 0;
  return (
    <Section title="Coupons" description="Coupons are funded by IBazzzar: sellers are paid their full price. Every order always keeps at least ₹1 payable. Used coupons are kept for the records and can only be paused." actions={<Button onClick={() => setF({ kind: 'PERCENT', mode: 'ANY', perUser: '1', public: true })}><Plus size={15} />New coupon</Button>}>
      <DataTable tableId="coupons" query={list} rows={list.data?.coupons} columns={columns} search="Code or description" dateFilter="Created"
        filters={[{ key: 'state', label: 'State', options: [['ACTIVE', 'Active'], ['SCHEDULED', 'Scheduled'], ['PAUSED', 'Paused'], ['ENDED', 'Ended']] }, { key: 'mode', label: 'Applies to', options: [['ANY', 'All orders'], ['RETAIL', 'Personal'], ['BUSINESS', 'Business']] }]}
        bulk={{ endpoint: '/admin/coupons/bulk', actions: [{ id: 'activate', label: 'Activate' }, { id: 'pause', label: 'Pause' }, { id: 'delete', label: 'Delete unused', danger: true, confirm: 'Coupons that have been used are kept and skipped.' }] }} />
      <Modal open={!!f} onOpenChange={(o) => !o && setF(null)} title={f?.id ? `Edit ${f.code}` : 'New coupon'} wide>
        {f && <div className="grid gap-3 sm:grid-cols-2">
          {used && <div className="sm:col-span-2"><Alert tone="info">Used {String(f.used)} times, so the code can’t change. Other terms apply to future orders only.</Alert></div>}
          <Field label="Code"><Input className="uppercase" disabled={!!used} value={String(f.code ?? '')} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></Field>
          <Field label="Type"><Select value={String(f.kind)} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="PERCENT">Percentage</option><option value="FLAT">Flat amount</option></Select></Field>
          <Field label={f.kind === 'PERCENT' ? 'Percent off' : 'Amount off (₹)'}><Input inputMode="decimal" value={String(f.value ?? '')} onChange={(e) => setF({ ...f, value: e.target.value })} /></Field>
          <Field label="Max discount (₹, optional)"><Input inputMode="decimal" value={String(f.max ?? '')} onChange={(e) => setF({ ...f, max: e.target.value })} /></Field>
          <Field label="Minimum order (₹)"><Input inputMode="decimal" value={String(f.min ?? '')} onChange={(e) => setF({ ...f, min: e.target.value })} /></Field>
          <Field label="Applies to"><Select value={String(f.mode)} onChange={(e) => setF({ ...f, mode: e.target.value })}><option value="ANY">All orders</option><option value="RETAIL">Personal orders</option><option value="BUSINESS">Business orders</option></Select></Field>
          <Field label="Starts"><Input type="datetime-local" value={String(f.start ?? '')} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
          <Field label="Ends"><Input type="datetime-local" value={String(f.end ?? '')} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
          <Field label="Total uses (optional)"><Input inputMode="numeric" value={String(f.limit ?? '')} onChange={(e) => setF({ ...f, limit: e.target.value })} /></Field>
          <Field label="Uses per customer"><Input inputMode="numeric" value={String(f.perUser ?? '1')} onChange={(e) => setF({ ...f, perUser: e.target.value })} /></Field>
          <Field label="Description" className="sm:col-span-2"><Textarea rows={2} value={String(f.description ?? '')} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Checkbox checked={!!f.public} onChange={(e) => setF({ ...f, public: e.target.checked })} label="Show on the Deals page" /></div>
          <Button className="sm:col-span-2" onClick={save}>{f.id ? 'Save changes' : 'Create coupon'}</Button>
        </div>}
      </Modal>
    </Section>
  );
}


