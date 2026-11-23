'use client';
import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Trash2, Merge, Plus } from 'lucide-react';
import { api, del, patch, post, put } from '@/lib/api';
import { formatDate, formatMoney, label, pct, rupeesToPaise } from '@/lib/format';
import { Alert, Badge, Button, ConfirmButton, Field, Input, Modal, Select, StatusBadge, Textarea, Checkbox, Tabs } from '../ui';
import { ActionButton, DataTable, Drawer, KV, Loadable, MiniStats, NotesPanel, Panel, Section, Table, attempt, useAdminTable, useOpenParam, useUrlState, type Column, type ListResponse } from './kit';
import type { Can } from './people';

// ───────────── Moderation ─────────────
type ModProduct = { id: string; name: string; brand: string; category: string; status: string; description: string; highlights: string[]; hsnCode: string | null; updatedAt: string; images: string[]; specifications: { name: string; value: string }[]; listings: { id: string; variantLabel: string; seller: string; sku: string; pricePaise: number; mrpPaise: number; moq: number; status: string }[] };
type ModOffer = { id: string; name: string; variantLabel: string; seller: string; sku: string; pricePaise: number; mrpPaise: number; image: string; stock: number };

export function Moderation() {
  const query = useQuery({ queryKey: ['admin', 'moderation'], queryFn: () => api<{ products: ModProduct[]; offers: ModOffer[] }>('/admin/moderation') });
  const [picked, setPicked] = useState<{ product: string[]; listing: string[] }>({ product: [], listing: [] });
  const decide = async (kind: string, id: string, decision: string, note?: string) => { if (await attempt(() => post(`/admin/moderation/${kind}/${id}`, { decision, ...(note ? { note } : {}) }), label(decision))) query.refetch(); };
  const bulk = async (kind: 'product' | 'listing', action: string, reason?: string) => {
    try {
      const r = await post<{ done: number; skipped: unknown[] }>('/admin/moderation/bulk', { kind, ids: picked[kind], action, ...(reason ? { reason } : {}) });
      toast.success(`${r.done} done${r.skipped.length ? `, ${r.skipped.length} skipped` : ''}`); setPicked({ ...picked, [kind]: [] }); query.refetch();
    } catch (e) { toast.error((e as Error).message); }
  };
  const toggle = (kind: 'product' | 'listing', id: string) => setPicked((p) => ({ ...p, [kind]: p[kind].includes(id) ? p[kind].filter((x) => x !== id) : [...p[kind], id] }));
  const buttons = (kind: string, id: string) => (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => decide(kind, id, 'APPROVED')}>Approve</Button>
      <ConfirmButton title="Request changes" reason={{ label: 'What should the seller fix?' }} confirmLabel="Send" onConfirm={(note) => decide(kind, id, 'CHANGES_REQUESTED', note)}>Request changes</ConfirmButton>
      <ConfirmButton danger title="Reject" reason={{ label: 'Reason sent to the seller' }} confirmLabel="Reject" onConfirm={(note) => decide(kind, id, 'REJECTED', note)}>Reject</ConfirmButton>
    </div>
  );
  const bulkBar = (kind: 'product' | 'listing') => picked[kind].length > 0 && (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-deep text-white px-4 py-2.5 mb-3">
      <span className="font-semibold mr-2">{picked[kind].length} selected</span>
      <Button size="sm" variant="outline" className="bg-white/10 border-white/30 text-white" onClick={() => bulk(kind, 'approve')}>Approve all</Button>
      <ConfirmButton title="Request changes on all selected" reason={{ label: 'What should the sellers fix?' }} confirmLabel="Send" onConfirm={(r) => bulk(kind, 'changes', r)}>Request changes</ConfirmButton>
      <ConfirmButton danger title="Reject all selected" reason={{ label: 'Reason sent to the sellers' }} confirmLabel="Reject" onConfirm={(r) => bulk(kind, 'reject', r)}>Reject</ConfirmButton>
      <button className="ml-auto text-sm text-white/80" onClick={() => setPicked({ ...picked, [kind]: [] })}>Clear</button>
    </div>
  );
  return (
    <Section title="Moderation" description="Check photos are genuine product photos, claims are accurate, HSN and category fit, and prices are honest (MRP ≥ price). Oldest submissions first.">
      <Loadable query={query}>{(d) => (
        <div className="grid gap-6">
          <section>
            <div className="flex items-center justify-between mb-3"><h2 className="text-lg">New products ({d.products.length})</h2>{d.products.length > 1 && <label className="text-sm flex items-center gap-2"><input type="checkbox" className="checkbox mt-0" checked={picked.product.length === d.products.length} onChange={(e) => setPicked({ ...picked, product: e.target.checked ? d.products.map((p) => p.id) : [] })} />Select all</label>}</div>
            {bulkBar('product')}
            <div className="grid gap-4">{d.products.map((p) => (
              <article key={p.id} className="card card-pad grid gap-4 md:grid-cols-[24px_200px_1fr]">
                <input type="checkbox" className="checkbox mt-1" aria-label={`Select ${p.name}`} checked={picked.product.includes(p.id)} onChange={() => toggle('product', p.id)} />
                <div className="grid grid-cols-3 md:grid-cols-2 gap-2 content-start">{p.images.map((u) => <span key={u} className="relative aspect-square rounded-lg bg-cream border border-line"><Image src={u} alt="" fill sizes="100px" className="object-contain p-1" unoptimized /></span>)}</div>
                <div>
                  <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-lg">{p.name}</p><StatusBadge status={p.status} /><span className="text-xs text-muted">submitted {formatDate(p.updatedAt)}</span></div>
                  <p className="text-sm text-muted">{p.brand} · {p.category} · HSN {p.hsnCode ?? <span className="text-warning font-semibold">missing</span>}</p>
                  <p className="text-sm mt-2 whitespace-pre-line">{p.description}</p>
                  {p.highlights.length > 0 && <ul className="text-sm list-disc pl-5 mt-2">{p.highlights.map((h) => <li key={h}>{h}</li>)}</ul>}
                  {p.specifications.length > 0 && <p className="text-sm text-muted mt-2">{p.specifications.map((s) => `${s.name}: ${s.value}`).join(' · ')}</p>}
                  <ul className="text-sm mt-2">{p.listings.map((l) => <li key={l.id} className={l.mrpPaise < l.pricePaise ? 'text-danger' : ''}>{l.seller} · {l.variantLabel} · SKU {l.sku} · {formatMoney(l.pricePaise)} (MRP {formatMoney(l.mrpPaise)}) · MOQ {l.moq}</li>)}</ul>
                  <div className="mt-3">{buttons('product', p.id)}</div>
                </div>
              </article>
            ))}{!d.products.length && <p className="text-muted">No products waiting.</p>}</div>
          </section>
          <section>
            <h2 className="text-lg mb-3">New offers on existing products ({d.offers.length})</h2>
            {bulkBar('listing')}
            <Table head={[<input key="all" type="checkbox" className="checkbox mt-0" aria-label="Select all offers" checked={!!d.offers.length && picked.listing.length === d.offers.length} onChange={(e) => setPicked({ ...picked, listing: e.target.checked ? d.offers.map((o) => o.id) : [] })} />, 'Offer', 'Seller', 'Price', 'Stock', '']} empty={!d.offers.length}>
              {d.offers.map((o) => <tr key={o.id}><td><input type="checkbox" className="checkbox mt-0" aria-label="Select offer" checked={picked.listing.includes(o.id)} onChange={() => toggle('listing', o.id)} /></td><td>{o.name} · {o.variantLabel}<span className="block text-xs text-muted">SKU {o.sku}</span></td><td>{o.seller}</td><td>{formatMoney(o.pricePaise)} <span className="mrp text-xs">{formatMoney(o.mrpPaise)}</span></td><td>{o.stock}</td><td>{buttons('listing', o.id)}</td></tr>)}
            </Table>
          </section>
        </div>
      )}</Loadable>
    </Section>
  );
}

