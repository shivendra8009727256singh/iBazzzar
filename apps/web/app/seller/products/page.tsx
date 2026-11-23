'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Search, Pencil, PackagePlus, History } from 'lucide-react';
import { api, patch, post } from '@/lib/api';
import { formatDateTime, formatMoney, label, rupeesToPaise, cn } from '@/lib/format';
import { TierEditor } from '@/components/tier-editor';
import { Alert, Badge, Button, Empty, Field, Input, Modal, PageHeader, Select, Spinner, StatusBadge, Tabs, useFormErrors } from '@/components/ui';

type Listing = {
  id: string; sku: string; status: string; productStatus: string; ownsProduct: boolean; catalogProductId: string; slug: string; name: string; brand: string; variantLabel: string; image: string;
  pricePaise: number; mrpPaise: number; effectivePaise: number; promotion: { name: string } | null; moq: number; bulkPackUnits: number; wholesaleEnabled: boolean; codAllowed: boolean; returnable: boolean;
  tiers: { minQty: number; pricePaise: number }[]; stock: number; onHand: number; reserved: number; taxRateBps: number; moderationNote: string | null; demo: boolean;
};

function EditListing({ l, onSaved }: { l: Listing; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ price: String(l.pricePaise / 100), mrp: String(l.mrpPaise / 100), moq: String(l.moq), pack: String(l.bulkPackUnits), wholesale: l.wholesaleEnabled, cod: l.codAllowed, returnable: l.returnable, tiers: l.tiers.map((t) => ({ min: String(t.minQty), price: String(t.pricePaise / 100) })) });
  const [busy, setBusy] = useState(false);
  const errors = useFormErrors();
  const save = async () => {
    setBusy(true); errors.clear();
    try {
      await patch(`/seller/listings/${l.id}`, { pricePaise: rupeesToPaise(f.price), mrpPaise: rupeesToPaise(f.mrp), moq: Number(f.moq), bulkPackUnits: Number(f.pack), wholesaleEnabled: f.wholesale, codAllowed: f.cod, returnable: f.returnable, tiers: f.tiers.filter((t) => t.min && t.price).map((t) => ({ minQty: Number(t.min), pricePaise: rupeesToPaise(t.price) })) });
      toast.success('Listing updated'); setOpen(false); onSaved();
    } catch (e) { errors.set(e); } finally { setBusy(false); }
  };
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Pencil size={14} />Price & terms</Button>
      <Modal open={open} onOpenChange={setOpen} title="Price and terms" description={`${l.name} · ${l.variantLabel} · SKU ${l.sku}. Price changes go live immediately.`} wide>
        <div className="grid gap-4">
          {errors.message && <Alert>{errors.message}</Alert>}
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Selling price (₹)" error={errors.field('pricePaise')}><Input inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
            <Field label="MRP (₹)" error={errors.field('mrpPaise')}><Input inputMode="decimal" value={f.mrp} onChange={(e) => setF({ ...f, mrp: e.target.value })} /></Field>
            <Field label="Business MOQ" error={errors.field('moq')}><Input inputMode="numeric" value={f.moq} onChange={(e) => setF({ ...f, moq: e.target.value })} /></Field>
            <Field label="Pack size" error={errors.field('bulkPackUnits')}><Input inputMode="numeric" value={f.pack} onChange={(e) => setF({ ...f, pack: e.target.value })} /></Field>
          </div>
          <TierEditor tiers={f.tiers} onChange={(tiers) => setF({ ...f, tiers })} />
          <div className="flex flex-wrap gap-5 text-sm">
            {[['wholesale', 'Offer to business buyers'], ['cod', 'Allow cash on delivery'], ['returnable', 'Returnable']].map(([k, t]) => <label key={k} className="flex items-center gap-2"><input type="checkbox" className="checkbox mt-0" checked={f[k as 'cod']} onChange={(e) => setF({ ...f, [k]: e.target.checked })} />{t}</label>)}
          </div>
          <Button loading={busy} onClick={save}>Save</Button>
        </div>
      </Modal>
    </>
  );
}

