import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BadgeCheck, CalendarDays, Package, Star, ShieldCheck, RotateCcw, Receipt, ChevronRight } from 'lucide-react';
import { tryServerApi } from '@/lib/server-api';
import type { Product } from '@/lib/types';
import { formatDate } from '@/lib/format';
import { ProductGrid } from '@/components/product-card';
import { Panel } from '@/components/page-banner';
import { Empty, Pagination } from '@/components/ui';

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
  const stats = [
    { icon: Package, label: 'Products', value: data.total },
    { icon: Star, label: s.rating ? `${s.rating.count} ratings` : 'Ratings', value: s.rating ? s.rating.average.toFixed(1) : 'New' },
    { icon: CalendarDays, label: 'Selling since', value: formatDate(s.createdAt, { month: 'short', year: 'numeric' }) },
  ];
  return (
    <div className="bg-[#f3f5f0] -mb-16 pb-16">
      <div className="container-page py-5 md:py-6 grid grid-cols-[minmax(0,1fr)] gap-5 md:gap-6">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted"><Link href="/" className="hover:text-forest">Home</Link><ChevronRight size={14} /><span className="text-ink font-medium truncate">{s.name}</span></nav>

        <section className="rounded-3xl bg-white border border-line shadow-card overflow-hidden">
          <div className="relative h-36 md:h-48 bg-[linear-gradient(120deg,#062a1e_0%,#0d3d2c_45%,#c99a3d_130%)]">
            <span className="absolute inset-0 opacity-15 bg-[radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:22px_22px]" aria-hidden />
            <span className="absolute -right-16 -top-16 size-64 rounded-full bg-white/[0.07]" aria-hidden />
          </div>
          <div className="px-5 md:px-8 pb-6 flex flex-wrap items-end gap-5 -mt-12 md:-mt-14">
            <span className="relative size-24 md:size-28 rounded-3xl border-4 border-white shadow-lift bg-gradient-to-br from-ivory to-mint text-forest grid place-items-center font-display text-5xl">{s.name.charAt(0)}</span>
            <div className="flex-1 min-w-[220px] pt-14 md:pt-16">
              <h1 className="text-3xl md:text-4xl flex items-center gap-2 flex-wrap">{s.name}<BadgeCheck size={26} className="text-forest" aria-label="Approved store" /></h1>
              {s.primaryCategory && <p className="text-gold-ink font-semibold text-sm mt-1">{s.primaryCategory}</p>}
            </div>
          </div>
          <div className="px-5 md:px-8 pb-6 grid gap-5 lg:grid-cols-[1fr_auto]">
            <p className="text-muted max-w-3xl">{s.description}</p>
            <dl className="grid grid-cols-3 gap-2.5">
              {stats.map((x) => (
                <div key={x.label} className="rounded-2xl bg-cream/70 border border-line px-4 py-3 min-w-0">
                  <dt className="flex items-center gap-1.5 text-[12px] text-muted"><x.icon size={13} />{x.label}</dt>
                  <dd className="text-lg md:text-xl font-bold tabular-nums truncate">{x.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <ul className="border-t border-line grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-line text-sm">
            {[[ShieldCheck, 'Approved store', 'Identity and documents checked'], [Receipt, 'GST invoice', 'With every order'], [RotateCcw, 'Easy returns', 'Window shown on each product']].map(([Icon, t, b]) => {
              const I = Icon as typeof ShieldCheck;
              return <li key={t as string} className="flex items-center gap-3 px-5 md:px-8 py-3.5"><I size={18} className="text-forest shrink-0" /><span><span className="font-semibold block">{t as string}</span><span className="text-muted text-xs">{b as string}</span></span></li>;
            })}
          </ul>
        </section>

        <Panel title={`${data.total} product${data.total === 1 ? '' : 's'}`} subtitle={`Everything ${s.name} sells on IBazzzar`}>
          {data.products.length ? <><ProductGrid products={data.products} /><Pagination page={data.page} pages={data.pages} hrefBase={`/sellers/${slug}`} /></> : <Empty icon={<Package size={26} />} title="No products listed yet" />}
        </Panel>
      </div>
    </div>
  );
}
