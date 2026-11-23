import type { Metadata } from 'next';
import Link from 'next/link';
import { Package, RotateCcw, CreditCard, Building2, Store, LifeBuoy } from 'lucide-react';
import { PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Help centre', description: 'Answers about orders, returns, payments, business buying and selling on IBazzzar.' };

const FAQ = [
  { q: 'How do I track my order?', a: 'Open My orders. Each parcel shows its status, the courier and a tracking timeline.' },
  { q: 'When will I get my refund?', a: 'Once the seller receives your return, the refund is issued to your original payment method. Banks usually show it within 5–7 working days. Cash-on-delivery refunds are paid by bank transfer.' },
  { q: 'Why is my order split into parcels?', a: 'IBazzzar is a marketplace. Each seller packs, invoices and ships their own items, so you may receive more than one parcel.' },
  { q: 'Is my card information safe?', a: 'Payments are processed by Razorpay. Card numbers never reach IBazzzar’s servers.' },
  { q: 'Can I pay cash on delivery?', a: 'For eligible items and PIN codes, cash on delivery is offered at checkout with a small fee shown before you confirm.' },
  { q: 'How do I buy for my business?', a: 'Create a business account, then switch to Business mode for MOQ pricing or send a request for quotation.' },
];

export default function HelpPage() {
  return (
    <div className="container-page py-8">
      <PageHeader eyebrow="Help centre" title="How can we help?" description="Quick answers below, or talk to our team — every reply is kept in your account." actions={<Link href="/account/support" className="btn btn-primary"><LifeBuoy size={17} />Contact support</Link>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-12">
        {[[Package, 'Orders & tracking', '/account/orders'], [RotateCcw, 'Returns & refunds', '/pages/returns'], [CreditCard, 'Payments', '/pages/payments'], [Building2, 'Business buying', '/wholesale'], [Store, 'Selling', '/sell']].map(([Icon, t, h]) => {
          const I = Icon as typeof Package;
          return <Link key={h as string} href={h as string} className="card card-pad hover:shadow-lift"><I size={22} className="text-forest" /><p className="font-semibold mt-3">{t as string}</p></Link>;
        })}
      </div>
      <h2 className="text-2xl mb-4">Frequently asked</h2>
      <div className="grid gap-3 max-w-3xl">
        {FAQ.map((f) => (
          <details key={f.q} className="card p-5 group">
            <summary className="font-semibold cursor-pointer list-none flex justify-between gap-4">{f.q}<span className="text-gold transition group-open:rotate-45" aria-hidden>+</span></summary>
            <p className="text-muted mt-3">{f.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
