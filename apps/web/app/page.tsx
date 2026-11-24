import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight, ShoppingBag, Building2, Cpu, Shirt, Apple, Sofa, Sparkles, Armchair, Wrench, PenTool, Car, Dumbbell, Puzzle, Watch,
  ShieldCheck, RotateCcw, Truck, Store, BadgeCheck, FileText, Layers, ClipboardList, Users, Receipt, LayoutGrid, Banknote, Flame, Star,
} from 'lucide-react';
import { tryServerApi } from '@/lib/server-api';
import type { Category, Product, Review } from '@/lib/types';
import { Countdown } from '@/components/home-parts';
import { HeroSlider } from '@/components/hero-slider';
import { MiniProductCard, OfferStrip, Rail } from '@/components/home-sections';

export const dynamic = 'force-dynamic'; // rendered per request; API data is cached via fetch revalidate

type Home = {
  rails: { trending: Product[]; bestSellers: Product[]; newArrivals: Product[]; topRated: Product[]; deals: Product[] };
  sections: Record<string, { heading: string; body: string; data: { ctaLabel?: string; ctaLink?: string } }>;
  sellers: { id: string; slug: string; name: string; description: string; primaryCategory: string | null }[];
};
type Deals = { deals: { id: string; name: string; description: string; discountBps: number; startsAt: string; endsAt: string; live: boolean; products: Product[] }[] };
type Offer = { code: string; description: string; kind: string; value: number; minOrderPaise: number; endsAt: string };
type Brand = { id: string; name: string; slug: string; verified: boolean; products: number; image: string | null; category: string | null };

const ICONS: Record<string, typeof Cpu> = {
  electronics: Cpu, fashion: Shirt, grocery: Apple, 'home-and-living': Sofa, 'beauty-and-personal-care': Sparkles, furniture: Armchair,
  'industrial-supplies': Wrench, 'office-supplies': PenTool, automotive: Car, sports: Dumbbell, toys: Puzzle, 'smart-gadgets': Watch,
};
const TILE_TONES = ['from-[#e6efe9] to-[#f8faf6]', 'from-[#f7ecd2] to-[#fdf9ef]', 'from-[#e7f0f8] to-[#f6f9fc]', 'from-[#efeafd] to-[#f8f6fe]', 'from-[#fde8e2] to-[#fdf6f3]', 'from-[#e8f5ee] to-[#f6fbf8]'];

