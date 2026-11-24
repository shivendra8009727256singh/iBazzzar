import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { Flame, TicketPercent, Clock, ArrowRight, Zap, ShieldCheck, CalendarClock, Tag, BadgePercent, Sparkles } from 'lucide-react';
import { tryServerApi } from '@/lib/server-api';
import type { Product } from '@/lib/types';
import { cn, formatDate, formatMoney } from '@/lib/format';
import { ProductGrid } from '@/components/product-card';
import { CountdownBoxes, CouponCard, DealProgress, Rail } from '@/components/home-sections';
import { TILE_BG } from '@/lib/tiles';
import { Empty } from '@/components/ui';

export const metadata: Metadata = { title: 'Deals and offers', description: 'Scheduled flash deals and coupon offers with clear terms.' };
export const dynamic = 'force-dynamic'; // rendered per request; API data is cached via fetch revalidate

type Deal = { id: string; name: string; description: string; discountBps: number; startsAt: string; endsAt: string; live: boolean; products: Product[] };
type Offers = { offers: { code: string; description: string; kind: string; value: number; maxDiscountPaise: number | null; minOrderPaise: number; mode: string; endsAt: string }[] };

const pct = (d: Deal) => Math.round(d.discountBps / 100);
// Live deals alternate between a few rich sale colourways so a long page doesn't feel repetitive.
const LIVE_TONES = [
  'bg-[linear-gradient(120deg,#5c1010_0%,#b42318_55%,#e0892b_100%)]',
  'bg-[linear-gradient(120deg,#3b0a45_0%,#8e2463_55%,#e0602b_100%)]',
  'bg-[linear-gradient(120deg,#062a1e_0%,#17603f_55%,#c99a3d_100%)]',
];

