import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight, ShoppingBag, Building2, Cpu, Shirt, Apple, Sofa, Sparkles, Armchair, Wrench, PenTool, Car, Dumbbell, Puzzle, Watch,
  ShieldCheck, RotateCcw, Truck, Store, Headphones, BadgeCheck, FileText, Layers, ClipboardList, Users, Receipt, LayoutGrid,
} from 'lucide-react';
import { tryServerApi } from '@/lib/server-api';
import type { Category, Product, Review } from '@/lib/types';
import { ProductRails, Countdown, CommerceStory, Reveal } from '@/components/home-parts';
import { ProductGrid } from '@/components/product-card';
import { Stars, Badge } from '@/components/ui';

export const revalidate = 60;

type Home = {
  rails: { trending: Product[]; bestSellers: Product[]; newArrivals: Product[]; topRated: Product[]; deals: Product[] };
  sections: Record<string, { heading: string; body: string; data: { ctaLabel?: string; ctaLink?: string } }>;
  sellers: { id: string; slug: string; name: string; description: string; primaryCategory: string | null }[];
};
type Deals = { deals: { id: string; name: string; description: string; discountBps: number; startsAt: string; endsAt: string; live: boolean; products: Product[] }[] };

const ICONS: Record<string, typeof Cpu> = {
  electronics: Cpu, fashion: Shirt, grocery: Apple, 'home-and-living': Sofa, 'beauty-and-personal-care': Sparkles, furniture: Armchair,
  'industrial-supplies': Wrench, 'office-supplies': PenTool, automotive: Car, sports: Dumbbell, toys: Puzzle, 'smart-gadgets': Watch,
};

