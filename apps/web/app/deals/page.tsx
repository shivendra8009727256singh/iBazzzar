import type { Metadata } from 'next';
import Link from 'next/link';
import { Tag } from 'lucide-react';
import { tryServerApi } from '@/lib/server-api';
import type { Product } from '@/lib/types';
import { formatDate, formatMoney } from '@/lib/format';
import { ProductGrid } from '@/components/product-card';
import { Countdown } from '@/components/home-parts';
import { Empty, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Deals and offers', description: 'Scheduled flash deals and coupon offers with clear terms.' };
export const dynamic = 'force-dynamic'; // rendered per request; API data is cached via fetch revalidate

type Deals = { deals: { id: string; name: string; description: string; discountBps: number; startsAt: string; endsAt: string; live: boolean; products: Product[] }[] };
type Offers = { offers: { code: string; description: string; kind: string; value: number; maxDiscountPaise: number | null; minOrderPaise: number; mode: string; endsAt: string }[] };

export default async function DealsPage() {
  const [deals, offers] = await Promise.all([tryServerApi<Deals>('/deals', { revalidate: 60 }), tryServerApi<Offers>('/offers', { revalidate: 60 })]);
  return (
    <div className="container-page py-8">
      <PageHeader eyebrow="Deals" title="Deals with clear terms" description="Every deal has a real start and end time. Prices return to normal when the timer ends — no fake urgency." />
      {offers?.offers.length ? (
        <section className="mb-12">
          <h2 className="text-2xl mb-4">Coupon codes</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {offers.offers.map((o) => (
              <div key={o.code} className="rounded-2xl border-2 border-dashed border-gold/60 bg-cream p-5">
                <p className="flex items-center gap-2 font-mono text-lg font-bold text-emerald"><Tag size={18} className="text-gold" />{o.code}</p>
                <p className="mt-1 font-semibold">{o.kind === 'PERCENT' ? `${o.value}% off` : `${formatMoney(o.value)} off`}{o.maxDiscountPaise ? ` (up to ${formatMoney(o.maxDiscountPaise)})` : ''}</p>
                <p className="text-sm text-muted mt-1">{o.description}</p>
                <p className="text-xs text-muted mt-3">{o.minOrderPaise ? `Min. order ${formatMoney(o.minOrderPaise)} · ` : ''}{o.mode === 'ANY' ? 'All orders' : o.mode === 'RETAIL' ? 'Personal orders' : 'Business orders'} · Valid till {formatDate(o.endsAt)}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {deals?.deals.length ? deals.deals.map((d) => (
        <section key={d.id} className="mb-12">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
            <div><h2 className="text-2xl">{d.name}</h2><p className="text-muted">{d.description} · {Math.round(d.discountBps / 100)}% off</p></div>
            <span className={`badge ${d.live ? 'badge-danger' : 'badge-info'} py-1.5 px-3 text-sm`}><Countdown endsAt={d.endsAt} startsAt={d.live ? undefined : d.startsAt} /></span>
          </div>
          <ProductGrid products={d.products} />
        </section>
      )) : <div className="card"><Empty title="No flash deals running right now" body="Check back soon, or browse products with everyday discounts." action={<Link href="/products?sort=discount" className="btn btn-primary">Biggest discounts</Link>} /></div>}
    </div>
  );
}