// ───────────── Products ─────────────
type ProductRow = { id: string; slug: string; name: string; brand: string; category: string; status: string; featured: boolean; demo: boolean; hsnCode: string | null; gstRateBps: number | null; image: string | null; variants: number; sellers: number; offers: number; minPricePaise: number | null; reviews: number; updatedAt: string; createdAt: string };
type Product360 = {
  product: { id: string; slug: string; name: string; description: string; highlights: string[]; hsnCode: string | null; status: string; featured: boolean; demo: boolean; brand: { id: string; name: string }; category: { id: string; name: string }; taxClassId: string | null; gstRateBps: number | null; images: { id: string; url: string; alt: string }[]; specifications: { name: string; value: string }[]; createdAt: string; updatedAt: string };
  variants: { id: string; label: string; slug: string; weightGrams: number }[];
  listings: { id: string; variantId: string; variantLabel: string; seller: string; storeId: string; sku: string; status: string; pricePaise: number; mrpPaise: number; moq: number; onHand: number; reserved: number; stock: number; codAllowed: boolean; returnable: boolean; moderationNote: string | null }[];
  sales: { units: number; revenuePaise: number };
  reviews: { count: number; average: number | null };
  notes: { id: string; body: string; authorName: string; authorId: string; createdAt: string }[];
};
type CatalogRefs = { categories: { id: string; name: string; slug: string; active: boolean; parentId: string | null }[]; taxClasses: { id: string; name: string; gstRateBps: number }[] };

