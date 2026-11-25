'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Heart, Plus, Check, Building2, Truck, Star, Flame, Banknote } from 'lucide-react';
import { toast } from 'sonner';
import type { Product } from '@/lib/types';
import { cn, formatMoney, percentOff } from '@/lib/format';
import { useCart } from './providers';

export function ProductCard({ product: p, priority, index = 0 }: { product: Product; priority?: boolean; index?: number }) {
  const { add, wishlist, toggleWishlist, mode } = useCart();
  const router = useRouter();
  const [added, setAdded] = useState(false);
  const saved = wishlist.has(p.catalogProductId);
  const business = mode === 'BUSINESS' && p.wholesaleEnabled && p.tiers.length > 0;
  const off = percentOff(p.pricePaise, p.mrpPaise);
  const qty = mode === 'BUSINESS' ? Math.max(p.moq, p.bulkPackUnits) : 1;
  const quickAdd = async () => {
    try { await add(p.listingId, qty); setAdded(true); toast.success(`Added ${p.name} to your cart`, { action: { label: 'View cart', onClick: () => router.push('/cart') } }); setTimeout(() => setAdded(false), 1600); } catch { /* toast shown by cart */ }
  };
  const alt = p.images?.find((x) => x && x !== p.image);
  const save = p.mrpPaise - p.pricePaise;
  const tone = (v: number) => (v >= 4 ? 'bg-success' : v >= 3 ? 'bg-[#c27c0e]' : 'bg-danger');
  return (
    <article className="group relative flex flex-col rounded-[20px] border border-line bg-white overflow-hidden transition duration-300 hover:-translate-y-1 hover:shadow-lift hover:border-gold/40 animate-[fade-up_0.5s_ease-out_both]" style={{ animationDelay: `${Math.min(index, 11) * 40}ms` }}>
      <div className="relative aspect-square bg-white m-1.5 mb-0 rounded-2xl overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,#f7f1e1,#fbfaf5_55%,#f3f5ef)]" aria-hidden />
        <Link href={`/products/${p.slug}`} aria-label={p.name} className="relative block size-full">
          <Image src={p.image} alt={p.name} fill sizes="(min-width:1280px) 280px, (min-width:768px) 33vw, 50vw" priority={priority} className={cn('object-contain p-6 transition duration-500 group-hover:scale-[1.06]', alt && 'group-hover:opacity-0')} unoptimized={p.image.startsWith('/api/')} />
          {alt && <Image src={alt} alt="" fill sizes="(min-width:1280px) 280px, (min-width:768px) 33vw, 50vw" className="object-contain p-6 opacity-0 scale-[0.98] transition duration-500 group-hover:opacity-100 group-hover:scale-[1.04]" unoptimized={alt.startsWith('/api/')} />}
        </Link>
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5 items-start">
          {p.promotion && <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-danger to-[#e0612b] text-white text-[10.5px] font-bold px-2 py-0.5 shadow-sm"><Flame size={11} />DEAL · {Math.round(p.promotion.discountBps / 100)}% OFF</span>}
          {p.stock > 0 && p.stock <= 5 && <span className="rounded-full bg-[#fdf1d8] text-[#8a5a00] text-[10.5px] font-bold px-2 py-0.5">Only {p.stock} left</span>}
        </div>
        <button onClick={() => toggleWishlist(p.catalogProductId)} aria-pressed={saved} aria-label={saved ? `Remove ${p.name} from wishlist` : `Save ${p.name} to wishlist`}
          className="absolute top-2.5 right-2.5 size-9 rounded-full bg-white/90 backdrop-blur shadow-card grid place-items-center hover:scale-110 transition">
          <Heart size={17} className={saved ? 'fill-danger text-danger' : 'text-muted'} />
        </button>
        {p.stock <= 0 && <div className="absolute inset-x-0 bottom-0 bg-white/90 py-1.5 text-center text-xs font-bold text-danger">Currently out of stock</div>}
      </div>
      <div className="flex flex-1 flex-col px-4 pb-4 pt-3 gap-1.5">
        <p className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-gold-ink truncate">{p.brand}</p>
        <h3 className="font-sans text-[15px] font-semibold leading-snug line-clamp-2 min-h-[2.6em]"><Link href={`/products/${p.slug}`} className="hover:text-forest">{p.name}</Link></h3>
        {p.rating ? (
          <p className="flex items-center gap-1.5 text-[12.5px] text-muted">
            <span className={cn('inline-flex items-center gap-0.5 rounded px-1.5 py-px text-[11.5px] font-bold text-white', tone(p.rating.average))}>{p.rating.average.toFixed(1)}<Star size={10} fill="currentColor" /></span>
            ({p.rating.count.toLocaleString('en-IN')})
          </p>
        ) : <p className="text-[12px] text-muted">New arrival</p>}
        <div className="mt-auto pt-1.5">
          {business ? (
            <div>
              <p className="text-[12px] text-muted flex items-center gap-1"><Building2 size={13} />Bulk from {formatMoney(Math.min(...p.tiers.map((t) => t.pricePaise)))} / unit</p>
              <p className="text-lg font-bold">{formatMoney(p.tiers[0].pricePaise)} <span className="text-[12px] font-medium text-muted">MOQ {p.moq}</span></p>
            </div>
          ) : (
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-lg font-bold tabular-nums">{formatMoney(p.pricePaise)}</span>
              {p.mrpPaise > p.pricePaise && <span className="text-[13px] text-muted line-through">{formatMoney(p.mrpPaise)}</span>}
              {off > 0 && <span className="text-[13px] font-bold text-success">{off}% off</span>}
            </div>
          )}
          {!business && save > 0 && <p className="mt-0.5 inline-flex rounded-md bg-success/10 px-1.5 py-px text-[11.5px] font-semibold text-success">You save {formatMoney(save)}</p>}
          <p className="text-[12px] text-muted truncate flex items-center gap-1 mt-1"><Truck size={12} />{p.sellerName}{p.offerCount && p.offerCount > 1 ? ` · ${p.offerCount} sellers` : ''}{p.codAllowed && <><span className="mx-0.5">·</span><Banknote size={12} />COD</>}</p>
          <button onClick={quickAdd} disabled={p.stock < qty} aria-label={`Add ${p.name} to cart`}
            className={cn('mt-3 w-full btn btn-sm rounded-full transition', added ? 'btn-primary' : 'btn-outline group-hover:bg-forest group-hover:text-white group-hover:border-forest')}>
            {added ? <Check size={15} /> : <Plus size={15} />}{added ? 'Added to cart' : p.stock < qty ? 'Out of stock' : 'Add to cart'}
          </button>
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products, className }: { products: Product[]; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 md:gap-4 md:grid-cols-3 xl:grid-cols-4', className)}>
      {products.map((p, i) => <ProductCard key={p.catalogProductId} product={p} priority={i < 4} index={i} />)}
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:gap-4 md:grid-cols-3 xl:grid-cols-4" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-line bg-white overflow-hidden"><div className="skeleton aspect-square rounded-none" /><div className="p-4 grid gap-2"><div className="skeleton h-3 w-1/3" /><div className="skeleton h-4 w-4/5" /><div className="skeleton h-5 w-1/2 mt-3" /><div className="skeleton h-9 w-full mt-2" /></div></div>
      ))}
    </div>
  );
}
