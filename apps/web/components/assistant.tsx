'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bot, X, ArrowRight, Search } from 'lucide-react';

// A guided helper with fixed, rule-based answers. It is clearly labelled: no AI service is connected,
// and it never places orders, changes prices or issues refunds.
const TOPICS: { q: string; a: string; links: [string, string][] }[] = [
  { q: 'Where is my order?', a: 'Open your orders to see each parcel’s status and courier tracking.', links: [['My orders', '/account/orders']] },
  { q: 'How do returns work?', a: 'Request a return from the order page within the return window. Refunds start once the seller receives the item.', links: [['Returns policy', '/pages/returns'], ['My returns', '/account/returns']] },
  { q: 'I want to buy in bulk', a: 'Switch to Business mode for wholesale prices and MOQ, or send a request for quotation to sellers.', links: [['Wholesale', '/wholesale'], ['Request a quote', '/business/rfqs/new']] },
  { q: 'Is cash on delivery available?', a: 'Eligible items show “Cash on delivery” at checkout once you enter your PIN code.', links: [['Payments', '/pages/payments']] },
  { q: 'How do I sell on IBazzzar?', a: 'Apply with your store and tax details. Once approved, list products and start receiving orders.', links: [['Become a seller', '/sell']] },
];

export function Assistant() {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const path = usePathname();
  const router = useRouter();
  if (/^\/(admin|superadmin|checkout)/.test(path)) return null;
  return (
    <div className="fixed right-4 bottom-20 md:bottom-6 z-40">
      {open && (
        <section aria-label="Guided shopping assistant" className="card mb-3 w-[min(360px,calc(100vw-32px))] p-0 overflow-hidden animate-fade-up">
          <div className="surface-emerald px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2"><span className="size-8 rounded-full bg-gold-light/20 grid place-items-center"><Bot size={18} className="text-gold-light" /></span><div><p className="font-semibold text-white text-[15px]">IBazzzar guide</p><p className="text-[11.5px] text-white/65">Guided help · not an AI · not a person</p></div></div>
            <button onClick={() => setOpen(false)} aria-label="Close guide" className="text-white/80 hover:text-white p-1"><X size={18} /></button>
          </div>
          <div className="p-4 grid gap-3 max-h-[55vh] overflow-y-auto">
            {topic == null ? (
              <>
                <p className="text-[14.5px]">What can I help you find?</p>
                <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) { router.push(`/products?q=${encodeURIComponent(q.trim())}`); setOpen(false); } }} className="flex gap-2">
                  <label htmlFor="guide-search" className="sr-only">Search products</label>
                  <input id="guide-search" className="input min-h-[40px]" placeholder="e.g. desk lamp" value={q} onChange={(e) => setQ(e.target.value)} />
                  <button className="btn btn-primary btn-icon" aria-label="Search"><Search size={16} /></button>
                </form>
                <div className="grid gap-1.5">
                  {TOPICS.map((t, i) => <button key={t.q} onClick={() => setTopic(i)} className="text-left rounded-lg border border-line px-3 py-2 text-[14px] hover:border-forest hover:bg-mint">{t.q}</button>)}
                </div>
              </>
            ) : (
              <>
                <p className="font-semibold">{TOPICS[topic].q}</p>
                <p className="text-[14.5px] text-muted">{TOPICS[topic].a}</p>
                <div className="flex flex-wrap gap-2">
                  {TOPICS[topic].links.map(([l, h]) => <Link key={h} href={h} onClick={() => setOpen(false)} className="btn btn-outline btn-sm">{l}<ArrowRight size={14} /></Link>)}
                </div>
                <button onClick={() => setTopic(null)} className="link text-sm text-left">← Other questions</button>
                <p className="text-xs text-muted border-t border-line pt-3">Still stuck? <Link href="/support" className="link" onClick={() => setOpen(false)}>Contact our support team</Link>.</p>
              </>
            )}
          </div>
        </section>
      )}
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="ml-auto flex items-center gap-2 rounded-full bg-emerald text-white pl-3 pr-4 py-2.5 shadow-lift hover:bg-forest">
        <Bot size={20} className="text-gold-light" /><span className="text-sm font-semibold">Need help?</span>
      </button>
    </div>
  );
}
