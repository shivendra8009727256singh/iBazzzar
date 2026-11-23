'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, patch, post } from '@/lib/api';
import type { Order } from '@/lib/types';
import { formatDate, formatDateTime, formatMoney, label, PAYMENT_TEXT, rupeesToPaise, pct } from '@/lib/format';
import { Alert, Badge, Button, ConfirmButton, Field, Input, Modal, Select, StatusBadge, Textarea, Checkbox } from '../ui';
import { Loadable, Pager, SearchInput, Section, Table, useAdminList } from './kit';

// ───────────── Orders ─────────────
type OrderRow = { id: string; number: string; createdAt: string; status: string; paymentStatus: string; paymentMethod: string; mode: string; totalPaise: number; items: number; couponCode: string | null; customer: string; email: string; parcels: { seller: string; status: string }[]; demo: boolean };
export function Orders({ canManage, canFinance }: { canManage: boolean; canFinance: boolean }) {
  const params = useSearchParams();
  const [status, setStatus] = useState('');
  const [payment, setPayment] = useState('');
  const list = useAdminList<{ orders: OrderRow[]; page: number; pages: number; total: number }>('/admin/orders', 'orders', { status, payment });
  const [open, setOpen] = useState<string | null>(params.get('open'));
  return (
    <Section title="Orders" description="Every order and its seller parcels." actions={<>
      <Select aria-label="Status" className="min-h-[40px] py-1 w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{['AWAITING_PAYMENT', 'CONFIRMED', 'PARTIALLY_SHIPPED', 'SHIPPED', 'DELIVERED', 'CANCELLED'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select>
      <Select aria-label="Payment" className="min-h-[40px] py-1 w-auto" value={payment} onChange={(e) => setPayment(e.target.value)}><option value="">All payments</option>{Object.entries(PAYMENT_TEXT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
      <SearchInput value={list.q} onChange={list.setQ} placeholder="Order number or customer" /></>}>
      <Loadable query={list}>{(d) => (
        <>
          <Table head={['Order', 'Customer', 'Parcels', 'Payment', 'Status', 'Total', '']} empty={!d.orders.length}>
            {d.orders.map((o) => <tr key={o.id}><td className="font-semibold">{o.number}<span className="block text-xs text-muted font-normal">{formatDateTime(o.createdAt)}{o.mode === 'BUSINESS' ? ' · business' : ''}</span></td><td>{o.customer}<span className="block text-xs text-muted">{o.email}</span></td><td className="text-sm">{o.parcels.map((p) => `${p.seller}: ${label(p.status).toLowerCase()}`).join('; ')}</td><td><StatusBadge status={o.paymentStatus} text={PAYMENT_TEXT[o.paymentStatus]} />{o.demo && <Badge tone="gold" className="ml-1">Demo</Badge>}</td><td><StatusBadge status={o.status} /></td><td className="font-semibold">{formatMoney(o.totalPaise)}</td><td><Button size="sm" variant="outline" onClick={() => setOpen(o.id)}>Open</Button></td></tr>)}
          </Table>
          <Pager data={d} setPage={list.setPage} />
        </>
      )}</Loadable>
      {open && <OrderPanel id={open} canManage={canManage} canFinance={canFinance} onClose={() => { setOpen(null); list.refetch(); }} />}
    </Section>
  );
}

function OrderPanel({ id, canManage, canFinance, onClose }: { id: string; canManage: boolean; canFinance: boolean; onClose: () => void }) {
  const { data, refetch } = useQuery({ queryKey: ['admin', 'order', id], queryFn: () => api<{ order: Order; customer: { name: string; email: string; phone: string }; payments: { providerOrderId: string; status: string; amountPaise: number; transactions: { id: string; status: string; method: string | null; source: string }[] }[]; tickets: { id: string; number: string; subject: string; status: string }[] }>(`/admin/orders/${id}`) });
  const [utr, setUtr] = useState('');
  const o = data?.order;
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title={o ? `Order ${o.number}` : 'Loading…'} description={data ? `${data.customer.name} · ${data.customer.email} · ${data.customer.phone ?? ''}` : undefined} wide>
      {o && (
        <div className="grid gap-4 text-[14.5px]">
          <div className="flex flex-wrap gap-2"><StatusBadge status={o.status} /><StatusBadge status={o.paymentStatus} text={PAYMENT_TEXT[o.paymentStatus]} /><Badge tone="neutral">{label(o.paymentMethod)}</Badge>{o.demo && <Badge tone="gold">Demo</Badge>}</div>
          {o.parcels.map((p) => <div key={p.id} className="rounded-xl border border-line p-3"><p className="font-semibold">{p.sellerName} · {label(p.status)}{p.invoiceNumber ? ` · ${p.invoiceNumber}` : ''}</p><ul className="text-sm mt-1">{p.items.map((i) => <li key={i.id}>{i.name} × {i.quantity} · {formatMoney(i.totalPaise)}</li>)}</ul>{p.shipments.map((s) => <p key={s.id} className="text-sm text-muted mt-1">{s.carrier} {s.trackingRef} · {label(s.status)}</p>)}</div>)}
          <p>Total {formatMoney(o.totalPaise)} (GST {formatMoney(o.taxPaise)}, delivery {formatMoney(o.shippingPaise)}{o.discountPaise ? `, discount ${formatMoney(o.discountPaise)}` : ''}) · Ship to {o.address?.city}, {o.address?.state} {o.address?.pincode}</p>
          {data.payments.length > 0 && <div><p className="label">Payment attempts</p>{data.payments.map((p) => <p key={p.providerOrderId} className="text-sm">{p.providerOrderId} · {label(p.status)} · {formatMoney(p.amountPaise)} {p.transactions.map((t) => `· ${t.id} (${t.source.toLowerCase()})`).join(' ')}</p>)}</div>}
          {data.tickets.length > 0 && <p className="text-sm">Support: {data.tickets.map((t) => `${t.number} ${t.subject} (${label(t.status)})`).join(', ')}</p>}
          <ol className="text-sm grid gap-1 border-t border-line pt-3">{o.history.map((h, i) => <li key={i}>{label(h.status)}{h.note ? ` — ${h.note}` : ''} <span className="text-muted">{formatDateTime(h.at)}</span></li>)}</ol>
          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            {canManage && o.status === 'AWAITING_PAYMENT' && <ConfirmButton danger title="Cancel this unpaid order?" reason={{ label: 'Reason (sent to the customer)' }} confirmLabel="Cancel order" onConfirm={async (reason) => { await post(`/admin/orders/${id}/cancel`, { reason }); refetch(); }}>Cancel order</ConfirmButton>}
            {canFinance && o.paymentStatus === 'BANK_TRANSFER_PENDING' && o.status === 'AWAITING_PAYMENT' && (
              <div className="flex gap-2 items-end"><Field label="Bank UTR / reference"><Input value={utr} onChange={(e) => setUtr(e.target.value.toUpperCase())} /></Field><Button onClick={async () => { try { await post(`/admin/orders/${id}/bank-transfer`, { utr }); toast.success('Payment confirmed'); refetch(); } catch (e) { toast.error((e as Error).message); } }}>Confirm transfer received</Button></div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

export function B2B() {
  const query = useQuery({ queryKey: ['admin', 'b2b'], queryFn: () => api<{ rfqs: { id: string; number: string; title: string; status: string; organization: string; items: number; sellers: number; createdAt: string }[]; quotations: { id: string; status: string; seller: string; rfq: string; title: string; revision: number; totalPaise: number | null; updatedAt: string }[]; purchaseOrders: { id: string; number: string; status: string; organization: string; seller: string; totalPaise: number; paymentTerms: string; createdAt: string }[] }>('/admin/b2b') });
  return (
    <Section title="B2B: RFQs, quotations and POs" description="Read-only view of business procurement across the marketplace.">
      <Loadable query={query}>{(d) => (
        <div className="grid gap-6">
          <section><h2 className="text-lg mb-2">Purchase orders</h2><Table head={['PO', 'Buyer', 'Seller', 'Terms', 'Status', 'Total']} empty={!d.purchaseOrders.length}>{d.purchaseOrders.map((p) => <tr key={p.id}><td>{p.number}<span className="block text-xs text-muted">{formatDate(p.createdAt)}</span></td><td>{p.organization}</td><td>{p.seller}</td><td>{label(p.paymentTerms)}</td><td><StatusBadge status={p.status} /></td><td>{formatMoney(p.totalPaise)}</td></tr>)}</Table></section>
          <section><h2 className="text-lg mb-2">RFQs</h2><Table head={['RFQ', 'Buyer', 'Items', 'Sellers asked', 'Status']} empty={!d.rfqs.length}>{d.rfqs.map((r) => <tr key={r.id}><td>{r.title}<span className="block text-xs text-muted">{r.number} · {formatDate(r.createdAt)}</span></td><td>{r.organization}</td><td>{r.items}</td><td>{r.sellers}</td><td><StatusBadge status={r.status} /></td></tr>)}</Table></section>
          <section><h2 className="text-lg mb-2">Quotations</h2><Table head={['RFQ', 'Seller', 'Revision', 'Total', 'Status']} empty={!d.quotations.length}>{d.quotations.map((q) => <tr key={q.id}><td>{q.rfq} · {q.title}</td><td>{q.seller}</td><td>{q.revision}</td><td>{formatMoney(q.totalPaise)}</td><td><StatusBadge status={q.status} /></td></tr>)}</Table></section>
        </div>
      )}</Loadable>
    </Section>
  );
}

// ───────────── Payments & refunds ─────────────
export function Payments() {
  const query = useQuery({ queryKey: ['admin', 'payments'], queryFn: () => api<{ provider: string; webhook: string; totals: Record<string, { count: number; amountPaise: number }>; intents: { id: string; order: string; providerOrderId: string; status: string; amountPaise: number; createdAt: string; payments: string[] }[]; events: { id: string; type: string; outcome: string; receivedAt: string }[]; anomalies: { id: string; action: string; entityId: string; metadata: Record<string, unknown>; createdAt: string }[] }>('/admin/payments') });
  return (
    <Section title="Payments" description="Razorpay runs in test mode only until live payments are approved. Mismatched or late payments are flagged here, never applied automatically.">
      <Loadable query={query}>{(d) => (
        <div className="grid gap-6">
          <div className="flex flex-wrap gap-2"><Badge tone={d.provider.startsWith('Razorpay') ? 'success' : 'warning'}>Provider: {d.provider}</Badge><Badge tone={d.webhook === 'Configured' ? 'success' : 'warning'}>Webhook: {d.webhook}</Badge></div>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">{Object.entries(d.totals).map(([k, v]) => <div key={k} className="card p-4"><p className="text-sm text-muted">{PAYMENT_TEXT[k] ?? label(k)}</p><p className="font-bold text-lg">{formatMoney(v.amountPaise)}</p><p className="text-xs text-muted">{v.count} orders</p></div>)}</div>
          {d.anomalies.length > 0 && <Alert tone="warning" title={`${d.anomalies.length} payment anomalies need review`}><ul className="mt-1">{d.anomalies.map((a) => <li key={a.id}>{a.action === 'payment.mismatch' ? 'Amount mismatch' : 'Paid after cancellation — refund needed'} · order {a.entityId.slice(0, 8)} · {formatDateTime(a.createdAt)}</li>)}</ul></Alert>}
          <section><h2 className="text-lg mb-2">Payment attempts</h2><Table head={['Order', 'Provider order', 'Amount', 'Status', 'Payments']} empty={!d.intents.length}>{d.intents.map((i) => <tr key={i.id}><td>{i.order}<span className="block text-xs text-muted">{formatDateTime(i.createdAt)}</span></td><td className="font-mono text-xs">{i.providerOrderId}</td><td>{formatMoney(i.amountPaise)}</td><td><StatusBadge status={i.status} /></td><td className="font-mono text-xs">{i.payments.join(', ') || '—'}</td></tr>)}</Table></section>
          <section><h2 className="text-lg mb-2">Webhook events</h2><Table head={['Event', 'Type', 'Outcome', 'Received']} empty={!d.events.length}>{d.events.map((e) => <tr key={e.id}><td className="font-mono text-xs">{e.id}</td><td>{e.type}</td><td>{label(e.outcome)}</td><td>{formatDateTime(e.receivedAt)}</td></tr>)}</Table></section>
        </div>
      )}</Loadable>
    </Section>
  );
}

export function Refunds({ canManage }: { canManage: boolean }) {
  const [status, setStatus] = useState('PENDING_PROVIDER');
  const query = useQuery({ queryKey: ['admin', 'refunds', status], queryFn: () => api<{ refunds: { id: string; orderId: string; order: string; paymentRef: string | null; paymentMethod: string; seller: string; amountPaise: number; reason: string; status: string; providerRef: string | null; createdAt: string; processedAt: string | null }[]; providerRefundsAvailable: boolean }>(`/admin/refunds${status ? `?status=${status}` : ''}`) });
  const [manual, setManual] = useState<{ id: string; ref: string } | null>(null);
  const process = async (id: string, mode: 'PROVIDER' | 'MANUAL', reference?: string) => { try { await post(`/admin/refunds/${id}/process`, { mode, ...(reference ? { reference } : {}) }); toast.success('Refund processed'); setManual(null); query.refetch(); } catch (e) { toast.error((e as Error).message); } };
  return (
    <Section title="Refunds" description="Refunds are created automatically from approved returns and seller cancellations. Issue them through Razorpay, or record a bank transfer (needed for cash-on-delivery orders)." actions={<Select aria-label="Status" className="min-h-[40px] py-1 w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="PENDING_PROVIDER">To pay</option><option value="PROCESSED">Processed</option><option value="DEMO_SIMULATED">Demo</option><option value="">All</option></Select>}>
      <Loadable query={query}>{(d) => (
        <Table head={['Order', 'Seller', 'Reason', 'Amount', 'Status', '']} empty={!d.refunds.length}>
          {d.refunds.map((r) => <tr key={r.id}><td>{r.order}<span className="block text-xs text-muted">{label(r.paymentMethod)} · {formatDate(r.createdAt)}</span></td><td>{r.seller}</td><td className="text-sm">{r.reason}</td><td className="font-semibold">{formatMoney(r.amountPaise)}</td><td><StatusBadge status={r.status} />{r.providerRef && <span className="block text-xs font-mono text-muted">{r.providerRef}</span>}</td>
            <td>{canManage && r.status === 'PENDING_PROVIDER' && <div className="flex flex-wrap gap-2">{d.providerRefundsAvailable && r.paymentRef?.startsWith('pay_') && <ConfirmButton variant="primary" title="Refund through Razorpay?" body={`${formatMoney(r.amountPaise)} goes back to the customer’s original payment method.`} confirmLabel="Issue refund" onConfirm={() => process(r.id, 'PROVIDER')}>Refund via Razorpay</ConfirmButton>}<Button size="sm" variant="outline" onClick={() => setManual({ id: r.id, ref: '' })}>Record manual refund</Button></div>}</td></tr>)}
        </Table>
      )}</Loadable>
      <Modal open={!!manual} onOpenChange={(o) => !o && setManual(null)} title="Record a refund made outside IBazzzar" description="Enter the Razorpay refund ID or bank UTR. IBazzzar does not move money here.">
        {manual && <div className="grid gap-3"><Field label="Refund ID or UTR"><Input value={manual.ref} onChange={(e) => setManual({ ...manual, ref: e.target.value })} /></Field><Button onClick={() => process(manual.id, 'MANUAL', manual.ref)}>Record refund</Button></div>}
      </Modal>
    </Section>
  );
}

export function Finance({ canManage }: { canManage: boolean }) {
  const query = useQuery({ queryKey: ['admin', 'finance'], queryFn: () => api<{ balances: { storeId: string; seller: string; payoutAccount: { accountLast4: string; ifsc: string; verified: boolean } | null; salesPaise: number; shippingPaise: number; commissionPaise: number; refundsPaise: number; paidOutPaise: number; payablePaise: number; demoPaise: number }[]; ledger: { id: string; seller: string; kind: string; amountPaise: number; note: string | null; demo: boolean; createdAt: string }[]; payouts: { id: string; seller: string; amountPaise: number; providerRef: string; createdAt: string }[] }>('/admin/finance') });
  const [payout, setPayout] = useState<{ storeId: string; seller: string; max: number; amount: string; ref: string } | null>(null);
  const record = async () => { if (!payout) return; try { await post('/admin/payouts', { storeId: payout.storeId, amountPaise: rupeesToPaise(payout.amount), providerRef: payout.ref.trim() }); toast.success('Payout recorded'); setPayout(null); query.refetch(); } catch (e) { toast.error((e as Error).message); } };
  return (
    <Section title="Commissions & settlements" description="Seller balances from the append-only ledger. Record a payout only after the money has actually been sent; it can never exceed the payable balance.">
      <Loadable query={query}>{(d) => (
        <div className="grid gap-6">
          <Table head={['Seller', 'Sales + delivery', 'Commission', 'Refunds', 'Paid out', 'Payable', '']} empty={!d.balances.length}>
            {d.balances.map((b) => <tr key={b.storeId}><td className="font-semibold">{b.seller}<span className="block text-xs text-muted font-normal">{b.payoutAccount ? `••••${b.payoutAccount.accountLast4} ${b.payoutAccount.verified ? '· verified' : '· unverified'}` : 'No bank account'}{b.demoPaise ? ` · demo ${formatMoney(b.demoPaise)}` : ''}</span></td><td>{formatMoney(b.salesPaise + b.shippingPaise)}</td><td>{formatMoney(b.commissionPaise)}</td><td>{formatMoney(b.refundsPaise)}</td><td>{formatMoney(b.paidOutPaise)}</td><td className="font-bold">{formatMoney(b.payablePaise)}</td><td>{canManage && b.payablePaise >= 100 && <Button size="sm" variant="outline" disabled={!b.payoutAccount?.verified} onClick={() => setPayout({ storeId: b.storeId, seller: b.seller, max: b.payablePaise, amount: String(b.payablePaise / 100), ref: '' })}>Record payout</Button>}</td></tr>)}
          </Table>
          <section><h2 className="text-lg mb-2">Ledger</h2><Table head={['Date', 'Seller', 'Entry', 'Amount']} empty={!d.ledger.length}>{d.ledger.map((e) => <tr key={e.id}><td>{formatDate(e.createdAt)}</td><td>{e.seller}</td><td>{label(e.kind)}{e.demo && <Badge tone="gold" className="ml-1">Demo</Badge>}<span className="block text-xs text-muted">{e.note}</span></td><td className={e.amountPaise < 0 ? 'text-danger' : 'text-success'}>{formatMoney(e.amountPaise)}</td></tr>)}</Table></section>
        </div>
      )}</Loadable>
      <Modal open={!!payout} onOpenChange={(o) => !o && setPayout(null)} title={`Record payout to ${payout?.seller}`} description={payout ? `Payable balance ${formatMoney(payout.max)}` : undefined}>
        {payout && <div className="grid gap-3"><Field label="Amount (₹)"><Input inputMode="decimal" value={payout.amount} onChange={(e) => setPayout({ ...payout, amount: e.target.value })} /></Field><Field label="Razorpay payout ID or bank UTR" hint="pout_… or the 12–22 character UTR"><Input value={payout.ref} onChange={(e) => setPayout({ ...payout, ref: e.target.value.trim() })} /></Field><Button onClick={record}>Record payout</Button></div>}
      </Modal>
    </Section>
  );
}

// ───────────── Shipping & returns ─────────────
export function Shipping({ canManage }: { canManage: boolean }) {
  const query = useQuery({ queryKey: ['admin', 'shipping'], queryFn: () => api<{ provider: string; counts: Record<string, number>; awaitingDispatch: number; shipments: { id: string; provider: string; carrier: string; trackingRef: string; status: string; seller: string; order: string; pincode: string; lastEvent: { status: string; occurredAt: string } | null; updatedAt: string }[] }>('/admin/shipping') });
  const step = async (id: string, status: string) => { try { await post(`/admin/shipments/${id}/events`, { status }); query.refetch(); } catch (e) { toast.error((e as Error).message); } };
  const NEXT: Record<string, string> = { CREATED: 'PICKED_UP', PICKED_UP: 'IN_TRANSIT', IN_TRANSIT: 'OUT_FOR_DELIVERY', OUT_FOR_DELIVERY: 'DELIVERED' };
  return (
    <Section title="Shipping" description="Sandbox shipments can be advanced here to test the full flow. Seller-booked couriers are updated by the seller.">
      <Loadable query={query}>{(d) => (
        <div className="grid gap-5">
          <Alert tone="info">{d.provider}</Alert>
          <div className="flex flex-wrap gap-2"><Badge tone="warning">{d.awaitingDispatch} parcels awaiting dispatch</Badge>{Object.entries(d.counts).map(([k, v]) => <Badge key={k} tone="neutral">{label(k)}: {v}</Badge>)}</div>
          <Table head={['Shipment', 'Order', 'Seller', 'PIN', 'Status', '']} empty={!d.shipments.length}>
            {d.shipments.map((s) => <tr key={s.id}><td>{s.carrier}<span className="block text-xs font-mono text-muted">{s.trackingRef}</span></td><td>{s.order}</td><td>{s.seller}</td><td>{s.pincode}</td><td><StatusBadge status={s.status} /></td><td>{canManage && s.provider === 'SANDBOX' && NEXT[s.status] && <Button size="sm" variant="outline" onClick={() => step(s.id, NEXT[s.status])}>Mark {label(NEXT[s.status]).toLowerCase()}</Button>}</td></tr>)}
          </Table>
        </div>
      )}</Loadable>
    </Section>
  );
}

export function Returns() {
  const query = useQuery({ queryKey: ['admin', 'returns'], queryFn: () => api<{ returns: { id: string; order: string; customer: string; seller: string; status: string; reason: string; note: string | null; refundPaise: number; createdAt: string; items: { name: string; quantity: number }[] }[] }>('/admin/returns') });
  const act = async (url: string, body: object = {}) => { try { await post(url, body); toast.success('Saved'); query.refetch(); } catch (e) { toast.error((e as Error).message); } };
  return (
    <Section title="Returns" description="Step in when a seller doesn’t respond or a customer disputes a decision.">
      <Loadable query={query}>{(d) => (
        <Table head={['Return', 'Customer', 'Seller', 'Refund', 'Status', '']} empty={!d.returns.length}>
          {d.returns.map((r) => <tr key={r.id}><td>{r.items.map((i) => `${i.name} × ${i.quantity}`).join(', ')}<span className="block text-xs text-muted">{r.order} · {formatDate(r.createdAt)} · “{r.reason}”</span></td><td>{r.customer}</td><td>{r.seller}</td><td>{formatMoney(r.refundPaise)}</td><td><StatusBadge status={r.status} /></td>
            <td><div className="flex flex-wrap gap-2">{r.status === 'REQUESTED' && <><Button size="sm" onClick={() => act(`/admin/returns/${r.id}/decision`, { decision: 'APPROVED' })}>Approve</Button><ConfirmButton danger title="Decline return?" reason={{ label: 'Reason for the customer' }} confirmLabel="Decline" onConfirm={(note) => act(`/admin/returns/${r.id}/decision`, { decision: 'REJECTED', note })}>Decline</ConfirmButton></>}{r.status === 'APPROVED' && <ConfirmButton title="Mark received?" body="Stock is restored and the refund created." confirmLabel="Mark received" onConfirm={() => act(`/admin/returns/${r.id}/receive`)}>Mark received</ConfirmButton>}</div></td></tr>)}
        </Table>
      )}</Loadable>
    </Section>
  );
}

// ───────────── Promotions & coupons ─────────────
export function Promotions() {
  const query = useQuery({ queryKey: ['admin', 'promotions'], queryFn: () => api<{ promotions: { id: string; name: string; description: string; discountBps: number; startsAt: string; endsAt: string; state: string; active: boolean; items: number }[] }>('/admin/promotions') });
  const products = useQuery({ queryKey: ['admin', 'promo-products'], queryFn: () => api<{ products: { listingId: string; name: string; sellerName: string; pricePaise: number }[] }>('/products?limit=60&inStock=true') });
  const [form, setForm] = useState<{ name: string; description: string; discount: string; start: string; end: string; ids: string[] } | null>(null);
  const save = async () => {
    if (!form) return;
    try { await post('/admin/promotions', { name: form.name, description: form.description, discountBps: Math.round(Number(form.discount) * 100), startsAt: new Date(form.start).toISOString(), endsAt: new Date(form.end).toISOString(), listingIds: form.ids }); toast.success('Deal scheduled'); setForm(null); query.refetch(); } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <Section title="Flash deals" description="Real start and end times; the storefront countdown follows them exactly. Sellers are notified when their product is included." actions={<Button onClick={() => setForm({ name: '', description: '', discount: '10', start: '', end: '', ids: [] })}>New deal</Button>}>
      <Loadable query={query}>{(d) => (
        <Table head={['Deal', 'Discount', 'Runs', 'Products', 'State', '']} empty={!d.promotions.length}>
          {d.promotions.map((p) => <tr key={p.id}><td className="font-semibold">{p.name}<span className="block text-xs text-muted font-normal">{p.description}</span></td><td>{pct(p.discountBps)}</td><td className="text-sm">{formatDateTime(p.startsAt)} – {formatDateTime(p.endsAt)}</td><td>{p.items}</td><td><StatusBadge status={p.state} /></td><td>{p.state !== 'ENDED' && <Button size="sm" variant="outline" onClick={async () => { await patch(`/admin/promotions/${p.id}`, { active: !p.active }); query.refetch(); }}>{p.active ? 'Pause' : 'Resume'}</Button>}</td></tr>)}
        </Table>
      )}</Loadable>
      <Modal open={!!form} onOpenChange={(o) => !o && setForm(null)} title="Schedule a flash deal" wide>
        {form && <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field><Field label="Discount %"><Input inputMode="decimal" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} /></Field></div>
          <Field label="Description"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Starts"><Input type="datetime-local" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></Field><Field label="Ends"><Input type="datetime-local" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></Field></div>
          <fieldset><legend className="label mb-2">Products ({form.ids.length} selected)</legend><div className="max-h-60 overflow-y-auto grid gap-1">{products.data?.products.map((p) => <label key={p.listingId} className="flex items-center gap-2 text-sm"><input type="checkbox" className="checkbox mt-0" checked={form.ids.includes(p.listingId)} onChange={(e) => setForm({ ...form, ids: e.target.checked ? [...form.ids, p.listingId] : form.ids.filter((x) => x !== p.listingId) })} />{p.name} · {p.sellerName} · {formatMoney(p.pricePaise)}</label>)}</div></fieldset>
          <Button onClick={save}>Schedule deal</Button>
        </div>}
      </Modal>
    </Section>
  );
}

export function Coupons() {
  const query = useQuery({ queryKey: ['admin', 'coupons'], queryFn: () => api<{ coupons: { id: string; code: string; description: string; kind: string; value: number; maxDiscountPaise: number | null; minOrderPaise: number; mode: string; startsAt: string; endsAt: string; usageLimit: number | null; perUserLimit: number; used: number; active: boolean; public: boolean; state: string }[] }>('/admin/coupons') });
  const [f, setF] = useState<Record<string, string | boolean> | null>(null);
  const save = async () => {
    if (!f) return;
    try {
      await post('/admin/coupons', { code: f.code, description: f.description, kind: f.kind, value: f.kind === 'PERCENT' ? Number(f.value) : rupeesToPaise(String(f.value)), maxDiscountPaise: f.max ? rupeesToPaise(String(f.max)) : null, minOrderPaise: rupeesToPaise(String(f.min || 0)), mode: f.mode, startsAt: new Date(String(f.start)).toISOString(), endsAt: new Date(String(f.end)).toISOString(), usageLimit: f.limit ? Number(f.limit) : null, perUserLimit: Number(f.perUser || 1), public: !!f.public });
      toast.success('Coupon created'); setF(null); query.refetch();
    } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <Section title="Coupons" description="Coupons are funded by IBazzzar: sellers are paid their full price. Every order always keeps at least ₹1 payable." actions={<Button onClick={() => setF({ kind: 'PERCENT', mode: 'ANY', perUser: '1', public: true })}>New coupon</Button>}>
      <Loadable query={query}>{(d) => (
        <Table head={['Code', 'Offer', 'Valid', 'Used', 'State', '']} empty={!d.coupons.length}>
          {d.coupons.map((c) => <tr key={c.id}><td className="font-mono font-bold">{c.code}{c.public && <Badge tone="info" className="ml-2">Public</Badge>}</td><td className="text-sm">{c.kind === 'PERCENT' ? `${c.value}%` : formatMoney(c.value)} off{c.maxDiscountPaise ? ` up to ${formatMoney(c.maxDiscountPaise)}` : ''}{c.minOrderPaise ? ` · min ${formatMoney(c.minOrderPaise)}` : ''} · {label(c.mode)}<span className="block text-xs text-muted">{c.description}</span></td><td className="text-sm">{formatDate(c.startsAt)} – {formatDate(c.endsAt)}</td><td>{c.used}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</td><td><StatusBadge status={c.state} /></td><td>{c.state !== 'ENDED' && <Button size="sm" variant="outline" onClick={async () => { await patch(`/admin/coupons/${c.id}`, { active: !c.active }); query.refetch(); }}>{c.active ? 'Pause' : 'Activate'}</Button>}</td></tr>)}
        </Table>
      )}</Loadable>
      <Modal open={!!f} onOpenChange={(o) => !o && setF(null)} title="New coupon" wide>
        {f && <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Code"><Input className="uppercase" value={String(f.code ?? '')} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></Field>
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
          <Button className="sm:col-span-2" onClick={save}>Create coupon</Button>
        </div>}
      </Modal>
    </Section>
  );
}

/** Keeps the "open" param in sync so the dashboard can deep-link to an order. */
export function useSyncedOpen() {
  const params = useSearchParams();
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { setOpen(params.get('open')); }, [params]);
  return [open, setOpen] as const;
}
