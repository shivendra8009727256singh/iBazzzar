'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Copy, Check, Star, ArrowRight, TicketPercent } from 'lucide-react';
import type { Product } from '@/lib/types';
import { cn, formatMoney, percentOff } from '@/lib/format';

/** Compact product tile for horizontal rows. */
export function MiniProductCard({ p, badge }: { p: Product; badge?: string }) {
  const off = percentOff(p.pricePaise, p.mrpPaise);
  return (
    <Link href={`/products/${p.slug}`} className="group snap-start w-[168px] sm:w-[196px] shrink-0 rounded-2xl border border-line bg-white overflow-hidden hover:shadow-lift hover:-translate-y-0.5 transition duration-300">
      <div className="relative aspect-square bg-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,#f6f1e2,transparent_68%)]" aria-hidden />
        <Image src={p.image} alt={p.name} fill sizes="196px" className="object-contain p-6 transition-transform duration-500 group-hover:scale-[1.07]" unoptimized={p.image.startsWith('/api/')} />
        {(badge || p.promotion) && <span className="absolute top-2.5 left-2.5 rounded-md bg-danger text-white text-[10.5px] font-bold px-1.5 py-0.5">{badge ?? `${Math.round((p.promotion?.discountBps ?? 0) / 100)}% OFF`}</span>}
      </div>
      <div className="p-3 border-t border-line/70">
        <p className="text-[11px] font-bold uppercase tracking-wider text-gold-ink truncate">{p.brand}</p>
        <p className="text-[13.5px] font-semibold leading-snug line-clamp-2 min-h-[2.5em] group-hover:text-forest">{p.name}</p>
        {p.rating && <p className="mt-1 flex items-center gap-1 text-[11.5px] text-muted"><span className={cn('inline-flex items-center gap-0.5 rounded px-1 text-[11px] font-bold text-white', p.rating.average >= 4 ? 'bg-success' : p.rating.average >= 3 ? 'bg-[#c27c0e]' : 'bg-danger')}>{p.rating.average.toFixed(1)}<Star size={9} fill="currentColor" /></span>({p.rating.count})</p>}
        <p className="mt-1.5 flex flex-wrap items-baseline gap-1.5"><span className="font-bold tabular-nums">{formatMoney(p.pricePaise)}</span>{off > 0 && <><span className="text-[11.5px] text-muted line-through">{formatMoney(p.mrpPaise)}</span><span className="text-[11.5px] font-bold text-success">{off}% off</span></>}</p>
      </div>
    </Link>
  );
}

/** A titled, horizontally scrolling row with arrow buttons on wide screens. */
export function Rail({ title, subtitle, href, products, accent, children }: { title: string; subtitle?: React.ReactNode; href?: string; products?: Product[]; accent?: React.ReactNode; children?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * (ref.current.clientWidth * 0.85), behavior: 'smooth' });
  if (products && !products.length) return null;
  return (
    <section className="rounded-3xl bg-white border border-line shadow-card p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-2xl md:text-[28px] flex items-center gap-3 flex-wrap">{title}{accent}</h2>
          {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label={`Scroll ${title} left`} onClick={() => scroll(-1)} className="hidden md:grid size-9 place-items-center rounded-full border border-line hover:border-forest hover:text-forest"><ChevronLeft size={18} /></button>
          <button type="button" aria-label={`Scroll ${title} right`} onClick={() => scroll(1)} className="hidden md:grid size-9 place-items-center rounded-full border border-line hover:border-forest hover:text-forest"><ChevronRight size={18} /></button>
          {href && <Link href={href} className="btn btn-primary btn-sm rounded-full">View all<ArrowRight size={15} /></Link>}
        </div>
      </div>
      <div ref={ref} className="flex gap-3 md:gap-4 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-1 -mx-1 px-1">
        {children ?? products?.map((p) => <MiniProductCard key={p.catalogProductId} p={p} />)}
      </div>
    </section>
  );
}

type Offer = { code: string; description: string; kind: string; value: number; minOrderPaise: number; endsAt: string };
const OFFER_TONES = ['from-[#174b37] to-[#2f6b52]', 'from-[#7a5715] to-[#c99a3d]', 'from-[#1d4f7a] to-[#3b7cb5]', 'from-[#6941c6] to-[#9b7ae8]'];

/** Coupon cards with a one-tap copy of the code. */
export function OfferStrip({ offers }: { offers: Offer[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  if (!offers.length) return null;
  const copy = async (code: string) => { try { await navigator.clipboard.writeText(code); setCopied(code); setTimeout(() => setCopied(null), 1600); } catch { /* clipboard blocked */ } };
  return (
    <div className="flex gap-3 overflow-x-auto snap-x no-scrollbar -mx-1 px-1">
      {offers.slice(0, 4).map((o, i) => (
        <div key={o.code} className={cn('relative snap-start min-w-[260px] flex-1 rounded-2xl bg-gradient-to-br text-white p-4 overflow-hidden', OFFER_TONES[i % OFFER_TONES.length])}>
          <span className="absolute -right-6 -top-6 size-24 rounded-full bg-white/10" aria-hidden />
          <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-white/80"><TicketPercent size={15} />{o.kind === 'PERCENT' ? `${o.value}% off` : `${formatMoney(o.value)} off`}</p>
          <p className="mt-1 font-semibold text-[15px] leading-snug line-clamp-2">{o.description}</p>
          <div className="mt-3 flex items-center gap-2">
            <span className="rounded-lg border border-dashed border-white/60 px-2.5 py-1 font-mono font-bold tracking-wider">{o.code}</span>
            <button type="button" onClick={() => copy(o.code)} className="inline-flex items-center gap-1 rounded-lg bg-white/15 hover:bg-white/25 px-2.5 py-1 text-[13px] font-semibold" aria-label={`Copy code ${o.code}`}>{copied === o.code ? <><Check size={14} />Copied</> : <><Copy size={14} />Copy</>}</button>
          </div>
        </div>
      ))}
    </div>
  );
}
