import type { Metadata } from 'next';
import Link from 'next/link';
import { BadgeCheck } from 'lucide-react';
import { tryServerApi } from '@/lib/server-api';
import { Empty, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Stores', description: 'Independent stores approved to sell on IBazzzar.' };
export const revalidate = 300;

export default async function SellersPage() {
  const data = await tryServerApi<{ sellers: { id: string; slug: string; name: string; description: string; primaryCategory: string | null; products: number; createdAt: string }[] }>('/sellers', { revalidate: 300 });
  return (
    <div className="container-page py-8">
      <PageHeader eyebrow="Stores" title="Independent stores, one mall" description="Every store is reviewed by our marketplace team before it can sell." actions={<Link href="/sell" className="btn btn-outline">Open your store</Link>} />
      {data?.sellers.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.sellers.map((s) => (
            <Link key={s.id} href={`/sellers/${s.slug}`} className="card card-pad flex gap-4 hover:shadow-lift transition">
              <span className="size-14 shrink-0 rounded-2xl bg-emerald text-gold-light grid place-items-center font-display text-2xl">{s.name.charAt(0)}</span>
              <div className="min-w-0"><p className="font-semibold flex items-center gap-1.5">{s.name}<BadgeCheck size={16} className="text-forest" /></p><p className="text-[13px] text-gold-ink">{s.primaryCategory} · {s.products} listings</p><p className="text-sm text-muted mt-1 line-clamp-2">{s.description}</p></div>
            </Link>
          ))}
        </div>
      ) : <div className="card"><Empty title="No stores yet" /></div>}
    </div>
  );
}
