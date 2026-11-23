import type { Metadata } from 'next';
import Link from 'next/link';
import { ClipboardList, FileCheck2, Users, Receipt, Landmark, Scale, ArrowRight } from 'lucide-react';
import { tryServerApi } from '@/lib/server-api';
import type { Product } from '@/lib/types';
import { ProductGrid } from '@/components/product-card';
import { WholesaleModeHint } from '@/components/wholesale-hint';

export const metadata: Metadata = { title: 'Wholesale & business buying', description: 'MOQ pricing, quotations, purchase orders with approvals and GST invoices for Indian businesses.' };
export const dynamic = 'force-dynamic'; // rendered per request; API data is cached via fetch revalidate

const STEPS = [
  { icon: Scale, title: 'Compare bulk prices', body: 'Wholesale tiers drop the unit price as quantity grows. Switch to Business mode to see them everywhere.' },
  { icon: ClipboardList, title: 'Request a quotation', body: 'Send one request to every seller of a product, attach drawings or specs, and negotiate in one thread.' },
  { icon: FileCheck2, title: 'Approve purchase orders', body: 'Accepted quotes become POs. Set an auto-approval limit; above it an approver signs off (never their own request).' },
  { icon: Landmark, title: 'Pay your way', body: 'Online, NEFT/RTGS bank transfer, or approved credit terms once our finance team reviews your account.' },
  { icon: Receipt, title: 'GST-ready invoices', body: 'Sellers issue tax invoices with your GSTIN so you can claim input tax credit.' },
  { icon: Users, title: 'Team roles', body: 'Owners invite buyers and approvers. Everyone sees order status; addresses stay private.' },
];

export default async function WholesalePage() {
  const data = await tryServerApi<{ products: Product[] }>('/products?wholesale=true&limit=8&sort=popular', { revalidate: 120 });
  return (
    <>
      <section className="surface-emerald">
        <div className="container-page py-14 md:py-20 grid gap-8 lg:grid-cols-[1.3fr_1fr] items-center">
          <div>
            <span className="eyebrow text-gold-light!">Business buying</span>
            <h1 className="text-4xl md:text-[52px] text-white mt-2">Smarter Sourcing for Every Business</h1>
            <p className="text-white/75 mt-4 text-lg max-w-xl">Bulk catalogues with MOQ pricing, quotations from several sellers, and purchase orders your finance team can trust.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/products?wholesale=true" className="btn btn-gold btn-lg">Browse wholesale catalogue<ArrowRight size={18} /></Link>
              <Link href="/business/rfqs/new" className="btn btn-on-dark btn-lg">Request a quote</Link>
            </div>
          </div>
          <div className="rounded-3xl bg-white/[0.06] border border-white/12 p-6 text-white/85">
            <p className="font-semibold text-white">Getting started</p>
            <ol className="mt-3 grid gap-3 text-[15px]">
              <li>1. <Link href="/register?as=business" className="underline">Create a business account</Link> (GST optional for small businesses)</li>
              <li>2. Our team reviews your details — usually within one working day</li>
              <li>3. Invite your buyers and approvers, then start sourcing</li>
            </ol>
          </div>
        </div>
      </section>
      <section className="container-page py-14">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s) => <div key={s.title} className="card card-pad"><s.icon size={24} className="text-gold-ink" /><h2 className="text-xl mt-3">{s.title}</h2><p className="text-muted mt-1.5 text-[15px]">{s.body}</p></div>)}
        </div>
      </section>
      <section className="container-page pb-10">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
          <div><span className="eyebrow">Wholesale-ready</span><h2 className="text-3xl mt-1">Popular for bulk orders</h2></div>
          <WholesaleModeHint />
        </div>
        {data?.products.length ? <ProductGrid products={data.products} /> : <p className="text-muted">Wholesale listings appear here as sellers enable them.</p>}
      </section>
    </>
  );
}
