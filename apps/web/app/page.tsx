import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight, ShoppingBag, Building2, Cpu, Shirt, Apple, Sofa, Sparkles, Armchair, Wrench, PenTool, Car, Dumbbell, Puzzle, Watch,
  ShieldCheck, RotateCcw, Truck, Store, BadgeCheck, FileText, Layers, ClipboardList, Users, Receipt, LayoutGrid, Banknote, Flame, Star, TicketPercent, Quote,
} from 'lucide-react';
import { tryServerApi } from '@/lib/server-api';
import type { Category, Product, Review } from '@/lib/types';
import { cn, formatMoney, percentOff } from '@/lib/format';
import { HeroSlider } from '@/components/hero-slider';
import { CountdownBoxes, MiniProductCard, OfferStrip, QuadCard, Rail, SectionHead } from '@/components/home-sections';

export const dynamic = 'force-dynamic'; // rendered per request; API data is cached via fetch revalidate

type Home = {
  rails: { trending: Product[]; bestSellers: Product[]; newArrivals: Product[]; topRated: Product[]; deals: Product[] };
  sections: Record<string, { heading: string; body: string; data: { ctaLabel?: string; ctaLink?: string } }>;
  sellers: { id: string; slug: string; name: string; description: string; primaryCategory: string | null }[];
  homeDeal?: Partial<HomeDeal>;
};
/** Admin → Homepage & content → Homepage deal block. Empty promotionId = the live deal ending soonest. */
type HomeDeal = { enabled: boolean; promotionId: string; label: string; ctaLabel: string; bgFrom: string; bgVia: string; bgTo: string; showTimer: boolean; showOtherDeals: boolean };
const HOME_DEAL_DEFAULTS: HomeDeal = { enabled: true, promotionId: '', label: 'Deal of the day', ctaLabel: 'All deals', bgFrom: '#5c1010', bgVia: '#b42318', bgTo: '#e0892b', showTimer: true, showOtherDeals: true };
type Deals = { deals: { id: string; name: string; description: string; discountBps: number; startsAt: string; endsAt: string; live: boolean; products: Product[] }[] };
type Offer = { code: string; description: string; kind: string; value: number; minOrderPaise: number; endsAt: string };
type Brand = { id: string; name: string; slug: string; verified: boolean; products: number; image: string | null; category: string | null };

const ICONS: Record<string, typeof Cpu> = {
  electronics: Cpu, fashion: Shirt, grocery: Apple, 'home-and-living': Sofa, 'beauty-and-personal-care': Sparkles, furniture: Armchair,
  'industrial-supplies': Wrench, 'office-supplies': PenTool, automotive: Car, sports: Dumbbell, toys: Puzzle, 'smart-gadgets': Watch,
};
// Each department gets its own colour pair (tile background + icon colour), like a mall directory.
const CAT_TONES = [
  'bg-[#e3efe7] text-[#17603f]', 'bg-[#fbe7ea] text-[#b4234a]', 'bg-[#eaf3dc] text-[#4d7a12]', 'bg-[#f6ecda] text-[#9a6413]',
  'bg-[#f7e6f3] text-[#a0337f]', 'bg-[#efe6dc] text-[#7a4b25]', 'bg-[#e5edf6] text-[#245f96]', 'bg-[#ece8f8] text-[#5b3fb0]',
  'bg-[#e6eef0] text-[#2e5d6b]', 'bg-[#fdebdc] text-[#c25414]', 'bg-[#fff2cc] text-[#9c7a06]', 'bg-[#e4f0f6] text-[#1d6a8f]',
];
const PRICE_TILES = [
  { max: 299, tone: 'from-[#ff8a65] to-[#e8553d]' }, { max: 499, tone: 'from-[#f0b43c] to-[#d48a12]' },
  { max: 999, tone: 'from-[#4fa37a] to-[#17603f]' }, { max: 1999, tone: 'from-[#5b8fd6] to-[#2a5ea8]' },
];

