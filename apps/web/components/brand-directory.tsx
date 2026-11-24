'use client';
import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { BadgeCheck, Search, ArrowRight, X, Crown, ShieldCheck, FileCheck2, PackageCheck, Store, SlidersHorizontal, Sparkles } from 'lucide-react';
import { cn, formatMoney } from '@/lib/format';

export type BrandCard = { id: string; name: string; slug: string; verified: boolean; products: number; logoUrl: string | null; category: string | null; fromPaise: number | null; image: string | null };

// Each brand keeps the same colours everywhere (derived from its name).
const PALETTE = [
  { bg: 'bg-[#e8f0ea]', ink: 'text-[#17603f]', grad: 'from-[#0d3d2c] via-[#17603f] to-[#4f9a73]' },
  { bg: 'bg-[#f6ecda]', ink: 'text-[#8a5a10]', grad: 'from-[#5a3d0c] via-[#9a6413] to-[#d9a441]' },
  { bg: 'bg-[#e5edf6]', ink: 'text-[#245f96]', grad: 'from-[#0f2742] via-[#245f96] to-[#5b8fd6]' },
  { bg: 'bg-[#efe9f8]', ink: 'text-[#5b3fb0]', grad: 'from-[#2a1a5e] via-[#5b3fb0] to-[#9b7ae8]' },
  { bg: 'bg-[#fbe9e4]', ink: 'text-[#b4432a]', grad: 'from-[#5c1a10] via-[#b4432a] to-[#ec8a5c]' },
  { bg: 'bg-[#f7e6f1]', ink: 'text-[#a0337f]', grad: 'from-[#4a0f3a] via-[#a0337f] to-[#e07ac0]' },
];
const pal = (name: string) => PALETTE[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % PALETTE.length];
const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

function Monogram({ b, className }: { b: BrandCard; className?: string }) {
  const p = pal(b.name);
  return (
    <span className={cn('grid place-items-center overflow-hidden rounded-full bg-white shadow-card ring-4 ring-white shrink-0', className)}>
      {b.logoUrl ? <Image src={b.logoUrl} alt="" fill sizes="80px" className="object-contain p-2" unoptimized /> : <span className={cn('font-display font-bold', p.ink)}>{initials(b.name)}</span>}
    </span>
  );
}

