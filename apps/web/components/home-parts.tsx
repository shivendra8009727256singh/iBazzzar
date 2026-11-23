'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, Scale, ShoppingCart, PackageCheck, Truck, Clock } from 'lucide-react';
import type { Product } from '@/lib/types';
import { ProductGrid } from './product-card';
import { Tabs, Empty } from './ui';

type Rails = { trending: Product[]; bestSellers: Product[]; newArrivals: Product[]; deals: Product[] };

export function ProductRails({ rails }: { rails: Rails }) {
  const [tab, setTab] = useState<keyof Rails>('trending');
  const items: { value: keyof Rails; label: string }[] = [
    { value: 'trending', label: 'Trending' }, { value: 'bestSellers', label: 'Best sellers' },
    { value: 'newArrivals', label: 'New arrivals' }, { value: 'deals', label: 'Deals' },
  ];
  return (
    <div>
      <Tabs value={tab} onChange={setTab} items={items} />
      {rails[tab].length ? <ProductGrid products={rails[tab]} /> : <Empty title="Nothing here yet" body="As sellers add products and customers order, this shelf fills up." />}
    </div>
  );
}

/** Countdown to a real promotion end time. Shows nothing misleading: when the deal ends, it says so. */
export function Countdown({ endsAt, startsAt }: { endsAt: string; startsAt?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (now == null) return <span className="tabular-nums">—</span>;
  const upcoming = startsAt && Date.parse(startsAt) > now;
  const target = upcoming ? Date.parse(startsAt!) : Date.parse(endsAt);
  const ms = Math.max(0, target - now);
  if (!ms) return <span>Ended</span>;
  const d = Math.floor(ms / 86_400_000), h = Math.floor(ms / 3_600_000) % 24, m = Math.floor(ms / 60_000) % 60, s = Math.floor(ms / 1000) % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums" aria-live="off">
      <Clock size={14} />{upcoming ? 'Starts in ' : 'Ends in '}{d > 0 && `${d}d `}{pad(h)}:{pad(m)}:{pad(s)}
    </span>
  );
}

const STAGES = [
  { icon: Search, title: 'Discover', body: 'Search across every department, with filters that remember where you were.' },
  { icon: Scale, title: 'Compare', body: 'See every seller’s offer, MOQ and bulk price side by side — no hidden charges.' },
  { icon: ShoppingCart, title: 'Order', body: 'Pay online, on delivery or by bank transfer for business. Totals include GST.' },
  { icon: PackageCheck, title: 'Fulfilment', body: 'Each seller packs and invoices their own parcel; you track every one.' },
  { icon: Truck, title: 'Delivery', body: 'Estimated by your PIN code before you pay, then tracked to your door.' },
];

export function CommerceStory() {
  return (
    <ol className="grid gap-4 md:grid-cols-5">
      {STAGES.map((s, i) => (
        <li key={s.title} style={{ animationDelay: `${i * 80}ms` }} className="relative rounded-2xl border border-white/12 bg-white/[0.04] p-5 animate-fade-up">
          <span className="text-[12px] font-bold text-gold-light tracking-widest">0{i + 1}</span>
          <s.icon className="mt-3 text-gold-light" size={26} />
          <h3 className="mt-3 text-xl text-white">{s.title}</h3>
          <p className="mt-1.5 text-[14px] text-white/70">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

/** Content is always rendered visible; the entrance is a CSS animation (disabled for reduced motion), never hidden until scrolled. */
export function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  return <div className={`animate-fade-up ${className ?? ''}`} style={{ animationDelay: `${delay}s` }}>{children}</div>;
}

export function ShopLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="link inline-flex items-center gap-1">{children} →</Link>;
}
