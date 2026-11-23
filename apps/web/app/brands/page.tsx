import type { Metadata } from 'next';
import Link from 'next/link';
import { BadgeCheck } from 'lucide-react';
import { tryServerApi } from '@/lib/server-api';
import { Empty, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Brands', description: 'Browse brands sold by approved sellers on IBazzzar.' };
export const dynamic = 'force-dynamic'; // rendered per request; API data is cached via fetch revalidate

export default async function BrandsPage() {
  const data = await tryServerApi<{ brands: { id: string; name: string; slug: string; verified: boolean; products: number }[] }>('/brands', { revalidate: 300 });
  const groups = new Map<string, typeof data extends null ? never : NonNullable<typeof data>['brands']>();
  for (const b of data?.brands ?? []) {
    const k = /[a-z]/i.test(b.name[0]) ? b.name[0].toUpperCase() : '#';
    groups.set(k, [...(groups.get(k) ?? []), b]);
  }
  return (
    <div className="container-page py-8">
      <PageHeader eyebrow="Brands" title="Shop by brand" description="Verified brands carry a badge after our team checks ownership or authorisation." />
      {groups.size ? [...groups].map(([letter, list]) => (
        <section key={letter} className="mb-8">
          <h2 className="text-xl mb-3 text-gold-ink">{letter}</h2>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {list.map((b) => (
              <Link key={b.id} href={`/products?brand=${b.slug}`} className="card p-4 hover:shadow-lift transition">
                <p className="font-semibold flex items-center gap-1.5">{b.name}{b.verified && <BadgeCheck size={15} className="text-forest" aria-label="Verified brand" />}</p>
                <p className="text-sm text-muted">{b.products} product{b.products === 1 ? '' : 's'}</p>
              </Link>
            ))}
          </div>
        </section>
      )) : <div className="card"><Empty title="No brands yet" /></div>}
    </div>
  );
}
