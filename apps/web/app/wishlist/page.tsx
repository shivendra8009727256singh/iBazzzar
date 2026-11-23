'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import { api } from '@/lib/api';
import type { Product } from '@/lib/types';
import { useCart, useSession } from '@/components/providers';
import { ProductGrid, ProductGridSkeleton } from '@/components/product-card';
import { Empty, PageHeader } from '@/components/ui';

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
  return (
    <div className="container-page py-8">
      <PageHeader title="Your wishlist" description={user ? 'Saved to your account across devices.' : 'Saved on this device. Sign in to keep it across devices.'} />
      {isLoading ? <ProductGridSkeleton count={4} /> : data?.length ? <ProductGrid products={data.filter((p) => wishlist.has(p.catalogProductId))} /> : (
        <div className="card"><Empty icon={<Heart size={26} />} title="Nothing saved yet" body="Tap the heart on any product to save it for later." action={<Link href="/products" className="btn btn-primary">Discover products</Link>} /></div>
      )}
    </div>
  );
}
