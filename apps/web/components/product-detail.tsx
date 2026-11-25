'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Heart, Minus, Plus, Truck, RotateCcw, ShieldCheck, Store, BadgeCheck, Banknote, MapPin, Building2, ZoomIn, ShoppingCart, Zap, Tag, Star,
  ChevronRight, Share2, Award, Package,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Estimate, Product, Review } from '@/lib/types';
import { cn, formatMoney, formatDate, percentOff, pct } from '@/lib/format';
import { useCart } from './providers';
import { Badge, Button, Modal } from './ui';
import { Countdown } from './home-parts';
import { ProductReviews, useReviewPage } from './reviews';

export type Detail = {
  product: {
    id: string; slug: string; name: string; brand: { name: string; slug: string }; category: { name: string; slug: string; parent: { name: string; slug: string } | null };
    description: string; highlights: string[]; hsnCode: string | null; images: { url: string; alt: string }[]; specifications: { name: string; value: string }[];
    rating: { average: number; count: number } | null; demo: boolean; ratingBreakdown?: { stars: number; count: number }[];
  };
  variants: { id: string; slug: string; label: string; listingId: string; pricePaise: number; mrpPaise: number; stock: number }[];
  selectedVariantId: string;
  offer: Product;
  offers: Product[];
  sellers: { id: string; slug: string; name: string; description: string; primaryCategory: string | null }[];
  reviews: Review[];
  related: Product[];
};
type Offer = { code: string; description: string; kind: string; value: number; maxDiscountPaise: number | null; minOrderPaise: number; mode: string; endsAt: string };

/** Green rating chip, the quick-scan rating style shoppers in India are used to. */
export function RatingPill({ value, className }: { value: number; className?: string }) {
  const tone = value >= 4 ? 'bg-success' : value >= 3 ? 'bg-[#c27c0e]' : 'bg-danger';
  return <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12.5px] font-bold text-white', tone, className)}>{value.toFixed(1)}<Star size={11} fill="currentColor" /></span>;
}

