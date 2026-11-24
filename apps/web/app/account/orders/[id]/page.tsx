'use client';
import { use, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, FileText, Store, Truck, Star, RotateCcw, Landmark, CircleDot } from 'lucide-react';
import { api, post } from '@/lib/api';
import type { Order, Parcel, PaymentInfo } from '@/lib/types';
import { formatDate, formatDateTime, formatMoney, label, ORDER_STATUS_TEXT, PAYMENT_TEXT } from '@/lib/format';
import { ParcelProgress } from '@/components/order-bits';
import { BuyAgainButton } from '@/components/buy-again';
import { payDemo, payOnline } from '@/components/pay';
import { Alert, Badge, Button, ConfirmButton, Field, Modal, Spinner, StatusBadge, Textarea, useFormErrors } from '@/components/ui';

type Detail = { order: Order; payment: PaymentInfo; bankTransfer: { accountName: string; accountNumber: string; ifsc: string; bankName: string; note: string } | null; returnWindowDays: number };

function ReviewDialog({ productId, name, onDone }: { productId: string; name: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const errors = useFormErrors();
  const submit = async () => {
    setBusy(true); errors.clear();
    try { await post(`/products/${productId}/reviews`, { rating, title, body }); toast.success('Thanks! Your review is live.'); setOpen(false); onDone(); } catch (e) { errors.set(e); } finally { setBusy(false); }
  };
  return (
    <>
      <button onClick={() => setOpen(true)} className="link text-sm inline-flex items-center gap-1"><Star size={14} />Write a review</button>
      <Modal open={open} onOpenChange={setOpen} title="Review your purchase" description={name}>
        <div className="grid gap-4">
          {errors.message && <Alert>{errors.message}</Alert>}
          <div role="radiogroup" aria-label="Rating" className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => <button key={n} role="radio" aria-checked={rating === n} aria-label={`${n} stars`} onClick={() => setRating(n)}><Star size={30} className={n <= rating ? 'fill-gold text-gold' : 'text-line-strong'} /></button>)}
          </div>
          <Field label="Headline" error={errors.field('title')}><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Your review" error={errors.field('body')}><Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
          <Button loading={busy} onClick={submit}>Publish review</Button>
        </div>
      </Modal>
    </>
  );
}

