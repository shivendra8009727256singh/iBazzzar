import type { Metadata } from 'next';
import Link from 'next/link';
import { ClipboardList, FileCheck2, Users, Receipt, Landmark, Scale, ArrowRight, Building2, BadgeCheck, Truck, LayoutGrid, Cpu, Shirt, Apple, Sofa, Sparkles, Armchair, Wrench, PenTool, Car, Dumbbell, Puzzle, Watch } from 'lucide-react';
import { tryServerApi } from '@/lib/server-api';
import type { Category, Product } from '@/lib/types';
import { ProductGrid } from '@/components/product-card';
import { WholesaleModeHint } from '@/components/wholesale-hint';
import { PageBanner, Panel } from '@/components/page-banner';

export const metadata: Metadata = { title: 'Wholesale & business buying', description: 'MOQ pricing, quotations, purchase orders with approvals and GST invoices for Indian businesses.' };
export const dynamic = 'force-dynamic'; // rendered per request; API data is cached via fetch revalidate

const FEATURES = [
  { icon: Scale, title: 'Compare bulk prices', body: 'Wholesale tiers drop the unit price as quantity grows. Switch to Business mode to see them everywhere.' },
  { icon: ClipboardList, title: 'Request a quotation', body: 'Send one request to every seller of a product, attach drawings or specs, and negotiate in one thread.' },
  { icon: FileCheck2, title: 'Approve purchase orders', body: 'Accepted quotes become POs. Set an auto-approval limit; above it an approver signs off (never their own request).' },
  { icon: Landmark, title: 'Pay your way', body: 'Online, NEFT/RTGS bank transfer, or approved credit terms once our finance team reviews your account.' },
  { icon: Receipt, title: 'GST-ready invoices', body: 'Sellers issue tax invoices with your GSTIN so you can claim input tax credit.' },
  { icon: Users, title: 'Team roles', body: 'Owners invite buyers and approvers. Everyone sees order status; addresses stay private.' },
];
const STEPS = [
  { title: 'Create a business account', body: 'GST optional for small businesses.', href: '/register?as=business', cta: 'Register' },
  { title: 'Get verified', body: 'Our team reviews your details, usually within one working day.' },
  { title: 'Invite your team', body: 'Add buyers and approvers with their own limits.' },
  { title: 'Source and save', body: 'Order at tier prices or request quotes from several sellers.' },
];
// Illustrative example of how MOQ tiers work; actual tiers are set by each seller on their listing.
const TIERS = [['1–9 units', '₹500', ''], ['10–49 units', '₹450', '10% less'], ['50–199 units', '₹410', '18% less'], ['200+ units', '₹375', '25% less']];
const ICONS: Record<string, typeof Cpu> = {
  electronics: Cpu, fashion: Shirt, grocery: Apple, 'home-and-living': Sofa, 'beauty-and-personal-care': Sparkles, furniture: Armchair,
  'industrial-supplies': Wrench, 'office-supplies': PenTool, automotive: Car, sports: Dumbbell, toys: Puzzle, 'smart-gadgets': Watch,
};