export function Products({ can }: { can: Can }) {
  const list = useAdminTable<ListResponse & { products: ProductRow[] }>('/admin/products', ['status', 'category', 'featured', 'demo']);
  const refs = useQuery({ queryKey: ['admin', 'categories'], queryFn: () => api<CatalogRefs>('/admin/categories') });
  const [open, setOpen] = useOpenParam();
  const columns: Column<ProductRow>[] = [
    { key: 'image', label: 'Photo', render: (p) => (p.image ? <Image src={p.image} alt="" width={40} height={40} className="size-10 rounded bg-cream object-contain" unoptimized /> : <span className="size-10 block rounded bg-cream" />) },
    { key: 'name', label: 'Product', sort: 'name', always: true, render: (p) => <><p className="font-semibold">{p.name}{p.featured && <Badge tone="gold" className="ml-1">Featured</Badge>}{p.demo && <Badge tone="neutral" className="ml-1">Demo</Badge>}</p><p className="text-xs text-muted">{p.brand} · {p.variants} variant{p.variants === 1 ? '' : 's'}</p></> },
    { key: 'category', label: 'Category', render: (p) => p.category },
    { key: 'hsn', label: 'HSN · GST', hidden: true, render: (p) => <span className="text-sm">{p.hsnCode ?? '—'} · {p.gstRateBps == null ? 'category' : pct(p.gstRateBps)}</span> },
    { key: 'sellers', label: 'Sellers', className: 'text-right', render: (p) => p.sellers },
    { key: 'price', label: 'From', className: 'text-right', render: (p) => (p.minPricePaise == null ? '—' : formatMoney(p.minPricePaise)) },
    { key: 'reviews', label: 'Reviews', className: 'text-right', hidden: true, render: (p) => p.reviews },
    { key: 'updated', label: 'Updated', sort: 'updated', render: (p) => formatDate(p.updatedAt) },
    { key: 'status', label: 'Status', render: (p) => <StatusBadge status={p.status} /> },
  ];
  return (
    <Section title="Products" description="Every product page across sellers. Admin edits go live immediately without re-review. Merge duplicate pages so one product has one page.">
      <DataTable tableId="products" query={list} rows={list.data?.products} columns={columns} onOpen={(p) => setOpen(p.id)} search="Product, brand or SKU" dateFilter="Created"
        filters={[
          { key: 'status', label: 'Status', options: [['APPROVED', 'Live'], ['PENDING', 'Pending'], ['CHANGES_REQUESTED', 'Changes requested'], ['PAUSED', 'Paused'], ['REJECTED', 'Rejected']] },
          { key: 'category', label: 'Category', options: (refs.data?.categories ?? []).map((c) => [c.slug, c.name]) },
          { key: 'featured', label: 'Homepage', options: [['yes', 'Featured']] },
          { key: 'demo', label: 'Data', options: [['no', 'Real only'], ['yes', 'Demo only']] },
        ]}
        bulk={{ endpoint: '/admin/products/bulk', actions: [{ id: 'approve', label: 'Approve' }, { id: 'feature', label: 'Feature' }, { id: 'unfeature', label: 'Unfeature' }, { id: 'resume', label: 'Resume' }, { id: 'pause', label: 'Pause', danger: true, reason: 'required' }, { id: 'reject', label: 'Reject', danger: true, reason: 'required' }] }} />
      {open && <ProductDrawer id={open} can={can} refs={refs.data} onClose={() => { setOpen(null); list.refetch(); }} />}
    </Section>
  );
}