function BrandTile({ b, anchor }: { b: BrandCard; anchor?: string }) {
  const p = pal(b.name);
  return (
    <Link id={anchor} href={`/products?brand=${b.slug}`} className="group rounded-3xl bg-white border border-line overflow-hidden hover:shadow-lift hover:-translate-y-1 transition duration-300 flex flex-col scroll-mt-72">
      <div className={cn('relative aspect-[4/3]', p.bg)}>
        <span className="absolute inset-0 opacity-[0.12] bg-[radial-gradient(circle_at_1px_1px,currentColor_1px,transparent_0)] [background-size:16px_16px]" aria-hidden />
        {b.image && <Image src={b.image} alt="" fill sizes="(min-width:1024px) 240px, 45vw" className="object-contain p-7 pb-9 transition-transform duration-500 group-hover:scale-110" unoptimized={b.image.startsWith('/api/')} />}
        {b.verified && <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-white/95 shadow-card px-2 py-0.5 text-[11px] font-bold text-forest"><BadgeCheck size={13} />Verified</span>}
        <Monogram b={b} className="absolute -bottom-5 left-3 sm:-bottom-6 sm:left-4 size-11 sm:size-14 text-sm sm:text-lg" />
      </div>
      <div className="px-3 sm:px-4 pt-7 sm:pt-8 pb-4 flex-1 flex flex-col">
        <p className="font-semibold text-[15px] sm:text-[16px] leading-tight group-hover:text-forest">{b.name}</p>
        <p className="text-[12.5px] text-muted mt-0.5">{b.category ?? 'Multiple categories'}</p>
        <div className="mt-auto pt-3 flex items-end justify-between gap-2">
          <span className="text-[12.5px] text-muted leading-snug">{b.products} product{b.products === 1 ? '' : 's'}{b.fromPaise != null && <><br /><span className="text-ink font-bold text-[14px]">from {formatMoney(b.fromPaise)}</span></>}</span>
          <span className="size-9 rounded-full bg-mint text-forest grid place-items-center group-hover:bg-forest group-hover:text-white group-hover:-rotate-45 transition"><ArrowRight size={16} /></span>
        </div>
      </div>
    </Link>
  );
}

type Sort = 'az' | 'popular' | 'price';

export function BrandDirectory({ brands }: { brands: BrandCard[] }) {
  const [q, setQ] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('az');
  const categories = [...new Set(brands.map((b) => b.category).filter((c): c is string => !!c))].sort();
  const filtered = brands.filter((b) => (!verifiedOnly || b.verified) && (!category || b.category === category) && b.name.toLowerCase().includes(q.trim().toLowerCase()));
  const sorted = [...filtered].sort((a, b) => sort === 'popular' ? b.products - a.products : sort === 'price' ? (a.fromPaise ?? Infinity) - (b.fromPaise ?? Infinity) : a.name.localeCompare(b.name));
  // Small list (tens of brands): plain recalculation on each render is cheap.
  const byLetter = new Map<string, BrandCard[]>();
  for (const b of [...filtered].sort((x, y) => x.name.localeCompare(y.name))) { const k = /[a-z]/i.test(b.name[0]) ? b.name[0].toUpperCase() : '#'; byLetter.set(k, [...(byLetter.get(k) ?? []), b]); }
  const groups = [...byLetter].sort(([a], [b]) => a.localeCompare(b));
  const top = [...brands].sort((a, b) => b.products - a.products || Number(b.verified) - Number(a.verified)).slice(0, 4);
  const [hero, ...runners] = top;
  const letters = new Set(groups.map(([l]) => l));
  const browsing = !q && !verifiedOnly && !category;
  const verifiedCount = brands.filter((b) => b.verified).length;
  const totalProducts = brands.reduce((n, b) => n + b.products, 0);
  const wall = [...brands, ...brands]; // duplicated for a seamless loop

  return (
    <div className="bg-[#f3f5f0] -mb-16 pb-16">
      {/* Banner */}
      <section className="relative overflow-hidden text-white bg-[linear-gradient(120deg,#041f16_0%,#0b3526_45%,#174b37_100%)]">
        <span className="absolute -right-24 -top-24 size-[420px] rounded-full bg-gold/15 blur-3xl" aria-hidden />
        <span className="absolute left-1/3 -bottom-40 size-80 rounded-full bg-[#3b7cb5]/20 blur-3xl" aria-hidden />
        <span className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:22px_22px]" aria-hidden />
        <div className="container-page relative pt-10 md:pt-14 pb-8 grid gap-8 lg:grid-cols-[1.2fr_1fr] items-center">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-light/15 text-gold-light px-3 py-1 text-[11px] md:text-xs font-bold uppercase tracking-[0.14em]"><Sparkles size={13} />The brand directory</span>
            <h1 className="text-[34px] leading-[1.08] md:text-[52px] text-white mt-4">Shop the brands<br className="hidden md:block" /> <span className="bg-gradient-to-r from-gold-light to-[#ffe7a8] bg-clip-text text-transparent">you trust</span></h1>
            <p className="text-white/75 mt-3 max-w-xl text-[15px] md:text-[17px]">Every brand here is sold by approved sellers. A verified badge means our team checked brand ownership or authorisation.</p>
            <div className="relative mt-6 max-w-xl">
              <Search size={19} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
              <input aria-label="Search brands" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for a brand…" className="w-full rounded-2xl bg-white text-ink pl-12 pr-11 py-3.5 text-[15px] shadow-lift outline-none focus:ring-4 focus:ring-gold/40" />
              {q && <button aria-label="Clear search" onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"><X size={18} /></button>}
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-2.5 lg:max-w-md lg:justify-self-end w-full">
            {[['Brands', brands.length], ['Verified', verifiedCount], ['Products', totalProducts]].map(([l, v]) => (
              <div key={l as string} className="rounded-2xl bg-white/[0.07] border border-white/12 backdrop-blur px-3 py-4 text-center">
                <dd className="font-display text-[30px] md:text-[38px] leading-none">{v}</dd>
                <dt className="text-[12px] text-white/65 mt-1.5">{l}</dt>
              </div>
            ))}
          </dl>
        </div>
        {/* Brand wall */}
        <div className="relative border-t border-white/10 py-4 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]" aria-hidden>
          <div className="flex w-max gap-3 animate-[brand-marquee_40s_linear_infinite] hover:[animation-play-state:paused] motion-reduce:animate-none">
            {wall.map((b, i) => (
              <span key={`${b.id}:${i}`} className="inline-flex items-center gap-2 rounded-full bg-white/[0.08] border border-white/12 pl-1.5 pr-4 py-1.5 text-sm font-semibold whitespace-nowrap">
                <span className={cn('size-7 rounded-full bg-white grid place-items-center text-[11px] font-bold', pal(b.name).ink)}>{initials(b.name)}</span>{b.name}{b.verified && <BadgeCheck size={14} className="text-gold-light" />}
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="container-page grid grid-cols-[minmax(0,1fr)] gap-6 md:gap-8 pt-6 md:pt-8">
        {/* Spotlight */}
        {browsing && hero && (
          <section aria-labelledby="spotlight" className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
            <h2 id="spotlight" className="sr-only">Brand spotlight</h2>
            <Link href={`/products?brand=${hero.slug}`} className={cn('group relative overflow-hidden rounded-3xl bg-gradient-to-br text-white p-6 md:p-8 min-h-[280px] flex flex-col justify-between shadow-lift', pal(hero.name).grad)}>
              <span className="absolute -right-16 -top-16 size-72 rounded-full bg-white/10" aria-hidden />
              {hero.image && <span className="absolute right-0 bottom-0 w-[48%] h-[85%]"><Image src={hero.image} alt="" fill sizes="(min-width:1024px) 360px, 50vw" className="object-contain p-4 drop-shadow-[0_24px_30px_rgba(0,0,0,0.3)] transition-transform duration-700 group-hover:scale-105 group-hover:-rotate-3" unoptimized={hero.image.startsWith('/api/')} /></span>}
              <div className="relative max-w-[60%]">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em]"><Crown size={13} />Brand of the week</span>
                <div className="mt-4 flex items-center gap-3"><Monogram b={hero} className="relative size-14 text-lg ring-white/30" /></div>
                <h3 className="font-display text-[32px] md:text-[44px] leading-none mt-3">{hero.name}</h3>
                <p className="text-white/80 mt-2">{hero.category ?? 'Multiple categories'} · {hero.products} products</p>
              </div>
              <div className="relative flex flex-wrap items-center gap-3 mt-6">
                {hero.fromPaise != null && <span className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold">From {formatMoney(hero.fromPaise)}</span>}
                <span className="btn bg-white text-ink hover:bg-ivory rounded-full">Shop {hero.name}<ArrowRight size={16} className="group-hover:translate-x-1 transition" /></span>
              </div>
            </Link>
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              {runners.map((b, i) => {
                const p = pal(b.name);
                return (
                  <Link key={b.id} href={`/products?brand=${b.slug}`} className="group relative overflow-hidden rounded-3xl bg-white border border-line shadow-card p-4 flex items-center gap-4 hover:shadow-lift hover:-translate-y-0.5 transition">
                    <span className={cn('relative size-20 shrink-0 rounded-2xl overflow-hidden', p.bg)}>
                      {b.image && <Image src={b.image} alt="" fill sizes="80px" className="object-contain p-3 group-hover:scale-110 transition duration-500" unoptimized={b.image.startsWith('/api/')} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-gold-ink">#{i + 2} top brand</span>
                      <span className="flex items-center gap-1.5 font-semibold text-[16px] group-hover:text-forest">{b.name}{b.verified && <BadgeCheck size={15} className="text-forest shrink-0" aria-label="Verified" />}</span>
                      <span className="block text-[12.5px] text-muted">{b.products} products{b.fromPaise != null && ` · from ${formatMoney(b.fromPaise)}`}</span>
                    </span>
                    <ArrowRight size={18} className="text-forest shrink-0 group-hover:translate-x-1 transition" />
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Toolbar */}
        <div className="sticky top-[104px] md:top-[162px] z-20 rounded-2xl bg-white/95 backdrop-blur border border-line shadow-card p-2.5 md:p-3 grid gap-2.5">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <SlidersHorizontal size={17} className="text-muted shrink-0 ml-1" aria-hidden />
            {[null, ...categories].map((c) => (
              <button key={c ?? 'all'} type="button" onClick={() => setCategory(c)} aria-pressed={category === c}
                className={cn('shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold border transition', category === c ? 'bg-forest text-white border-forest' : 'bg-white border-line hover:border-forest hover:text-forest')}>{c ?? 'All brands'}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <label className="inline-flex items-center gap-2 rounded-full border border-line px-3.5 py-1.5 text-[13px] font-semibold cursor-pointer has-[:checked]:bg-mint has-[:checked]:border-forest">
              <input type="checkbox" className="checkbox mt-0" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} /><BadgeCheck size={15} className="text-forest" />Verified only
            </label>
            <div className="flex items-center gap-1 rounded-full bg-mint/60 p-1 text-[13px]" role="group" aria-label="Sort brands">
              {([['az', 'A–Z'], ['popular', 'Most products'], ['price', 'Lowest price']] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setSort(k)} aria-pressed={sort === k} className={cn('rounded-full px-3 py-1 font-semibold transition', sort === k ? 'bg-white text-forest shadow-card' : 'text-forest/70 hover:text-forest')}>{l}</button>
              ))}
            </div>
          </div>
          {sort === 'az' && (
            <nav aria-label="Jump to letter" className="hidden md:flex gap-0.5 overflow-x-auto no-scrollbar border-t border-line pt-2">
              {'#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => letters.has(l)
                ? <a key={l} href={`#brands-${l}`} className="min-w-7 h-7 rounded-lg grid place-items-center text-[13px] font-bold text-forest hover:bg-forest hover:text-white transition">{l}</a>
                : <span key={l} className="min-w-7 h-7 grid place-items-center text-[13px] text-line-strong" aria-hidden>{l}</span>)}
            </nav>
          )}
        </div>

        {/* Results */}
        {!filtered.length ? (
          <div className="rounded-3xl bg-white border border-line p-10 text-center">
            <p className="font-display text-2xl">No brand matches</p>
            <p className="text-muted mt-1">Try another name or clear the filters.</p>
            <button type="button" className="btn btn-outline mt-4" onClick={() => { setQ(''); setCategory(null); setVerifiedOnly(false); }}>Clear filters</button>
          </div>
        ) : sort === 'az' ? (
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {/* One continuous A–Z grid; the first brand of each letter is the jump-bar target. */}
            {groups.flatMap(([letter, list]) => list.map((br, i) => <BrandTile key={br.id} b={br} anchor={i === 0 ? `brands-${letter}` : undefined} />))}
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{sorted.map((b) => <BrandTile key={b.id} b={b} />)}</div>
        )}

        {/* Trust + brand owners */}
        <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-3xl bg-white border border-line shadow-card p-5 md:p-7">
            <h2 className="text-2xl md:text-[28px]">What “Verified” means</h2>
            <p className="text-muted text-sm mt-1">We check before the badge appears — and remove it if anything changes.</p>
            <ol className="grid gap-3 sm:grid-cols-3 mt-5">
              {[[FileCheck2, 'Documents checked', 'Trademark, ownership or a letter of authorisation from the brand.'], [ShieldCheck, 'Seller approved', 'Only approved stores can list a verified brand.'], [PackageCheck, 'Genuine products', 'Reports of counterfeits are investigated by our team.']].map(([Icon, t, b], i) => {
                const I = Icon as typeof ShieldCheck;
                return <li key={t as string} className="rounded-2xl bg-cream/60 border border-line p-4"><span className="flex items-center gap-2"><span className="size-9 rounded-xl bg-white text-forest grid place-items-center shadow-card"><I size={18} /></span><span className="text-[11px] font-bold text-gold-ink">STEP {i + 1}</span></span><p className="font-semibold mt-3">{t as string}</p><p className="text-[13px] text-muted mt-1">{b as string}</p></li>;
              })}
            </ol>
          </div>
          <Link href="/sell" className="group relative overflow-hidden rounded-3xl surface-emerald p-6 md:p-8 flex flex-col justify-between gap-6">
            <span className="absolute -right-16 -bottom-16 size-64 rounded-full bg-gold/15 group-hover:scale-110 transition duration-700" aria-hidden />
            <span className="relative size-12 rounded-2xl bg-gold-light/15 text-gold-light grid place-items-center"><Store size={24} /></span>
            <span className="relative">
              <span className="block font-display text-[28px] md:text-[34px] text-white leading-tight">Own a brand?</span>
              <span className="block text-white/75 mt-2">Sell directly to shoppers and businesses, and get your verified badge.</span>
              <span className="mt-5 btn btn-gold">Start selling<ArrowRight size={16} className="group-hover:translate-x-1 transition" /></span>
            </span>
          </Link>
        </section>
      </div>
    </div>
  );
}
