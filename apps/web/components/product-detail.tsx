'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Heart, Minus, Plus, Truck, RotateCcw, ShieldCheck, Store, BadgeCheck, Banknote, MapPin, Building2, ZoomIn } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Estimate, Product, Review } from '@/lib/types';
import { cn, formatMoney, formatDate, percentOff, pct } from '@/lib/format';
import { useCart } from './providers';
import { Badge, Button, Modal, Price, Stars } from './ui';
import { Countdown } from './home-parts';

export type Detail = {
  product: {
    id: string; slug: string; name: string; brand: { name: string; slug: string }; category: { name: string; slug: string; parent: { name: string; slug: string } | null };
    description: string; highlights: string[]; hsnCode: string | null; images: { url: string; alt: string }[]; specifications: { name: string; value: string }[];
    rating: { average: number; count: number } | null; demo: boolean;
  };
  variants: { id: string; slug: string; label: string; listingId: string; pricePaise: number; mrpPaise: number; stock: number }[];
  selectedVariantId: string;
  offer: Product;
  offers: Product[];
  sellers: { id: string; slug: string; name: string; description: string; primaryCategory: string | null }[];
  reviews: Review[];
  related: Product[];
};

function Gallery({ images, name }: { images: { url: string; alt: string }[]; name: string }) {
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [origin, setOrigin] = useState('50% 50%');
  const img = images[active] ?? { url: '/products/placeholder.svg', alt: name };
  return (
    <div className="grid gap-3 md:grid-cols-[72px_1fr] md:gap-4">
      <div className="order-2 md:order-1 flex md:flex-col gap-2 overflow-x-auto" role="tablist" aria-label="Product photos">
        {images.map((im, i) => (
          <button key={im.url} role="tab" aria-selected={i === active} aria-label={`Photo ${i + 1}`} onClick={() => setActive(i)}
            className={cn('relative size-16 md:size-[72px] shrink-0 rounded-xl border bg-cream overflow-hidden', i === active ? 'border-emerald ring-2 ring-emerald/20' : 'border-line')}>
            <Image src={im.url} alt="" fill sizes="72px" className="object-contain p-1.5" unoptimized={im.url.startsWith('/api/')} />
          </button>
        ))}
      </div>
      <div className="order-1 md:order-2 relative aspect-square rounded-2xl border border-line bg-cream overflow-hidden group cursor-zoom-in"
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`); }}
        onClick={() => setZoom(true)}>
        <Image src={img.url} alt={img.alt} fill priority sizes="(min-width:1024px) 560px, 100vw" style={{ transformOrigin: origin }} className="object-contain p-8 transition-transform duration-200 md:group-hover:scale-[1.8]" unoptimized={img.url.startsWith('/api/')} />
        <span className="absolute bottom-3 right-3 badge badge-neutral"><ZoomIn size={13} />Tap to zoom</span>
      </div>
      <Modal open={zoom} onOpenChange={setZoom} title={name} wide>
        <div className="relative aspect-square bg-cream rounded-xl"><Image src={img.url} alt={img.alt} fill sizes="90vw" className="object-contain p-4" unoptimized={img.url.startsWith('/api/')} /></div>
      </Modal>
    </div>
  );
}

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
    <div className="rounded-xl border border-line p-4">
      <form onSubmit={check} className="flex gap-2 items-center">
        <MapPin size={18} className="text-forest shrink-0" />
        <label htmlFor="pdp-pin" className="sr-only">Delivery PIN code</label>
        <input id="pdp-pin" inputMode="numeric" maxLength={6} placeholder="Enter delivery PIN code" className="input min-h-[40px]" value={pincode} onChange={(ev) => setPincode(ev.target.value.replace(/\D/g, ''))} />
        <button className="btn btn-outline btn-sm" disabled={pincode.length !== 6}>Check</button>
      </form>
      {error && <p className="error-text mt-2">{error}</p>}
      {e && (e.serviceable ? (
        <div className="mt-3 grid gap-1.5 text-[14px]">
          <p className="flex items-center gap-2"><Truck size={16} className="text-success" />Estimated delivery <strong>{result?.from} – {result?.to}</strong></p>
          <p className="flex items-center gap-2"><Banknote size={16} className={e.codAvailable ? 'text-success' : 'text-muted'} />{e.codAvailable ? 'Cash on delivery available' : 'Cash on delivery not available here'}</p>
          <p className="text-muted text-[13px]">Free delivery from this seller on orders over {formatMoney(result!.freeShippingThresholdPaise)}. Estimates, not guarantees.</p>
        </div>
      ) : <p className="mt-3 text-danger text-[14px]">{e.reason}</p>)}
    </div>
  );
}

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
  const p = data.product;
  const saved = wishlist.has(p.id);
  const seller = data.sellers.find((s) => s.id === offer.sellerId);

  const unit = useMemo(() => {
    if (!business) return offer.pricePaise;
    const tier = [...offer.tiers].filter((t) => t.minQty <= quantity).sort((a, b) => b.minQty - a.minQty)[0];
    return Math.min(tier?.pricePaise ?? offer.listPricePaise, offer.pricePaise);
  }, [business, offer, quantity]);

  const go = async (buy: boolean) => {
    setBusy(buy ? 'buy' : 'add');
    try {
      await add(offer.listingId, quantity);
      if (buy) router.push('/checkout'); else toast.success('Added to cart', { action: { label: 'View cart', onClick: () => router.push('/cart') } });
    } catch { /* toast already shown */ } finally { setBusy(null); }
  };
  const out = offer.stock < minQty;

  return (
    <div className="container-page py-6 md:py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-muted mb-5">
        <ol className="flex flex-wrap gap-1.5">
          <li><Link href="/" className="hover:text-ink">Home</Link> /</li>
          {p.category.parent && <li><Link href={`/products?category=${p.category.parent.slug}`} className="hover:text-ink">{p.category.parent.name}</Link> /</li>}
          <li><Link href={`/products?category=${p.category.slug}`} className="hover:text-ink">{p.category.name}</Link> /</li>
          <li aria-current="page" className="text-ink line-clamp-1">{p.name}</li>
        </ol>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
        <Gallery images={p.images} name={p.name} />

        <div>
          <Link href={`/products?brand=${p.brand.slug}`} className="eyebrow hover:underline">{p.brand.name}</Link>
          <h1 className="text-[28px] md:text-[36px] mt-1">{p.name}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            {p.rating ? <a href="#reviews"><Stars value={p.rating.average} count={p.rating.count} /></a> : <span className="text-sm text-muted">No reviews yet</span>}
            {p.demo && <Badge tone="gold">Demonstration product — not for real sale</Badge>}
          </div>

          <div className="mt-5 rounded-2xl bg-cream border border-line p-5">
            {offer.promotion && (
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Badge tone="danger">{offer.promotion.name} · {pct(offer.promotion.discountBps)} off</Badge>
                <span className="text-sm text-danger font-medium"><Countdown endsAt={offer.promotion.endsAt} /></span>
              </div>
            )}
            <Price paise={unit} mrp={offer.mrpPaise} size="lg" />
            <p className="text-[13px] text-muted mt-1">Inclusive of all taxes{offer.taxRateBps ? ` (GST ${pct(offer.taxRateBps)})` : ''}. Delivery charges, if any, are shown before you pay.</p>

            {business && offer.tiers.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-semibold flex items-center gap-1.5"><Building2 size={15} />Business pricing · MOQ {offer.moq}{offer.bulkPackUnits > 1 ? ` · packs of ${offer.bulkPackUnits}` : ''}</p>
                <table className="mt-2 w-full text-sm">
                  <thead><tr className="text-muted text-left"><th className="font-medium py-1">Quantity</th><th className="font-medium py-1">Price / unit</th><th className="font-medium py-1">You save</th></tr></thead>
                  <tbody>
                    {offer.tiers.map((t, i) => (
                      <tr key={t.minQty} className={cn('border-t border-line', quantity >= t.minQty && (i === offer.tiers.length - 1 || quantity < offer.tiers[i + 1].minQty) && 'bg-mint font-semibold')}>
                        <td className="py-1.5">{t.minQty}{offer.tiers[i + 1] ? `–${offer.tiers[i + 1].minQty - 1}` : '+'}</td>
                        <td>{formatMoney(t.pricePaise)}</td>
                        <td className="text-success">{percentOff(t.pricePaise, offer.listPricePaise)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!business && offer.wholesaleEnabled && offer.tiers.length > 0 && (
              <p className="mt-3 text-[13.5px]"><Building2 size={14} className="inline mr-1 text-forest" />Buying for a business? Bulk prices from {formatMoney(Math.min(...offer.tiers.map((t) => t.pricePaise)))} — switch to <strong>Business</strong> mode at the top.</p>
            )}
          </div>

          {data.variants.length > 1 && (
            <div className="mt-6">
              <p className="font-semibold mb-2">Variant: <span className="font-normal text-muted">{data.variants.find((v) => v.id === data.selectedVariantId)?.label}</span></p>
              <div className="flex flex-wrap gap-2">
                {data.variants.map((v) => (
                  <Link key={v.id} href={`/products/${v.slug}`} scroll={false} aria-current={v.id === data.selectedVariantId ? 'true' : undefined}
                    className={cn('rounded-xl border px-4 py-2 text-sm font-medium', v.id === data.selectedVariantId ? 'border-emerald bg-mint text-emerald' : 'border-line-strong hover:border-emerald', v.stock === 0 && 'opacity-55 line-through')}>
                    {v.label}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <div className="flex items-center rounded-xl border border-line-strong" role="group" aria-label="Quantity">
              <button className="btn btn-ghost btn-icon" aria-label="Decrease quantity" disabled={quantity <= minQty} onClick={() => setQty(Math.max(minQty, quantity - step))}><Minus size={16} /></button>
              <input aria-label="Quantity" inputMode="numeric" className="w-14 text-center font-semibold outline-none" value={quantity} onChange={(e) => setQty(Number(e.target.value.replace(/\D/g, '')) || minQty)} />
              <button className="btn btn-ghost btn-icon" aria-label="Increase quantity" disabled={quantity + step > offer.stock} onClick={() => setQty(quantity + step)}><Plus size={16} /></button>
            </div>
            <p className={cn('text-sm font-semibold', out ? 'text-danger' : offer.stock <= 5 ? 'text-warning' : 'text-success')}>
              {out ? 'Out of stock' : offer.stock <= 5 ? `Only ${offer.stock} left` : 'In stock'}
            </p>
          </div>
          {business && <p className="text-[13px] text-muted mt-2">Subtotal at this quantity: <strong className="text-ink">{formatMoney(unit * quantity)}</strong></p>}

          <div className="mt-5 grid grid-cols-[1fr_1fr_auto] gap-3">
            <Button size="lg" variant="outline" loading={busy === 'add'} disabled={out || quantity > offer.stock} onClick={() => go(false)}>Add to Cart</Button>
            <Button size="lg" loading={busy === 'buy'} disabled={out || quantity > offer.stock} onClick={() => go(true)}>Buy Now</Button>
            <button onClick={() => toggleWishlist(p.id)} aria-pressed={saved} aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'} className="btn btn-outline btn-lg px-4">
              <Heart size={20} className={saved ? 'fill-danger text-danger' : ''} />
            </button>
          </div>
          {business && <Link href={`/business/rfqs/new?product=${p.id}`} className="link text-sm mt-3 inline-block">Need a custom price for a large order? Request a quote →</Link>}

          <div className="mt-6"><DeliveryCheck listingId={offer.listingId} /></div>

          <ul className="mt-5 grid sm:grid-cols-3 gap-3 text-[13.5px]">
            <li className="flex gap-2 rounded-xl bg-cream p-3"><RotateCcw size={17} className="text-forest shrink-0" />{offer.returnable ? 'Returnable within the policy window' : 'Not returnable'}</li>
            <li className="flex gap-2 rounded-xl bg-cream p-3"><Banknote size={17} className="text-forest shrink-0" />{offer.codAllowed ? 'Cash on delivery eligible' : 'Prepaid only'}</li>
            <li className="flex gap-2 rounded-xl bg-cream p-3"><ShieldCheck size={17} className="text-forest shrink-0" />GST invoice from the seller</li>
          </ul>

          <div className="mt-6 rounded-2xl border border-line p-4 flex gap-3">
            <span className="size-11 shrink-0 rounded-xl bg-emerald text-gold-light grid place-items-center"><Store size={20} /></span>
            <div className="min-w-0">
              <p className="text-sm text-muted">Sold and shipped by</p>
              <Link href={`/sellers/${offer.sellerSlug}`} className="font-semibold hover:underline flex items-center gap-1.5">{offer.sellerName}<BadgeCheck size={15} className="text-forest" /></Link>
              {seller?.description && <p className="text-[13.5px] text-muted mt-0.5 line-clamp-2">{seller.description}</p>}
            </div>
          </div>

          {data.offers.length > 1 && (
            <div className="mt-6">
              <p className="font-semibold mb-2">{data.offers.length} sellers offer this item</p>
              <div className="grid gap-2" role="radiogroup" aria-label="Choose a seller">
                {data.offers.map((o) => (
                  <label key={o.listingId} className={cn('flex items-center gap-3 rounded-xl border p-3 cursor-pointer', o.listingId === offerId ? 'border-emerald bg-mint' : 'border-line hover:border-line-strong')}>
                    <input type="radio" name="offer" className="checkbox mt-0" checked={o.listingId === offerId} onChange={() => { setOfferId(o.listingId); setQty(1); }} />
                    <span className="flex-1 min-w-0"><span className="font-semibold block truncate">{o.sellerName}</span><span className="text-xs text-muted">{o.stock > 0 ? `${o.stock} in stock` : 'Out of stock'} · {o.codAllowed ? 'COD available' : 'Prepaid'}{o.wholesaleEnabled ? ` · MOQ ${o.moq}` : ''}</span></span>
                    <span className="font-bold">{formatMoney(o.pricePaise)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-14 grid gap-10 lg:grid-cols-[1.3fr_1fr]">
        <section aria-labelledby="about">
          <h2 id="about" className="text-2xl mb-3">About this product</h2>
          {p.highlights.length > 0 && <ul className="grid gap-2 mb-4">{p.highlights.map((h) => <li key={h} className="flex gap-2"><BadgeCheck size={17} className="text-forest shrink-0 mt-0.5" />{h}</li>)}</ul>}
          <p className="text-[#33443a] leading-relaxed whitespace-pre-line">{p.description}</p>
        </section>
        <section aria-labelledby="specs">
          <h2 id="specs" className="text-2xl mb-3">Specifications</h2>
          <dl className="rounded-2xl border border-line divide-y divide-line text-[14.5px]">
            {[['Brand', p.brand.name], ['Category', p.category.name], ...(p.hsnCode ? [['HSN code', p.hsnCode]] : []), ['GST rate', offer.taxRateBps ? pct(offer.taxRateBps) : 'Not charged (seller not GST-registered)'], ...p.specifications.map((s) => [s.name, s.value])].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[140px_1fr] gap-3 px-4 py-2.5"><dt className="text-muted">{k}</dt><dd className="font-medium">{v}</dd></div>
            ))}
          </dl>
        </section>
      </div>

      <section id="reviews" className="mt-14" aria-labelledby="reviews-title">
        <h2 id="reviews-title" className="text-2xl mb-1">Customer reviews</h2>
        <p className="text-sm text-muted mb-5">Only customers whose order was delivered can review. Reviews are never edited by sellers.</p>
        {data.reviews.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {data.reviews.map((r) => (
              <article key={r.id} className="card card-pad">
                <div className="flex items-center justify-between"><Stars value={r.rating} /><Badge tone="success">Verified purchase</Badge></div>
                <h3 className="font-sans font-semibold mt-3">{r.title}</h3>
                <p className="text-muted mt-1 text-[15px]">{r.body}</p>
                <p className="text-xs text-muted mt-3">{r.authorName} · {formatDate(r.createdAt)}</p>
              </article>
            ))}
          </div>
        ) : <p className="panel p-6 text-muted">No reviews yet. Bought this? You can review it from your order once it’s delivered.</p>}
      </section>

      {data.related.length > 0 && (
        <section className="mt-14" aria-labelledby="related">
          <h2 id="related" className="text-2xl mb-5">More in {p.category.name}</h2>
          <div className="scroll-row">
            {data.related.map((r) => (
              <Link key={r.catalogProductId} href={`/products/${r.slug}`} className="w-[200px] card overflow-hidden hover:shadow-lift">
                <div className="relative aspect-square bg-cream"><Image src={r.image} alt={r.name} fill sizes="200px" className="object-contain p-5" unoptimized={r.image.startsWith('/api/')} /></div>
                <div className="p-3"><p className="text-sm font-semibold line-clamp-2">{r.name}</p><p className="price mt-1">{formatMoney(r.pricePaise)}</p></div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Sticky buy bar on phones */}
      <div className="lg:hidden fixed bottom-[56px] inset-x-0 z-30 bg-white border-t border-line px-4 py-3 flex items-center gap-3 shadow-lift">
        <div className="flex-1 min-w-0"><p className="price text-lg">{formatMoney(unit)}</p><p className="text-xs text-muted truncate">{out ? 'Out of stock' : `Qty ${quantity}`}</p></div>
        <Button variant="outline" disabled={out} loading={busy === 'add'} onClick={() => go(false)}>Add</Button>
        <Button disabled={out} loading={busy === 'buy'} onClick={() => go(true)}>Buy now</Button>
      </div>
    </div>
  );
}