export default async function WholesalePage() {
  const [data, cats] = await Promise.all([
    tryServerApi<{ products: Product[]; total?: number }>('/products?wholesale=true&limit=8&sort=popular', { revalidate: 120 }),
    tryServerApi<{ categories: Category[] }>('/categories', { revalidate: 300 }),
  ]);
  const categories = (cats?.categories ?? []).filter((c) => !c.parentId);
  return (
    <div className="bg-[#f3f5f0] -mb-16 pb-16">
      <div className="container-page py-5 md:py-6 grid grid-cols-[minmax(0,1fr)] gap-5 md:gap-6">
        <PageBanner tone="emerald" icon={<Building2 size={24} />} eyebrow="Business buying" title="Smarter Sourcing for Every Business"
          description="Bulk catalogues with MOQ pricing, quotations from several sellers, and purchase orders your finance team can trust."
          actions={<><Link href="/products?wholesale=true" className="btn btn-gold btn-lg">Browse wholesale catalogue<ArrowRight size={18} /></Link><Link href="/business/rfqs/new" className="btn btn-on-dark btn-lg">Request a quote</Link></>}>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/80">
            {['MOQ-based tier pricing', 'Quotes from several sellers', 'GST invoices', 'Credit terms on approval'].map((t) => <li key={t} className="flex items-center gap-1.5"><BadgeCheck size={15} className="text-gold-light" />{t}</li>)}
          </ul>
        </PageBanner>

        <section className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
          <Panel title="How it works" subtitle="From sign-up to your first purchase order">
            <ol className="grid gap-3 sm:grid-cols-2">
              {STEPS.map((s, i) => (
                <li key={s.title} className="relative rounded-2xl border border-line p-4 pl-16">
                  <span className="absolute left-4 top-4 size-9 rounded-xl bg-gradient-to-br from-emerald to-forest text-gold-light grid place-items-center font-display text-lg">{i + 1}</span>
                  <p className="font-semibold">{s.title}</p><p className="text-sm text-muted mt-0.5">{s.body}</p>
                  {s.href && <Link href={s.href} className="link text-sm font-semibold inline-flex items-center gap-1 mt-2">{s.cta}<ArrowRight size={14} /></Link>}
                </li>
              ))}
            </ol>
          </Panel>
          <Panel title="How tier pricing works" subtitle="An example — each seller sets their own tiers">
            <div className="rounded-2xl border border-line overflow-hidden">
              {TIERS.map(([q, p, save], i) => (
                <div key={q} className={`flex items-center justify-between gap-3 px-4 py-3 ${i % 2 ? 'bg-cream/60' : 'bg-white'}`}>
                  <span className="text-sm font-medium">{q}</span>
                  <span className="flex items-center gap-2"><span className="font-bold tabular-nums">{p}<span className="text-xs font-normal text-muted"> /unit</span></span>{save && <span className="rounded-full bg-success-bg text-success text-[11px] font-bold px-2 py-0.5">{save}</span>}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted mt-3 flex items-center gap-1.5"><Truck size={14} />Delivery and GST are shown separately at checkout.</p>
          </Panel>
        </section>

        <Panel title="Everything a buying team needs">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((s) => (
              <div key={s.title} className="group rounded-2xl border border-line p-5 hover:shadow-lift hover:border-transparent transition">
                <span className="size-11 rounded-xl bg-[#f7ead0] text-gold-ink grid place-items-center group-hover:scale-110 transition"><s.icon size={22} /></span>
                <h3 className="text-lg mt-3">{s.title}</h3><p className="text-muted mt-1 text-[14.5px]">{s.body}</p>
              </div>
            ))}
          </div>
        </Panel>

        {categories.length > 0 && (
          <Panel title="Source by category">
            <div className="flex gap-2.5 flex-wrap">
              {categories.map((c) => {
                const Icon = ICONS[c.slug] ?? LayoutGrid;
                return <Link key={c.id} href={`/products?wholesale=true&category=${c.slug}`} className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3.5 py-2 text-sm font-semibold hover:border-forest hover:text-forest hover:bg-mint transition"><Icon size={16} className="text-forest" />{c.name}</Link>;
              })}
            </div>
          </Panel>
        )}

        <Panel title="Popular for bulk orders" subtitle="Wholesale-ready listings" action={<WholesaleModeHint />}>
          {data?.products.length ? <ProductGrid products={data.products} /> : <p className="text-muted">Wholesale listings appear here as sellers enable them.</p>}
          <div className="mt-5 text-center"><Link href="/products?wholesale=true" className="btn btn-outline rounded-full">See the full wholesale catalogue<ArrowRight size={16} /></Link></div>
        </Panel>

        <section className="relative overflow-hidden rounded-3xl bg-ivory border border-line p-6 md:p-10 flex flex-wrap items-center justify-between gap-5">
          <span className="absolute -right-16 -top-16 size-56 rounded-full bg-gold/15" aria-hidden />
          <div className="relative"><p className="eyebrow">Need something specific?</p><p className="font-display text-2xl md:text-3xl mt-1">Tell sellers what you need — they quote</p><p className="text-muted mt-1">Attach specs or drawings. Compare quotes side by side.</p></div>
          <Link href="/business/rfqs/new" className="relative btn btn-primary btn-lg">Request a quote<ArrowRight size={18} /></Link>
        </section>
      </div>
    </div>
  );
}
