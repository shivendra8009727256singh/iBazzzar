'use client';
import { Suspense, useState } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Truck, PackageCheck, MapPin, FileText, Banknote } from 'lucide-react';
import { api, post } from '@/lib/api';
import { formatDateTime, formatMoney, label, PAYMENT_TEXT } from '@/lib/format';
import { InvoiceView, type Invoice } from '@/components/invoice-view';
import { Alert, Badge, Button, ConfirmButton, Empty, Field, Input, Modal, PageHeader, Pagination, Select, Spinner, StatusBadge, Tabs, useFormErrors } from '@/components/ui';

type Parcel = {
  id: string; orderNumber: string; status: string; orderStatus: string; paymentMethod: string; paymentStatus: string; mode: string; createdAt: string;
  subtotalPaise: number; shippingPaise: number; taxPaise: number; totalPaise: number; collectOnDeliveryPaise: number; estimatedDeliveryAt: string | null; invoiceNumber: string | null;
  address: { name: string; phone: string; line1: string; line2?: string; city: string; state: string; pincode: string } | null; billingGstin: string | null;
  items: { id: string; name: string; variantLabel: string; sku: string; image: string | null; quantity: number; unitPaise: number; totalPaise: number }[];
  shipments: { id: string; provider: string; carrier: string; trackingRef: string; status: string; events: { status: string; location: string | null; at: string }[] }[];
};
const NEXT: Record<string, string[]> = { CREATED: ['PICKED_UP'], PICKED_UP: ['IN_TRANSIT', 'FAILED_DELIVERY'], IN_TRANSIT: ['OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED_DELIVERY'], OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED_DELIVERY'], FAILED_DELIVERY: ['OUT_FOR_DELIVERY'] };

function ShipDialog({ p, onDone }: { p: Parcel; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'SANDBOX' | 'MANUAL'>('SANDBOX');
  const [carrier, setCarrier] = useState('');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const errors = useFormErrors();
  const ship = async () => {
    setBusy(true); errors.clear();
    try { await post(`/seller/orders/${p.id}/ship`, { mode, ...(mode === 'MANUAL' ? { carrier, trackingRef: ref } : {}) }); toast.success('Shipped. Invoice issued.'); setOpen(false); onDone(); } catch (e) { errors.set(e); } finally { setBusy(false); }
  };
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Truck size={15} />Ship</Button>
      <Modal open={open} onOpenChange={setOpen} title={`Ship ${p.orderNumber}`} description="Shipping issues your GST invoice for this parcel.">
        <div className="grid gap-4">
          {errors.message && <Alert>{errors.message}</Alert>}
          <label className="flex items-start gap-3 rounded-xl border border-line p-3"><input type="radio" className="checkbox" checked={mode === 'SANDBOX'} onChange={() => setMode('SANDBOX')} /><span><span className="font-semibold">IBazzzar sandbox courier</span><span className="block text-sm text-muted">Test tracking number. No real pickup is booked — use until a courier partner is connected.</span></span></label>
          <label className="flex items-start gap-3 rounded-xl border border-line p-3"><input type="radio" className="checkbox" checked={mode === 'MANUAL'} onChange={() => setMode('MANUAL')} /><span><span className="font-semibold">My own courier</span><span className="block text-sm text-muted">Enter the courier and AWB you booked.</span></span></label>
          {mode === 'MANUAL' && <div className="grid grid-cols-2 gap-3"><Field label="Courier" error={errors.field('carrier')}><Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="e.g. Delhivery" /></Field><Field label="Tracking / AWB" error={errors.field('trackingRef')}><Input value={ref} onChange={(e) => setRef(e.target.value)} /></Field></div>}
          <Button loading={busy} onClick={ship}>Confirm shipment</Button>
        </div>
      </Modal>
    </>
  );
}

function TrackingUpdate({ shipment, onDone }: { shipment: Parcel['shipments'][number]; onDone: () => void }) {
  const options = NEXT[shipment.status] ?? [];
  const [status, setStatus] = useState(options[0] ?? '');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  if (!options.length) return null;
  const save = async () => {
    setBusy(true);
    try { await post(`/seller/shipments/${shipment.id}/events`, { status, ...(location ? { location } : {}) }); toast.success(`Marked ${label(status).toLowerCase()}`); setLocation(''); onDone(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-sm"><span className="sr-only">Next status</span><Select className="min-h-[38px] py-1 w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>{options.map((o) => <option key={o} value={o}>{label(o)}</option>)}</Select></label>
      <label className="text-sm"><span className="sr-only">Location</span><Input className="min-h-[38px] py-1 w-40" placeholder="Location (optional)" value={location} onChange={(e) => setLocation(e.target.value)} /></label>
      <Button size="sm" variant="outline" loading={busy} onClick={save}>Update tracking</Button>
    </div>
  );
}

function InvoiceButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({ queryKey: ['seller-invoice', id], queryFn: () => api<{ invoice: Invoice }>(`/seller/orders/${id}/invoice`), enabled: open });
  return (<><Button size="sm" variant="ghost" onClick={() => setOpen(true)}><FileText size={15} />Invoice</Button><Modal open={open} onOpenChange={setOpen} title="Tax invoice" wide>{data ? <InvoiceView invoice={data.invoice} /> : <Spinner />}</Modal></>);
}

function Orders() {
  const initial = useSearchParams().get('status') ?? 'PENDING';
  const [status, setStatus] = useState(initial);
  const [page, setPage] = useState(1);
  const { data, refetch } = useQuery({ queryKey: ['seller-orders', status, page], queryFn: () => api<{ orders: Parcel[]; page: number; pages: number; total: number }>(`/seller/orders?page=${page}${status ? `&status=${status}` : ''}`), placeholderData: keepPreviousData });
  return (
    <>
      <PageHeader title="Orders" description="Only paid (or cash-on-delivery) orders appear here. Pack, ship and keep tracking up to date." />
      <Tabs value={status} onChange={(s) => { setStatus(s); setPage(1); }} items={[{ value: 'PENDING', label: 'To pack' }, { value: 'PACKED', label: 'To ship' }, { value: 'SHIPPED', label: 'In transit' }, { value: 'DELIVERED', label: 'Delivered' }, { value: 'CANCELLED', label: 'Cancelled' }, { value: '', label: 'All' }]} />
      {!data ? <Spinner /> : data.orders.length ? (
        <div className="grid gap-4">
          {data.orders.map((p) => (
            <article key={p.id} className="card">
              <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 bg-cream border-b border-line">
                <div><p className="font-semibold">{p.orderNumber}</p><p className="text-xs text-muted">{formatDateTime(p.createdAt)}{p.estimatedDeliveryAt ? ` · promise by ${formatDateTime(p.estimatedDeliveryAt)}` : ''}</p></div>
                <div className="flex flex-wrap gap-2 items-center"><StatusBadge status={p.status} />{p.mode === 'BUSINESS' && <Badge tone="info">Business</Badge>}<Badge tone={p.paymentMethod === 'COD' ? 'gold' : 'neutral'}>{PAYMENT_TEXT[p.paymentStatus] ?? label(p.paymentStatus)}</Badge></div>
              </header>
              <div className="p-5 grid gap-4 md:grid-cols-[1.4fr_1fr]">
                <ul className="grid gap-3">{p.items.map((i) => <li key={i.id} className="flex gap-3"><span className="relative size-14 rounded-lg bg-cream shrink-0"><Image src={i.image ?? '/products/placeholder.svg'} alt="" fill sizes="56px" className="object-contain p-1" unoptimized /></span><span className="flex-1 text-sm"><span className="font-semibold block">{i.name}{i.variantLabel !== 'Standard' ? ` · ${i.variantLabel}` : ''}</span><span className="text-muted">SKU {i.sku} · Qty {i.quantity} × {formatMoney(i.unitPaise)}</span></span><span className="text-sm font-semibold">{formatMoney(i.totalPaise)}</span></li>)}</ul>
                <div className="text-sm grid gap-2 content-start">
                  {p.address && <p className="flex gap-2"><MapPin size={15} className="text-forest shrink-0 mt-0.5" /><span>{p.address.name}, {p.address.line1}{p.address.line2 ? `, ${p.address.line2}` : ''}, {p.address.city}, {p.address.state} {p.address.pincode} · {p.address.phone}</span></p>}
                  {p.billingGstin && <p className="text-muted">Buyer GSTIN {p.billingGstin}</p>}
                  {p.collectOnDeliveryPaise > 0 && <p className="flex items-center gap-2 font-semibold text-gold-ink"><Banknote size={15} />Collect {formatMoney(p.collectOnDeliveryPaise)} on delivery</p>}
                  <p>Parcel total {formatMoney(p.totalPaise)} <span className="text-muted">(incl. delivery {formatMoney(p.shippingPaise)}, GST {formatMoney(p.taxPaise)})</span></p>
                </div>
              </div>
              {p.shipments.map((s) => (
                <div key={s.id} className="px-5 pb-4 text-sm">
                  <p className="flex flex-wrap items-center gap-2"><PackageCheck size={15} className="text-forest" /><strong>{s.carrier}</strong> · {s.trackingRef} <StatusBadge status={s.status} />{s.provider === 'SANDBOX' && <Badge tone="gold">Sandbox</Badge>}</p>
                  <div className="mt-2"><TrackingUpdate shipment={s} onDone={refetch} /></div>
                </div>
              ))}
              <footer className="flex flex-wrap gap-2 px-5 py-3 border-t border-line">
                {p.status === 'PENDING' && <Button size="sm" onClick={async () => { try { await post(`/seller/orders/${p.id}/pack`); toast.success('Marked as packed'); refetch(); } catch (e) { toast.error((e as Error).message); } }}>Mark packed</Button>}
                {p.status === 'PACKED' && <ShipDialog p={p} onDone={refetch} />}
                {['PENDING', 'PACKED'].includes(p.status) && <ConfirmButton danger title="Cancel this parcel?" body="Stock is put back. A paid customer is refunded automatically." confirmLabel="Cancel parcel" reason={{ label: 'Reason shown to the customer' }} onConfirm={async (reason) => { await post(`/seller/orders/${p.id}/cancel`, { reason }); refetch(); }}>Cancel</ConfirmButton>}
                {p.invoiceNumber && <InvoiceButton id={p.id} />}
              </footer>
            </article>
          ))}
          <Pagination page={data.page} pages={data.pages} onChange={setPage} />
        </div>
      ) : <div className="card"><Empty title="Nothing here" body="New orders appear as soon as customers pay." /></div>}
    </>
  );
}

export default function SellerOrdersPage() {
  return <Suspense><Orders /></Suspense>;
}