function ProductDrawer({ id, can, refs, onClose }: { id: string; can: Can; refs?: CatalogRefs; onClose: () => void }) {
  const { data, refetch, error } = useQuery({ queryKey: ['admin', 'product', id], queryFn: () => api<Product360>(`/admin/products/${id}`) });
  const [edit, setEdit] = useState<{ name: string; description: string; highlights: string; categoryId: string; hsnCode: string; taxClassId: string; images: { id: string; url: string }[] } | null>(null);
  const [merge, setMerge] = useState(false);
  const p = data?.product;
  const save = async (body: object, msg = 'Saved') => { if (await attempt(() => patch(`/admin/products/${id}`, body), msg)) refetch(); };
  const startEdit = () => p && setEdit({ name: p.name, description: p.description, highlights: p.highlights.join('\n'), categoryId: p.category.id, hsnCode: p.hsnCode ?? '', taxClassId: p.taxClassId ?? '', images: p.images.map((i) => ({ id: i.id, url: i.url })) });
  const move = (i: number, dir: -1 | 1) => { if (!edit) return; const imgs = [...edit.images]; const j = i + dir; if (j < 0 || j >= imgs.length) return; [imgs[i], imgs[j]] = [imgs[j], imgs[i]]; setEdit({ ...edit, images: imgs }); };
  return (
    <Drawer open onClose={onClose} wide title={p?.name ?? 'Loading…'} subtitle={p ? `${p.brand.name} · ${p.category.name} · HSN ${p.hsnCode ?? 'not set'}` : undefined}
      badges={p && <><StatusBadge status={p.status} />{p.featured && <Badge tone="gold">Featured</Badge>}{p.demo && <Badge tone="neutral">Demo</Badge>}</>}
      actions={p && <>
        {!edit && <Button size="sm" onClick={startEdit}>Edit content</Button>}
        {p.status === 'APPROVED' && <Button size="sm" variant="outline" onClick={() => save({ featured: !p.featured }, p.featured ? 'Removed from homepage' : 'Featured on homepage')}>{p.featured ? 'Unfeature' : 'Feature on homepage'}</Button>}
        {p.status === 'APPROVED' && <ConfirmButton danger title="Pause this product?" body="It disappears from the storefront for every seller." confirmLabel="Pause" onConfirm={() => save({ status: 'PAUSED' }, 'Paused')}>Pause</ConfirmButton>}
        {p.status === 'PAUSED' && <Button size="sm" variant="outline" onClick={() => save({ status: 'APPROVED' }, 'Live again')}>Resume</Button>}
        <Button size="sm" variant="ghost" onClick={() => setMerge(true)}><Merge size={14} />Merge into…</Button>
        {p.status === 'APPROVED' && <Link href={`/products/${p.slug}`} className="btn btn-ghost btn-sm">View page</Link>}
      </>}>
      {error && <Alert>{(error as Error).message}</Alert>}
      {data && p && <>
        {edit && (
          <Panel title="Edit content" actions={<span className="text-xs text-muted">Saved changes go live immediately</span>}>
            <div className="grid gap-3">
              <Field label="Name"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label="Description"><Textarea rows={6} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
              <Field label="Highlights" hint="One per line, up to 8"><Textarea rows={4} value={edit.highlights} onChange={(e) => setEdit({ ...edit, highlights: e.target.value })} /></Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Category"><Select value={edit.categoryId} onChange={(e) => setEdit({ ...edit, categoryId: e.target.value })}>{refs?.categories.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.parentId ? '— ' : ''}{c.name}</option>)}</Select></Field>
                <Field label="HSN code"><Input inputMode="numeric" value={edit.hsnCode} onChange={(e) => setEdit({ ...edit, hsnCode: e.target.value.replace(/\D/g, '').slice(0, 8) })} /></Field>
                <Field label="GST rate"><Select value={edit.taxClassId} onChange={(e) => setEdit({ ...edit, taxClassId: e.target.value })}><option value="">From category</option>{refs?.taxClasses.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
              </div>
              <div>
                <p className="label mb-2">Photos (first is the main photo)</p>
                <ul className="grid gap-2 grid-cols-2 sm:grid-cols-4">{edit.images.map((img, i) => (
                  <li key={img.id} className="rounded-lg border border-line bg-white p-1.5">
                    <span className="relative block aspect-square bg-cream rounded"><Image src={img.url} alt="" fill sizes="120px" className="object-contain" unoptimized /></span>
                    <div className="flex justify-between mt-1">
                      <span className="flex gap-1"><button type="button" className="btn btn-ghost btn-sm px-1.5" aria-label="Move earlier" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={13} /></button><button type="button" className="btn btn-ghost btn-sm px-1.5" aria-label="Move later" disabled={i === edit.images.length - 1} onClick={() => move(i, 1)}><ArrowDown size={13} /></button></span>
                      <button type="button" className="btn btn-ghost btn-sm px-1.5 text-danger" aria-label="Remove photo" disabled={edit.images.length === 1} onClick={() => setEdit({ ...edit, images: edit.images.filter((x) => x.id !== img.id) })}><Trash2 size={13} /></button>
                    </div>
                  </li>
                ))}</ul>
              </div>
              <div className="flex gap-2">
                <Button onClick={async () => { await save({ name: edit.name, description: edit.description, highlights: edit.highlights.split('\n').map((h) => h.trim()).filter(Boolean), categoryId: edit.categoryId, hsnCode: edit.hsnCode || null, taxClassId: edit.taxClassId || null, imageOrder: edit.images.map((i) => i.id) }, 'Product updated'); setEdit(null); }}>Save changes</Button>
                <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
              </div>
            </div>
          </Panel>
        )}
        <MiniStats items={[['Units sold', data.sales.units], ['Revenue', formatMoney(data.sales.revenuePaise)], ['Reviews', data.reviews.count, data.reviews.average ? `${data.reviews.average} ★ average` : undefined], ['Offers', data.listings.length, `${new Set(data.listings.map((l) => l.storeId)).size} sellers`]]} />
        {!edit && <Panel title="Content">
          <div className="flex gap-2 overflow-x-auto mb-3">{p.images.map((i) => <span key={i.id} className="relative shrink-0 size-20 rounded-lg bg-cream border border-line"><Image src={i.url} alt={i.alt} fill sizes="80px" className="object-contain p-1" unoptimized /></span>)}</div>
          <p className="text-sm whitespace-pre-line">{p.description}</p>
          {p.highlights.length > 0 && <ul className="text-sm list-disc pl-5 mt-2">{p.highlights.map((h) => <li key={h}>{h}</li>)}</ul>}
          {p.specifications.length > 0 && <KV items={p.specifications.map((s) => [s.name, s.value])} />}
        </Panel>}
        <Panel title="Seller offers">
          <div className="grid gap-2">
            {data.listings.map((l) => <ListingRow key={l.id} l={l} onChange={refetch} canEdit={can('catalogue.manage')} />)}
            {!data.listings.length && <p className="text-sm text-muted">No offers.</p>}
          </div>
        </Panel>
        <NotesPanel entityType="product" entityId={id} initial={data.notes} />
        <Modal open={merge} onOpenChange={setMerge} title="Merge into another product" description="Variants, seller offers, reviews, wishlists and order history move to the product you pick. This page is then deleted.">
          <MergePicker excludeId={id} onPick={async (intoId) => { if (await attempt(() => post(`/admin/products/${id}/merge`, { intoId }), 'Merged')) { setMerge(false); onClose(); } }} />
        </Modal>
      </>}
    </Drawer>
  );
}

function ListingRow({ l, onChange, canEdit }: { l: Product360['listings'][number]; onChange: () => void; canEdit: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-white p-3 grid gap-2">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div><p className="font-semibold text-sm">{l.seller} · {l.variantLabel}</p><p className="text-xs text-muted">SKU {l.sku} · MOQ {l.moq}{l.codAllowed ? ' · COD' : ''}{l.returnable ? ' · returnable' : ''}</p></div>
        <div className="flex items-center gap-2"><StatusBadge status={l.status} /><span className="font-semibold">{formatMoney(l.pricePaise)}</span><span className="mrp text-xs">{formatMoney(l.mrpPaise)}</span></div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Stock {l.onHand} on hand · {l.reserved} held · <strong className={l.stock <= 0 ? 'text-danger' : 'text-ink'}>{l.stock} available</strong></span>
        {l.moderationNote && <span className="text-xs text-warning">Note: {l.moderationNote}</span>}
        {canEdit && <span className="ml-auto flex flex-wrap gap-2">
          <ActionButton label="Price / status" title="Change this offer" body="The seller is notified with your reason." confirmLabel="Save" fields={(st, set) => <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Price (₹)"><Input inputMode="decimal" value={st.price ?? String(l.pricePaise / 100)} onChange={(e) => set({ price: e.target.value })} /></Field>
            <Field label="MRP (₹)"><Input inputMode="decimal" value={st.mrp ?? String(l.mrpPaise / 100)} onChange={(e) => set({ mrp: e.target.value })} /></Field>
            <Field label="Status"><Select value={st.status ?? (['APPROVED', 'PAUSED', 'REJECTED'].includes(l.status) ? l.status : 'APPROVED')} onChange={(e) => set({ status: e.target.value })}><option value="APPROVED">Live</option><option value="PAUSED">Paused</option><option value="REJECTED">Rejected</option></Select></Field>
          </div>} onSubmit={(v) => patch(`/admin/listings/${l.id}`, { ...(v.price ? { pricePaise: rupeesToPaise(v.price) } : {}), ...(v.mrp ? { mrpPaise: rupeesToPaise(v.mrp) } : {}), ...(v.status ? { status: v.status } : {}), reason: v.reason }).then(onChange)} />
          <StockButton listingId={l.id} sku={l.sku} onDone={onChange} />
        </span>}
      </div>
    </div>
  );
}

export function StockButton({ listingId, sku, onDone }: { listingId: string; sku: string; onDone: () => void }) {
  return (
    <ActionButton label="Correct stock" title={`Correct stock for ${sku}`} body="Use a positive number to add stock, negative to remove. Stock held for unpaid orders can’t be removed." confirmLabel="Apply"
      fields={(st, set) => <Field label="Change (units)"><Input inputMode="numeric" value={st.delta ?? ''} onChange={(e) => set({ delta: e.target.value.replace(/[^\d-]/g, '') })} placeholder="e.g. 10 or -3" /></Field>}
      onSubmit={(v) => post(`/admin/listings/${listingId}/stock`, { delta: Number(v.delta), reason: v.reason }).then(onDone)} />
  );
}

function MergePicker({ excludeId, onPick }: { excludeId: string; onPick: (id: string) => void }) {
  const [q, setQ] = useState('');
  const res = useQuery({ queryKey: ['admin', 'merge-search', q], queryFn: () => api<{ products: ProductRow[] }>(`/admin/products?q=${encodeURIComponent(q)}&limit=25`), enabled: q.trim().length >= 2 });
  return (
    <div className="grid gap-3">
      <Field label="Find the product to keep"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, brand or SKU" /></Field>
      <ul className="grid gap-1.5 max-h-72 overflow-y-auto">
        {res.data?.products.filter((p) => p.id !== excludeId).map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-line p-2">
            <span className="text-sm"><strong>{p.name}</strong><span className="block text-xs text-muted">{p.brand} · {p.category} · {p.sellers} sellers · {label(p.status)}</span></span>
            <ConfirmButton danger title={`Merge into “${p.name}”?`} body="This can’t be undone." confirmLabel="Merge" onConfirm={async () => onPick(p.id)}>Merge here</ConfirmButton>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ───────────── Categories and tax classes ─────────────
type Cat = { id: string; name: string; slug: string; description: string | null; imageUrl: string | null; parentId: string | null; taxClassId: string | null; taxClass: { gstRateBps: number; name: string } | null; active: boolean; sortOrder: number; products: number; liveProducts: number; stores: number; children: number; commissionBps: number | null };
type TaxClass = { id: string; code: string; name: string; gstRateBps: number; cessRateBps: number; categories: number; products: number };

export function Categories({ can }: { can: Can }) {
  const query = useQuery({ queryKey: ['admin', 'categories'], queryFn: () => api<{ categories: Cat[]; taxClasses: TaxClass[]; defaultCommissionBps: number }>('/admin/categories') });
  const [edit, setEdit] = useState<Partial<Cat> & { commission?: string } | null>(null);
  const [tax, setTax] = useState<Partial<TaxClass> & { rate?: string } | null>(null);
  const finance = can('finance.manage');
  const save = async () => {
    if (!edit) return;
    const body = { name: edit.name, description: edit.description || null, parentId: edit.parentId || null, taxClassId: edit.taxClassId || null, active: edit.active ?? true, ...(finance ? { commissionBps: edit.commission ? Math.round(Number(edit.commission) * 100) : null } : {}) };
    if (await attempt(() => (edit.id ? patch(`/admin/categories/${edit.id}`, body) : post('/admin/categories', body)), 'Saved')) { setEdit(null); query.refetch(); }
  };
  const saveTax = async () => {
    if (!tax) return;
    const body = { name: tax.name, gstRateBps: Math.round(Number(tax.rate) * 100), cessRateBps: tax.cessRateBps ?? 0 };
    if (await attempt(() => (tax.id ? patch(`/admin/tax-classes/${tax.id}`, body) : post('/admin/tax-classes', { ...body, code: tax.code })), 'Saved')) { setTax(null); query.refetch(); }
  };
  const reorder = async (cats: Cat[], i: number, dir: -1 | 1) => {
    const ids = cats.map((c) => c.id); const j = i + dir; if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    if (await attempt(() => put('/admin/categories/order', { ids }))) query.refetch();
  };
  return (
    <Section title="Categories and GST" description="Each category sets a default GST rate (a product can override it) and, optionally, its own commission. Hide a category instead of deleting it if it has products." actions={<Button onClick={() => setEdit({ active: true })}><Plus size={15} />New category</Button>}>
      <Loadable query={query}>{(d) => {
        const ordered = [...d.categories].sort((a, b) => a.sortOrder - b.sortOrder);
        return (
          <div className="grid gap-6">
            <Table head={['Order', 'Category', 'Parent', 'Default GST', 'Commission', 'Products', 'Stores', 'Status', '']}>
              {ordered.map((c, i) => (
                <tr key={c.id}>
                  <td><span className="flex gap-0.5"><button className="btn btn-ghost btn-sm px-1.5" aria-label="Move up" disabled={i === 0} onClick={() => reorder(ordered, i, -1)}><ArrowUp size={13} /></button><button className="btn btn-ghost btn-sm px-1.5" aria-label="Move down" disabled={i === ordered.length - 1} onClick={() => reorder(ordered, i, 1)}><ArrowDown size={13} /></button></span></td>
                  <td className="font-semibold">{c.name}<span className="block text-xs text-muted font-normal">{c.description}</span></td>
                  <td>{d.categories.find((p) => p.id === c.parentId)?.name ?? '—'}</td>
                  <td>{c.taxClass ? pct(c.taxClass.gstRateBps) : '18% (fallback)'}</td>
                  <td>{c.commissionBps != null ? pct(c.commissionBps) : <span className="text-muted">{pct(d.defaultCommissionBps)} default</span>}</td>
                  <td><Link href={`/admin/products?category=${c.slug}`} className="hover:underline">{c.liveProducts} live</Link><span className="block text-xs text-muted">{c.products} total</span></td>
                  <td>{c.stores}</td>
                  <td>{c.active ? <Badge tone="success">Visible</Badge> : <Badge tone="neutral">Hidden</Badge>}</td>
                  <td><span className="flex gap-1"><Button size="sm" variant="outline" onClick={() => setEdit({ ...c, commission: c.commissionBps != null ? String(c.commissionBps / 100) : '' })}>Edit</Button>
                    {!c.products && !c.children && !c.stores && <ConfirmButton variant="ghost" danger title={`Delete “${c.name}”?`} confirmLabel="Delete" onConfirm={async () => { if (await attempt(() => del(`/admin/categories/${c.id}`), 'Deleted')) query.refetch(); }}><Trash2 size={14} /></ConfirmButton>}</span></td>
                </tr>
              ))}
            </Table>
            <section className="card card-pad">
              <div className="flex flex-wrap justify-between items-center gap-3 mb-3"><div><h2 className="text-lg">GST tax classes</h2><p className="text-sm text-muted">Changing a rate affects new orders only. Placed orders keep the tax they were charged.</p></div>{can('settings.manage') && <Button size="sm" variant="outline" onClick={() => setTax({ rate: '18', cessRateBps: 0 })}><Plus size={14} />New tax class</Button>}</div>
              <Table head={['Code', 'Name', 'GST', 'Cess', 'Used by', '']}>
                {d.taxClasses.map((t) => <tr key={t.id}><td className="font-mono text-xs">{t.code}</td><td>{t.name}</td><td>{pct(t.gstRateBps)}</td><td>{t.cessRateBps ? pct(t.cessRateBps) : '—'}</td><td className="text-sm">{t.categories} categories · {t.products} products</td><td>{can('settings.manage') && <Button size="sm" variant="ghost" onClick={() => setTax({ ...t, rate: String(t.gstRateBps / 100) })}>Edit</Button>}</td></tr>)}
              </Table>
            </section>
            <Modal open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={edit?.id ? 'Edit category' : 'New category'}>
              {edit && <div className="grid gap-4">
                <Field label="Name"><Input value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
                <Field label="Description"><Textarea rows={2} value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
                <Field label="Parent category"><Select value={edit.parentId ?? ''} onChange={(e) => setEdit({ ...edit, parentId: e.target.value || null })}><option value="">None (top level)</option>{d.categories.filter((c) => c.id !== edit.id && !c.parentId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
                <Field label="Default GST rate"><Select value={edit.taxClassId ?? ''} onChange={(e) => setEdit({ ...edit, taxClassId: e.target.value || null })}><option value="">Not set (18% fallback)</option>{d.taxClasses.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
                {finance && <Field label="Commission % (blank = platform default)"><Input inputMode="decimal" value={edit.commission ?? ''} onChange={(e) => setEdit({ ...edit, commission: e.target.value })} /></Field>}
                <Checkbox checked={edit.active ?? true} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} label="Visible to shoppers and sellers" />
                <Button onClick={save}>Save</Button>
              </div>}
            </Modal>
            <Modal open={!!tax} onOpenChange={(o) => !o && setTax(null)} title={tax?.id ? 'Edit tax class' : 'New tax class'}>
              {tax && <div className="grid gap-4">
                {!tax.id && <Field label="Code" hint="e.g. GST_12"><Input className="uppercase" value={tax.code ?? ''} onChange={(e) => setTax({ ...tax, code: e.target.value.toUpperCase() })} /></Field>}
                <Field label="Name"><Input value={tax.name ?? ''} onChange={(e) => setTax({ ...tax, name: e.target.value })} placeholder="GST 12%" /></Field>
                <Field label="GST rate %"><Select value={tax.rate ?? '18'} onChange={(e) => setTax({ ...tax, rate: e.target.value })}>{['0', '0.25', '3', '5', '12', '18', '28', '40'].map((r) => <option key={r} value={r}>{r}%</option>)}</Select></Field>
                <Button onClick={saveTax}>Save</Button>
              </div>}
            </Modal>
          </div>
        );
      }}</Loadable>
    </Section>
  );
}

// ───────────── Brands ─────────────
type BrandRow = { id: string; name: string; slug: string; verified: boolean; logoUrl: string | null; products: number; createdAt: string };
export function Brands() {
  const list = useAdminTable<ListResponse & { brands: BrandRow[] }>('/admin/brands', ['verified'], { sort: 'name', dir: 'asc' });
  const [form, setForm] = useState<{ id?: string; name: string; verified: boolean } | null>(null);
  const [merging, setMerging] = useState<BrandRow | null>(null);
  const [target, setTarget] = useState('');
  const all = useQuery({ queryKey: ['admin', 'brands-all'], queryFn: () => api<{ brands: BrandRow[] }>('/admin/brands?limit=100&sort=name&dir=asc'), enabled: !!merging });
  const columns: Column<BrandRow>[] = [
    { key: 'name', label: 'Brand', sort: 'name', always: true, render: (b) => <span className="font-semibold">{b.name}</span> },
    { key: 'products', label: 'Products', sort: 'products', className: 'text-right', render: (b) => <Link href={`/admin/products?q=${encodeURIComponent(b.name)}`} className="hover:underline">{b.products}</Link> },
    { key: 'verified', label: 'Verified', render: (b) => (b.verified ? <Badge tone="success">Verified</Badge> : <Badge tone="neutral">No</Badge>) },
    { key: 'created', label: 'Added', sort: 'created', render: (b) => formatDate(b.createdAt) },
    { key: 'actions', label: 'Actions', always: true, render: (b) => <span className="flex flex-wrap gap-1">
      <Button size="sm" variant="ghost" onClick={() => setForm({ id: b.id, name: b.name, verified: b.verified })}>Edit</Button>
      <Button size="sm" variant="ghost" onClick={async () => { if (await attempt(() => patch(`/admin/brands/${b.id}`, { verified: !b.verified }), b.verified ? 'Badge removed' : 'Marked verified')) list.refetch(); }}>{b.verified ? 'Unverify' : 'Verify'}</Button>
      <Button size="sm" variant="ghost" onClick={() => { setMerging(b); setTarget(''); }}>Merge</Button>
      {!b.products && <ConfirmButton variant="ghost" danger title={`Delete “${b.name}”?`} confirmLabel="Delete" onConfirm={async () => { if (await attempt(() => del(`/admin/brands/${b.id}`), 'Deleted')) list.refetch(); }}>Delete</ConfirmButton>}
    </span> },
  ];
  return (
    <Section title="Brands" description="Mark a brand verified only after checking trademark ownership or authorised-reseller documents. Merge spelling variants into one brand." actions={<Button onClick={() => setForm({ name: '', verified: false })}><Plus size={15} />New brand</Button>}>
      <DataTable tableId="brands" query={list} rows={list.data?.brands} columns={columns} search="Brand name" dateFilter={false} filters={[{ key: 'verified', label: 'Verified', options: [['yes', 'Verified'], ['no', 'Not verified']] }]} />
      <Modal open={!!form} onOpenChange={(o) => !o && setForm(null)} title={form?.id ? 'Edit brand' : 'New brand'}>
        {form && <div className="grid gap-4">
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Checkbox checked={form.verified} onChange={(e) => setForm({ ...form, verified: e.target.checked })} label="Verified brand (documents checked)" />
          <Button onClick={async () => { if (await attempt(() => (form.id ? patch(`/admin/brands/${form.id}`, { name: form.name, verified: form.verified }) : post('/admin/brands', { name: form.name, verified: form.verified })), 'Saved')) { setForm(null); list.refetch(); } }}>Save</Button>
        </div>}
      </Modal>
      <Modal open={!!merging} onOpenChange={(o) => !o && setMerging(null)} title={`Merge “${merging?.name}” into another brand`} description="Its products move to the brand you choose, and this brand is deleted.">
        {merging && <div className="grid gap-4">
          <Field label="Keep this brand"><Select value={target} onChange={(e) => setTarget(e.target.value)}><option value="">Choose…</option>{all.data?.brands.filter((b) => b.id !== merging.id).map((b) => <option key={b.id} value={b.id}>{b.name} ({b.products})</option>)}</Select></Field>
          <ConfirmButton variant="primary" size="md" danger title="Merge brands?" body="This can’t be undone." confirmLabel="Merge" onConfirm={async () => { if (!target) { toast.error('Choose a brand'); return; } const r = await post<{ productsMoved: number }>(`/admin/brands/${merging.id}/merge`, { intoId: target }); toast.success(`${r.productsMoved} products moved`); setMerging(null); list.refetch(); }}>Merge</ConfirmButton>
        </div>}
      </Modal>
    </Section>
  );
}

// ───────────── Inventory ─────────────
type StockRow = { id: string; sku: string; productId: string; name: string; variant: string; seller: string; status: string; onHand: number; reserved: number; available: number; sold30d: number; daysOfCover: number | null };
export function Inventory() {
  const { get, set } = useUrlState();
  const view = get('view') || 'low';
  const q = get('q');
  const query = useQuery({ queryKey: ['admin', 'inventory', view, q], queryFn: () => api<{ lowStockThreshold: number; items: StockRow[] }>(`/admin/inventory?view=${view}${q ? `&q=${encodeURIComponent(q)}` : ''}`) });
  const [text, setText] = useState(q);
  return (
    <Section title="Inventory" description="Available stock is on hand minus units held for unpaid orders. Days of cover uses the last 30 days of sales."
      actions={<a className="btn btn-outline btn-sm" href={`/api/admin/inventory?view=${view}${q ? `&q=${encodeURIComponent(q)}` : ''}&format=csv`} download>Export CSV</a>}>
      <Tabs value={view} onChange={(v) => set({ view: v })} items={[{ value: 'low', label: 'Low stock' }, { value: 'out', label: 'Out of stock' }, { value: 'all', label: 'All live offers' }]} />
      <form className="flex gap-2 mb-4" onSubmit={(e) => { e.preventDefault(); set({ q: text.trim() }); }}><Input className="max-w-xs min-h-[40px]" aria-label="Search stock" placeholder="Product, SKU or seller" value={text} onChange={(e) => setText(e.target.value)} /><Button variant="outline" type="submit">Search</Button></form>
      <Loadable query={query}>{(d) => (
        <Table head={['Product', 'Seller', 'SKU', 'On hand', 'Held', 'Available', 'Sold (30 days)', 'Days of cover', '']} empty={!d.items.length}>
          {d.items.map((i) => <tr key={i.id}>
            <td><Link href={`/admin/products?open=${i.productId}`} className="hover:underline">{i.name}</Link><span className="block text-xs text-muted">{i.variant}</span></td><td>{i.seller}</td><td className="font-mono text-xs">{i.sku}</td><td>{i.onHand}</td><td>{i.reserved}</td>
            <td className={i.available <= 0 ? 'text-danger font-bold' : i.available <= d.lowStockThreshold ? 'text-warning font-semibold' : ''}>{i.available}</td><td>{i.sold30d}</td><td>{i.daysOfCover == null ? '—' : `${i.daysOfCover} d`}</td>
            <td><StockButton listingId={i.id} sku={i.sku} onDone={() => query.refetch()} /></td>
          </tr>)}
        </Table>
      )}</Loadable>
    </Section>
  );
}

// ───────────── Reviews ─────────────
type ReviewRow = { id: string; rating: number; title: string; body: string; status: string; authorName: string; email: string; product: { id: string; name: string; slug: string }; createdAt: string };
export function Reviews() {
  const list = useAdminTable<ListResponse & { reviews: ReviewRow[] }>('/admin/reviews', ['status', 'rating']);
  const columns: Column<ReviewRow>[] = [
    { key: 'product', label: 'Product', always: true, render: (r) => <Link href={`/admin/products?open=${r.product.id}`} className="font-semibold hover:underline">{r.product.name}</Link> },
    { key: 'rating', label: 'Rating', sort: 'rating', render: (r) => <span className={r.rating <= 2 ? 'text-danger font-bold' : 'font-semibold'}>{r.rating} ★</span> },
    { key: 'review', label: 'Review', render: (r) => <span className="text-sm"><strong>{r.title}</strong><span className="block text-muted line-clamp-2 max-w-md">{r.body}</span></span> },
    { key: 'author', label: 'By', render: (r) => <span className="text-sm">{r.authorName}<span className="block text-xs text-muted">{r.email}</span></span> },
    { key: 'date', label: 'Date', sort: 'newest', render: (r) => formatDate(r.createdAt) },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} text={r.status === 'PUBLISHED' ? 'Published' : 'Hidden'} /> },
    { key: 'act', label: 'Action', always: true, render: (r) => <ActionButton label={r.status === 'PUBLISHED' ? 'Hide' : 'Publish'} danger={r.status === 'PUBLISHED'} title={r.status === 'PUBLISHED' ? 'Hide this review?' : 'Publish this review again?'} body={r.status === 'PUBLISHED' ? 'The customer is told why. Only hide reviews that break the review policy, never for being negative.' : undefined} reasonLabel={r.status === 'PUBLISHED' ? 'Reason (sent to the customer)' : 'Reason (audit log)'} onSubmit={(v) => patch(`/admin/reviews/${r.id}`, { status: r.status === 'PUBLISHED' ? 'HIDDEN' : 'PUBLISHED', reason: v.reason }).then(() => list.refetch())} /> },
  ];
  return (
    <Section title="Reviews" description="Customer reviews from verified purchases. Hide only reviews with abuse, personal data or spam.">
      <DataTable tableId="reviews" query={list} rows={list.data?.reviews} columns={columns} search="Text or product" filters={[{ key: 'status', label: 'Status', options: [['PUBLISHED', 'Published'], ['HIDDEN', 'Hidden']] }, { key: 'rating', label: 'Rating', options: ['1', '2', '3', '4', '5'].map((n) => [n, `${n} star`]) }]} />
    </Section>
  );
}
