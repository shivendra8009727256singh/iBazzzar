import type { Metadata } from 'next';
import Link from 'next/link';
import { Store, Boxes, ClipboardList, Wallet, BarChart3, Users, ShieldCheck, ArrowRight } from 'lucide-react';
import { tryServerApi } from '@/lib/server-api';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sell on IBazzzar', description: 'Open a store and sell retail and wholesale to customers and businesses across India.' };

export default async function SellPage() {
  const settings = await tryServerApi<{ categories: { id: string }[] }>('/categories', { revalidate: 300 });
  return (
    <>
      <section className="surface-emerald">
        <div className="container-page py-14 md:py-20 max-w-4xl">
          <span className="eyebrow text-gold-light!">Sell on IBazzzar</span>
          <h1 className="text-4xl md:text-[54px] text-white mt-2">Your Store. A Bigger Marketplace.</h1>
          <p className="text-white/75 mt-4 text-lg max-w-2xl">Reach shoppers and businesses from one catalogue. You keep control of prices, stock and fulfilment; we bring the customers, payments and tools.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register?as=seller" className="btn btn-gold btn-lg">Become a Seller<ArrowRight size={18} /></Link>
            <Link href="/seller" className="btn btn-on-dark btn-lg">I already sell here</Link>
          </div>
          <p className="text-white/55 text-sm mt-6">{settings?.categories.length ?? 12} departments open for new stores.</p>
        </div>
      </section>
      <section className="container-page py-14">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            [Store, 'Retail and wholesale', 'One listing serves personal shoppers and business buyers with MOQ and bulk tiers.'],
            [Boxes, 'Inventory you can trust', 'Stock is reserved at checkout and never oversold. Adjust counts with a full movement history.'],
            [ClipboardList, 'Orders and fulfilment', 'Pack, book a courier (or enter your own AWB), print GST invoices and track every parcel.'],
            [Users, 'Business quotations', 'Respond to RFQs with revisions and negotiate in one thread. Accepted quotes arrive as POs.'],
            [Wallet, 'Clear settlements', 'A ledger of every sale, commission, refund and payout. No surprises.'],
            [BarChart3, 'Performance at a glance', '30-day revenue, top products, low-stock alerts and review scores.'],
          ].map(([Icon, t, b]) => {
            const I = Icon as typeof Store;
            return <div key={t as string} className="card card-pad"><I size={24} className="text-gold-ink" /><h2 className="text-xl mt-3">{t as string}</h2><p className="text-muted mt-1.5 text-[15px]">{b as string}</p></div>;
          })}
        </div>
        <div className="panel p-6 md:p-8 mt-10 grid gap-4 md:grid-cols-[auto_1fr] items-start">
          <ShieldCheck size={30} className="text-forest" />
          <div>
            <h2 className="text-2xl">What we ask of sellers</h2>
            <ul className="mt-3 grid gap-2 text-[15px] text-[#33443a] list-disc pl-5">
              <li>Accurate listings with your own genuine product photos</li>
              <li>Valid GST details if you are registered (small unregistered businesses can sell with a bill of supply)</li>
              <li>A pickup address and a bank account in your business’s name for payouts</li>
              <li>Shipping within your stated handling time and honouring the returns policy</li>
            </ul>
            <p className="text-sm text-muted mt-3">Read the full <Link href="/pages/seller-agreement" className="link">Seller Agreement</Link>. Commission is shown in your seller hub before you list.</p>
          </div>
        </div>
      </section>
    </>
  );
}
