'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Heart, Plus, Check, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Product } from '@/lib/types';
import { cn, formatMoney, percentOff } from '@/lib/format';
import { useCart } from './providers';
import { Stars, Badge } from './ui';

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
  return (
    <article className="group relative card overflow-hidden flex flex-col transition-shadow hover:shadow-lift">
      <div className="relative aspect-square bg-cream">
        <Link href={`/products/${p.slug}`} aria-label={p.name} className="block size-full">
          <Image src={p.image} alt={p.name} fill sizes="(min-width:1280px) 280px, (min-width:768px) 33vw, 50vw" priority={priority} className="object-contain p-6 transition-transform duration-500 group-hover:scale-[1.04]" unoptimized={p.image.startsWith('/api/')} />
        </Link>
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 items-start">
          {p.promotion && <Badge tone="danger">Deal · {Math.round(p.promotion.discountBps / 100)}% off</Badge>}
          {!p.promotion && off >= 10 && <Badge tone="success">{off}% off</Badge>}
          {p.demo && <Badge tone="gold">Demo</Badge>}
        </div>
        <button onClick={() => toggleWishlist(p.catalogProductId)} aria-pressed={saved} aria-label={saved ? `Remove ${p.name} from wishlist` : `Save ${p.name} to wishlist`}
          className="absolute top-3 right-3 size-9 rounded-full bg-white/95 shadow-card grid place-items-center hover:scale-105 transition">
          <Heart size={17} className={saved ? 'fill-danger text-danger' : 'text-ink'} />
        </button>
      </div>
      <div className="flex flex-1 flex-col p-4 gap-1.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-gold-ink">{p.brand}</p>
        <h3 className="font-sans text-[15.5px] font-semibold leading-snug line-clamp-2"><Link href={`/products/${p.slug}`} className="hover:text-forest">{p.name}</Link></h3>
        <p className="text-[13px] text-muted truncate">by {p.sellerName}{p.offerCount && p.offerCount > 1 ? ` · ${p.offerCount} sellers` : ''}</p>
        {p.rating ? <Stars value={p.rating.average} count={p.rating.count} size={13} /> : <span className="text-[12.5px] text-muted">No reviews yet</span>}
        <div className="mt-auto pt-2">
          {business ? (
            <div>
              <p className="text-[12px] text-muted flex items-center gap-1"><Building2 size={13} />From {formatMoney(Math.min(...p.tiers.map((t) => t.pricePaise)))} / unit</p>
              <p className="price text-lg">{formatMoney(p.tiers[0].pricePaise)} <span className="text-[12px] font-medium text-muted">MOQ {p.moq}</span></p>
            </div>
          ) : (
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="price text-lg">{formatMoney(p.pricePaise)}</span>
              {p.mrpPaise > p.pricePaise && <span className="mrp text-[13px]">{formatMoney(p.mrpPaise)}</span>}
            </div>
          )}
          <div className="flex items-center justify-between mt-2 gap-2">
            <span className={cn('text-[12.5px] font-medium', p.stock > 0 ? (p.stock <= 5 ? 'text-warning' : 'text-success') : 'text-danger')}>
              {p.stock > 0 ? (p.stock <= 5 ? `Only ${p.stock} left` : 'In stock') : 'Out of stock'}
            </span>
            <button onClick={quickAdd} disabled={p.stock < qty} className="btn btn-primary btn-sm" aria-label={`Add ${p.name} to cart`}>
              {added ? <Check size={15} /> : <Plus size={15} />}{added ? 'Added' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products, className }: { products: Product[]; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 md:gap-5 md:grid-cols-3 xl:grid-cols-4', className)}>
      {products.map((p, i) => <ProductCard key={p.catalogProductId} product={p} priority={i < 4} />)}
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:gap-5 md:grid-cols-3 xl:grid-cols-4" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card overflow-hidden"><div className="skeleton aspect-square rounded-none" /><div className="p-4 grid gap-2"><div className="skeleton h-3 w-1/3" /><div className="skeleton h-4 w-4/5" /><div className="skeleton h-5 w-1/2 mt-3" /></div></div>
      ))}
    </div>
  );
}