export default async function HomePage() {
  const [home, cats, deals, reviews, offers, brands, discounted, bulk] = await Promise.all([
    tryServerApi<Home>('/home', { revalidate: 30 }),
    tryServerApi<{ categories: Category[] }>('/categories', { revalidate: 300 }),
    tryServerApi<Deals>('/deals', { revalidate: 30 }),
    tryServerApi<{ reviews: Review[] }>('/reviews/recent', { revalidate: 300 }),
    tryServerApi<{ offers: Offer[] }>('/offers', { revalidate: 120 }),
    tryServerApi<{ brands: Brand[] }>('/brands', { revalidate: 300 }),
    tryServerApi<{ products: Product[] }>('/products?sort=discount&limit=4', { revalidate: 30 }),
    tryServerApi<{ products: Product[] }>('/products?wholesale=true&sort=popular&limit=4', { revalidate: 30 }),
  ]);
  const wholesale = home?.sections.wholesale;
  const sell = home?.sections.sell;
  const categories = (cats?.categories ?? []).filter((c) => !c.parentId);
  const homeDeal = { ...HOME_DEAL_DEFAULTS, ...(home?.homeDeal ?? {}) };
  const allDeals = deals?.deals ?? []; // live first-ending first, as the API sorts them
  // The admin's chosen deal if it is still running or scheduled, else the live deal ending soonest, else the next one.
  const liveDeal = homeDeal.enabled ? (allDeals.find((d) => d.id === homeDeal.promotionId) ?? allDeals.find((d) => d.live) ?? allDeals[0]) : undefined;
  const otherLive = homeDeal.showOtherDeals ? allDeals.filter((d) => d.live && d.id !== liveDeal?.id) : [];
  const topBrands = [...(brands?.brands ?? [])].sort((a, b) => b.products - a.products).slice(0, 8);
  const coupon = offers?.offers[0];

  return (
    <div className="bg-[#f3f5f0] -mb-16 pb-16">
      {/* Department tiles */}
      <nav aria-label="Shop by category" className="bg-white border-b border-line">
        <div className="container-page flex gap-3 md:gap-2 overflow-x-auto no-scrollbar py-3.5 lg:justify-between">
          {categories.slice(0, 12).map((c, i) => {
            const Icon = ICONS[c.slug] ?? LayoutGrid;
            return (
              <Link key={c.id} href={`/products?category=${c.slug}`} className="group flex flex-col items-center gap-1.5 shrink-0 w-[72px] md:w-[84px] text-center">
                <span className={cn('size-14 md:size-[62px] rounded-2xl grid place-items-center transition duration-300 group-hover:-translate-y-1 group-hover:shadow-lift group-hover:rounded-[22px]', CAT_TONES[i % CAT_TONES.length])}><Icon size={26} strokeWidth={1.8} /></span>
                <span className="text-[11.5px] md:text-[12.5px] font-semibold leading-tight line-clamp-2 text-ink/85 group-hover:text-forest">{c.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="container-page pt-4 md:pt-5 grid grid-cols-[minmax(0,1fr)] gap-5 md:gap-7">
        {/* Hero with side promotions (Admin → Homepage & content manages the slides) */}
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_330px]">
          <div className="rounded-3xl overflow-hidden shadow-lift min-w-0"><HeroSlider /></div>
          <div className="grid grid-cols-2 lg:grid-cols-1 lg:grid-rows-2 gap-3 md:gap-4">
            <Link href="/wholesale" className="group relative overflow-hidden rounded-3xl p-4 md:p-6 text-white bg-[linear-gradient(135deg,#0f2742_0%,#1d4f7a_60%,#3b7cb5_100%)] flex flex-col justify-between min-h-[150px]">
              <span className="absolute -right-8 -bottom-8 size-36 rounded-full bg-white/10 group-hover:scale-125 transition duration-700" aria-hidden />
              <Building2 size={58} className="absolute right-4 bottom-4 text-white/15" aria-hidden />
              <span className="relative text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">For business</span>
              <span className="relative"><span className="block font-display text-[19px] md:text-[25px] leading-tight">Wholesale prices, MOQ tiers</span><span className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-[#ffd98a]">Explore wholesale<ArrowRight size={14} className="group-hover:translate-x-1 transition" /></span></span>
            </Link>
            <Link href={coupon ? '/deals' : '/sell'} className="group relative overflow-hidden rounded-3xl p-4 md:p-6 bg-[linear-gradient(135deg,#fff4d6_0%,#f6dc9a_55%,#e2b453_100%)] text-ink flex flex-col justify-between min-h-[150px]">
              <span className="absolute -right-10 -top-10 size-40 rounded-full bg-white/40 group-hover:scale-125 transition duration-700" aria-hidden />
              <TicketPercent size={58} className="absolute right-4 bottom-4 text-[#9a6413]/20" aria-hidden />
              <span className="relative text-[11px] font-bold uppercase tracking-[0.14em] text-[#7a5715]">{coupon ? 'Coupon of the week' : 'Sell with us'}</span>
              {coupon ? (
                <span className="relative"><span className="block font-display text-[19px] md:text-[25px] leading-tight">{coupon.kind === 'PERCENT' ? `Extra ${coupon.value}% off` : `${formatMoney(coupon.value)} off`}</span><span className="mt-2 inline-flex rounded-lg border border-dashed border-[#7a5715] bg-white/70 px-2 py-0.5 font-mono text-[13px] font-bold tracking-wider text-[#7a5715]">{coupon.code}</span></span>
              ) : <span className="relative font-display text-[19px] md:text-[25px] leading-tight">Open your store in the mall</span>}
            </Link>
          </div>
        </section>

        {/* Trust bar */}
        <ul className="grid grid-cols-2 lg:grid-cols-4 rounded-2xl bg-white border border-line shadow-card overflow-hidden">
          {[[Truck, 'Free delivery', 'On eligible seller orders'], [Banknote, 'Cash on delivery', 'Pay when it arrives'], [RotateCcw, 'Easy returns', 'Window shown on every product'], [ShieldCheck, 'GST invoice', 'From every verified seller']].map(([Icon, t, b], i) => {
            const I = Icon as typeof Truck;
            return <li key={t as string} className={cn('flex items-center gap-3 px-3 py-3 md:px-5 md:py-4 border-line min-w-0', i % 2 === 0 && 'border-r', i < 2 && 'max-lg:border-b', i === 1 && 'lg:border-r', i === 2 && 'lg:border-r')}><I size={22} className="text-forest shrink-0" strokeWidth={1.8} /><span className="min-w-0"><span className="block text-[13px] md:text-sm font-semibold">{t as string}</span><span className="block text-[11.5px] md:text-xs text-muted truncate">{b as string}</span></span></li>;
          })}
        </ul>

        {/* Themed picks, 2×2 each */}
        <section aria-label="Picks for you" className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {discounted?.products.length ? <QuadCard title="Biggest savings today" href="/products?sort=discount" cta="See all offers" products={discounted.products} tone={0} tags={discounted.products.map((p) => `${percentOff(p.pricePaise, p.mrpPaise)}% off`)} /> : null}
          {home && <QuadCard title="Top rated by buyers" href="/products?sort=rating" cta="See top rated" products={home.rails.topRated} tone={1} tags={home.rails.topRated.map((p) => (p.rating ? `★ ${p.rating.average.toFixed(1)} · ${p.rating.count} ratings` : formatMoney(p.pricePaise)))} />}
          {home && <QuadCard title="New this week" href="/products?sort=newest" cta="See new arrivals" products={home.rails.newArrivals} tone={2} tags={home.rails.newArrivals.map((p) => `From ${formatMoney(p.pricePaise)}`)} />}
          {bulk?.products.length ? <QuadCard title="Bulk-ready for business" href="/products?wholesale=true" cta="Wholesale catalogue" products={bulk.products} tone={3} tags={bulk.products.map((p) => (p.moq > 1 ? `MOQ ${p.moq} · ${formatMoney(p.pricePaise)}` : `Tier prices · ${formatMoney(p.pricePaise)}`))} /> : null}
        </section>

        {/* Deal of the day */}
        {liveDeal && liveDeal.products.length > 0 && (
          <section className="grid lg:grid-cols-[300px_minmax(0,1fr)] rounded-3xl overflow-hidden shadow-lift bg-white border border-line">
            <div className="relative overflow-hidden p-5 md:p-7 text-white flex flex-col justify-between gap-5" style={{ background: `linear-gradient(150deg, ${homeDeal.bgFrom} 0%, ${homeDeal.bgVia} 55%, ${homeDeal.bgTo} 100%)` }}>
              <span className="absolute -right-16 -top-16 size-56 rounded-full bg-white/10" aria-hidden />
              <span className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:18px_18px]" aria-hidden />
              <div className="relative">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em]"><Flame size={13} />{liveDeal.live ? homeDeal.label : 'Coming up'}</span>
                <h2 className="text-[26px] md:text-[32px] text-white mt-3 leading-tight">{liveDeal.name}</h2>
                <p className="text-white/80 text-sm mt-1">{liveDeal.description}</p>
                <p className="mt-3 font-display text-[44px] leading-none">{Math.round(liveDeal.discountBps / 100)}%<span className="text-lg font-sans font-bold ml-1">OFF</span></p>
              </div>
              <div className="relative grid gap-4">
                {homeDeal.showTimer && <CountdownBoxes endsAt={liveDeal.endsAt} startsAt={liveDeal.live ? undefined : liveDeal.startsAt} />}
                <Link href={`/deals#deal-${liveDeal.id}`} className="btn bg-white text-ink hover:bg-ivory rounded-full justify-self-start">{homeDeal.ctaLabel}<ArrowRight size={16} /></Link>
                {otherLive.length > 0 && (
                  <div className="grid gap-1.5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">Also live now</p>
                    <div className="flex flex-wrap gap-1.5">
                      {otherLive.slice(0, 4).map((d) => <Link key={d.id} href={`/deals#deal-${d.id}`} className="rounded-full bg-white/15 hover:bg-white hover:text-ink border border-white/20 px-3 py-1 text-[12.5px] font-semibold transition">{d.name} · {Math.round(d.discountBps / 100)}%</Link>)}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3 md:gap-4 overflow-x-auto no-scrollbar p-4 md:p-6 snap-x items-start min-w-0">
              {liveDeal.products.map((p, i) => <MiniProductCard key={`${p.listingId}:${i}`} p={p} tone={i + 4} />)}
              <Link href="/deals" className="snap-start shrink-0 w-[160px] sm:w-[188px] aspect-[4/5] rounded-2xl border-2 border-dashed border-line grid place-items-center text-center text-forest font-semibold hover:border-forest hover:bg-mint/40 transition"><span><ArrowRight className="mx-auto mb-2" />More deals</span></Link>
            </div>
          </section>
        )}

        {offers?.offers.length ? <OfferStrip offers={offers.offers} /> : null}

        {home && <Rail title="Best sellers" subtitle="The most-ordered products this week" href="/products?sort=popular" products={home.rails.bestSellers} ranked />}

        {/* Shop by price */}
        <section className="rounded-3xl bg-white border border-line shadow-card p-4 md:p-6">
          <SectionHead title="Shop by price" subtitle="Great finds for every budget" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {PRICE_TILES.map((t) => (
              <Link key={t.max} href={`/products?max=${t.max}`} className={cn('group relative overflow-hidden rounded-2xl bg-gradient-to-br text-white p-4 md:p-5 min-h-[112px] md:min-h-[136px] flex flex-col justify-between hover:-translate-y-1 hover:shadow-lift transition', t.tone)}>
                <span className="absolute -right-6 -bottom-8 size-28 rounded-full bg-white/15 group-hover:scale-125 transition duration-700" aria-hidden />
                <span className="relative text-[12px] font-bold uppercase tracking-[0.16em] text-white/85">Under</span>
                <span className="relative font-display text-[32px] md:text-[42px] leading-none">₹{t.max.toLocaleString('en-IN')}</span>
                <span className="relative text-[12.5px] font-semibold inline-flex items-center gap-1">Shop now<ArrowRight size={13} className="group-hover:translate-x-1 transition" /></span>
              </Link>
            ))}
          </div>
        </section>

        {/* Personal vs business */}
        <section className="grid gap-4 md:grid-cols-2">
          {[
            { icon: ShoppingBag, title: 'Shop for yourself', body: 'Everyday essentials and treats across every department, with genuine offers and secure checkout.', points: ['Everyday essentials', 'Genuine offers', 'Cash on delivery', 'Easy returns'], href: '/products', cta: 'Start shopping' },
            { icon: Building2, title: 'Buy for your business', body: 'Wholesale prices, MOQ-based tiers, quotations and purchase orders with approvals for your team.', points: ['Wholesale catalogue', 'Bulk prices & MOQ', 'Request quotations', 'GST invoices'], href: '/wholesale', cta: 'Explore wholesale', dark: true },
          ].map((c) => (
            <Link key={c.title} href={c.href} className={`group relative overflow-hidden rounded-3xl p-6 md:p-8 flex flex-col gap-3 transition hover:-translate-y-0.5 hover:shadow-lift ${c.dark ? 'surface-emerald' : 'bg-white border border-line shadow-card'}`}>
              <span className={`absolute -right-10 -top-10 size-40 rounded-full ${c.dark ? 'bg-gold/15' : 'bg-mint'}`} aria-hidden />
              <span className={`relative size-12 rounded-2xl grid place-items-center ${c.dark ? 'bg-gold-light/15 text-gold-light' : 'bg-mint text-forest'}`}><c.icon size={24} /></span>
              <h2 className={`relative text-2xl md:text-[30px] ${c.dark ? 'text-white' : ''}`}>{c.title}</h2>
              <p className={`relative ${c.dark ? 'text-white/75' : 'text-muted'}`}>{c.body}</p>
              <ul className="relative grid grid-cols-2 gap-1.5 text-[14px]">{c.points.map((p) => <li key={p} className="flex items-center gap-2"><BadgeCheck size={15} className={c.dark ? 'text-gold-light' : 'text-forest'} />{p}</li>)}</ul>
              <span className={`relative mt-auto pt-2 font-semibold inline-flex items-center gap-2 ${c.dark ? 'text-gold-light' : 'text-forest'}`}>{c.cta}<ArrowRight size={16} className="transition group-hover:translate-x-1" /></span>
            </Link>
          ))}
        </section>

        {home && <Rail title="Trending now" subtitle="What shoppers are looking at" href="/products" products={home.rails.trending} accent={<span className="inline-flex items-center gap-1 rounded-full bg-danger-bg text-danger text-xs font-bold px-2 py-0.5"><Flame size={12} />Hot</span>} />}

        {/* Brands */}
        {topBrands.length > 0 && (
          <section className="rounded-3xl bg-white border border-line shadow-card p-4 md:p-6">
            <SectionHead title="Top brands" subtitle="Verified brands carry a badge after our checks" action={<Link href="/brands" className="btn btn-outline btn-sm rounded-full">All brands<ArrowRight size={14} /></Link>} />
            <div className="flex gap-3 overflow-x-auto no-scrollbar lg:grid lg:grid-cols-8">
              {topBrands.map((b, i) => (
                <Link key={b.id} href={`/products?brand=${b.slug}`} className="group shrink-0 w-[120px] lg:w-auto rounded-2xl border border-line p-3 pt-4 flex flex-col items-center text-center gap-2 hover:border-gold hover:shadow-card hover:-translate-y-0.5 transition">
                  <span className={cn('relative size-16 rounded-full overflow-hidden grid place-items-center ring-4 ring-white shadow-card', CAT_TONES[i % CAT_TONES.length])}>
                    {b.image ? <Image src={b.image} alt="" fill sizes="64px" className="object-contain p-3 group-hover:scale-110 transition" unoptimized={b.image.startsWith('/api/')} /> : <span className="font-display font-bold text-lg">{b.name.slice(0, 2)}</span>}
                  </span>
                  <span className="text-[13px] font-semibold leading-tight flex items-center gap-1">{b.name}{b.verified && <BadgeCheck size={13} className="text-forest shrink-0" aria-label="Verified" />}</span>
                  <span className="text-[11px] text-muted">{b.products} products</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Wholesale hub */}
        <section className="grid gap-6 lg:grid-cols-2 items-center rounded-3xl border border-line bg-ivory p-6 md:p-10 relative overflow-hidden">
          <span className="absolute -left-16 -bottom-20 size-64 rounded-full bg-gold/10" aria-hidden />
          <div className="relative">
            <span className="eyebrow">B2B wholesale hub</span>
            <h2 className="text-3xl md:text-[38px] mt-2">{wholesale?.heading ?? 'Smarter Sourcing for Every Business'}</h2>
            <p className="text-muted mt-3 text-[16px]">{wholesale?.body}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/wholesale" className="btn btn-primary btn-lg">Explore wholesale<ArrowRight size={18} /></Link>
              <Link href="/business/rfqs/new" className="btn btn-outline btn-lg">Request a quote</Link>
            </div>
          </div>
          <div className="relative grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[[Layers, 'Bulk catalogue'], [Receipt, 'MOQ pricing'], [ClipboardList, 'Quotations'], [FileText, 'Purchase orders'], [Users, 'Team accounts'], [BadgeCheck, 'GST invoices']].map(([Icon, t]) => {
              const I = Icon as typeof Layers;
              return <div key={t as string} className="rounded-2xl bg-white border border-line p-4 hover:shadow-card hover:-translate-y-0.5 transition"><span className="size-10 rounded-xl bg-[#f7ead0] text-gold-ink grid place-items-center"><I size={19} /></span><p className="font-semibold mt-2.5 text-[14.5px]">{t as string}</p></div>;
            })}
          </div>
        </section>

        {/* Reviews */}
        {reviews?.reviews.length ? (
          <section className="rounded-3xl bg-white border border-line shadow-card p-4 md:p-6">
            <SectionHead title="Loved by verified buyers" subtitle="Only customers who received their order can review. We never publish invented testimonials." />
            <div className="grid gap-3 md:grid-cols-3">
              {reviews.reviews.slice(0, 3).map((r, i) => (
                <figure key={r.id} className="relative rounded-2xl border border-line p-5 bg-gradient-to-b from-cream/60 to-white">
                  <Quote size={28} className="absolute right-4 top-4 text-gold/30" aria-hidden />
                  <p className="flex items-center gap-0.5 text-[#e0a106]" aria-label={`${r.rating} out of 5`}>{Array.from({ length: 5 }, (_, k) => <Star key={k} size={15} fill={k < r.rating ? 'currentColor' : 'none'} />)}</p>
                  <p className="font-semibold mt-2">{r.title}</p>
                  <blockquote className="text-muted mt-1.5 text-[14.5px] line-clamp-4">{r.body}</blockquote>
                  <figcaption className="mt-4 flex items-center gap-3">
                    <span className={cn('size-9 shrink-0 rounded-full grid place-items-center font-semibold text-sm', CAT_TONES[(i + 3) % CAT_TONES.length])}>{r.authorName.charAt(0)}</span>
                    <span className="min-w-0 text-[12.5px]"><span className="block font-semibold text-ink">{r.authorName} <BadgeCheck size={13} className="inline text-forest" aria-label="Verified buyer" /></span>{r.productSlug && <Link href={`/products/${r.productSlug}`} className="text-muted hover:text-forest truncate block">{r.productName}</Link>}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        ) : null}

        {/* Sell */}
        <section className="relative overflow-hidden surface-emerald rounded-3xl p-6 md:p-10 grid gap-6 md:grid-cols-[1.4fr_1fr] items-center">
          <span className="absolute -right-20 -top-20 size-72 rounded-full bg-gold/15 blur-2xl" aria-hidden />
          <div className="relative">
            <span className="eyebrow text-gold-light!">Sell with us</span>
            <h2 className="text-3xl md:text-[38px] text-white mt-2">{sell?.heading ?? 'Your Store. A Bigger Marketplace.'}</h2>
            <p className="text-white/75 mt-3 text-[16px]">{sell?.body}</p>
            <Link href="/sell" className="btn btn-gold btn-lg mt-6">Become a seller<ArrowRight size={18} /></Link>
          </div>
          <ul className="relative grid gap-2.5 text-white/85">
            {['Retail and wholesale from one catalogue', 'Inventory, orders and returns in one hub', 'Quote on business RFQs', 'Clear commission and settlements'].map((t) => (
              <li key={t} className="flex items-center gap-3 rounded-xl bg-white/[0.06] border border-white/10 px-4 py-3"><Store size={18} className="text-gold-light shrink-0" />{t}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
