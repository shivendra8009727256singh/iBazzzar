import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BadgeCheck, CalendarDays } from 'lucide-react';
import { tryServerApi } from '@/lib/server-api';
import type { Product } from '@/lib/types';
import { formatDate } from '@/lib/format';
import { ProductGrid } from '@/components/product-card';
import { Empty, Pagination, Stars } from '@/components/ui';

type Store = { seller: { id: string; slug: string; name: string; description: string; primaryCategory: string | null; createdAt: string; rating: { average: number; count: number } | null }; products: Product[]; total: number; page: number; pages: number };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await tryServerApi<Store>(`/sellers/${slug}`, { revalidate: 120 });
  return data ? { title: data.seller.name, description: data.seller.description.slice(0, 158) } : { title: 'Store not found' };
}

export default async function StorePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> }) {
  const { slug } = await params;
  const { page } = await searchParams;
  const data = await tryServerApi<Store>(`/sellers/${slug}?page=${Number(page) || 1}`, { revalidate: 120 });
  if (!data) notFound();
  const s = data.seller;
  return (
    <div className="container-page py-8">
      <div className="surface-emerald rounded-3xl p-6 md:p-10 flex flex-wrap gap-6 items-center mb-8">
        <span className="size-20 rounded-3xl bg-ivory text-emerald grid place-items-center font-display text-4xl">{s.name.charAt(0)}</span>
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-3xl md:text-4xl text-white flex items-center gap-2">{s.name}<BadgeCheck size={24} className="text-gold-light" aria-label="Approved store" /></h1>
          <p className="text-white/75 mt-2 max-w-2xl">{s.description}</p>
          <div className="flex flex-wrap gap-4 mt-3 text-sm text-white/70">
            {s.primaryCategory && <span>{s.primaryCategory}</span>}
            <span className="flex items-center gap-1.5"><CalendarDays size={14} />Selling since {formatDate(s.createdAt, { month: 'long', year: 'numeric' })}</span>
            {s.rating ? <span className="[&_*]:text-white"><Stars value={s.rating.average} count={s.rating.count} /></span> : <span>No reviews yet</span>}
          </div>
        </div>
      </div>
      <h2 className="text-2xl mb-4">{data.total} product{data.total === 1 ? '' : 's'}</h2>
      {data.products.length ? <><ProductGrid products={data.products} /><Pagination page={data.page} pages={data.pages} hrefBase={`/sellers/${slug}`} /></> : <div className="card"><Empty title="No products listed yet" /></div>}
    </div>
  );
}
