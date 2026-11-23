'use client';
import { Suspense, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ImagePlus, X, Search, Loader2 } from 'lucide-react';
import { api, post, upload } from '@/lib/api';
import type { Category } from '@/lib/types';
import { cn, rupeesToPaise } from '@/lib/format';
import { Alert, Button, Field, Input, PageHeader, Select, Tabs, Textarea, useFormErrors } from '@/components/ui';
import { TierEditor } from '@/components/tier-editor';

type Mode = 'new' | 'offer' | 'variant';
type Pricing = { sku: string; price: string; mrp: string; stock: string; moq: string; pack: string; wholesale: boolean; cod: boolean; returnable: boolean; tiers: { min: string; price: string }[] };
const emptyPricing: Pricing = { sku: '', price: '', mrp: '', stock: '', moq: '1', pack: '1', wholesale: true, cod: true, returnable: true, tiers: [] };
const pricingPayload = (p: Pricing) => ({
  sku: p.sku, pricePaise: rupeesToPaise(p.price || 0), mrpPaise: rupeesToPaise(p.mrp || p.price || 0), stock: Number(p.stock || 0), moq: Number(p.moq || 1),
  bulkPackUnits: Number(p.pack || 1), wholesaleEnabled: p.wholesale, codAllowed: p.cod, returnable: p.returnable,
  tiers: p.tiers.filter((t) => t.min && t.price).map((t) => ({ minQty: Number(t.min), pricePaise: rupeesToPaise(t.price) })),
});

function PricingFields({ value: p, onChange, err }: { value: Pricing; onChange: (p: Pricing) => void; err: (k: string) => string | undefined }) {
  const set = (k: keyof Pricing) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...p, [k]: e.target.value });
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="SKU" required error={err('sku')} hint="Your own stock code"><Input value={p.sku} onChange={set('sku')} /></Field>
        <Field label="Selling price (₹, incl. GST)" required error={err('pricePaise')}><Input inputMode="decimal" value={p.price} onChange={set('price')} /></Field>
        <Field label="MRP (₹)" required error={err('mrpPaise')}><Input inputMode="decimal" value={p.mrp} onChange={set('mrp')} /></Field>
        <Field label="Opening stock" required error={err('stock')}><Input inputMode="numeric" value={p.stock} onChange={set('stock')} /></Field>
        <Field label="Business MOQ" error={err('moq')}><Input inputMode="numeric" value={p.moq} onChange={set('moq')} /></Field>
        <Field label="Sold in packs of" error={err('bulkPackUnits')}><Input inputMode="numeric" value={p.pack} onChange={set('pack')} /></Field>
      </div>
      <TierEditor tiers={p.tiers} onChange={(tiers) => onChange({ ...p, tiers })} />
      {err('tiers') && <p className="error-text">{err('tiers')}</p>}
      <div className="flex flex-wrap gap-5 text-sm">
        {([['wholesale', 'Offer to business buyers'], ['cod', 'Allow cash on delivery'], ['returnable', 'Returnable']] as const).map(([k, t]) => <label key={k} className="flex items-center gap-2"><input type="checkbox" className="checkbox mt-0" checked={p[k]} onChange={(e) => onChange({ ...p, [k]: e.target.checked })} />{t}</label>)}
      </div>
    </div>
  );
}

function Photos({ images, onChange }: { images: string[]; onChange: (i: string[]) => void }) {
  const [busy, setBusy] = useState(false);
  const add = async (files: FileList | null) => {
    if (!files) return;
    setBusy(true);
    const next = [...images];
    for (const f of [...files].slice(0, 8 - images.length)) {
      try { const r = await upload<{ media: { url: string } }>('/seller/media', f); next.push(r.media.url); } catch (e) { toast.error(`${f.name}: ${(e as Error).message}`); }
    }
    onChange(next); setBusy(false);
  };
  return (
    <div>
      <p className="label mb-2">Photos <span className="text-danger">*</span></p>
      <div className="flex flex-wrap gap-3">
        {images.map((url, i) => (
          <div key={url} className={cn('relative size-28 rounded-xl border bg-cream overflow-hidden', i === 0 ? 'border-gold ring-2 ring-gold/30' : 'border-line')}>
            <Image src={url} alt={`Photo ${i + 1}`} fill sizes="112px" className="object-contain p-1" unoptimized />
            {i === 0 && <span className="absolute bottom-1 left-1 badge badge-gold text-[10px]">Cover</span>}
            <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => onChange(images.filter((x) => x !== url))} className="absolute top-1 right-1 size-6 rounded-full bg-white shadow grid place-items-center"><X size={13} /></button>
          </div>
        ))}
        {images.length < 8 && (
          <label className="size-28 rounded-xl border-2 border-dashed border-line-strong grid place-items-center text-center text-xs text-muted cursor-pointer hover:border-forest">
            {busy ? <Loader2 className="animate-spin" /> : <span><ImagePlus className="mx-auto mb-1" />Add photos</span>}
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => add(e.target.files)} />
          </label>
        )}
      </div>
      <p className="hint mt-2">Your own genuine photos, at least 300 × 300 px, up to 5 MB each. JPEG, PNG or WebP. We strip hidden data and convert to WebP.</p>
    </div>
  );
}

