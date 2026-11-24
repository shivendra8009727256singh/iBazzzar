'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Copy, Check, Star, ArrowRight, TicketPercent } from 'lucide-react';
import type { Product } from '@/lib/types';
import { cn, formatMoney, percentOff } from '@/lib/format';
import { TILE_BG } from '@/lib/tiles';



const ratingTone = (r: number) => (r >= 4 ? 'bg-success' : r >= 3 ? 'bg-[#c27c0e]' : 'bg-danger');

/** Compact product tile for horizontal rows: tinted art, optional rank, rating, price and saving. */
export function MiniProductCard({ p, badge, rank, tone = 0 }: { p: Product; badge?: string; rank?: number; tone?: number }) {
  const off = percentOff(p.pricePaise, p.mrpPaise);
  const save = Math.max(0, p.mrpPaise - p.pricePaise);
  return (
    <Link href={`/products/${p.slug}`} className="group snap-start w-[160px] sm:w-[188px] shrink-0 flex flex-col">
      <div className={cn('relative aspect-[4/5] rounded-2xl overflow-hidden', TILE_BG[tone % TILE_BG.length])}>
        <span className="absolute inset-x-6 bottom-5 h-4 rounded-[50%] bg-black/[0.06] blur-md" aria-hidden />
        <Image src={p.image} alt={p.name} fill sizes="188px" className="object-contain p-6 transition-transform duration-500 group-hover:scale-[1.08] group-hover:-translate-y-1" unoptimized={p.image.startsWith('/api/')} />
        {rank != null && <span className="absolute left-0 top-0 rounded-br-2xl bg-ink text-white font-display text-xl leading-none px-3 py-2">#{rank}</span>}
        {(badge || p.promotion) && <span className="absolute top-2.5 right-2.5 rounded-full bg-danger text-white text-[10.5px] font-bold px-2 py-0.5 shadow-card">{badge ?? `DEAL · ${Math.round((p.promotion?.discountBps ?? 0) / 100)}% OFF`}</span>}
        {p.rating && <span className="absolute left-2.5 bottom-2.5 inline-flex items-center gap-1 rounded-full bg-white/95 shadow-card px-2 py-0.5 text-[11px] font-bold"><span className={cn('inline-flex items-center gap-0.5 rounded-full px-1.5 text-white', ratingTone(p.rating.average))}>{p.rating.average.toFixed(1)}<Star size={8} fill="currentColor" /></span><span className="text-muted font-medium">{p.rating.count}</span></span>}
      </div>
      <div className="pt-2.5 px-0.5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-gold-ink truncate">{p.brand}</p>
        <p className="text-[13.5px] font-medium leading-snug line-clamp-2 min-h-[2.5em] text-ink/85 group-hover:text-forest">{p.name}</p>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5"><span className="font-bold text-[15px] tabular-nums">{formatMoney(p.pricePaise)}</span>{off > 0 && <><span className="text-[11.5px] text-muted line-through">{formatMoney(p.mrpPaise)}</span><span className="text-[11.5px] font-bold text-success">{off}% off</span></>}</p>
        {save >= 10000 && <p className="text-[11px] text-success font-semibold">Save {formatMoney(save)}</p>}
      </div>
    </Link>
  );
}

/** Section heading with a short gold accent, shared by the homepage blocks. */
export function SectionHead({ title, subtitle, action, light }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; light?: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-4 md:mb-5">
      <div className="min-w-0">
        <span className="block h-1 w-10 rounded-full bg-gradient-to-r from-gold to-gold-light mb-2" aria-hidden />
        <h2 className={cn('text-[22px] md:text-[28px] flex items-center gap-3 flex-wrap leading-tight', light && 'text-white')}>{title}</h2>
        {subtitle && <p className={cn('text-sm mt-1', light ? 'text-white/70' : 'text-muted')}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** A titled, horizontally scrolling row with arrow buttons on wide screens. */
export function Rail({ title, subtitle, href, products, accent, children, ranked, className }: { title: string; subtitle?: React.ReactNode; href?: string; products?: Product[]; accent?: React.ReactNode; children?: React.ReactNode; ranked?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * (ref.current.clientWidth * 0.85), behavior: 'smooth' });
  if (products && !products.length) return null;
  return (
    <section className={cn('rounded-3xl bg-white border border-line shadow-card p-4 md:p-6 min-w-0', className)}>
      <SectionHead title={<>{title}{accent}</>} subtitle={subtitle} action={
        <div className="flex items-center gap-2">
          <button type="button" aria-label={`Scroll ${title} left`} onClick={() => scroll(-1)} className="hidden md:grid size-9 place-items-center rounded-full border border-line hover:border-forest hover:text-forest"><ChevronLeft size={18} /></button>
          <button type="button" aria-label={`Scroll ${title} right`} onClick={() => scroll(1)} className="hidden md:grid size-9 place-items-center rounded-full border border-line hover:border-forest hover:text-forest"><ChevronRight size={18} /></button>
          {href && <Link href={href} className="btn btn-primary btn-sm rounded-full">View all<ArrowRight size={15} /></Link>}
        </div>
      } />
      <div ref={ref} className="flex gap-3 md:gap-4 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-1 -mx-1 px-1">
        {children ?? products?.map((p, i) => <MiniProductCard key={`${p.listingId}:${i}`} p={p} tone={i} rank={ranked ? i + 1 : undefined} />)}
      </div>
    </section>
  );
}

/** Amazon-style card: a theme with four products in a 2×2 grid and a "see more" link. */
export function QuadCard({ title, href, cta, products, tone = 0, tags }: { title: string; href: string; cta: string; products: Product[]; tone?: number; tags?: string[] }) {
  if (products.length < 2) return null;
  return (
    <section className="rounded-3xl bg-white border border-line shadow-card p-4 md:p-5 flex flex-col min-w-0 max-sm:w-[78%] max-sm:shrink-0 snap-start">
      <h2 className="text-[19px] md:text-[21px] leading-tight">{title}</h2>
      <div className="grid grid-cols-2 gap-2.5 mt-3 flex-1">
        {products.slice(0, 4).map((p, i) => (
          <Link key={`${p.listingId}:${i}`} href={`/products/${p.slug}`} className="group min-w-0">
            <span className={cn('relative block aspect-square rounded-xl overflow-hidden', TILE_BG[(tone + i) % TILE_BG.length])}>
              <Image src={p.image} alt="" fill sizes="140px" className="object-contain p-4 transition-transform duration-500 group-hover:scale-110" unoptimized={p.image.startsWith('/api/')} />
            </span>
            <span className="block text-[12px] text-ink/80 mt-1.5 truncate group-hover:text-forest">{p.name}</span>
            <span className="block text-[12px] font-bold text-success truncate">{tags?.[i] ?? formatMoney(p.pricePaise)}</span>
          </Link>
        ))}
      </div>
      <Link href={href} className="mt-3 text-[13.5px] font-semibold text-forest inline-flex items-center gap-1 hover:gap-2 transition-all">{cta}<ArrowRight size={14} /></Link>
    </section>
  );
}

/** Big ticking timer for the deal of the day (client-only time to avoid hydration mismatch). */
export function CountdownBoxes({ endsAt, startsAt, tone = 'red', hideLabel }: { endsAt: string; startsAt?: string; tone?: 'red' | 'navy'; hideLabel?: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const upcoming = !!startsAt && now != null && Date.parse(startsAt) > now;
  const ms = now == null ? 0 : Math.max(0, (upcoming ? Date.parse(startsAt!) : Date.parse(endsAt)) - now);
  // More than a day away: days / hours / minutes; otherwise hours / minutes / seconds.
  const parts: [string, number][] = ms >= 86_400_000
    ? [['Days', Math.floor(ms / 86_400_000)], ['Hrs', Math.floor(ms / 3_600_000) % 24], ['Min', Math.floor(ms / 60_000) % 60]]
    : [['Hrs', Math.floor(ms / 3_600_000)], ['Min', Math.floor(ms / 60_000) % 60], ['Sec', Math.floor(ms / 1000) % 60]];
  const ink = tone === 'navy' ? 'text-[#1d4f7a]' : 'text-[#9f1d17]';
  return (
    <div aria-label={upcoming ? 'Starts in' : 'Ends in'}>
      {!hideLabel && <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/75 mb-2">{upcoming ? 'Starts in' : 'Ends in'}</p>}
      <div className="flex items-center gap-1.5">
        {parts.map(([label, v], i) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={cn('grid place-items-center min-w-[54px] rounded-xl bg-white px-2 py-1.5 shadow-lift', ink)}>
              <span className="font-display text-[26px] leading-none tabular-nums">{now == null ? '--' : String(v).padStart(2, '0')}</span>
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-70 mt-0.5">{label}</span>
            </span>
            {i < 2 && <span className="font-display text-2xl text-white/80">:</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

type Offer = { code: string; description: string; kind: string; value: number; minOrderPaise: number; endsAt: string };
type FullOffer = Offer & { maxDiscountPaise: number | null; mode: string };

/** A ticket-style coupon with notches, terms and a one-tap copy. */
export function CouponCard({ o, index = 0 }: { o: FullOffer; index?: number }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(o.code); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard blocked */ } };
  return (
    <div className="relative flex rounded-2xl bg-white text-ink border border-line shadow-card overflow-hidden hover:shadow-lift hover:-translate-y-0.5 transition">
      <div className={cn('relative w-[92px] sm:w-[104px] shrink-0 bg-gradient-to-b text-white grid place-items-center text-center px-2', OFFER_TONES[index % OFFER_TONES.length])}>
        <span className="font-display text-[26px] leading-none">{o.kind === 'PERCENT' ? `${o.value}%` : formatMoney(o.value).replace('.00', '')}<span className="block text-[11px] font-sans font-bold tracking-[0.18em] mt-1.5">OFF</span></span>
        <span className="absolute -right-2.5 -top-2.5 size-5 rounded-full bg-[#f3f5f0]" aria-hidden />
        <span className="absolute -right-2.5 -bottom-2.5 size-5 rounded-full bg-[#f3f5f0]" aria-hidden />
      </div>
      <div className="flex-1 min-w-0 p-4 border-l-2 border-dashed border-line">
        <p className="font-semibold leading-snug line-clamp-2">{o.description}</p>
        <p className="text-[12px] text-muted mt-1">
          {o.minOrderPaise ? `Min. order ${formatMoney(o.minOrderPaise)} · ` : ''}{o.maxDiscountPaise ? `Up to ${formatMoney(o.maxDiscountPaise)} · ` : ''}{o.mode === 'ANY' ? 'All orders' : o.mode === 'RETAIL' ? 'Personal orders' : 'Business orders'}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-lg border border-dashed border-gold bg-cream px-2.5 py-1 font-mono font-bold tracking-wider text-forest">{o.code}</span>
          <button type="button" onClick={copy} className="inline-flex items-center gap-1 rounded-lg bg-forest text-white hover:bg-emerald px-2.5 py-1 text-[13px] font-semibold" aria-label={`Copy code ${o.code}`}>{copied ? <><Check size={14} />Copied</> : <><Copy size={14} />Copy</>}</button>
          <span className="text-[11.5px] text-muted ml-auto">Till {new Date(o.endsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
        </div>
      </div>
    </div>
  );
}
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

/** How much of a deal's time has passed, as a thin bar with "x% of time left" (client-only clock). */
export function DealProgress({ startsAt, endsAt, light }: { startsAt: string; endsAt: string; light?: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const start = Date.parse(startsAt), end = Date.parse(endsAt);
  const left = now == null ? 1 : Math.min(1, Math.max(0, (end - now) / Math.max(1, end - start)));
  return (
    <div className="min-w-[160px]">
      <div className={cn('h-2 rounded-full overflow-hidden', light ? 'bg-black/10' : 'bg-white/20')}>
        <div className={cn('h-full rounded-full transition-[width] duration-700', light ? 'bg-danger' : 'bg-gradient-to-r from-[#ffd98a] to-white')} style={{ width: `${Math.round(left * 100)}%` }} />
      </div>
      <p className={cn('text-[11.5px] font-semibold mt-1', light ? 'text-danger' : 'text-white/80')}>{now == null ? ' ' : left < 0.2 ? 'Ending soon — hurry' : `${Math.round(left * 100)}% of deal time left`}</p>
    </div>
  );
}