export default async function HomePage() {
  const [home, cats, deals, reviews, offers, brands] = await Promise.all([
    tryServerApi<Home>('/home', { revalidate: 60 }),
    tryServerApi<{ categories: Category[] }>('/categories', { revalidate: 300 }),
    tryServerApi<Deals>('/deals', { revalidate: 60 }),
    tryServerApi<{ reviews: Review[] }>('/reviews/recent', { revalidate: 300 }),
    tryServerApi<{ offers: Offer[] }>('/offers', { revalidate: 120 }),
    tryServerApi<{ brands: Brand[] }>('/brands', { revalidate: 300 }),
  ]);
  const wholesale = home?.sections.wholesale;
  const sell = home?.sections.sell;
  const categories = (cats?.categories ?? []).filter((c) => !c.parentId);
  const liveDeal = deals?.deals.find((d) => d.live) ?? deals?.deals[0];
  const topBrands = [...(brands?.brands ?? [])].sort((a, b) => b.products - a.products).slice(0, 8);

  return (
    <div className="bg-[#f3f5f0] -mb-16 pb-16">
      {/* Category strip */}
      <nav aria-label="Shop by category" className="bg-white border-b border-line">
        <div className="container-page flex gap-2 md:gap-4 overflow-x-auto no-scrollbar py-3 md:justify-between">
          {categories.slice(0, 12).map((c) => {
            const Icon = ICONS[c.slug] ?? LayoutGrid;
            return (
              <Link key={c.id} href={`/products?category=${c.slug}`} className="group flex flex-col items-center gap-1.5 shrink-0 w-[76px] md:w-auto text-center">
                <span className="size-14 md:size-16 rounded-full bg-gradient-to-br from-mint to-white border border-line grid place-items-center text-forest group-hover:border-gold group-hover:shadow-card group-hover:-translate-y-0.5 transition"><Icon size={24} /></span>
                <span className="text-[12px] md:text-[13px] font-semibold leading-tight line-clamp-2 group-hover:text-forest">{c.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="container-page pt-4 md:pt-5 grid grid-cols-[minmax(0,1fr)] gap-5 md:gap-6">
        {/* Hero slider (managed in Admin → Homepage & content) */}
        <div className="rounded-3xl overflow-hidden shadow-lift"><HeroSlider /></div>

        {/* Promise strip */}
        <ul className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
          {[[Truck, 'Free delivery', 'On eligible seller orders'], [Banknote, 'Cash on delivery', 'Pay when it arrives'], [RotateCcw, 'Easy returns', 'Window shown on every product'], [ShieldCheck, 'GST invoice', 'From every verified seller']].map(([Icon, t, b]) => {
            const I = Icon as typeof Truck;
            return <li key={t as string} className="flex items-center gap-3 rounded-2xl bg-white border border-line px-3 py-2.5 md:px-4 md:py-3"><span className="size-9 md:size-10 rounded-xl bg-mint text-forest grid place-items-center shrink-0"><I size={18} /></span><span className="min-w-0"><span className="block text-[13px] md:text-sm font-semibold">{t as string}</span><span className="block text-[11.5px] md:text-xs text-muted truncate">{b as string}</span></span></li>;
          })}
        </ul>

        {/* Coupons */}
        {offers?.offers.length ? <OfferStrip offers={offers.offers} /> : null}

        {/* Deal of the day */}
        {liveDeal && liveDeal.products.length > 0 && (
          <section className="rounded-3xl overflow-hidden border border-line shadow-card bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-6 py-4 bg-gradient-to-r from-[#7f1d1d] via-[#b42318] to-[#c99a3d] text-white">
              <div className="flex items-center gap-3">
                <span className="size-11 rounded-2xl bg-white/15 grid place-items-center"><Flame size={22} /></span>
                <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-white/80">{liveDeal.live ? 'Deal of the day' : 'Coming up'}</p><h2 className="text-xl md:text-2xl text-white">{liveDeal.name} · {Math.round(liveDeal.discountBps / 100)}% off</h2></div>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-black/20 px-3.5 py-1.5 text-sm font-semibold"><Countdown endsAt={liveDeal.endsAt} startsAt={liveDeal.live ? undefined : liveDeal.startsAt} /></span>
                <Link href="/deals" className="btn btn-sm bg-white text-[#b42318] hover:bg-ivory rounded-full">All deals<ArrowRight size={15} /></Link>
              </div>
            </div>
            <div className="flex gap-3 md:gap-4 overflow-x-auto no-scrollbar p-4 md:p-6 snap-x">
              {liveDeal.products.map((p) => <MiniProductCard key={p.catalogProductId} p={p} />)}
            </div>
          </section>
        )}

        {home && <Rail title="Best sellers" subtitle="What shoppers are buying most this week" href="/products?sort=popular" products={home.rails.bestSellers} />}

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

        {/* Shop by category */}
        {categories.length > 0 && (
          <section className="rounded-3xl bg-white border border-line shadow-card p-4 md:p-6">
            <div className="flex items-end justify-between gap-3 mb-4"><div><h2 className="text-2xl md:text-[28px]">Shop by category</h2><p className="text-sm text-muted mt-1">Every floor of the mall, one tap away</p></div><Link href="/products" className="btn btn-outline btn-sm rounded-full">All products</Link></div>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {categories.map((c, i) => {
                const Icon = ICONS[c.slug] ?? LayoutGrid;
                return (
                  <Link key={c.id} href={`/products?category=${c.slug}`} className={`group relative rounded-2xl bg-gradient-to-br ${TILE_TONES[i % TILE_TONES.length]} border border-line p-3 md:p-4 aspect-[4/5] md:aspect-square flex flex-col justify-between overflow-hidden hover:shadow-lift hover:-translate-y-0.5 transition`}>
                    <Icon size={64} className="absolute -right-3 -bottom-3 text-forest/10 group-hover:text-forest/15 group-hover:scale-110 transition" aria-hidden />
                    <span className="size-10 md:size-12 rounded-xl bg-white shadow-card grid place-items-center text-forest"><Icon size={20} /></span>
                    <span className="relative"><span className="block font-semibold text-[13.5px] md:text-[15px] leading-tight">{c.name}</span><span className="block text-[11.5px] text-muted mt-0.5">{c.products ? `${c.products} products` : 'Coming soon'}</span></span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {home && <Rail title="New arrivals" subtitle="Fresh from our sellers" href="/products?sort=newest" products={home.rails.newArrivals} />}
        {home && <Rail title="Top rated" subtitle="Loved by verified buyers" href="/products?sort=rating" products={home.rails.topRated} accent={<span className="inline-flex items-center gap-1 rounded-full bg-success-bg text-success text-xs font-bold px-2 py-0.5"><Star size={12} fill="currentColor" />4+</span>} />}

        {/* Brands */}
        {topBrands.length > 0 && (
          <section className="rounded-3xl bg-white border border-line shadow-card p-4 md:p-6">
            <div className="flex items-end justify-between gap-3 mb-4"><div><h2 className="text-2xl md:text-[28px]">Top brands</h2><p className="text-sm text-muted mt-1">Verified brands carry a badge after our checks</p></div><Link href="/brands" className="btn btn-outline btn-sm rounded-full">All brands</Link></div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              {topBrands.map((b) => (
                <Link key={b.id} href={`/products?brand=${b.slug}`} className="group rounded-2xl border border-line p-3 flex flex-col items-center text-center gap-2 hover:border-gold hover:shadow-card transition">
                  <span className="relative size-16 rounded-full bg-cream border border-line overflow-hidden grid place-items-center">
                    {b.image ? <Image src={b.image} alt="" fill sizes="64px" className="object-contain p-3 group-hover:scale-110 transition" unoptimized={b.image.startsWith('/api/')} /> : <span className="font-display font-bold text-forest text-lg">{b.name.slice(0, 2)}</span>}
                  </span>
                  <span className="text-[13px] font-semibold leading-tight flex items-center gap-1">{b.name}{b.verified && <BadgeCheck size={13} className="text-forest shrink-0" aria-label="Verified" />}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {home && <Rail title="Trending now" href="/products" products={home.rails.trending} />}

        {/* Wholesale hub */}
        <section className="grid gap-6 lg:grid-cols-2 items-center rounded-3xl border border-line bg-ivory p-6 md:p-10">
          <div>
            <span className="eyebrow">B2B wholesale hub</span>
            <h2 className="text-3xl md:text-[38px] mt-2">{wholesale?.heading ?? 'Smarter Sourcing for Every Business'}</h2>
            <p className="text-muted mt-3 text-[16px]">{wholesale?.body}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/wholesale" className="btn btn-primary btn-lg">Explore wholesale<ArrowRight size={18} /></Link>
              <Link href="/business/rfqs/new" className="btn btn-outline btn-lg">Request a quote</Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[[Layers, 'Bulk catalogue', 'Wholesale-enabled listings'], [Receipt, 'MOQ pricing', 'Prices drop as quantity grows'], [ClipboardList, 'Quotations', 'Compare several sellers'], [FileText, 'Purchase orders', 'Approval limits for your team'], [Users, 'Team accounts', 'Owners, buyers, approvers'], [BadgeCheck, 'GST invoices', 'With your GSTIN']].map(([Icon, t, b]) => {
              const I = Icon as typeof Layers;
              return <div key={t as string} className="rounded-2xl bg-white border border-line p-4 hover:shadow-card transition"><I size={20} className="text-gold-ink" /><p className="font-semibold mt-2 text-[15px]">{t as string}</p><p className="text-[13px] text-muted mt-0.5">{b as string}</p></div>;
            })}
          </div>
        </section>

        {/* Featured stores */}
        {home?.sellers.length ? (
          <section className="rounded-3xl bg-white border border-line shadow-card p-4 md:p-6">
            <div className="flex items-end justify-between gap-3 mb-4"><div><h2 className="text-2xl md:text-[28px]">Featured stores</h2><p className="text-sm text-muted mt-1">Approved by our marketplace team</p></div><Link href="/sellers" className="btn btn-outline btn-sm rounded-full">All stores</Link></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {home.sellers.map((s) => (
                <Link key={s.id} href={`/sellers/${s.slug}`} className="group rounded-2xl border border-line p-4 flex gap-4 hover:shadow-lift hover:border-transparent transition">
                  <span className="size-12 shrink-0 rounded-xl bg-gradient-to-br from-emerald to-forest text-gold-light grid place-items-center font-display text-xl">{s.name.charAt(0)}</span>
                  <div className="min-w-0">
                    <p className="font-semibold flex items-center gap-1.5 group-hover:text-forest">{s.name}<BadgeCheck size={16} className="text-forest" aria-label="Approved store" /></p>
                    {s.primaryCategory && <p className="text-[12.5px] text-gold-ink">{s.primaryCategory}</p>}
                    <p className="text-[13.5px] text-muted mt-1 line-clamp-2">{s.description}</p>
                  </div>
                </Link>
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

        {/* Reviews */}
        <section className="rounded-3xl bg-white border border-line shadow-card p-4 md:p-6 mb-2">
          <h2 className="text-2xl md:text-[28px]">From customers who received their orders</h2>
          <p className="text-sm text-muted mt-1 mb-4">Only verified buyers can review. We never publish invented testimonials.</p>
          {reviews?.reviews.length ? (
            <div className="grid gap-3 md:grid-cols-3">
              {reviews.reviews.slice(0, 3).map((r) => (
                <figure key={r.id} className="rounded-2xl border border-line p-4">
                  <p className="flex items-center gap-2"><span className="inline-flex items-center gap-0.5 rounded px-1.5 text-xs font-bold text-white bg-success">{r.rating}<Star size={10} fill="currentColor" /></span><span className="font-semibold">{r.title}</span></p>
                  <blockquote className="text-muted mt-2 text-[14.5px] line-clamp-4">{r.body}</blockquote>
                  <figcaption className="mt-3 text-[12.5px] text-muted">{r.authorName} · Verified buyer{r.productSlug && <> · <Link href={`/products/${r.productSlug}`} className="link">{r.productName}</Link></>}</figcaption>
                </figure>
              ))}
            </div>
          ) : <p className="text-muted">Reviews appear here once customers receive their orders.</p>}
        </section>
      </div>
    </div>
  );
}
