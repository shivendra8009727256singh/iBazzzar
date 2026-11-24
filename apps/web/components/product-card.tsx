'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Heart, Plus, Check, Building2, Truck, Star } from 'lucide-react';
import { toast } from 'sonner';
import type { Product } from '@/lib/types';
import { cn, formatMoney, percentOff } from '@/lib/format';
import { useCart } from './providers';

export function ProductCard({ product: p, priority }: { product: Product; priority?: boolean }) {
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
  const tone = (v: number) => (v >= 4 ? 'bg-success' : v >= 3 ? 'bg-[#c27c0e]' : 'bg-danger');
  return (
    <article className="group relative flex flex-col rounded-2xl border border-line bg-white overflow-hidden transition duration-300 hover:-translate-y-0.5 hover:shadow-lift hover:border-transparent">
      <div className="relative aspect-square bg-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,#f6f1e2,transparent_68%)]" aria-hidden />
        <Link href={`/products/${p.slug}`} aria-label={p.name} className="block size-full">
          <Image src={p.image} alt={p.name} fill sizes="(min-width:1280px) 280px, (min-width:768px) 33vw, 50vw" priority={priority} className="object-contain p-7 transition-transform duration-500 group-hover:scale-[1.06]" unoptimized={p.image.startsWith('/api/')} />
        </Link>
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 items-start">
          {p.promotion && <span className="rounded-md bg-danger text-white text-[11px] font-bold px-2 py-0.5 shadow-sm">DEAL · {Math.round(p.promotion.discountBps / 100)}% OFF</span>}
          {p.stock > 0 && p.stock <= 5 && <span className="rounded-md bg-[#fdf1d8] text-[#8a5a00] text-[11px] font-bold px-2 py-0.5">Only {p.stock} left</span>}
          {p.demo && <span className="rounded-md bg-[#f7ecd2] text-gold-ink text-[11px] font-bold px-2 py-0.5">Demo</span>}
        </div>
        <button onClick={() => toggleWishlist(p.catalogProductId)} aria-pressed={saved} aria-label={saved ? `Remove ${p.name} from wishlist` : `Save ${p.name} to wishlist`}
          className="absolute top-3 right-3 size-9 rounded-full bg-white shadow-card border border-line grid place-items-center hover:scale-110 transition">
          <Heart size={17} className={saved ? 'fill-danger text-danger' : 'text-muted'} />
        </button>
        {p.stock <= 0 && <div className="absolute inset-x-0 bottom-0 bg-white/90 py-1.5 text-center text-xs font-bold text-danger">Currently out of stock</div>}
      </div>
      <div className="flex flex-1 flex-col px-4 pb-4 pt-3 gap-1.5 border-t border-line/70">
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
          <p className="text-[12px] text-muted truncate flex items-center gap-1 mt-0.5"><Truck size={12} />{p.sellerName}{p.offerCount && p.offerCount > 1 ? ` · ${p.offerCount} sellers` : ''}</p>
          <button onClick={quickAdd} disabled={p.stock < qty} aria-label={`Add ${p.name} to cart`}
            className={cn('mt-3 w-full btn btn-sm transition', added ? 'btn-primary' : 'btn-outline group-hover:bg-forest group-hover:text-white group-hover:border-forest')}>
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
      {products.map((p, i) => <ProductCard key={p.catalogProductId} product={p} priority={i < 4} />)}
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