// ───────────── Gallery ─────────────
function Gallery({ images, name }: { images: { url: string; alt: string }[]; name: string }) {
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [origin, setOrigin] = useState('50% 50%');
  const list = images.length ? images : [{ url: '/products/placeholder.svg', alt: name }];
  const img = list[active] ?? list[0];
  return (
    <div className="grid gap-3 md:grid-cols-[76px_1fr]">
      <div className="order-2 md:order-1 flex md:flex-col gap-2 overflow-x-auto md:max-h-[520px]" role="tablist" aria-label="Product photos">
        {list.map((im, i) => (
          <button key={im.url + i} role="tab" aria-selected={i === active} aria-label={`Photo ${i + 1}`} onMouseEnter={() => setActive(i)} onClick={() => setActive(i)}
            className={cn('relative size-16 md:size-[76px] shrink-0 rounded-xl border-2 bg-white overflow-hidden transition', i === active ? 'border-forest shadow-card' : 'border-line hover:border-line-strong')}>
            <Image src={im.url} alt="" fill sizes="76px" className="object-contain p-2" unoptimized={im.url.startsWith('/api/')} />
          </button>
        ))}
      </div>
      <div className="order-1 md:order-2 relative aspect-square rounded-2xl border border-line bg-white overflow-hidden group cursor-zoom-in"
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`); }}
        onClick={() => setZoom(true)}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,#f7f3e6,transparent_70%)]" aria-hidden />
        <Image src={img.url} alt={img.alt} fill priority sizes="(min-width:1024px) 520px, 100vw" style={{ transformOrigin: origin }} className="object-contain p-10 transition-transform duration-300 md:group-hover:scale-[1.9]" unoptimized={img.url.startsWith('/api/')} />
        <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-white/90 border border-line px-2.5 py-1 text-xs font-medium text-muted"><ZoomIn size={13} />Hover to zoom · click to enlarge</span>
      </div>
      <Modal open={zoom} onOpenChange={setZoom} title={name} wide>
        <div className="relative aspect-square bg-white rounded-xl"><Image src={img.url} alt={img.alt} fill sizes="90vw" className="object-contain p-4" unoptimized={img.url.startsWith('/api/')} /></div>
        {list.length > 1 && <div className="flex gap-2 mt-3 justify-center">{list.map((im, i) => <button key={im.url + i} onClick={() => setActive(i)} aria-label={`Photo ${i + 1}`} className={cn('relative size-14 rounded-lg border-2', i === active ? 'border-forest' : 'border-line')}><Image src={im.url} alt="" fill sizes="56px" className="object-contain p-1" unoptimized /></button>)}</div>}
      </Modal>
    </div>
  );
}

// ───────────── Delivery ─────────────
function DeliveryCheck({ listingId }: { listingId: string }) {
  const [pincode, setPincode] = useState('');
  const [result, setResult] = useState<{ estimate: Estimate; freeShippingThresholdPaise: number; from?: string; to?: string } | null>(null);
  const [error, setError] = useState<string>();
  const check = async (e: React.FormEvent) => {
    e.preventDefault(); setError(undefined);
    try {
      const r = await api<{ estimate: Estimate; freeShippingThresholdPaise: number }>(`/delivery/estimate?listingId=${listingId}&pincode=${pincode}`);
      const day = (d: number) => formatDate(new Date(Date.now() + d * 86_400_000), { weekday: 'short', day: 'numeric', month: 'short' });
      setResult({ ...r, from: r.estimate.minDays != null ? day(r.estimate.minDays) : undefined, to: r.estimate.maxDays != null ? day(r.estimate.maxDays) : undefined });
      try { localStorage.setItem('ibazzzar.pincode', pincode); } catch { /* ignore */ }
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not check'); setResult(null); }
  };
  const e = result?.estimate;
  return (
    <div>
      <form onSubmit={check} className="flex items-center gap-2 border-b-2 border-forest/70 max-w-sm pb-1">
        <MapPin size={17} className="text-forest shrink-0" />
        <label htmlFor="pdp-pin" className="sr-only">Delivery PIN code</label>
        <input id="pdp-pin" inputMode="numeric" maxLength={6} placeholder="Enter delivery PIN code" className="flex-1 min-w-0 bg-transparent py-1.5 font-semibold outline-none placeholder:font-normal" value={pincode} onChange={(ev) => setPincode(ev.target.value.replace(/\D/g, ''))} />
        <button className="text-forest font-bold text-sm px-2 disabled:text-muted" disabled={pincode.length !== 6}>Check</button>
      </form>
      {error && <p className="error-text mt-2">{error}</p>}
      {e && (e.serviceable ? (
        <div className="mt-3 grid gap-1.5 text-[14px]">
          <p className="flex items-center gap-2"><Truck size={16} className="text-success" />Estimated delivery <strong>{result?.from} – {result?.to}</strong></p>
          <p className="flex items-center gap-2"><Banknote size={16} className={e.codAvailable ? 'text-success' : 'text-muted'} />{e.codAvailable ? 'Cash on delivery available' : 'Cash on delivery not available here'}</p>
          <p className="text-muted text-[12.5px]">Free delivery from this seller on orders over {formatMoney(result!.freeShippingThresholdPaise)}. Dates are estimates.</p>
        </div>
      ) : <p className="mt-3 text-danger text-[14px]">{e.reason}</p>)}
      {!e && !error && <p className="text-[12.5px] text-muted mt-2">Check delivery date and cash on delivery for your area.</p>}
    </div>
  );
}

/** One labelled row on the right-hand side, like “Delivery”, “Highlights”, “Seller”. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[110px_1fr] sm:gap-6 py-4 border-t border-line first:border-t-0">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// ───────────── Reviews ─────────────
/** "4.2★ 120 ratings & 120 reviews", read live so a new review counts at once (falls back to the page's figures). */
function RatingLine({ data }: { data: Detail }) {
  const p = data.product;
  const live = useReviewPage(p.id, { size: 5, sort: 'helpful' }).data?.summary;
  const average = live?.average ?? p.rating?.average ?? null;
  const count = live?.count ?? p.rating?.count ?? 0;
  if (!count || average == null) return <a href="#reviews" className="text-sm text-muted hover:text-ink">Be the first to review</a>;
  return <a href="#reviews" className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink"><RatingPill value={average} />{count.toLocaleString('en-IN')} rating{count === 1 ? '' : 's'} & review{count === 1 ? '' : 's'}{live?.withPhotos ? ` · ${live.withPhotos} with photos` : ''}</a>;
}

// ───────────── Page ─────────────
export function ProductDetail({ data }: { data: Detail }) {
  const router = useRouter();
  const { add, mode, wishlist, toggleWishlist } = useCart();
  const [offerId, setOfferId] = useState(data.offer.listingId);
  const offer = data.offers.find((o) => o.listingId === offerId) ?? data.offer;
  const business = mode === 'BUSINESS' && offer.wholesaleEnabled;
  const minQty = business ? Math.max(offer.moq, offer.bulkPackUnits) : 1;
  const step = business ? offer.bulkPackUnits : 1;
  const [qty, setQty] = useState(minQty);
  const quantity = Math.max(qty, minQty);
  const [busy, setBusy] = useState<'add' | 'buy' | null>(null);
  const [showAllSpecs, setShowAllSpecs] = useState(false);
  const p = data.product;
  const saved = wishlist.has(p.id);
  const seller = data.sellers.find((s) => s.id === offer.sellerId);
  const { data: offers } = useQuery({ queryKey: ['public-offers'], queryFn: () => api<{ offers: Offer[] }>('/offers').then((r) => r.offers), staleTime: 300_000 });

  const unit = useMemo(() => {
    if (!business) return offer.pricePaise;
    const tier = [...offer.tiers].filter((t) => t.minQty <= quantity).sort((a, b) => b.minQty - a.minQty)[0];
    return Math.min(tier?.pricePaise ?? offer.listPricePaise, offer.pricePaise);
  }, [business, offer, quantity]);
  const off = percentOff(unit, offer.mrpPaise);

  const go = async (buy: boolean) => {
    setBusy(buy ? 'buy' : 'add');
    try {
      await add(offer.listingId, quantity);
      if (buy) router.push('/checkout'); else toast.success('Added to cart', { action: { label: 'View cart', onClick: () => router.push('/cart') } });
    } catch { /* toast already shown */ } finally { setBusy(null); }
  };
  const share = async () => {
    const url = window.location.href;
    try { if (navigator.share) await navigator.share({ title: p.name, url }); else { await navigator.clipboard.writeText(url); toast.success('Link copied'); } } catch { /* cancelled */ }
  };
  const out = offer.stock < minQty;
  const specs: [string, string][] = [['Brand', p.brand.name], ['Category', p.category.name], ...p.specifications.map((s) => [s.name, s.value] as [string, string]), ...(p.hsnCode ? [['HSN code', p.hsnCode] as [string, string]] : []), ['GST rate', offer.taxRateBps ? pct(offer.taxRateBps) : 'Not charged (seller not GST-registered)']];
  const shownSpecs = showAllSpecs ? specs : specs.slice(0, 8);

  return (
    <div className="bg-[#f5f6f2] pb-24 lg:pb-12">
      <div className="container-page py-4 md:py-6">
        <nav aria-label="Breadcrumb" className="text-[13px] text-muted mb-4">
          <ol className="flex flex-wrap items-center gap-1">
            <li><Link href="/" className="hover:text-forest">Home</Link></li>
            <ChevronRight size={13} /><li><Link href="/products" className="hover:text-forest">Products</Link></li>
            {p.category.parent && <><ChevronRight size={13} /><li><Link href={`/products?category=${p.category.parent.slug}`} className="hover:text-forest">{p.category.parent.name}</Link></li></>}
            <ChevronRight size={13} /><li><Link href={`/products?category=${p.category.slug}`} className="hover:text-forest">{p.category.name}</Link></li>
            <ChevronRight size={13} /><li><Link href={`/products?brand=${p.brand.slug}`} className="hover:text-forest">{p.brand.name}</Link></li>
            <ChevronRight size={13} /><li aria-current="page" className="text-ink line-clamp-1 max-w-[40ch]">{p.name}</li>
          </ol>
        </nav>

        <div className="card p-4 md:p-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-10">
          {/* Left: gallery and the two main buttons, kept in view while the details scroll */}
          <div className="lg:sticky lg:top-28 self-start">
            <div className="relative">
              <Gallery images={p.images} name={p.name} />
              <div className="absolute top-3 right-3 flex flex-col gap-2">
                <button onClick={() => toggleWishlist(p.id)} aria-pressed={saved} aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'} className="size-10 rounded-full bg-white border border-line shadow-card grid place-items-center hover:scale-105 transition">
                  <Heart size={19} className={saved ? 'fill-danger text-danger' : 'text-muted'} />
                </button>
                <button onClick={share} aria-label="Share" className="size-10 rounded-full bg-white border border-line shadow-card grid place-items-center hover:scale-105 transition"><Share2 size={17} className="text-muted" /></button>
              </div>
            </div>
            <div className="hidden lg:grid grid-cols-2 gap-3 mt-5 md:pl-[88px]">
              <Button size="lg" variant="gold" className="h-14 text-[16px]" loading={busy === 'add'} disabled={out || quantity > offer.stock} onClick={() => go(false)}><ShoppingCart size={19} />Add to Cart</Button>
              <Button size="lg" className="h-14 text-[16px]" loading={busy === 'buy'} disabled={out || quantity > offer.stock} onClick={() => go(true)}><Zap size={19} />Buy Now</Button>
            </div>
          </div>

          {/* Right: details */}
          <div className="min-w-0">
            <Link href={`/products?brand=${p.brand.slug}`} className="eyebrow hover:underline">{p.brand.name}</Link>
            <h1 className="text-[24px] md:text-[30px] leading-tight mt-1">{p.name}</h1>
            <div className="flex flex-wrap items-center gap-3 mt-2.5">
              <RatingLine data={data} />
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-forest bg-mint rounded-full px-2 py-0.5"><Award size={13} />IBazzzar verified seller</span>
              {p.demo && <Badge tone="gold">Demonstration product</Badge>}
            </div>

            {/* Price */}
            <div className="mt-5">
              {offer.promotion ? (
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="rounded-md bg-danger text-white text-xs font-bold px-2 py-0.5">{offer.promotion.name}</span>
                  <span className="text-sm text-danger font-semibold">Ends in <Countdown endsAt={offer.promotion.endsAt} /></span>
                </div>
              ) : off >= 5 && <p className="text-success text-sm font-semibold mb-1">Special price</p>}
              <div className="flex flex-wrap items-end gap-3">
                <span className="text-[34px] font-bold leading-none tabular-nums">{formatMoney(unit)}</span>
                {offer.mrpPaise > unit && <span className="text-lg text-muted line-through">{formatMoney(offer.mrpPaise)}</span>}
                {off > 0 && <span className="text-lg font-bold text-success">{off}% off</span>}
              </div>
              <p className="text-[12.5px] text-muted mt-1.5">Inclusive of all taxes{offer.taxRateBps ? ` (GST ${pct(offer.taxRateBps)})` : ''} · delivery charges, if any, are shown before you pay</p>
            </div>

            {/* Offers */}
            {offers && offers.length > 0 && (
              <div className="mt-5">
                <p className="font-semibold mb-2">Available offers</p>
                <ul className="grid gap-2 text-[14px]">
                  {offers.filter((o) => o.mode !== 'BUSINESS' || business).slice(0, 4).map((o) => (
                    <li key={o.code} className="flex gap-2"><Tag size={16} className="text-success shrink-0 mt-0.5" /><span><span className="font-semibold">Coupon {o.code}</span> · {o.description}<span className="text-muted"> · apply in cart</span></span></li>
                  ))}
                  {offer.codAllowed && <li className="flex gap-2"><Tag size={16} className="text-success shrink-0 mt-0.5" /><span><span className="font-semibold">Pay on delivery</span> available on eligible PIN codes</span></li>}
                </ul>
              </div>
            )}

            {/* Business pricing */}
            {business && offer.tiers.length > 0 && (
              <div className="mt-5 rounded-xl border border-gold/40 bg-[#fffaf0] p-4">
                <p className="text-sm font-semibold flex items-center gap-1.5"><Building2 size={15} className="text-gold-ink" />Business pricing · MOQ {offer.moq}{offer.bulkPackUnits > 1 ? ` · packs of ${offer.bulkPackUnits}` : ''}</p>
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {offer.tiers.map((t, i) => {
                    const active = quantity >= t.minQty && (i === offer.tiers.length - 1 || quantity < offer.tiers[i + 1].minQty);
                    return (
                      <button key={t.minQty} type="button" onClick={() => setQty(t.minQty)} className={cn('rounded-lg border p-2.5 text-left transition', active ? 'border-forest bg-white shadow-card' : 'border-line bg-white/60 hover:border-forest/50')}>
                        <span className="block text-xs text-muted">{t.minQty}{offer.tiers[i + 1] ? `–${offer.tiers[i + 1].minQty - 1}` : '+'} units</span>
                        <span className="block font-bold">{formatMoney(t.pricePaise)}</span>
                        <span className="block text-xs text-success font-semibold">{percentOff(t.pricePaise, offer.listPricePaise)}% off</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[13px] text-muted mt-2">Subtotal at {quantity} units: <strong className="text-ink">{formatMoney(unit * quantity)}</strong></p>
              </div>
            )}
            {!business && offer.wholesaleEnabled && offer.tiers.length > 0 && (
              <p className="mt-4 text-[13.5px] rounded-lg bg-cream px-3 py-2"><Building2 size={14} className="inline mr-1 text-forest" />Buying for a business? Bulk prices from <strong>{formatMoney(Math.min(...offer.tiers.map((t) => t.pricePaise)))}</strong> — switch to <strong>Business</strong> mode at the top.</p>
            )}

            <div className="mt-4">
              {data.variants.length > 1 && (
                <Row label="Variant">
                  <div className="flex flex-wrap gap-2">
                    {data.variants.map((v) => (
                      <Link key={v.id} href={`/products/${v.slug}`} scroll={false} aria-current={v.id === data.selectedVariantId ? 'true' : undefined}
                        className={cn('rounded-lg border-2 px-4 py-2 text-sm font-semibold transition', v.id === data.selectedVariantId ? 'border-forest text-forest bg-mint' : 'border-line hover:border-forest/50', v.stock === 0 && 'opacity-50 line-through')}>
                        {v.label}
                      </Link>
                    ))}
                  </div>
                </Row>
              )}
              <Row label="Quantity">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center rounded-full border border-line-strong bg-white" role="group" aria-label="Quantity">
                    <button className="size-9 grid place-items-center rounded-full hover:bg-mint disabled:opacity-40" aria-label="Decrease quantity" disabled={quantity <= minQty} onClick={() => setQty(Math.max(minQty, quantity - step))}><Minus size={15} /></button>
                    <input aria-label="Quantity" inputMode="numeric" className="w-12 text-center font-bold outline-none bg-transparent" value={quantity} onChange={(e) => setQty(Number(e.target.value.replace(/\D/g, '')) || minQty)} />
                    <button className="size-9 grid place-items-center rounded-full hover:bg-mint disabled:opacity-40" aria-label="Increase quantity" disabled={quantity + step > offer.stock} onClick={() => setQty(quantity + step)}><Plus size={15} /></button>
                  </div>
                  <p className={cn('text-sm font-semibold', out ? 'text-danger' : offer.stock <= 5 ? 'text-warning' : 'text-success')}>{out ? 'Out of stock' : offer.stock <= 5 ? `Hurry, only ${offer.stock} left` : 'In stock'}</p>
                </div>
              </Row>
              <Row label="Delivery"><DeliveryCheck listingId={offer.listingId} /></Row>
              {p.highlights.length > 0 && (
                <Row label="Highlights">
                  <ul className="grid gap-1.5 text-[14.5px] list-disc pl-5 marker:text-muted">{p.highlights.map((h) => <li key={h}>{h}</li>)}</ul>
                </Row>
              )}
              <Row label="Services">
                <ul className="grid gap-2 text-[14px]">
                  <li className="flex items-center gap-2"><RotateCcw size={16} className="text-forest" />{offer.returnable ? 'Easy returns within the return window' : 'This item can’t be returned'}</li>
                  <li className="flex items-center gap-2"><Banknote size={16} className="text-forest" />{offer.codAllowed ? 'Cash on delivery available' : 'Prepaid only'}</li>
                  <li className="flex items-center gap-2"><ShieldCheck size={16} className="text-forest" />GST tax invoice from the seller</li>
                </ul>
              </Row>
              <Row label="Seller">
                <div className="flex items-start gap-3">
                  <span className="size-10 shrink-0 rounded-xl bg-emerald text-gold-light grid place-items-center"><Store size={18} /></span>
                  <div className="min-w-0">
                    <Link href={`/sellers/${offer.sellerSlug}`} className="font-semibold text-forest hover:underline flex items-center gap-1.5">{offer.sellerName}<BadgeCheck size={15} /></Link>
                    {seller?.description && <p className="text-[13px] text-muted mt-0.5 line-clamp-2">{seller.description}</p>}
                  </div>
                </div>
                {data.offers.length > 1 && (
                  <div className="mt-4">
                    <p className="text-sm font-semibold mb-2">{data.offers.length} sellers offer this item</p>
                    <div className="grid gap-2" role="radiogroup" aria-label="Choose a seller">
                      {data.offers.map((o) => (
                        <label key={o.listingId} className={cn('flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition', o.listingId === offerId ? 'border-forest bg-mint' : 'border-line hover:border-line-strong')}>
                          <input type="radio" name="offer" className="checkbox mt-0" checked={o.listingId === offerId} onChange={() => { setOfferId(o.listingId); setQty(1); }} />
                          <span className="flex-1 min-w-0"><span className="font-semibold block truncate">{o.sellerName}</span><span className="text-xs text-muted">{o.stock > 0 ? `${o.stock} in stock` : 'Out of stock'} · {o.codAllowed ? 'COD available' : 'Prepaid'}{o.wholesaleEnabled ? ` · MOQ ${o.moq}` : ''}</span></span>
                          <span className="font-bold">{formatMoney(o.pricePaise)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </Row>
            </div>
            {business && <Link href={`/business/rfqs/new?product=${p.id}`} className="link text-sm mt-1 inline-block">Need a custom price for a large order? Request a quote →</Link>}
          </div>
        </div>

        {/* Description and specifications */}
        <div className="grid gap-5 mt-5 lg:grid-cols-[1.15fr_1fr] items-start">
          <section className="card p-5 md:p-6" aria-labelledby="about">
            <h2 id="about" className="text-2xl mb-3">Product description</h2>
            <p className="text-[#33443a] leading-relaxed whitespace-pre-line">{p.description}</p>
            <div className="grid grid-cols-3 gap-3 mt-6">
              {[[Package, 'Packed by the seller'], [ShieldCheck, 'Secure payments'], [RotateCcw, offer.returnable ? 'Easy returns' : 'Final sale']].map(([Icon, t]) => {
                const I = Icon as typeof Package;
                return <div key={t as string} className="rounded-xl bg-cream p-3 text-center text-[12.5px] font-medium"><I size={20} className="mx-auto text-forest mb-1" />{t as string}</div>;
              })}
            </div>
          </section>
          <section className="card overflow-hidden" aria-labelledby="specs">
            <h2 id="specs" className="text-2xl px-5 md:px-6 pt-5 md:pt-6 mb-3">Specifications</h2>
            <dl className="text-[14.5px]">
              {shownSpecs.map(([k, v], i) => (
                <div key={k} className={cn('grid grid-cols-[150px_1fr] gap-3 px-5 md:px-6 py-2.5', i % 2 === 0 && 'bg-[#f8f9f5]')}><dt className="text-muted">{k}</dt><dd className="font-medium">{v}</dd></div>
              ))}
            </dl>
            {specs.length > 8 && <button onClick={() => setShowAllSpecs((s) => !s)} className="w-full border-t border-line py-3 text-sm font-semibold text-forest hover:bg-cream">{showAllSpecs ? 'Show fewer' : `Show all ${specs.length} specifications`}</button>}
          </section>
        </div>

        <div className="mt-5"><ProductReviews productId={p.id} slug={p.slug} /></div>

        {data.related.length > 0 && (
          <section className="card p-5 md:p-6 mt-5" aria-labelledby="related">
            <div className="flex items-center justify-between mb-4">
              <h2 id="related" className="text-2xl">Similar products</h2>
              <Link href={`/products?category=${p.category.slug}`} className="btn btn-outline btn-sm">View all</Link>
            </div>
            <div className="scroll-row">
              {data.related.map((r) => {
                const o = percentOff(r.pricePaise, r.mrpPaise);
                return (
                  <Link key={r.catalogProductId} href={`/products/${r.slug}`} className="group w-[190px] shrink-0 rounded-xl border border-line overflow-hidden hover:shadow-lift transition bg-white">
                    <div className="relative aspect-square bg-white"><Image src={r.image} alt={r.name} fill sizes="190px" className="object-contain p-5 transition-transform group-hover:scale-105" unoptimized={r.image.startsWith('/api/')} /></div>
                    <div className="p-3 border-t border-line">
                      <p className="text-sm font-semibold line-clamp-2 min-h-10 group-hover:text-forest">{r.name}</p>
                      {r.rating && <p className="mt-1 flex items-center gap-1.5 text-xs text-muted"><RatingPill value={r.rating.average} />({r.rating.count})</p>}
                      <p className="mt-1.5 flex flex-wrap items-baseline gap-1.5"><span className="font-bold">{formatMoney(r.pricePaise)}</span>{o > 0 && <><span className="text-xs text-muted line-through">{formatMoney(r.mrpPaise)}</span><span className="text-xs font-bold text-success">{o}% off</span></>}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* Sticky buy bar on phones and tablets */}
      <div className="lg:hidden fixed bottom-[56px] inset-x-0 z-30 bg-white border-t border-line grid grid-cols-2 shadow-lift">
        <Button variant="gold" className="rounded-none h-14" disabled={out} loading={busy === 'add'} onClick={() => go(false)}><ShoppingCart size={18} />Add to cart</Button>
        <Button className="rounded-none h-14" aria-label="Buy now" disabled={out} loading={busy === 'buy'} onClick={() => go(true)}><Zap size={18} />Buy now · {formatMoney(unit)}</Button>
      </div>
    </div>
  );
}
