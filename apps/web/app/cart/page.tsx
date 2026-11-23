'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ShoppingBag, Minus, Plus, Trash2, Bookmark, Truck, Tag, Store, ArrowRight, AlertTriangle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { post } from '@/lib/api';
import { formatMoney, cn } from '@/lib/format';
import type { Quote } from '@/lib/types';
import { useCart } from '@/components/providers';
import { useQuote } from '@/components/use-quote';
import { Button, Empty, Alert, Skeleton, Badge } from '@/components/ui';

function SavedForLater() {
  const { saved, saveForLater, remove } = useCart();
  const { data } = useQuery({
    queryKey: ['saved-lines', saved.map((s) => s.listingId)],
    queryFn: () => post<{ quote: Quote }>('/cart/quote', { items: saved.map((s) => ({ listingId: s.listingId, quantity: 1 })) }).then((r) => r.quote).catch(() => null),
    enabled: saved.length > 0,
  });
  if (!saved.length) return null;
  return (
    <section className="mt-10" aria-labelledby="saved-title">
      <h2 id="saved-title" className="text-xl mb-4">Saved for later ({saved.length})</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {saved.map((s) => {
          const line = data?.lines.find((l) => l.listingId === s.listingId);
          return (
            <div key={s.listingId} className="card p-4 flex gap-3 items-center">
              {line ? <Image src={line.image} alt="" width={64} height={64} className="size-16 rounded-lg bg-cream object-contain" unoptimized /> : <Skeleton className="size-16" />}
              <div className="flex-1 min-w-0"><p className="font-semibold truncate">{line?.name ?? 'Item'}</p><p className="text-sm text-muted">{line ? formatMoney(line.unitPaise) : 'Unavailable'}</p></div>
              <div className="flex flex-col gap-1"><button className="link text-sm" onClick={() => saveForLater(s.listingId, false)}>Move to cart</button><button className="text-sm text-muted hover:text-danger" onClick={() => remove(s.listingId)}>Remove</button></div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function CartPage() {
  const { lines, mode, setMode, setQuantity, remove, saveForLater, ready } = useCart();
  const [coupon, setCoupon] = useState('');
  const [applied, setApplied] = useState<string>();
  const [pincode, setPincode] = useState<string>();
  useEffect(() => { try { const p = localStorage.getItem('ibazzzar.pincode'); if (p) setPincode(p); } catch { /* ignore */ } }, []);
  const { data: quote, error, isFetching } = useQuote({ lines, mode, couponCode: applied, pincode });
  const couponError = applied && error ? (error as Error).message : null;
  useEffect(() => { try { if (applied && !error) sessionStorage.setItem('ibazzzar.coupon', applied); else sessionStorage.removeItem('ibazzzar.coupon'); } catch { /* ignore */ } }, [applied, error]);

  if (!ready) return <div className="container-page py-10"><Skeleton className="h-10 w-48 mb-6" /><Skeleton className="h-64" /></div>;
  if (!lines.length) {
    return (
      <div className="container-page py-12">
        <div className="card"><Empty icon={<ShoppingBag size={26} />} title="Your cart is empty" body="Find something you love, or switch to Business mode for wholesale prices." action={<div className="flex gap-2"><Link href="/products" className="btn btn-primary">Start shopping</Link><Link href="/wholesale" className="btn btn-outline">Wholesale</Link></div>} /></div>
        <SavedForLater />
      </div>
    );
  }

  const problemFor = (id: string) => quote?.problems.find((p) => p.listingId === id)?.message;
  const unknown = quote ? lines.filter((l) => !quote.lines.some((q) => q.listingId === l.listingId) && !problemFor(l.listingId)) : [];

  return (
    <div className="container-page py-8">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div><h1 className="text-3xl">Your cart</h1><p className="text-muted mt-1">{lines.reduce((s, l) => s + l.quantity, 0)} items{quote ? ` from ${quote.sellers.length} seller${quote.sellers.length === 1 ? '' : 's'}` : ''}</p></div>
        <div className="inline-flex rounded-lg bg-mint p-0.5 text-sm" role="radiogroup" aria-label="Pricing">
          {(['RETAIL', 'BUSINESS'] as const).map((m) => <button key={m} role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={cn('rounded-md px-3 py-1.5 font-semibold', mode === m ? 'bg-white text-emerald shadow-sm' : 'text-muted')}>{m === 'RETAIL' ? 'Personal prices' : 'Business prices'}</button>)}
        </div>
      </div>
      {error && !applied && <div className="mb-4"><Alert>{(error as Error).message}</Alert></div>}

      <div className="grid gap-8 lg:grid-cols-[1fr_380px] items-start">
        <div className="grid gap-5">
          {quote?.sellers.map((g) => (
            <section key={g.sellerId} className="card overflow-hidden" aria-label={`Items from ${g.sellerName}`}>
              <header className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 bg-cream border-b border-line">
                <p className="font-semibold flex items-center gap-2"><Store size={16} className="text-forest" />{g.sellerName}</p>
                <p className="text-sm text-muted flex items-center gap-1.5"><Truck size={15} />{g.shippingPaise ? `Delivery ${formatMoney(g.shippingPaise)}` : 'Free delivery'}{g.estimate?.serviceable && ` · ${g.estimate.minDays}–${g.estimate.maxDays} days`}</p>
              </header>
              {g.shippingPaise > 0 && (
                <div className="px-5 pt-3">
                  <p className="text-[13px] text-muted">Add {formatMoney(quote.freeShippingThresholdPaise - g.goodsPaise - (quote.lines.filter((l) => l.sellerId === g.sellerId).reduce((s, l) => s + l.discountPaise, 0)))} more from this seller for free delivery.</p>
                  <div className="h-1.5 rounded-full bg-mint mt-1.5"><div className="h-full rounded-full bg-gold" style={{ width: `${Math.min(100, (g.goodsPaise / quote.freeShippingThresholdPaise) * 100)}%` }} /></div>
                </div>
              )}
              <ul className="divide-y divide-line">
                {quote.lines.filter((l) => l.sellerId === g.sellerId).map((l) => (
                  <li key={l.listingId} className="flex gap-4 p-5">
                    <Link href={`/products/${l.productSlug}`} className="relative size-20 md:size-24 shrink-0 rounded-xl bg-cream overflow-hidden"><Image src={l.image} alt={l.name} fill sizes="96px" className="object-contain p-2" unoptimized /></Link>
                    <div className="flex-1 min-w-0">
                      <Link href={`/products/${l.productSlug}`} className="font-semibold hover:underline line-clamp-2">{l.name}</Link>
                      {l.variantLabel !== 'Standard' && <p className="text-sm text-muted">{l.variantLabel}</p>}
                      <div className="flex flex-wrap items-baseline gap-2 mt-1">
                        <span className="price">{formatMoney(l.unitPaise)}</span>
                        {l.mrpPaise > l.unitPaise && <span className="mrp text-sm">{formatMoney(l.mrpPaise)}</span>}
                        {l.priceSource === 'TIER' && <Badge tone="info">Bulk price</Badge>}
                        {l.priceSource === 'DEAL' && <Badge tone="danger">Deal price</Badge>}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mt-3">
                        <div className="flex items-center rounded-lg border border-line-strong" role="group" aria-label={`Quantity of ${l.name}`}>
                          <button className="btn btn-ghost btn-icon size-9 min-h-9" aria-label="Decrease" onClick={() => (l.quantity > 1 ? setQuantity(l.listingId, l.quantity - 1) : remove(l.listingId))}><Minus size={15} /></button>
                          <span className="w-10 text-center font-semibold tabular-nums" aria-live="polite">{l.quantity}</span>
                          <button className="btn btn-ghost btn-icon size-9 min-h-9" aria-label="Increase" onClick={() => setQuantity(l.listingId, l.quantity + 1)}><Plus size={15} /></button>
                        </div>
                        <button className="text-sm text-muted hover:text-ink inline-flex items-center gap-1" onClick={() => saveForLater(l.listingId, true)}><Bookmark size={14} />Save for later</button>
                        <button className="text-sm text-muted hover:text-danger inline-flex items-center gap-1" onClick={() => remove(l.listingId)}><Trash2 size={14} />Remove</button>
                      </div>
                    </div>
                    <p className="price text-right">{formatMoney(l.totalPaise)}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {quote?.problems.map((p) => (
            <div key={p.listingId} className="card p-4 flex items-center gap-3 border-warning/40">
              <AlertTriangle size={18} className="text-warning shrink-0" />
              <p className="flex-1 text-sm">{p.message}</p>
              <button className="btn btn-outline btn-sm" onClick={() => remove(p.listingId)}>Remove</button>
            </div>
          ))}
          {unknown.map((l) => <div key={l.listingId} className="card p-4 flex items-center gap-3"><p className="flex-1 text-sm text-muted">An item in your cart is no longer available.</p><button className="btn btn-outline btn-sm" onClick={() => remove(l.listingId)}>Remove</button></div>)}
          {!quote && !error && <Skeleton className="h-64" />}
        </div>

        <aside className="card card-pad lg:sticky lg:top-40" aria-label="Order summary">
          <h2 className="text-xl mb-4">Order summary</h2>
          <form className="flex gap-2 mb-1" onSubmit={(e) => { e.preventDefault(); setApplied(coupon.trim().toUpperCase() || undefined); }}>
            <label htmlFor="coupon" className="sr-only">Coupon code</label>
            <div className="relative flex-1"><Tag size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input id="coupon" className="input pl-9 min-h-[42px] uppercase" placeholder="Coupon code" value={coupon} onChange={(e) => setCoupon(e.target.value)} /></div>
            <Button variant="outline" size="sm" className="min-h-[42px]">Apply</Button>
          </form>
          {couponError && <p className="error-text mb-2">{couponError} <button className="link" onClick={() => { setApplied(undefined); setCoupon(''); }}>Remove</button></p>}
          {quote?.coupon && <p className="text-sm text-success mb-2">“{quote.coupon.code}” applied — {quote.coupon.description} <button className="link ml-1" onClick={() => { setApplied(undefined); setCoupon(''); }}>Remove</button></p>}
          <dl className={cn('grid gap-2 text-[15px] mt-4', isFetching && 'opacity-60')}>
            <div className="flex justify-between"><dt className="text-muted">Items</dt><dd>{formatMoney(quote?.subtotalPaise)}</dd></div>
            {!!quote?.discountPaise && <div className="flex justify-between text-success"><dt>Coupon discount</dt><dd>−{formatMoney(quote.discountPaise)}</dd></div>}
            <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd>{quote ? (quote.shippingPaise ? formatMoney(quote.shippingPaise) : 'Free') : '—'}</dd></div>
            <div className="flex justify-between border-t border-line pt-3 mt-1 text-lg font-bold"><dt>Total</dt><dd>{formatMoney(quote?.totalPaise)}</dd></div>
          </dl>
          <p className="text-[12.5px] text-muted mt-1">Prices include GST. Exact tax is shown at checkout once your address is known.</p>
          <Link href="/checkout" aria-disabled={!quote?.lines.length} className={cn('btn btn-primary btn-lg w-full mt-5', !quote?.lines.length && 'pointer-events-none opacity-50')}>Proceed to checkout<ArrowRight size={18} /></Link>
          <p className="text-center text-[12.5px] text-muted mt-3">Secure checkout · Card details never stored by IBazzzar</p>
        </aside>
      </div>
      <SavedForLater />
    </div>
  );
}