export default async function HomePage() {
  const [home, cats, deals, reviews] = await Promise.all([
    tryServerApi<Home>('/home', { revalidate: 60 }),
    tryServerApi<{ categories: Category[] }>('/categories', { revalidate: 300 }),
    tryServerApi<Deals>('/deals', { revalidate: 60 }),
    tryServerApi<{ reviews: Review[] }>('/reviews/recent', { revalidate: 300 }),
  ]);
  const hero = home?.sections.hero;
  const announcement = home?.sections.announcement;
  const wholesale = home?.sections.wholesale;
  const sell = home?.sections.sell;
  const categories = (cats?.categories ?? []).filter((c) => !c.parentId);
  const liveDeal = deals?.deals[0];

  return (
    <>
      {announcement && (
        <div className="bg-ivory border-b border-line text-center text-[14px] py-2 px-4">
          <strong className="text-emerald">{announcement.heading}</strong> <span className="text-muted">— {announcement.body}</span>
          {announcement.data.ctaLink && <Link href={announcement.data.ctaLink} className="link ml-2">{announcement.data.ctaLabel ?? 'Learn more'}</Link>}
        </div>
      )}

      {/* Hero */}
      <section className="relative overflow-hidden surface-emerald">
        <Image src="/images/mall-concept.webp" alt="" fill priority sizes="100vw" className="object-cover object-[70%_center] opacity-90" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(6,30,22,.96)_0%,rgba(6,30,22,.86)_38%,rgba(6,30,22,.25)_70%,rgba(6,30,22,.05)_100%)] max-md:bg-[linear-gradient(180deg,rgba(6,30,22,.55)_0%,rgba(6,30,22,.92)_65%)]" />
        <div className="relative container-page min-h-[560px] md:min-h-[600px] flex items-end md:items-center pb-12 md:pb-0">
          <div className="max-w-xl animate-fade-up pt-48 md:pt-0">
            <span className="eyebrow text-gold-light!">Intelligent Digital Mall</span>
            <h1 className="mt-3 text-[38px] leading-[1.08] md:text-[60px] text-white">{hero?.heading ?? 'Welcome to the Future of Shopping'}</h1>
            <p className="mt-5 text-[17px] md:text-lg text-white/80 max-w-lg">{hero?.body ?? 'Discover everything you love, connect with sellers, and shop for yourself or your business — all in one intelligent digital mall.'}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={hero?.data.ctaLink ?? '/products'} className="btn btn-gold btn-lg">{hero?.data.ctaLabel ?? 'Explore Products'}<ArrowRight size={18} /></Link>
              <Link href="/wholesale" className="btn btn-on-dark btn-lg">Shop Wholesale</Link>
            </div>
            <Link href="/sell" className="inline-block mt-5 text-[14px] text-white/75 hover:text-white underline-offset-4 hover:underline">Have products to sell? Become a Seller →</Link>
            <p className="mt-8 text-[11.5px] text-white/45">Illustration: a concept of IBazzzar’s robotic digital mall, not a photograph of a real facility.</p>
          </div>
        </div>
      </section>

      {/* Personal vs business */}
      <section className="container-page -mt-10 relative z-10 grid gap-4 md:grid-cols-2">
        {[
          { icon: ShoppingBag, title: 'Shop for Yourself', body: 'Everyday essentials and treats across every department, with genuine offers and secure checkout.', points: ['Everyday essentials', 'Multi-category shopping', 'Retail offers', 'Secure checkout'], href: '/products', cta: 'Start shopping' },
          { icon: Building2, title: 'Buy for Your Business', body: 'Wholesale prices, MOQ-based tiers, quotations and purchase orders with approvals for your team.', points: ['Wholesale catalogue', 'Bulk prices & MOQ', 'Request quotations', 'Business procurement'], href: '/wholesale', cta: 'Explore wholesale', dark: true },
        ].map((c) => (
          <Link key={c.title} href={c.href} className={`group card card-pad flex flex-col gap-3 transition hover:-translate-y-0.5 hover:shadow-lift ${c.dark ? 'surface-emerald border-transparent' : ''}`}>
            <span className={`size-12 rounded-2xl grid place-items-center ${c.dark ? 'bg-gold-light/15 text-gold-light' : 'bg-mint text-forest'}`}><c.icon size={24} /></span>
            <h2 className={`text-2xl md:text-[28px] ${c.dark ? 'text-white' : ''}`}>{c.title}</h2>
            <p className={c.dark ? 'text-white/75' : 'text-muted'}>{c.body}</p>
            <ul className="grid grid-cols-2 gap-1.5 text-[14px]">
              {c.points.map((p) => <li key={p} className="flex items-center gap-2"><BadgeCheck size={15} className={c.dark ? 'text-gold-light' : 'text-forest'} />{p}</li>)}
            </ul>
            <span className={`mt-auto pt-2 font-semibold inline-flex items-center gap-2 ${c.dark ? 'text-gold-light' : 'text-forest'}`}>{c.cta}<ArrowRight size={16} className="transition group-hover:translate-x-1" /></span>
          </Link>
        ))}
      </section>

      {/* Departments */}
      <section className="container-page py-16">
        <div className="flex items-end justify-between gap-4 mb-7">
          <div><span className="eyebrow">Department explorer</span><h2 className="text-3xl md:text-4xl mt-1">Every floor of the mall</h2></div>
          <Link href="/products" className="link hidden sm:inline">All products →</Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {categories.map((c, i) => {
            const Icon = ICONS[c.slug] ?? LayoutGrid;
            return (
              <Reveal key={c.id} delay={Math.min(i, 8) * 0.03}>
                <Link href={`/products?category=${c.slug}`} className="group relative flex h-full flex-col rounded-2xl border border-line bg-gradient-to-br from-cream to-white p-4 transition hover:border-gold hover:shadow-lift">
                  <span className="size-12 rounded-xl bg-emerald text-gold-light grid place-items-center transition group-hover:scale-105"><Icon size={22} /></span>
                  <p className="mt-4 font-semibold leading-tight">{c.name}</p>
                  <p className="text-[12.5px] text-muted mt-1">{c.products ? `${c.products} product${c.products === 1 ? '' : 's'}` : 'Coming soon'}</p>
                  <ArrowRight size={16} className="absolute right-4 top-5 text-gold opacity-0 -translate-x-1 transition group-hover:opacity-100 group-hover:translate-x-0" />
                </Link>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* Products */}
      <section className="container-page pb-16">
        <div className="flex items-end justify-between gap-4 mb-2">
          <div><span className="eyebrow">Fresh from the floor</span><h2 className="text-3xl md:text-4xl mt-1">Picked for you</h2></div>
          <Link href="/products" className="link hidden sm:inline">Shop all →</Link>
        </div>
        {home ? <ProductRails rails={home.rails} /> : <p className="text-muted py-10">Products will appear here once the catalogue is available.</p>}
      </section>

      {/* Commerce story */}
      <section className="surface-emerald py-16 md:py-20">
        <div className="container-page">
          <div className="max-w-2xl mb-10">
            <span className="eyebrow text-gold-light!">How IBazzzar works</span>
            <h2 className="text-3xl md:text-[42px] text-white mt-2">From discovery to your doorstep</h2>
            <p className="text-white/70 mt-3">Our robotic mall is a design concept. What’s real is the process: transparent prices, independent sellers, and every parcel tracked.</p>
          </div>
          <CommerceStory />
        </div>
      </section>

      {/* Wholesale hub */}
      <section className="container-page py-16">
        <div className="grid gap-8 lg:grid-cols-2 items-center rounded-3xl border border-line bg-ivory p-6 md:p-12">
          <div>
            <span className="eyebrow">B2B wholesale hub</span>
            <h2 className="text-3xl md:text-[40px] mt-2">{wholesale?.heading ?? 'Smarter Sourcing for Every Business'}</h2>
            <p className="text-muted mt-3 text-[17px]">{wholesale?.body}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/wholesale" className="btn btn-primary btn-lg">Explore Wholesale<ArrowRight size={18} /></Link>
              <Link href="/business/rfqs/new" className="btn btn-outline btn-lg">Request a Quote</Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[[Layers, 'Bulk catalogue', 'Wholesale-enabled listings from approved sellers'], [Receipt, 'MOQ pricing', 'Tiered prices that drop as quantity grows'], [ClipboardList, 'Request for quotation', 'Ask several sellers, compare and negotiate'], [FileText, 'Purchase orders', 'Approval limits and separation of duties'], [Users, 'Team accounts', 'Owners, buyers and approvers'], [BadgeCheck, 'GST invoices', 'Seller-issued invoices with your GSTIN']].map(([Icon, t, b]) => {
              const I = Icon as typeof Layers;
              return <div key={t as string} className="rounded-2xl bg-white border border-line p-4"><I size={20} className="text-gold-ink" /><p className="font-semibold mt-2 text-[15px]">{t as string}</p><p className="text-[13px] text-muted mt-0.5">{b as string}</p></div>;
            })}
          </div>
        </div>
      </section>

      {/* Flash deals */}
      {liveDeal && (
        <section className="container-page pb-16">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
            <div>
              <span className="eyebrow">{liveDeal.live ? 'Live now' : 'Coming up'}</span>
              <h2 className="text-3xl md:text-4xl mt-1">{liveDeal.name}</h2>
              <p className="text-muted mt-1">{liveDeal.description} · {Math.round(liveDeal.discountBps / 100)}% off selected items</p>
            </div>
            <span className="badge badge-danger text-sm py-1.5 px-3"><Countdown endsAt={liveDeal.endsAt} startsAt={liveDeal.live ? undefined : liveDeal.startsAt} /></span>
          </div>
          <ProductGrid products={liveDeal.products.slice(0, 4)} />
          <div className="mt-6 text-center"><Link href="/deals" className="btn btn-outline">See all deals</Link></div>
        </section>
      )}

      {/* Sellers */}
      {home?.sellers.length ? (
        <section className="container-page pb-16">
          <div className="flex items-end justify-between gap-4 mb-6">
            <div><span className="eyebrow">Featured stores</span><h2 className="text-3xl md:text-4xl mt-1">Approved by our marketplace team</h2></div>
            <Link href="/sellers" className="link hidden sm:inline">All stores →</Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {home.sellers.map((s) => (
              <Link key={s.id} href={`/sellers/${s.slug}`} className="card card-pad flex gap-4 hover:shadow-lift transition">
                <span className="size-12 shrink-0 rounded-xl bg-emerald text-gold-light grid place-items-center font-display text-xl">{s.name.charAt(0)}</span>
                <div className="min-w-0">
                  <p className="font-semibold flex items-center gap-1.5">{s.name}<BadgeCheck size={16} className="text-forest" aria-label="Approved store" /></p>
                  {s.primaryCategory && <p className="text-[13px] text-gold-ink">{s.primaryCategory}</p>}
                  <p className="text-[14px] text-muted mt-1 line-clamp-2">{s.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Sell */}
      <section className="container-page pb-16">
        <div className="surface-emerald rounded-3xl p-6 md:p-12 grid gap-8 md:grid-cols-[1.4fr_1fr] items-center">
          <div>
            <span className="eyebrow text-gold-light!">Sell on IBazzzar</span>
            <h2 className="text-3xl md:text-[40px] text-white mt-2">{sell?.heading ?? 'Your Store. A Bigger Marketplace.'}</h2>
            <p className="text-white/75 mt-3 text-[17px]">{sell?.body}</p>
            <Link href="/sell" className="btn btn-gold btn-lg mt-7">Become a Seller<ArrowRight size={18} /></Link>
          </div>
          <ul className="grid gap-3 text-white/85">
            {['Retail and wholesale from one catalogue', 'Inventory, orders and returns in one hub', 'Quote on business RFQs', 'Clear commission and settlement ledger'].map((t) => (
              <li key={t} className="flex items-center gap-3 rounded-xl bg-white/[0.06] border border-white/10 px-4 py-3"><Store size={18} className="text-gold-light shrink-0" />{t}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* Trust */}
      <section className="container-page pb-16">
        <span className="eyebrow">What you can count on</span>
        <h2 className="text-3xl md:text-4xl mt-1 mb-6">Clear policies, no fine-print surprises</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[[ShieldCheck, 'Secure payments', 'Paid through Razorpay. We never see or store card numbers.', '/pages/payments'], [RotateCcw, 'Clear returns', 'Return window shown before you buy; refunds tracked in your account.', '/pages/returns'], [Truck, 'Order tracking', 'Every parcel has a tracking timeline in your order page.', '/account/orders'], [Store, 'Seller information', 'Every product names the seller who ships and invoices it.', '/sellers'], [Headphones, 'Customer support', 'Raise a request and follow every reply in one place.', '/support']].map(([Icon, t, b, h]) => {
            const I = Icon as typeof ShieldCheck;
            return <Link key={t as string} href={h as string} className="rounded-2xl border border-line p-5 hover:border-gold transition"><I size={22} className="text-forest" /><p className="font-semibold mt-3">{t as string}</p><p className="text-[14px] text-muted mt-1">{b as string}</p></Link>;
          })}
        </div>
      </section>

      {/* Reviews */}
      <section className="container-page pb-8">
        <span className="eyebrow">Verified reviews</span>
        <h2 className="text-3xl md:text-4xl mt-1 mb-6">From customers who received their orders</h2>
        {reviews?.reviews.length ? (
          <div className="grid gap-4 md:grid-cols-3">
            {reviews.reviews.slice(0, 3).map((r) => (
              <figure key={r.id} className="card card-pad">
                <Stars value={r.rating} />
                <blockquote className="mt-3"><p className="font-semibold">{r.title}</p><p className="text-muted mt-1 text-[15px] line-clamp-4">{r.body}</p></blockquote>
                <figcaption className="mt-4 text-[13px] text-muted">{r.authorName} · <Badge tone="success">Verified purchase</Badge>{r.productSlug && <> · <Link href={`/products/${r.productSlug}`} className="link">{r.productName}</Link></>}</figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <p className="panel p-6 text-muted">Reviews appear here only from customers whose order was delivered. We never publish invented testimonials.</p>
        )}
      </section>
    </>
  );
}
