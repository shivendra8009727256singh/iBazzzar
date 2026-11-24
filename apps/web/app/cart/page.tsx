'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ShoppingBag, Minus, Plus, Trash2, Bookmark, Truck, Tag, Store, ArrowRight, AlertTriangle, MapPin, Check, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { ApiError, post } from '@/lib/api';
import { formatMoney, cn, percentOff } from '@/lib/format';
import type { Quote } from '@/lib/types';
import { useCart } from '@/components/providers';
import { useQuote } from '@/components/use-quote';
import { PriceDetails } from '@/components/price-details';
import { Empty, Alert, Skeleton } from '@/components/ui';

function SavedForLater() {
  const { saved, saveForLater, remove } = useCart();
  const { data } = useQuery({
    queryKey: ['saved-lines', saved.map((s) => s.listingId)],
    queryFn: () => post<{ quote: Quote }>('/cart/quote', { items: saved.map((s) => ({ listingId: s.listingId, quantity: 1 })) }).then((r) => r.quote).catch(() => null),
    enabled: saved.length > 0,
  });
  if (!saved.length) return null;
  return (
    <section className="rounded-2xl border border-line bg-white shadow-card mt-5 overflow-hidden" aria-labelledby="saved-title">
      <h2 id="saved-title" className="px-5 py-4 border-b border-line text-lg">Saved for later ({saved.length})</h2>
      <ul className="divide-y divide-line">
        {saved.map((s) => {
          const line = data?.lines.find((l) => l.listingId === s.listingId);
          return (
            <li key={s.listingId} className="p-5 flex gap-4 items-center">
              {line ? <span className="relative size-16 shrink-0 rounded-xl bg-white border border-line"><Image src={line.image} alt="" fill sizes="64px" className="object-contain p-1.5" unoptimized /></span> : <Skeleton className="size-16" />}
              <div className="flex-1 min-w-0"><p className="font-semibold truncate">{line?.name ?? 'Item'}</p><p className="text-sm font-bold mt-0.5">{line ? formatMoney(line.unitPaise) : <span className="text-muted font-normal">Unavailable</span>}</p></div>
              <div className="flex gap-4 text-sm font-semibold"><button className="text-forest hover:underline" onClick={() => saveForLater(s.listingId, false)}>Move to cart</button><button className="text-muted hover:text-danger" onClick={() => remove(s.listingId)}>Remove</button></div>
            </li>
          );
        })}
      </ul>
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
  // A coupon that stops qualifying (e.g. the cart drops below its minimum) is removed with the reason, and the cart is
  // re-priced without it; otherwise the last good quote (old quantities) would keep showing.
  const [couponNotice, setCouponNotice] = useState<string | null>(null);
  useEffect(() => {
    if (applied && error instanceof ApiError && error.fields?.coupon) { setCouponNotice(`${applied}: ${error.message}`); setApplied(undefined); }
  }, [applied, error]);
  const couponError = couponNotice;
  useEffect(() => { try { if (applied && !error) sessionStorage.setItem('ibazzzar.coupon', applied); else sessionStorage.removeItem('ibazzzar.coupon'); } catch { /* ignore */ } }, [applied, error]);

  if (!ready) return <div className="container-page py-10"><Skeleton className="h-10 w-48 mb-6" /><Skeleton className="h-64" /></div>;
  if (!lines.length) {
    return (
      <div className="bg-[#f5f6f2] min-h-[70vh]">
        <div className="container-page py-12">
          <div className="rounded-2xl border border-line bg-white shadow-card"><Empty icon={<ShoppingBag size={26} />} title="Your cart is empty" body="Find something you love, or switch to Business mode for wholesale prices." action={<div className="flex gap-2"><Link href="/products" className="btn btn-primary">Start shopping</Link><Link href="/wholesale" className="btn btn-outline">Wholesale</Link></div>} /></div>
          <SavedForLater />
        </div>
      </div>
    );
  }

  const problemFor = (id: string) => quote?.problems.find((p) => p.listingId === id)?.message;
  const unknown = quote ? lines.filter((l) => !quote.lines.some((q) => q.listingId === l.listingId) && !problemFor(l.listingId)) : [];
  const count = lines.reduce((s, l) => s + l.quantity, 0);

  return (
    <div className="bg-[#f5f6f2] min-h-screen pb-28 lg:pb-12">
      <div className="container-page py-5 md:py-6">
        <div className="grid gap-5 lg:grid-cols-[1fr_380px] items-start">
          <div className="grid gap-4 min-w-0">
            {/* Header: title, mode and delivery PIN */}
            <div className="rounded-2xl border border-line bg-white shadow-card px-5 py-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl">Your cart</h1>
                <p className="text-sm text-muted">{count} item{count === 1 ? '' : 's'}{quote ? ` from ${quote.sellers.length} seller${quote.sellers.length === 1 ? '' : 's'}` : ''}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 text-sm text-muted"><MapPin size={15} className="text-forest" />{pincode ? <>Deliver to <strong className="text-ink">{pincode}</strong></> : 'Delivery PIN set at checkout'}</span>
                <div className="inline-flex rounded-full bg-mint p-0.5 text-sm" role="radiogroup" aria-label="Pricing">
                  {(['RETAIL', 'BUSINESS'] as const).map((m) => <button key={m} role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={cn('rounded-full px-3 py-1.5 font-semibold transition', mode === m ? 'bg-white text-forest shadow-sm' : 'text-muted')}>{m === 'RETAIL' ? 'Personal prices' : 'Business prices'}</button>)}
                </div>
              </div>
            </div>
            {error && !(error instanceof ApiError && error.fields?.coupon) && <Alert>{(error as Error).message}</Alert>}

            {quote?.sellers.map((g) => {
              const sellerLines = quote.lines.filter((l) => l.sellerId === g.sellerId);
              // Free delivery is judged on the items' value before any coupon (same rule as the server).
              const itemsValue = sellerLines.reduce((s, l) => s + l.lineTotalPaise, 0);
              const remaining = quote.freeShippingThresholdPaise - itemsValue;
              return (
                <section key={g.sellerId} className="rounded-2xl border border-line bg-white shadow-card overflow-hidden" aria-label={`Items from ${g.sellerName}`}>
                  <header className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-line bg-[#fbfaf5]">
                    <p className="font-semibold flex items-center gap-2"><Store size={16} className="text-forest" />Sold by {g.sellerName}</p>
                    <p className="text-sm text-muted flex items-center gap-1.5"><Truck size={15} />{g.shippingPaise ? `Delivery ${formatMoney(g.shippingPaise)}` : <span className="text-success font-semibold">Free delivery</span>}{g.estimate?.serviceable && ` · ${g.estimate.minDays}–${g.estimate.maxDays} days`}</p>
                  </header>
                  {g.shippingPaise > 0 && remaining > 0 && (
                    <div className="px-5 pt-3">
                      <p className="text-[13px] text-muted">Add <strong className="text-ink">{formatMoney(remaining)}</strong> more from this seller for free delivery</p>
                      <div className="h-1.5 rounded-full bg-mint mt-1.5 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-gold to-gold-light" style={{ width: `${Math.min(100, (itemsValue / quote.freeShippingThresholdPaise) * 100)}%` }} /></div>
                    </div>
                  )}
                  <ul className="divide-y divide-line">
                    {sellerLines.map((l) => {
                      const off = percentOff(l.unitPaise, l.mrpPaise);
                      return (
                        <li key={l.listingId} className="p-5">
                          <div className="flex gap-4">
                            <Link href={`/products/${l.productSlug}`} className="relative size-24 md:size-28 shrink-0 rounded-xl bg-white border border-line overflow-hidden"><Image src={l.image} alt={l.name} fill sizes="112px" className="object-contain p-2" unoptimized /></Link>
                            <div className="flex-1 min-w-0">
                              <Link href={`/products/${l.productSlug}`} className="font-semibold hover:text-forest line-clamp-2">{l.name}</Link>
                              {l.variantLabel !== 'Standard' && <p className="text-sm text-muted">{l.variantLabel}</p>}
                              <p className="text-[12.5px] text-muted mt-0.5">Seller: {l.sellerName}</p>
                              <div className="flex flex-wrap items-baseline gap-2 mt-2">
                                {l.mrpPaise > l.unitPaise && <span className="text-sm text-muted line-through">{formatMoney(l.mrpPaise)}</span>}
                                <span className="text-lg font-bold">{formatMoney(l.unitPaise)}</span>
                                {off > 0 && <span className="text-sm font-bold text-success">{off}% off</span>}
                                {l.priceSource === 'TIER' && <span className="rounded bg-info-bg text-info text-[11px] font-bold px-1.5 py-0.5">Bulk price</span>}
                                {l.priceSource === 'DEAL' && <span className="rounded bg-danger text-white text-[11px] font-bold px-1.5 py-0.5">Deal price</span>}
                              </div>
                              {l.quantity > 1 && <p className="text-[13px] text-muted mt-0.5">{l.quantity} × {formatMoney(l.unitPaise)} = <strong className="text-ink">{formatMoney(l.lineTotalPaise)}</strong></p>}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-5 mt-4">
                            <div className="flex items-center gap-2" role="group" aria-label={`Quantity of ${l.name}`}>
                              <button className="size-8 rounded-full border border-line-strong grid place-items-center hover:border-forest" aria-label="Decrease" onClick={() => (l.quantity > 1 ? setQuantity(l.listingId, l.quantity - 1) : remove(l.listingId))}><Minus size={14} /></button>
                              <span className="w-10 text-center font-bold tabular-nums border border-line rounded-md py-0.5" aria-live="polite">{l.quantity}</span>
                              <button className="size-8 rounded-full border border-line-strong grid place-items-center hover:border-forest" aria-label="Increase" onClick={() => setQuantity(l.listingId, l.quantity + 1)}><Plus size={14} /></button>
                            </div>
                            <button className="text-sm font-semibold uppercase tracking-wide text-ink/80 hover:text-forest inline-flex items-center gap-1.5" onClick={() => saveForLater(l.listingId, true)}><Bookmark size={15} />Save for later</button>
                            <button className="text-sm font-semibold uppercase tracking-wide text-ink/80 hover:text-danger inline-flex items-center gap-1.5" onClick={() => remove(l.listingId)}><Trash2 size={15} />Remove</button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
            {quote?.problems.map((p) => (
              <div key={p.listingId} className="rounded-2xl border border-warning/40 bg-white p-4 flex items-center gap-3">
                <AlertTriangle size={18} className="text-warning shrink-0" />
                <p className="flex-1 text-sm">{p.message}</p>
                <button className="btn btn-outline btn-sm" onClick={() => remove(p.listingId)}>Remove</button>
              </div>
            ))}
            {unknown.map((l) => <div key={l.listingId} className="rounded-2xl border border-line bg-white p-4 flex items-center gap-3"><p className="flex-1 text-sm text-muted">An item in your cart is no longer available.</p><button className="btn btn-outline btn-sm" onClick={() => remove(l.listingId)}>Remove</button></div>)}
            {!quote && !error && <Skeleton className="h-64 rounded-2xl" />}
            <SavedForLater />
          </div>

          <aside className="lg:sticky lg:top-32 grid gap-4" aria-label="Order summary">
            <section className="rounded-2xl border border-line bg-white shadow-card p-5">
              <p className="font-semibold flex items-center gap-2 mb-3"><Tag size={16} className="text-forest" />Apply a coupon</p>
              {quote?.coupon ? (
                <div className="flex items-start gap-2 rounded-xl border border-success/30 bg-success-bg px-3 py-2.5 text-sm">
                  <Check size={16} className="text-success mt-0.5" />
                  <p className="flex-1"><strong>{quote.coupon.code}</strong> applied<br /><span className="text-muted">{quote.coupon.description}</span></p>
                  <button aria-label="Remove coupon" className="text-muted hover:text-danger" onClick={() => { setApplied(undefined); setCoupon(''); }}><X size={16} /></button>
                </div>
              ) : (
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setCouponNotice(null); setApplied(coupon.trim().toUpperCase() || undefined); }}>
                  <label htmlFor="coupon" className="sr-only">Coupon code</label>
                  <input id="coupon" className="input min-h-[42px] uppercase" placeholder="Enter coupon code" value={coupon} onChange={(e) => setCoupon(e.target.value)} />
                  <button className="btn btn-outline btn-sm min-h-[42px] px-4">Apply</button>
                </form>
              )}
              {couponError && <p className="error-text mt-2" role="alert">{couponError}</p>}
            </section>
            <PriceDetails quote={quote} fetching={isFetching}>
              <Link href="/checkout" aria-disabled={!quote?.lines.length} className={cn('btn btn-primary btn-lg w-full h-13 text-[16px]', !quote?.lines.length && 'pointer-events-none opacity-50')}>Proceed to checkout<ArrowRight size={18} /></Link>
            </PriceDetails>
          </aside>
        </div>
      </div>

      {/* Phones: total and the checkout button stay in reach */}
      {quote && (
        <div className="lg:hidden fixed bottom-[56px] inset-x-0 z-30 bg-white border-t border-line px-4 py-2.5 flex items-center gap-3 shadow-lift">
          <div className="flex-1 min-w-0"><p className="text-lg font-bold leading-tight">{formatMoney(quote.totalPaise)}</p><a href="#price" className="text-xs text-forest font-semibold">View price details</a></div>
          <Link href="/checkout" className="btn btn-primary" aria-label="Checkout">Place order</Link>
        </div>
      )}
    </div>
  );
}