function Stock({ l, onSaved }: { l: Listing; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('RECEIVED');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const errors = useFormErrors();
  const { data } = useQuery({ queryKey: ['movements', l.id], queryFn: () => api<{ movements: { id: string; delta: number; reason: string; reference: string | null; createdAt: string }[] }>(`/seller/listings/${l.id}/movements`), enabled: open });
  const save = async () => {
    setBusy(true); errors.clear();
    try { await post(`/seller/listings/${l.id}/stock`, { delta: Number(delta), reason, ...(note ? { note } : {}) }); toast.success('Stock updated'); setDelta(''); setNote(''); onSaved(); } catch (e) { errors.set(e); } finally { setBusy(false); }
  };
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><PackagePlus size={14} />Stock</Button>
      <Modal open={open} onOpenChange={setOpen} title="Adjust stock" description={`${l.onHand} on hand · ${l.reserved} held for unpaid orders · ${l.stock} available`}>
        <div className="grid gap-4">
          {errors.message && <Alert>{errors.message}</Alert>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Change (+/−)" error={errors.field('delta')} hint="e.g. 20 or -3"><Input inputMode="numeric" value={delta} onChange={(e) => setDelta(e.target.value.replace(/[^\d-]/g, ''))} /></Field>
            <Field label="Reason"><Select value={reason} onChange={(e) => setReason(e.target.value)}><option value="RECEIVED">Goods received</option><option value="ADJUSTMENT">Count adjustment</option><option value="CORRECTION">Correction</option></Select></Field>
          </div>
          <Field label="Note (optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <Button loading={busy} disabled={!delta || delta === '-'} onClick={save}>Update stock</Button>
          <div><p className="label flex items-center gap-1.5 mb-2"><History size={14} />Recent movements</p>
            <ul className="text-sm grid gap-1 max-h-48 overflow-y-auto">{data?.movements.map((m) => <li key={m.id} className="flex justify-between gap-3"><span className={m.delta > 0 ? 'text-success' : 'text-danger'}>{m.delta > 0 ? '+' : ''}{m.delta}</span><span className="flex-1 text-muted truncate">{label(m.reason)}{m.reference ? ` · ${m.reference}` : ''}</span><span className="text-muted">{formatDateTime(m.createdAt)}</span></li>)}</ul>
          </div>
        </div>
      </Modal>
    </>
  );
}

function Products() {
  const filter = useSearchParams().get('filter');
  const [tab, setTab] = useState(filter === 'low' ? 'LOW' : '');
  const [q, setQ] = useState('');
  const { data, refetch } = useQuery({ queryKey: ['seller-listings', q], queryFn: () => api<{ listings: Listing[]; lowStockThreshold: number }>(`/seller/products${q ? `?q=${encodeURIComponent(q)}` : ''}`) });
  if (!data) return <Spinner />;
  const rows = data.listings.filter((l) => (tab === 'LOW' ? l.status === 'APPROVED' && l.stock <= data.lowStockThreshold : !tab || l.status === tab));
  const count = (s: string) => data.listings.filter((l) => l.status === s).length;
  return (
    <>
      <PageHeader title="Products & stock" description="Price and stock changes go live at once. New products and content edits are reviewed first." actions={<Link href="/seller/products/new" className="btn btn-primary"><Plus size={16} />Add product</Link>} />
      <div className="relative max-w-sm mb-4"><Search size={16} className="absolute left-3 top-3.5 text-muted" /><label htmlFor="ps" className="sr-only">Search your products</label><input id="ps" className="input pl-9" placeholder="Search by name or SKU" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <Tabs value={tab} onChange={setTab} items={[{ value: '', label: 'All', count: data.listings.length }, { value: 'APPROVED', label: 'Live', count: count('APPROVED') }, { value: 'PENDING', label: 'In review', count: count('PENDING') }, { value: 'CHANGES_REQUESTED', label: 'Needs changes', count: count('CHANGES_REQUESTED') }, { value: 'PAUSED', label: 'Paused', count: count('PAUSED') }, { value: 'LOW', label: 'Low stock' }]} />
      {rows.length ? (
        <div className="grid gap-3">
          {rows.map((l) => (
            <article key={l.id} className="card p-4 flex flex-wrap gap-4 items-center">
              <span className="relative size-16 rounded-xl bg-cream shrink-0"><Image src={l.image} alt="" fill sizes="64px" className="object-contain p-1.5" unoptimized /></span>
              <div className="flex-1 min-w-[220px]">
                <p className="font-semibold">{l.name}{l.variantLabel !== 'Standard' && <span className="text-muted font-normal"> · {l.variantLabel}</span>}</p>
                <p className="text-xs text-muted">SKU {l.sku} · {l.brand}{!l.ownsProduct && ' · your offer on a shared product page'}</p>
                <div className="flex flex-wrap gap-1.5 mt-1.5"><StatusBadge status={l.status} />{l.productStatus !== 'APPROVED' && l.ownsProduct && <Badge tone="warning">Product page {label(l.productStatus).toLowerCase()}</Badge>}{l.promotion && <Badge tone="danger">In deal: {l.promotion.name}</Badge>}{l.demo && <Badge tone="gold">Demo</Badge>}</div>
                {l.moderationNote && <p className="text-sm text-warning mt-1.5">Reviewer: {l.moderationNote}</p>}
              </div>
              <div className="text-sm min-w-[120px]"><p className="price">{formatMoney(l.pricePaise)}</p><p className="mrp text-xs">{formatMoney(l.mrpPaise)}</p></div>
              <div className={cn('text-sm min-w-[110px]', l.stock <= data.lowStockThreshold && 'text-warning font-semibold')}><p>{l.stock} available</p><p className="text-xs text-muted">{l.reserved} held</p></div>
              <div className="flex flex-wrap gap-2">
                <EditListing l={l} onSaved={refetch} />
                <Stock l={l} onSaved={refetch} />
                {['APPROVED', 'PAUSED'].includes(l.status) && <Button size="sm" variant="ghost" onClick={async () => { await patch(`/seller/listings/${l.id}`, { paused: l.status === 'APPROVED' }); refetch(); }}>{l.status === 'APPROVED' ? 'Pause' : 'Resume'}</Button>}
                {l.ownsProduct && <Link href={`/seller/products/new?variantOf=${l.catalogProductId}`} className="btn btn-ghost btn-sm">Add variant</Link>}
                {l.status === 'APPROVED' && <Link href={`/products/${l.slug}`} className="btn btn-ghost btn-sm">View</Link>}
              </div>
            </article>
          ))}
        </div>
      ) : <div className="card"><Empty title="No products here" action={<Link href="/seller/products/new" className="btn btn-primary">Add your first product</Link>} /></div>}
    </>
  );
}

export default function SellerProductsPage() {
  return <Suspense><Products /></Suspense>;
}
