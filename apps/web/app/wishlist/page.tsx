'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Heart, ShoppingBag, Cloud, Smartphone, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import type { Product } from '@/lib/types';
import { formatMoney } from '@/lib/format';
import { useCart, useSession } from '@/components/providers';
import { ProductGrid, ProductGridSkeleton } from '@/components/product-card';
import { Rail } from '@/components/home-sections';
import { PageBanner, Panel } from '@/components/page-banner';
import { Empty } from '@/components/ui';

export default function WishlistPage() {
  const { user } = useSession();
  const { wishlist } = useCart();
  const ids = [...wishlist];
  // Signed-in wishlists live on the server; guests' are matched against the catalogue by product id.
  const { data, isLoading } = useQuery({
    queryKey: ['wishlist', user?.id, ids],
    queryFn: async () => {
      if (user) return (await api<{ items: Product[] }>('/wishlist')).items;
      if (!ids.length) return [];
      const all = await api<{ products: Product[] }>('/products?limit=60');
      return all.products.filter((p) => wishlist.has(p.catalogProductId));
    },
  });
  const { data: popular } = useQuery({ queryKey: ['products', 'popular-rail'], queryFn: () => api<{ products: Product[] }>('/products?sort=popular&limit=12') });
  const items = (data ?? []).filter((p) => wishlist.has(p.catalogProductId));
  const saving = items.reduce((n, p) => n + Math.max(0, p.mrpPaise - p.pricePaise), 0);

  return (
    <div className="bg-[#f3f5f0] -mb-16 pb-16">
      <div className="container-page py-5 md:py-6 grid grid-cols-[minmax(0,1fr)] gap-5 md:gap-6">
        <PageBanner tone="ivory" icon={<Heart size={24} />} eyebrow="Saved for later" title="Your wishlist"
          description={<span className="inline-flex items-center gap-1.5">{user ? <><Cloud size={16} />Saved to your account across devices.</> : <><Smartphone size={16} />Saved on this device. <Link href="/login?next=/wishlist" className="link">Sign in</Link> to keep it across devices.</>}</span>}
          stats={items.length ? [{ label: 'Saved items', value: items.length }, { label: 'You save vs MRP', value: formatMoney(saving) }] : undefined} />

        <Panel title={items.length ? `${items.length} saved item${items.length === 1 ? '' : 's'}` : undefined}
          action={items.length ? <Link href="/cart" className="btn btn-primary btn-sm rounded-full"><ShoppingBag size={15} />Go to cart</Link> : undefined}>
          {isLoading ? <ProductGridSkeleton count={4} /> : items.length ? <ProductGrid products={items} /> : (
            <Empty icon={<Heart size={26} />} title="Nothing saved yet" body="Tap the heart on any product to save it for later. We’ll keep the price and stock up to date here."
              action={<Link href="/products" className="btn btn-primary">Discover products<ArrowRight size={16} /></Link>} />
          )}
        </Panel>

        {popular?.products.length ? <Rail title="Popular right now" subtitle="Ideas to add to your list" href="/products?sort=popular" products={popular.products} /> : null}
      </div>
    </div>
  );
}
