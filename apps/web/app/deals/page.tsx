import type { Metadata } from 'next';
import Link from 'next/link';
import { Flame, TicketPercent, Clock, ArrowRight, Zap, ShieldCheck } from 'lucide-react';
import { tryServerApi } from '@/lib/server-api';
import type { Product } from '@/lib/types';
import { formatDate } from '@/lib/format';
import { ProductGrid } from '@/components/product-card';
import { Countdown } from '@/components/home-parts';
import { CouponCard, Rail } from '@/components/home-sections';
import { PageBanner, Panel } from '@/components/page-banner';
import { Empty } from '@/components/ui';

export const metadata: Metadata = { title: 'Deals and offers', description: 'Scheduled flash deals and coupon offers with clear terms.' };
export const dynamic = 'force-dynamic'; // rendered per request; API data is cached via fetch revalidate

type Deal = { id: string; name: string; description: string; discountBps: number; startsAt: string; endsAt: string; live: boolean; products: Product[] };
type Offers = { offers: { code: string; description: string; kind: string; value: number; maxDiscountPaise: number | null; minOrderPaise: number; mode: string; endsAt: string }[] };

export default async function DealsPage() {
  const [deals, offers, discounted] = await Promise.all([
    tryServerApi<{ deals: Deal[] }>('/deals', { revalidate: 60 }),
    tryServerApi<Offers>('/offers', { revalidate: 60 }),
    tryServerApi<{ products: Product[] }>('/products?sort=discount&limit=12', { revalidate: 120 }),
  ]);
  const all = deals?.deals ?? [];
  const live = all.filter((d) => d.live);
  const upcoming = all.filter((d) => !d.live);
  const best = Math.max(0, ...all.map((d) => Math.round(d.discountBps / 100)));

  return (
    <div className="bg-[#f3f5f0] -mb-16 pb-16">
      <div className="container-page py-5 md:py-6 grid grid-cols-[minmax(0,1fr)] gap-5 md:gap-6">
        <PageBanner tone="deal" icon={<Flame size={24} />} eyebrow="Today’s deals" title="Deals with clear terms"
          description="Every deal has a real start and end time. Prices return to normal when the timer ends — no fake urgency."
          stats={[{ label: 'Live now', value: live.length }, { label: 'Coupon codes', value: offers?.offers.length ?? 0 }, { label: 'Up to', value: best ? `${best}% off` : '—' }]}>
          {all.length > 1 && (
            <nav aria-label="Jump to a deal" className="mt-6 flex gap-2 overflow-x-auto no-scrollbar">
              {all.map((d) => <a key={d.id} href={`#deal-${d.id}`} className="shrink-0 rounded-full bg-white/12 hover:bg-white/20 border border-white/15 px-3.5 py-1.5 text-sm font-semibold">{d.name}</a>)}
            </nav>
          )}
        </PageBanner>

        <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:gap-3">
          {[[Clock, 'Real timers', 'Start and end times are fixed in advance'], [Zap, 'Applied automatically', 'Deal prices show in your cart'], [ShieldCheck, 'Same sellers, same warranty', 'Only the price changes']].map(([Icon, t, b]) => {
            const I = Icon as typeof Clock;
            return <li key={t as string} className="flex items-center gap-3 rounded-2xl bg-white border border-line px-4 py-3"><span className="size-10 rounded-xl bg-danger-bg text-danger grid place-items-center shrink-0"><I size={18} /></span><span className="min-w-0"><span className="block text-sm font-semibold">{t as string}</span><span className="block text-xs text-muted">{b as string}</span></span></li>;
          })}
        </ul>

        {offers?.offers.length ? (
          <Panel title={<span className="flex items-center gap-2"><TicketPercent className="text-gold-ink" />Coupon codes</span>} subtitle="Copy a code and apply it at checkout. One coupon per order.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{offers.offers.map((o, i) => <CouponCard key={o.code} o={o} index={i} />)}</div>
          </Panel>
        ) : null}

        {[...live, ...upcoming].map((d) => (
          <section key={d.id} id={`deal-${d.id}`} className="scroll-mt-32 rounded-3xl overflow-hidden border border-line shadow-card bg-white">
            <div className={`flex flex-wrap items-center justify-between gap-3 px-4 md:px-6 py-4 text-white ${d.live ? 'bg-gradient-to-r from-[#7f1d1d] via-[#b42318] to-[#c99a3d]' : 'bg-gradient-to-r from-[#0f2742] to-[#3b7cb5]'}`}>
              <div className="flex items-center gap-3 min-w-0">
                <span className="size-12 shrink-0 rounded-2xl bg-white/15 grid place-items-center font-display text-lg">{Math.round(d.discountBps / 100)}%</span>
                <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.14em] text-white/80">{d.live ? 'Live now' : `Starts ${formatDate(d.startsAt)}`}</p><h2 className="text-xl md:text-2xl text-white">{d.name}</h2><p className="text-sm text-white/80 line-clamp-1">{d.description}</p></div>
              </div>
              <span className="rounded-full bg-black/20 px-4 py-2 text-sm font-semibold"><Countdown endsAt={d.endsAt} startsAt={d.live ? undefined : d.startsAt} /></span>
            </div>
            <div className="p-4 md:p-6">{d.products.length ? <ProductGrid products={d.products} /> : <p className="text-muted">Products for this deal appear when it starts.</p>}</div>
          </section>
        ))}

        {!all.length && <Panel><Empty icon={<Flame size={26} />} title="No flash deals running right now" body="Check back soon, or browse products with everyday discounts." action={<Link href="/products?sort=discount" className="btn btn-primary">Biggest discounts</Link>} /></Panel>}

        {discounted?.products.length ? <Rail title="Everyday biggest discounts" subtitle="Lower than MRP every day, no timer needed" href="/products?sort=discount" products={discounted.products} /> : null}

        <Link href="/wholesale" className="group flex flex-wrap items-center justify-between gap-4 rounded-3xl surface-emerald p-6 md:p-8">
          <div><p className="eyebrow text-gold-light!">Buying in bulk?</p><p className="font-display text-2xl md:text-3xl text-white mt-1">Wholesale prices beat most deals</p><p className="text-white/70 mt-1">MOQ tiers lower the unit price as your quantity grows.</p></div>
          <span className="btn btn-gold">Explore wholesale<ArrowRight size={16} className="transition group-hover:translate-x-1" /></span>
        </Link>
      </div>
    </div>
  );
}