export default async function DealsPage() {
  const [deals, offers, discounted] = await Promise.all([
    tryServerApi<{ deals: Deal[] }>('/deals', { revalidate: 60 }),
    tryServerApi<Offers>('/offers', { revalidate: 60 }),
    tryServerApi<{ products: Product[] }>('/products?sort=discount&limit=12', { revalidate: 120 }),
  ]);
  const all = deals?.deals ?? [];
  const live = all.filter((d) => d.live);
  const upcoming = all.filter((d) => !d.live);
  const featured = live[0] ?? upcoming[0];
  const best = Math.max(0, ...all.map(pct), ...(discounted?.products ?? []).map((p) => Math.round(100 - (p.pricePaise / Math.max(1, p.mrpPaise)) * 100)));
  // Featured deal first, topped up with other discounted products so the collage always has three.
  const collage = [...(featured?.products ?? []), ...(discounted?.products ?? [])].filter((p, i, a) => a.findIndex((x) => x.catalogProductId === p.catalogProductId) === i).slice(0, 3);
  const tabs = [
    live.length ? ['#live', `Live now (${live.length})`, Flame] : null,
    upcoming.length ? ['#upcoming', `Coming soon (${upcoming.length})`, CalendarClock] : null,
    offers?.offers.length ? ['#coupons', `Coupons (${offers.offers.length})`, TicketPercent] : null,
    discounted?.products.length ? ['#everyday', 'Everyday low prices', Tag] : null,
  ].filter(Boolean) as [string, string, typeof Flame][];

  return (
    <div className="bg-[#f3f5f0] -mb-16 pb-16">
      {/* Sale banner */}
      <section className="relative overflow-hidden text-white bg-[linear-gradient(115deg,#3d0808_0%,#8f1a14_40%,#c8331f_70%,#e8902d_100%)]">
        <span className="absolute inset-0 opacity-[0.08] bg-[radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:20px_20px]" aria-hidden />
        <span className="absolute -left-24 -bottom-32 size-96 rounded-full bg-[#ffd98a]/15 blur-3xl" aria-hidden />
        <span className="absolute right-[8%] -top-24 size-[420px] rounded-full bg-white/[0.07]" aria-hidden />
        <div className="container-page relative py-8 md:py-12 grid gap-8 lg:grid-cols-[1.1fr_1fr] items-center">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 border border-white/20 px-3 py-1 text-[11px] md:text-xs font-bold uppercase tracking-[0.16em]"><Zap size={13} className="text-[#ffd98a]" />Today’s deals</span>
            <h1 className="mt-4 text-white leading-[0.95]">
              <span className="block text-[22px] md:text-[28px] font-sans font-semibold text-white/85">Up to</span>
              <span className="block font-display text-[76px] md:text-[120px] bg-gradient-to-b from-white to-[#ffd98a] bg-clip-text text-transparent">{best || 20}% OFF</span>
            </h1>
            <p className="text-white/80 mt-3 max-w-lg text-[15px] md:text-[17px]">Real start and end times. Prices go back to normal when the timer ends — no fake urgency, no inflated MRPs.</p>
            {featured && (
              <div className="mt-6 flex flex-wrap items-end gap-5">
                <CountdownBoxes endsAt={featured.endsAt} startsAt={featured.live ? undefined : featured.startsAt} />
                <a href={featured.live ? '#live' : '#upcoming'} className="btn bg-white text-[#9f1d17] hover:bg-ivory rounded-full">Shop {featured.name}<ArrowRight size={16} /></a>
              </div>
            )}
          </div>
          {collage.length > 0 && (
            <div className="relative h-[230px] sm:h-[300px] md:h-[340px] max-lg:hidden sm:max-lg:block">
              {collage.map((p, i) => (
                <Link key={`${p.listingId}:${i}`} href={`/products/${p.slug}`} aria-label={p.name}
                  className={cn('absolute rounded-[28px] bg-white/95 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.5)] overflow-hidden transition duration-500 hover:-translate-y-2 hover:rotate-0',
                    i === 0 && 'left-[22%] top-[6%] w-[44%] aspect-square z-20 -rotate-3',
                    i === 1 && 'left-0 top-[34%] w-[34%] aspect-square z-10 rotate-[-9deg]',
                    i === 2 && 'right-0 top-[30%] w-[34%] aspect-square z-10 rotate-[8deg]')}>
                  <span className={cn('absolute inset-0', TILE_BG[i % TILE_BG.length])} />
                  <Image src={p.image} alt="" fill sizes="240px" className="object-contain p-6" unoptimized={p.image.startsWith('/api/')} />
                  {p.promotion && <span className="absolute top-3 left-3 rounded-full bg-danger text-white text-[11px] font-bold px-2 py-0.5">{Math.round(p.promotion.discountBps / 100)}% OFF</span>}
                  <span className="absolute bottom-0 inset-x-0 bg-white/95 px-3 py-2 text-[12px] font-bold text-ink truncate">{formatMoney(p.pricePaise)} <span className="text-muted font-normal line-through">{formatMoney(p.mrpPaise)}</span></span>
                </Link>
              ))}
              <span className="absolute right-[6%] top-0 z-30 size-24 md:size-28 rounded-full bg-[#ffd98a] text-[#7a1a10] grid place-items-center text-center font-display leading-none rotate-12 shadow-lift">
                <span><span className="block text-[13px] font-sans font-bold tracking-wider">FLAT</span><span className="text-[34px] md:text-[40px]">{featured ? pct(featured) : best}%</span><span className="block text-[13px] font-sans font-bold">OFF</span></span>
              </span>
            </div>
          )}
        </div>
        {tabs.length > 0 && (
          <nav aria-label="Deals sections" className="relative border-t border-white/15 bg-black/15 backdrop-blur">
            <div className="container-page flex gap-2 overflow-x-auto no-scrollbar py-3">
              {tabs.map(([href, label, Icon]) => <a key={href} href={href} className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-white/12 hover:bg-white hover:text-[#9f1d17] border border-white/20 px-4 py-2 text-sm font-semibold transition"><Icon size={15} />{label}</a>)}
            </div>
          </nav>
        )}
      </section>

      <div className="container-page pt-5 md:pt-7 grid grid-cols-[minmax(0,1fr)] gap-6 md:gap-8">
        {/* Promise strip */}
        <ul className="grid grid-cols-1 sm:grid-cols-3 rounded-2xl bg-white border border-line shadow-card overflow-hidden">
          {[[Clock, 'Real timers', 'Start and end times fixed in advance'], [BadgePercent, 'Honest discounts', 'Measured against the seller’s real MRP'], [ShieldCheck, 'Same sellers, same warranty', 'Only the price changes']].map(([Icon, t, b], i) => {
            const I = Icon as typeof Clock;
            return <li key={t as string} className={cn('flex items-center gap-3 px-4 py-3.5 border-line', i < 2 && 'max-sm:border-b sm:border-r')}><span className="size-10 rounded-xl bg-danger-bg text-danger grid place-items-center shrink-0"><I size={18} /></span><span className="min-w-0"><span className="block text-sm font-semibold">{t as string}</span><span className="block text-xs text-muted">{b as string}</span></span></li>;
          })}
        </ul>

        {/* Live deals */}
        {live.length > 0 && (
          <div id="live" className="grid gap-6 scroll-mt-40">
            {live.map((d, i) => (
              <section key={d.id} id={`deal-${d.id}`} className="scroll-mt-40 rounded-3xl overflow-hidden border border-line shadow-lift bg-white">
                <div className={cn('relative overflow-hidden px-4 md:px-7 py-5 text-white grid gap-4 md:grid-cols-[1fr_auto] md:items-center', LIVE_TONES[i % LIVE_TONES.length])}>
                  <span className="absolute -right-10 -top-16 size-56 rounded-full bg-white/10" aria-hidden />
                  <div className="relative flex items-center gap-4 min-w-0">
                    <span className="shrink-0 size-16 md:size-20 rounded-2xl bg-white text-[#9f1d17] grid place-items-center text-center leading-none shadow-lift"><span><span className="font-display text-[28px] md:text-[34px]">{pct(d)}%</span><span className="block text-[10px] font-bold tracking-widest">OFF</span></span></span>
                    <div className="min-w-0">
                      <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/85"><span className="size-2 rounded-full bg-[#7CFFB2] animate-pulse" />Live now</p>
                      <h2 className="text-[24px] md:text-[32px] text-white leading-tight">{d.name}</h2>
                      <p className="text-sm text-white/80 line-clamp-1">{d.description}</p>
                    </div>
                  </div>
                  <div className="relative flex flex-wrap items-end gap-4">
                    <CountdownBoxes endsAt={d.endsAt} />
                    <DealProgress startsAt={d.startsAt} endsAt={d.endsAt} />
                  </div>
                </div>
                <div className="p-4 md:p-6">
                  <p className="text-sm text-muted mb-4">{d.products.length} product{d.products.length === 1 ? '' : 's'} on deal · ends {formatDate(d.endsAt, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
                  {d.products.length ? <ProductGrid products={d.products} /> : <p className="text-muted">Products for this deal appear shortly.</p>}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* Coupons */}
        {offers?.offers.length ? (
          <section id="coupons" className="scroll-mt-40 relative overflow-hidden rounded-3xl surface-emerald p-5 md:p-8">
            <span className="absolute -right-20 -top-20 size-72 rounded-full bg-gold/15 blur-2xl" aria-hidden />
            <div className="relative flex flex-wrap items-end justify-between gap-3 mb-5">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-light/15 text-gold-light px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em]"><Sparkles size={13} />Extra savings</span>
                <h2 className="text-[26px] md:text-[34px] text-white mt-2">Stack a coupon at checkout</h2>
                <p className="text-white/70 text-sm mt-1">Copy a code and apply it in the cart. One coupon per order.</p>
              </div>
            </div>
            <div className="relative grid gap-4 md:grid-cols-2 xl:grid-cols-3">{offers.offers.map((o, i) => <CouponCard key={o.code} o={o} index={i} />)}</div>
          </section>
        ) : null}

        {/* Upcoming */}
        {upcoming.length > 0 && (
          <section id="upcoming" className="scroll-mt-40">
            <div className="flex items-end justify-between gap-3 mb-4">
              <div><span className="block h-1 w-10 rounded-full bg-gradient-to-r from-gold to-gold-light mb-2" aria-hidden /><h2 className="text-[24px] md:text-[30px]">Coming soon</h2><p className="text-sm text-muted mt-1">Mark your calendar — prices drop when the timer hits zero.</p></div>
            </div>
            <div className={cn('grid gap-4', upcoming.length > 1 && 'md:grid-cols-2')}>
              {upcoming.map((d) => (
                <article key={d.id} id={`deal-${d.id}`} className={cn('scroll-mt-40 rounded-3xl overflow-hidden bg-white border border-line shadow-card', upcoming.length === 1 && 'lg:grid lg:grid-cols-2')}>
                  <div className="relative overflow-hidden p-5 md:p-6 text-white bg-[linear-gradient(120deg,#0f2742_0%,#1d4f7a_60%,#3b7cb5_100%)]">
                    <span className="absolute -right-12 -bottom-16 size-48 rounded-full bg-white/10" aria-hidden />
                    <p className="relative text-[11px] font-bold uppercase tracking-[0.14em] text-white/75">Starts {formatDate(d.startsAt, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
                    <h3 className="relative font-display text-[24px] md:text-[28px] mt-1">{d.name} · {pct(d)}% off</h3>
                    <p className="relative text-sm text-white/75 line-clamp-1">{d.description}</p>
                    <div className="relative mt-4"><CountdownBoxes endsAt={d.endsAt} startsAt={d.startsAt} tone="navy" /></div>
                  </div>
                  <div className="p-4 md:p-5 lg:self-center">
                    <p className="text-[12.5px] font-semibold text-muted mb-3">Sneak peek · {d.products.length} product{d.products.length === 1 ? '' : 's'}</p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                      {d.products.slice(0, 4).map((p, i) => (
                        <Link key={`${p.listingId}:${i}`} href={`/products/${p.slug}`} className="group min-w-0">
                          <span className={cn('relative block aspect-square rounded-xl overflow-hidden', TILE_BG[(i + 2) % TILE_BG.length])}><Image src={p.image} alt="" fill sizes="120px" className="object-contain p-3 group-hover:scale-110 transition duration-500" unoptimized={p.image.startsWith('/api/')} /></span>
                          <span className="block text-[11.5px] mt-1 truncate text-ink/80">{p.name}</span>
                          <span className="block text-[11.5px] font-bold">{formatMoney(p.pricePaise)}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {!all.length && (
          <section className="rounded-3xl bg-white border border-line shadow-card"><Empty icon={<Flame size={26} />} title="No flash deals running right now" body="Check back soon, or browse products with everyday discounts." action={<Link href="/products?sort=discount" className="btn btn-primary">Biggest discounts</Link>} /></section>
        )}

        {discounted?.products.length ? <div id="everyday" className="scroll-mt-40"><Rail title="Everyday low prices" subtitle="Below MRP every day — no timer needed" href="/products?sort=discount" products={discounted.products} /></div> : null}

        <Link href="/wholesale" className="group relative overflow-hidden flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-ivory border border-line p-6 md:p-8">
          <span className="absolute -left-16 -bottom-16 size-56 rounded-full bg-gold/15" aria-hidden />
          <div className="relative"><p className="eyebrow">Buying in bulk?</p><p className="font-display text-2xl md:text-3xl mt-1">Wholesale prices beat most deals</p><p className="text-muted mt-1">MOQ tiers lower the unit price as your quantity grows.</p></div>
          <span className="relative btn btn-primary">Explore wholesale<ArrowRight size={16} className="transition group-hover:translate-x-1" /></span>
        </Link>
      </div>
    </div>
  );
}
