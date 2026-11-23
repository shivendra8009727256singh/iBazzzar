'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, Paperclip, Search } from 'lucide-react';
import { api, post, upload } from '@/lib/api';
import type { Product } from '@/lib/types';
import { Alert, Button, Field, Input, PageHeader, Textarea, useFormErrors } from '@/components/ui';

type Item = { catalogProductId?: string; description: string; quantity: number };

function ProductPicker({ onPick }: { onPick: (p: Product) => void }) {
  const [q, setQ] = useState('');
  const { data } = useQuery({ queryKey: ['rfq-pick', q], queryFn: () => api<{ products: Product[] }>(`/products?wholesale=true&limit=6&q=${encodeURIComponent(q)}`), enabled: q.trim().length >= 2 });
  return (
    <div className="relative">
      <label htmlFor="pick" className="sr-only">Find a catalogue product</label>
      <Search size={16} className="absolute left-3 top-3.5 text-muted" />
      <input id="pick" className="input pl-9" placeholder="Search the wholesale catalogue to add a product" value={q} onChange={(e) => setQ(e.target.value)} />
      {q.trim().length >= 2 && data && (
        <ul className="absolute z-20 left-0 right-0 mt-1 card p-1 max-h-72 overflow-y-auto">
          {data.products.length ? data.products.map((p) => <li key={p.catalogProductId}><button type="button" className="w-full text-left rounded-lg px-3 py-2 hover:bg-mint" onClick={() => { onPick(p); setQ(''); }}><span className="font-medium">{p.name}</span><span className="text-xs text-muted block">{p.brand} · MOQ {p.moq} · {p.offerCount ?? 1} seller(s)</span></button></li>)
            : <li className="px-3 py-2 text-sm text-muted">No wholesale products match. Describe the item below instead.</li>}
        </ul>
      )}
    </div>
  );
}

function NewRfq() {
  const router = useRouter();
  const productParam = useSearchParams().get('product');
  const [form, setForm] = useState({ title: '', deliveryPincode: '', neededBy: '', notes: '' });
  const [items, setItems] = useState<Item[]>([]);
  const [files, setFiles] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const errors = useFormErrors();
  const addProduct = (p: Product) => setItems((prev) => (prev.some((i) => i.catalogProductId === p.catalogProductId) ? prev : [...prev, { catalogProductId: p.catalogProductId, description: `${p.name} (${p.brand})`, quantity: Math.max(p.moq, 1) }]));
  useEffect(() => {
    if (!productParam) return;
    api<{ offer: Product }>(`/products/${productParam}`).then((r) => addProduct(r.offer)).catch(() => {});
  }, [productParam]);
  const attach = async (f: File | undefined) => {
    if (!f) return;
    try { const r = await upload<{ attachment: { id: string; name: string } }>('/business/attachments', f, { 'X-File-Name': f.name }); setFiles((x) => [...x, r.attachment]); } catch (e) { toast.error((e as Error).message); }
  };
  const submit = async () => {
    setBusy(true); errors.clear();
    try {
      const r = await post<{ rfq: { id: string; number: string; sellers: number } }>('/business/rfqs', {
        title: form.title, deliveryPincode: form.deliveryPincode, notes: form.notes, ...(form.neededBy ? { neededBy: new Date(`${form.neededBy}T12:00:00+05:30`).toISOString() } : {}),
        items, attachmentIds: files.map((f) => f.id),
      });
      toast.success(`Request ${r.rfq.number} sent to ${r.rfq.sellers} seller(s)`);
      router.push(`/business/rfqs/${r.rfq.id}`);
    } catch (e) { errors.set(e); setBusy(false); }
  };
  return (
    <>
      <PageHeader title="New request for quotation" description="We send it to every approved seller offering these products wholesale. Prices you receive are tax-inclusive." />
      <div className="card card-pad grid gap-5 max-w-3xl">
        {errors.message && <Alert>{errors.message}</Alert>}
        <Field label="Title" required error={errors.field('title')} hint="e.g. Notebooks for the Pune office"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Delivery PIN code" required error={errors.field('deliveryPincode')}><Input inputMode="numeric" maxLength={6} value={form.deliveryPincode} onChange={(e) => setForm({ ...form, deliveryPincode: e.target.value.replace(/\D/g, '') })} /></Field>
          <Field label="Needed by (optional)" error={errors.field('neededBy')}><Input type="date" min={new Date().toISOString().slice(0, 10)} value={form.neededBy} onChange={(e) => setForm({ ...form, neededBy: e.target.value })} /></Field>
        </div>
        <div className="grid gap-3">
          <p className="label">Items</p>
          <ProductPicker onPick={addProduct} />
          {items.map((it, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_120px_auto] items-end rounded-xl border border-line p-3">
              <Field label={`Item ${i + 1}`} error={errors.field(`items.${i}.description`)}><Input value={it.description} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} /></Field>
              <Field label="Quantity" error={errors.field(`items.${i}.quantity`)}><Input inputMode="numeric" value={it.quantity} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value.replace(/\D/g, '')) || 0 } : x)))} /></Field>
              <button type="button" className="btn btn-ghost btn-icon" aria-label={`Remove item ${i + 1}`} onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 size={16} /></button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => setItems([...items, { description: '', quantity: 1 }])}><Plus size={15} />Describe an item not in the catalogue</Button>
          {errors.field('items') && <p className="error-text">{errors.field('items')}</p>}
        </div>
        <Field label="Requirements and notes" required error={errors.field('notes')} hint="Specifications, packaging, delivery window, invoice needs"><Textarea rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        <div>
          <label className="btn btn-outline btn-sm cursor-pointer"><Paperclip size={15} />Attach drawing or spec (PDF/image, max 8 MB)<input type="file" className="sr-only" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => attach(e.target.files?.[0])} /></label>
          {files.length > 0 && <ul className="mt-2 text-sm grid gap-1">{files.map((f) => <li key={f.id} className="flex items-center gap-2"><Paperclip size={13} />{f.name}<button className="text-danger text-xs" onClick={() => setFiles(files.filter((x) => x.id !== f.id))}>Remove</button></li>)}</ul>}
        </div>
        <Button size="lg" loading={busy} onClick={submit} disabled={!items.length}>Send to sellers</Button>
      </div>
    </>
  );
}

export default function NewRfqPage() {
  return <Suspense><NewRfq /></Suspense>;
}
