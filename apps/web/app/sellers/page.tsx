import type { Metadata } from 'next';
import Link from 'next/link';
import { BadgeCheck, Store, ArrowRight, Package, CalendarDays } from 'lucide-react';
import { tryServerApi } from '@/lib/server-api';
import { cn, formatDate } from '@/lib/format';
import { PageBanner, Panel } from '@/components/page-banner';
import { Empty } from '@/components/ui';

export const metadata: Metadata = { title: 'Stores', description: 'Independent stores approved to sell on IBazzzar.' };
export const dynamic = 'force-dynamic'; // rendered per request; API data is cached via fetch revalidate

type Seller = { id: string; slug: string; name: string; description: string; primaryCategory: string | null; products: number; createdAt: string };
const COVERS = ['from-[#0d3d2c] to-[#2f6b52]', 'from-[#7a5715] to-[#c99a3d]', 'from-[#1d4f7a] to-[#3b7cb5]', 'from-[#3b2a63] to-[#6941c6]', 'from-[#7a2e2e] to-[#b45454]', 'from-[#174b37] to-[#5c8f6f]'];

export default async function SellersPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  const data = await tryServerApi<{ sellers: Seller[] }>('/sellers', { revalidate: 300 });
  const all = data?.sellers ?? [];
  const categories = [...new Set(all.map((s) => s.primaryCategory).filter((c): c is string => !!c))].sort();
  const sellers = category ? all.filter((s) => s.primaryCategory === category) : all;
  const listings = all.reduce((n, s) => n + s.products, 0);

  return (
    <div className="bg-[#f3f5f0] -mb-16 pb-16">
      <div className="container-page py-5 md:py-6 grid grid-cols-[minmax(0,1fr)] gap-5 md:gap-6">
        <PageBanner tone="ivory" icon={<Store size={24} />} eyebrow="Stores" title="Independent stores, one mall"
          description="Every store is reviewed by our marketplace team before it can sell."
          stats={[{ label: 'Approved stores', value: all.length }, { label: 'Listings', value: listings.toLocaleString('en-IN') }, { label: 'Categories', value: categories.length }]}
          actions={<Link href="/sell" className="btn btn-primary">Open your store<ArrowRight size={16} /></Link>} />

        {categories.length > 1 && (
          <nav aria-label="Filter stores by category" className="flex gap-2 overflow-x-auto no-scrollbar">
            {[null, ...categories].map((c) => (
              <Link key={c ?? 'all'} href={c ? `/sellers?category=${encodeURIComponent(c)}` : '/sellers'} aria-current={(category ?? null) === c ? 'page' : undefined}
                className={cn('shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition', (category ?? null) === c ? 'bg-forest text-white border-forest' : 'bg-white border-line hover:border-forest hover:text-forest')}>{c ?? 'All stores'}</Link>
            ))}
          </nav>
        )}

        {sellers.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sellers.map((s, i) => (
              <Link key={s.id} href={`/sellers/${s.slug}`} className="group rounded-3xl bg-white border border-line shadow-card overflow-hidden hover:shadow-lift hover:-translate-y-0.5 transition">
                <div className={cn('relative h-24 bg-gradient-to-br', COVERS[i % COVERS.length])}>
                  <span className="absolute inset-0 opacity-15 bg-[radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:18px_18px]" aria-hidden />
                  {s.primaryCategory && <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2.5 py-0.5 text-[11.5px] font-bold text-forest">{s.primaryCategory}</span>}
                </div>
                <div className="px-5 pb-5 -mt-8">
                  <span className="relative size-16 rounded-2xl bg-white shadow-lift border-4 border-white grid place-items-center font-display text-2xl text-forest bg-gradient-to-br from-mint to-white">{s.name.charAt(0)}</span>
                  <p className="mt-3 font-semibold text-lg flex items-center gap-1.5 group-hover:text-forest">{s.name}<BadgeCheck size={17} className="text-forest shrink-0" aria-label="Approved store" /></p>
                  <p className="text-sm text-muted mt-1 line-clamp-2 min-h-[2.6em]">{s.description}</p>
                  <div className="mt-4 flex items-center justify-between gap-2 text-[13px] text-muted">
                    <span className="flex items-center gap-3"><span className="flex items-center gap-1"><Package size={14} />{s.products} listings</span><span className="flex items-center gap-1"><CalendarDays size={14} />Since {formatDate(s.createdAt, { year: 'numeric' })}</span></span>
                    <span className="font-semibold text-forest inline-flex items-center gap-1">Visit<ArrowRight size={14} className="transition group-hover:translate-x-1" /></span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : <Panel><Empty icon={<Store size={26} />} title="No stores yet" body="Approved stores appear here." /></Panel>}
      </div>
    </div>
  );
}
