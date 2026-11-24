'use client';
import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { BadgeCheck, Search, ArrowRight, X } from 'lucide-react';
import { cn, formatMoney } from '@/lib/format';

export type BrandCard = { id: string; name: string; slug: string; verified: boolean; products: number; logoUrl: string | null; category: string | null; fromPaise: number | null; image: string | null };

const TONES = ['from-[#174b37] to-[#2f6b52]', 'from-[#7a5715] to-[#c99a3d]', 'from-[#1d4f7a] to-[#3b7cb5]', 'from-[#6941c6] to-[#9b7ae8]', 'from-[#9a3412] to-[#d97706]', 'from-[#0f5132] to-[#3c8d5e]'];
const tone = (name: string) => TONES[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % TONES.length];
const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

function Card({ b }: { b: BrandCard }) {
  return (
    <Link href={`/products?brand=${b.slug}`} className="group rounded-2xl border border-line bg-white overflow-hidden hover:shadow-lift hover:-translate-y-0.5 transition duration-300 flex flex-col">
      <div className={cn('relative h-24 bg-gradient-to-br', tone(b.name))}>
        {b.image && <Image src={b.image} alt="" fill sizes="240px" className="object-contain p-3 opacity-25 mix-blend-luminosity group-hover:opacity-35 transition" unoptimized={b.image.startsWith('/api/')} />}
        <span className="absolute -bottom-6 left-4 size-14 rounded-2xl bg-white shadow-card border border-line grid place-items-center overflow-hidden">
          {b.logoUrl ? <Image src={b.logoUrl} alt="" width={56} height={56} className="object-contain p-1.5" unoptimized /> : <span className="font-display text-xl font-bold text-forest">{initials(b.name)}</span>}
        </span>
        {b.verified && <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-bold text-forest"><BadgeCheck size={13} />Verified</span>}
      </div>
      <div className="px-4 pt-8 pb-4 flex-1 flex flex-col">
        <p className="font-semibold text-[15.5px] group-hover:text-forest">{b.name}</p>
        <p className="text-[12.5px] text-muted">{b.category ?? 'Multiple categories'}</p>
        <div className="mt-auto pt-3 flex items-end justify-between gap-2">
          <span className="text-[12.5px] text-muted">{b.products} product{b.products === 1 ? '' : 's'}{b.fromPaise != null && <><br /><span className="text-ink font-semibold">from {formatMoney(b.fromPaise)}</span></>}</span>
          <span className="size-8 rounded-full bg-mint text-forest grid place-items-center group-hover:bg-forest group-hover:text-white transition"><ArrowRight size={15} /></span>
        </div>
      </div>
    </Link>
  );
}

export function BrandDirectory({ brands }: { brands: BrandCard[] }) {
  const [q, setQ] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const filtered = brands.filter((b) => (!verifiedOnly || b.verified) && b.name.toLowerCase().includes(q.trim().toLowerCase()));
  const groups = useMemo(() => {
    const m = new Map<string, BrandCard[]>();
    for (const b of filtered) { const k = /[a-z]/i.test(b.name[0]) ? b.name[0].toUpperCase() : '#'; m.set(k, [...(m.get(k) ?? []), b]); }
    return [...m].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);
  const top = [...brands].sort((a, b) => b.products - a.products).slice(0, 4);
  const letters = new Set(groups.map(([l]) => l));

  return (
    <div className="bg-[#f5f6f2] min-h-screen pb-12">
      <section className="relative overflow-hidden bg-gradient-to-br from-emerald via-forest to-deep text-white">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-gold/15 blur-3xl" aria-hidden />
        <div className="container-page relative py-10 md:py-14">
          <span className="eyebrow text-gold-light!">Brands on IBazzzar</span>
          <h1 className="text-3xl md:text-[44px] text-white mt-1 max-w-2xl">Shop the brands you trust</h1>
          <p className="text-white/75 mt-2 max-w-xl">{brands.length} brands sold by approved sellers. A verified badge means our team checked brand ownership or authorisation.</p>
          <div className="mt-6 flex flex-wrap items-center gap-3 max-w-xl">
            <div className="relative flex-1 min-w-60">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
              <input aria-label="Search brands" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a brand" className="w-full rounded-full bg-white text-ink pl-11 pr-10 py-3 outline-none focus:ring-4 focus:ring-gold/40" />
              {q && <button aria-label="Clear search" onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"><X size={17} /></button>}
            </div>
            <label className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/20 px-4 py-2.5 text-sm cursor-pointer">
              <input type="checkbox" className="checkbox mt-0" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} />Verified only
            </label>
          </div>
        </div>
      </section>

      <div className="container-page">
        {!q && !verifiedOnly && top.length > 0 && (
          <section className="-mt-8 relative" aria-labelledby="top-brands">
            <h2 id="top-brands" className="sr-only">Top brands</h2>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              {top.map((b) => (
                <Link key={b.id} href={`/products?brand=${b.slug}`} className="group rounded-2xl bg-white border border-line shadow-card p-4 flex items-center gap-3 hover:shadow-lift transition">
                  <span className={cn('size-12 rounded-xl bg-gradient-to-br grid place-items-center text-white font-display font-bold shrink-0', tone(b.name))}>{initials(b.name)}</span>
                  <span className="min-w-0"><span className="block font-semibold truncate group-hover:text-forest">{b.name}</span><span className="block text-xs text-muted">Top brand · {b.products} products</span></span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <nav aria-label="Jump to letter" className="sticky top-[110px] z-20 mt-6 rounded-2xl bg-white/95 backdrop-blur border border-line shadow-card px-3 py-2 flex gap-1 overflow-x-auto">
          {'#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => letters.has(l)
            ? <a key={l} href={`#brands-${l}`} className="min-w-8 h-8 rounded-lg grid place-items-center text-sm font-bold text-forest hover:bg-forest hover:text-white transition">{l}</a>
            : <span key={l} className="min-w-8 h-8 grid place-items-center text-sm text-line-strong" aria-hidden>{l}</span>)}
        </nav>

        {groups.length ? groups.map(([letter, list]) => (
          <section key={letter} id={`brands-${letter}`} className="mt-8 scroll-mt-40" aria-labelledby={`h-${letter}`}>
            <div className="flex items-center gap-3 mb-4">
              <h2 id={`h-${letter}`} className="text-2xl text-gold-ink w-8">{letter}</h2>
              <span className="h-px flex-1 bg-line" aria-hidden />
              <span className="text-xs text-muted">{list.length} brand{list.length === 1 ? '' : 's'}</span>
            </div>
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{list.map((b) => <Card key={b.id} b={b} />)}</div>
          </section>
        )) : <div className="card mt-8 p-10 text-center text-muted">No brand matches “{q}”.</div>}
      </div>
    </div>
  );
}