function NewProduct() {
  const router = useRouter();
  const variantOf = useSearchParams().get('variantOf');
  const [mode, setMode] = useState<Mode>(variantOf ? 'variant' : 'new');
  const [images, setImages] = useState<string[]>([]);
  const [info, setInfo] = useState({ name: '', brand: '', category: '', description: '', highlights: '', hsnCode: '', variantLabel: 'Standard', weight: '500' });
  const [specs, setSpecs] = useState<{ k: string; v: string }[]>([{ k: '', v: '' }]);
  const [pricing, setPricing] = useState<Pricing>(emptyPricing);
  const [offerQ, setOfferQ] = useState('');
  const [variantId, setVariantId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const errors = useFormErrors();
  const { data: cats } = useQuery({ queryKey: ['categories'], queryFn: () => api<{ categories: Category[] }>('/categories').then((r) => r.categories) });
  const { data: found } = useQuery({ queryKey: ['catalog-search', offerQ], queryFn: () => api<{ variants: { id: string; label: string; productName: string; brand: string; image: string | null; alreadyListed: boolean }[] }>(`/seller/catalog-search?q=${encodeURIComponent(offerQ)}`), enabled: mode === 'offer' && offerQ.trim().length >= 2 });
  const attributes = Object.fromEntries(specs.filter((s) => s.k.trim() && s.v.trim()).map((s) => [s.k.trim(), s.v.trim()]));

  const submit = async () => {
    setBusy(true); errors.clear();
    try {
      if (mode === 'new') {
        await post('/seller/products', { name: info.name, brand: info.brand, category: info.category, description: info.description, highlights: info.highlights.split('\n').map((h) => h.trim()).filter(Boolean), ...(info.hsnCode ? { hsnCode: info.hsnCode } : {}), images, attributes, variantLabel: info.variantLabel || 'Standard', weightGrams: Number(info.weight || 500), ...pricingPayload(pricing) });
      } else if (mode === 'variant') {
        await post('/seller/variants', { catalogProductId: variantOf, variantLabel: info.variantLabel, weightGrams: Number(info.weight || 500), attributes, ...pricingPayload(pricing) });
      } else {
        if (!variantId) throw new Error('Choose the catalogue product you want to sell');
        await post('/seller/offers', { variantId, ...pricingPayload(pricing) });
      }
      toast.success('Submitted for review. We’ll notify you when it’s live.');
      router.push('/seller/products?tab=PENDING');
    } catch (e) { errors.set(e); setBusy(false); }
  };

  return (
    <>
      <PageHeader title={mode === 'variant' ? 'Add a variant' : 'Add a product'} description="Accurate listings with genuine photos are approved fastest." />
      {!variantOf && <Tabs value={mode} onChange={setMode} items={[{ value: 'new', label: 'Create a new product' }, { value: 'offer', label: 'Sell an item already in the catalogue' }]} />}
      <div className="grid gap-5 max-w-4xl">
        {errors.message && <Alert>{errors.message}</Alert>}
        {mode === 'offer' && (
          <section className="card card-pad grid gap-3">
            <h2 className="text-lg">Find the product</h2>
            <p className="text-sm text-muted">If the product already exists, add your offer to its page instead of creating a duplicate. Customers then compare sellers side by side.</p>
            <div className="relative"><Search size={16} className="absolute left-3 top-3.5 text-muted" /><label htmlFor="cs" className="sr-only">Search catalogue</label><input id="cs" className="input pl-9" placeholder="Product or brand name" value={offerQ} onChange={(e) => setOfferQ(e.target.value)} /></div>
            <ul className="grid gap-2">
              {found?.variants.map((v) => (
                <li key={v.id}><label className={cn('flex items-center gap-3 rounded-xl border p-3', v.alreadyListed ? 'opacity-50' : 'cursor-pointer', variantId === v.id ? 'border-emerald bg-mint' : 'border-line')}>
                  <input type="radio" name="variant" className="checkbox mt-0" disabled={v.alreadyListed} checked={variantId === v.id} onChange={() => setVariantId(v.id)} />
                  {v.image && <Image src={v.image} alt="" width={40} height={40} className="size-10 rounded bg-cream object-contain" unoptimized />}
                  <span className="flex-1"><span className="font-medium">{v.productName}</span><span className="block text-xs text-muted">{v.brand} · {v.label}{v.alreadyListed ? ' · you already sell this' : ''}</span></span>
                </label></li>
              ))}
            </ul>
          </section>
        )}
        {mode === 'new' && (
          <>
            <section className="card card-pad"><Photos images={images} onChange={setImages} />{errors.field('images') && <p className="error-text mt-2">{errors.field('images')}</p>}</section>
            <section className="card card-pad grid gap-4">
              <h2 className="text-lg">Product details</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Product name" required error={errors.field('name')} className="sm:col-span-2"><Input value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} /></Field>
                <Field label="Brand" required error={errors.field('brand')}><Input value={info.brand} onChange={(e) => setInfo({ ...info, brand: e.target.value })} /></Field>
                <Field label="Category" required error={errors.field('category')}><Select value={info.category} onChange={(e) => setInfo({ ...info, category: e.target.value })}><option value="">Select…</option>{cats?.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}</Select></Field>
                <Field label="HSN code" error={errors.field('hsnCode')} hint="Decides the GST rate on your invoice"><Input inputMode="numeric" value={info.hsnCode} onChange={(e) => setInfo({ ...info, hsnCode: e.target.value.replace(/\D/g, '') })} /></Field>
                <Field label="Variant name" error={errors.field('variantLabel')} hint="e.g. Black, Large, 500 g"><Input value={info.variantLabel} onChange={(e) => setInfo({ ...info, variantLabel: e.target.value })} /></Field>
                <Field label="Description" required error={errors.field('description')} className="sm:col-span-2"><Textarea rows={5} value={info.description} onChange={(e) => setInfo({ ...info, description: e.target.value })} /></Field>
                <Field label="Key highlights (one per line, optional)" error={errors.field('highlights')} className="sm:col-span-2"><Textarea rows={3} value={info.highlights} onChange={(e) => setInfo({ ...info, highlights: e.target.value })} /></Field>
              </div>
            </section>
          </>
        )}
        {mode !== 'offer' && (
          <section className="card card-pad grid gap-4">
            <h2 className="text-lg">{mode === 'variant' ? 'Variant details' : 'Specifications'}</h2>
            {mode === 'variant' && <Field label="Variant name" required error={errors.field('variantLabel')} hint="e.g. Blue, XL"><Input value={info.variantLabel === 'Standard' ? '' : info.variantLabel} onChange={(e) => setInfo({ ...info, variantLabel: e.target.value })} /></Field>}
            <Field label="Shipping weight (grams)" error={errors.field('weightGrams')} hint="Used to calculate delivery charges"><Input inputMode="numeric" value={info.weight} onChange={(e) => setInfo({ ...info, weight: e.target.value.replace(/\D/g, '') })} /></Field>
            <div className="grid gap-2">
              {specs.map((s, i) => (
                <div key={i} className="flex gap-2">
                  <label className="sr-only" htmlFor={`sk${i}`}>Specification name</label><Input id={`sk${i}`} placeholder="e.g. Material" value={s.k} onChange={(e) => setSpecs(specs.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))} />
                  <label className="sr-only" htmlFor={`sv${i}`}>Value</label><Input id={`sv${i}`} placeholder="e.g. Cotton canvas" value={s.v} onChange={(e) => setSpecs(specs.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))} />
                </div>
              ))}
              <button type="button" className="link text-sm justify-self-start" onClick={() => setSpecs([...specs, { k: '', v: '' }])}>+ Add specification</button>
            </div>
          </section>
        )}
        <section className="card card-pad grid gap-4"><h2 className="text-lg">Price, stock and business terms</h2><PricingFields value={pricing} onChange={setPricing} err={errors.field} /></section>
        <Button size="lg" loading={busy} onClick={submit} className="justify-self-start">Submit for review</Button>
      </div>
    </>
  );
}

export default function NewProductPage() {
  return <Suspense><NewProduct /></Suspense>;
}