function ReturnDialog({ order, parcel, onDone }: { order: Order; parcel: Parcel; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [chosen, setChosen] = useState<Record<string, number>>(Object.fromEntries(parcel.items.map((i) => [i.id, i.quantity])));
  const [busy, setBusy] = useState(false);
  const errors = useFormErrors();
  const submit = async () => {
    setBusy(true); errors.clear();
    try {
      const items = Object.entries(chosen).filter(([, q]) => q > 0).map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
      await post(`/orders/${order.id}/returns`, { parcelId: parcel.id, reason, items });
      toast.success('Return requested. The seller will respond soon.'); setOpen(false); onDone();
    } catch (e) { errors.set(e); } finally { setBusy(false); }
  };
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}><RotateCcw size={15} />Return items</Button>
      <Modal open={open} onOpenChange={setOpen} title="Request a return" description={`From ${parcel.sellerName}`}>
        <div className="grid gap-4">
          {errors.message && <Alert>{errors.message}</Alert>}
          <div className="grid gap-2">
            {parcel.items.map((i) => (
              <label key={i.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                <span className="flex-1 text-sm font-medium">{i.name}{i.variantLabel !== 'Standard' ? ` · ${i.variantLabel}` : ''}</span>
                <select aria-label={`Quantity of ${i.name} to return`} className="input w-20 min-h-[38px] py-1" value={chosen[i.id]} onChange={(e) => setChosen({ ...chosen, [i.id]: Number(e.target.value) })}>
                  {Array.from({ length: i.quantity + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            ))}
          </div>
          <Field label="What went wrong?" error={errors.field('reason')} hint="This helps the seller resolve it quickly"><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <Button loading={busy} onClick={submit}>Submit return request</Button>
        </div>
      </Modal>
    </>
  );
}

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const placed = useSearchParams().get('placed');
  const qc = useQueryClient();
  const { data, error, refetch } = useQuery({ queryKey: ['order', id], queryFn: () => api<Detail>(`/orders/${id}`) });
  const [paying, setPaying] = useState(false);
  if (error) return <Alert>{(error as Error).message}</Alert>;
  if (!data) return <Spinner />;
  const { order: o, payment } = data;
  const reload = () => { refetch(); qc.invalidateQueries({ queryKey: ['orders'] }); };
  const pay = async () => {
    setPaying(true);
    try { if (payment.provider === 'razorpay') await payOnline(o.id); else await payDemo(o.id); toast.success('Payment received'); reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Payment failed'); } finally { setPaying(false); }
  };
  // Any order can be cancelled until a parcel ships; money paid online is refunded automatically.
  const cancellable = o.status !== 'CANCELLED' && o.parcels.every((p) => ['PENDING', 'PACKED', 'CANCELLED'].includes(p.status));
  const paidOnline = ['PAID', 'DEMO_SIMULATED', 'PARTIALLY_REFUNDED'].includes(o.paymentStatus);

  return (
    <div className="grid gap-5">
      {placed && <Alert tone="success" title="Thank you — your order is placed">We’ve sent the details to your email and notifications.</Alert>}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/account/orders" className="link text-sm">← All orders</Link>
          <h1 className="text-3xl mt-2">Order {o.number}</h1>
          <p className="text-muted mt-1">Placed {formatDateTime(o.createdAt)} · {o.itemCount} item{o.itemCount === 1 ? '' : 's'}</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <StatusBadge status={o.status} text={ORDER_STATUS_TEXT[o.status]} />
          <StatusBadge status={o.paymentStatus} text={PAYMENT_TEXT[o.paymentStatus]} />
          {o.demo && <Badge tone="gold">Demo order — no money moved</Badge>}
        </div>
      </div>

      {payment.required && o.paymentMethod === 'ONLINE' && (
        <div className="card card-pad flex flex-wrap items-center justify-between gap-4 border-warning/40 bg-warning-bg/40">
          <div><p className="font-semibold">Payment pending</p><p className="text-sm text-muted">Items are held until {formatDateTime(o.paymentDueAt)}. After that the order is cancelled and stock released.</p></div>
          {payment.provider ? <Button loading={paying} onClick={pay}>{payment.provider === 'demo' ? 'Simulate payment (demo)' : `Pay ${formatMoney(o.totalPaise)}`}</Button> : <p className="text-sm text-danger">Online payment is temporarily unavailable.</p>}
        </div>
      )}
      {data.bankTransfer && (
        <div className="card card-pad">
          <p className="font-semibold flex items-center gap-2"><Landmark size={18} className="text-forest" />Pay by bank transfer</p>
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 mt-3 text-[15px]">
            <div className="flex justify-between sm:block"><dt className="text-muted text-sm">Amount</dt><dd className="font-bold">{formatMoney(o.totalPaise)}</dd></div>
            <div className="flex justify-between sm:block"><dt className="text-muted text-sm">Reference (write this in remarks)</dt><dd className="font-bold">{o.number}</dd></div>
            <div className="flex justify-between sm:block"><dt className="text-muted text-sm">Account name</dt><dd>{data.bankTransfer.accountName || 'Shared by IBazzzar finance'}</dd></div>
            <div className="flex justify-between sm:block"><dt className="text-muted text-sm">Account number · IFSC</dt><dd>{data.bankTransfer.accountNumber ? `${data.bankTransfer.accountNumber} · ${data.bankTransfer.ifsc}` : 'Not yet configured'}</dd></div>
          </dl>
          <p className="text-sm text-muted mt-3">{data.bankTransfer.note} Stock is held until {formatDate(o.paymentDueAt)}.</p>
        </div>
      )}

      {o.parcels.map((p, idx) => {
        const ret = o.returns.find((r) => r.parcelId === p.id);
        const shipment = p.shipments[0];
        return (
          <section key={p.id} className="card overflow-hidden" aria-label={`Parcel ${idx + 1}`}>
            <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 bg-cream border-b border-line">
              <div>
                <p className="font-semibold flex items-center gap-2"><Store size={16} className="text-forest" />Parcel {idx + 1} · <Link href={`/sellers/${p.sellerSlug}`} className="hover:underline">{p.sellerName}</Link></p>
                {p.estimatedDeliveryAt && !['DELIVERED', 'CANCELLED'].includes(p.status) && <p className="text-sm text-muted">Estimated by {formatDate(p.estimatedDeliveryAt, { weekday: 'short', day: 'numeric', month: 'short' })}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {p.invoiceNumber && <Link href={`/account/orders/${o.id}/invoice/${p.id}`} className="btn btn-outline btn-sm"><FileText size={15} />Invoice {p.invoiceNumber}</Link>}
                {p.status === 'DELIVERED' && !ret && <ReturnDialog order={o} parcel={p} onDone={reload} />}
              </div>
            </header>
            <div className="p-5 grid gap-5">
              {o.status !== 'AWAITING_PAYMENT' && <ParcelProgress status={p.status} />}
              {ret && <Alert tone="info" title={`Return ${label(ret.status).toLowerCase()}`}>{ret.reason}{ret.note ? ` — Seller: ${ret.note}` : ''} · Refund {formatMoney(ret.refundPaise)}</Alert>}
              {shipment && (
                <div className="rounded-xl border border-line p-4">
                  <p className="font-semibold flex items-center gap-2 text-[15px]"><Truck size={16} className="text-forest" />{shipment.carrier} · {shipment.trackingRef}{shipment.provider === 'SANDBOX' && <Badge tone="gold">Sandbox tracking</Badge>}</p>
                  <ol className="mt-3 grid gap-2.5 border-l-2 border-mint pl-4">
                    {[...shipment.events].reverse().map((e, i) => (
                      <li key={i} className="relative text-sm"><CircleDot size={14} className={`absolute -left-[23px] top-0.5 bg-white ${i === 0 ? 'text-forest' : 'text-line-strong'}`} /><span className="font-semibold">{label(e.status)}</span>{e.location && ` · ${e.location}`}<span className="block text-muted text-[13px]">{formatDateTime(e.at)}{e.note ? ` — ${e.note}` : ''}</span></li>
                    ))}
                  </ol>
                </div>
              )}
              <ul className="divide-y divide-line">
                {p.items.map((i) => (
                  <li key={i.id} className="flex gap-4 py-3 first:pt-0 last:pb-0">
                    <span className="relative size-16 shrink-0 rounded-xl bg-cream"><Image src={i.image ?? '/products/placeholder.svg'} alt="" fill sizes="64px" className="object-contain p-1.5" unoptimized /></span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold">{i.name}</p>
                      <p className="text-sm text-muted">{i.variantLabel !== 'Standard' ? `${i.variantLabel} · ` : ''}Qty {i.quantity} × {formatMoney(i.unitPaise)}</p>
                      {p.status === 'DELIVERED' && i.catalogProductId && <ReviewDialog productId={i.catalogProductId} name={i.name} onDone={reload} />}
                    </div>
                    <p className="font-semibold">{formatMoney(i.totalPaise)}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        );
      })}

      <div className="grid gap-5 md:grid-cols-2">
        <section className="card card-pad">
          <h2 className="text-lg mb-3">Payment summary</h2>
          <dl className="grid gap-1.5 text-[15px]">
            <div className="flex justify-between"><dt className="text-muted">Items</dt><dd>{formatMoney(o.subtotalPaise)}</dd></div>
            {!!o.discountPaise && <div className="flex justify-between text-success"><dt>Discount{o.couponCode ? ` (${o.couponCode})` : ''}</dt><dd>−{formatMoney(o.discountPaise)}</dd></div>}
            <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd>{o.shippingPaise ? formatMoney(o.shippingPaise) : 'Free'}</dd></div>
            {!!o.codFeePaise && <div className="flex justify-between"><dt className="text-muted">COD fee</dt><dd>{formatMoney(o.codFeePaise)}</dd></div>}
            <div className="flex justify-between border-t border-line pt-2 mt-1 font-bold text-lg"><dt>Total</dt><dd>{formatMoney(o.totalPaise)}</dd></div>
            <div className="flex justify-between text-sm text-muted"><dt>Includes GST</dt><dd>{formatMoney(o.taxPaise)}</dd></div>
            <div className="flex justify-between text-sm text-muted"><dt>Payment</dt><dd>{label(o.paymentMethod)}{o.paymentRef ? ` · ${o.paymentRef}` : ''}</dd></div>
          </dl>
          {o.refunds.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <p className="font-semibold text-sm mb-2">Refunds</p>
              {o.refunds.map((r) => <p key={r.id} className="text-sm flex justify-between"><span>{formatMoney(r.amountPaise)} · {r.reason}</span><StatusBadge status={r.status} text={r.status === 'PENDING_PROVIDER' ? 'Processing' : undefined} /></p>)}
            </div>
          )}
        </section>
        <section className="card card-pad">
          <h2 className="text-lg mb-3">Delivery address</h2>
          {o.address && <p className="text-[15px]"><strong>{o.address.name}</strong><br />{o.address.line1}{o.address.line2 ? `, ${o.address.line2}` : ''}<br />{o.address.city}, {o.address.state} {o.address.pincode}<br />{o.address.phone}</p>}
          {o.billingGstin && <p className="text-sm text-muted mt-2">GSTIN on invoice: {o.billingGstin}</p>}
          <div className="flex flex-wrap gap-2 mt-4">
            <Link href={`/account/support?order=${o.id}`} className="btn btn-outline btn-sm">Get help with this order</Link>
            {cancellable && <ConfirmButton danger title="Cancel this order?" body={paidOnline ? `The full amount you paid (${formatMoney(o.totalPaise)}) is refunded to your original payment method. Banks usually take 5–7 working days.` : 'The items go back on sale. This can’t be undone.'} reason={{ label: 'Why are you cancelling? (optional)', min: 0 }} confirmLabel="Cancel order" onConfirm={async (reason) => { await post(`/orders/${o.id}/cancel`, reason ? { reason } : {}); toast.success(paidOnline ? 'Order cancelled. Your refund has started.' : 'Order cancelled'); reload(); }}>Cancel order</ConfirmButton>}
            <BuyAgainButton order={o} />
          </div>
        </section>
      </div>

      <section className="card card-pad">
        <h2 className="text-lg mb-3">Order history</h2>
        <ol className="grid gap-2">
          {o.history.map((h, i) => <li key={i} className="flex gap-3 text-sm"><CheckCircle2 size={16} className="text-forest shrink-0 mt-0.5" /><span><strong>{label(h.status)}</strong>{h.note ? ` — ${h.note}` : ''}<span className="block text-muted">{formatDateTime(h.at)}</span></span></li>)}
        </ol>
        <p className="text-xs text-muted mt-4">Returns are accepted within {data.returnWindowDays} days of delivery for returnable items.</p>
      </section>
    </div>
  );
}
