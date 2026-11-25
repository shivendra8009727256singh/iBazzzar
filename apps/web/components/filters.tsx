'use client';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { SlidersHorizontal, X, ChevronDown, Search, Star, Check, ArrowUpDown, LayoutGrid, IndianRupee, BadgeCheck, Sparkles, PackageCheck, Flame, Building2, RotateCcw } from 'lucide-react';
import type { Category } from '@/lib/types';
import { cn } from '@/lib/format';

export type Facets = { brands: { name: string; slug: string; count: number }[]; price?: { min: number; max: number } };

/** URL-driven filters: every change is a navigation, so Back/Forward and shared links reproduce the same results. */
export function useFilterNav() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (changes: Record<string, string | string[] | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      next.delete(k);
      if (Array.isArray(v)) v.forEach((x) => next.append(k, x));
      else if (v) next.set(k, v);
    }
    next.delete('page');
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };
  return { params, set };
}

const FILTER_KEYS = ['category', 'brand', 'min', 'max', 'minRating', 'inStock', 'deals', 'wholesale'];
const PRICE_PRESETS: [string, string | null, string | null][] = [['Under ₹500', null, '500'], ['₹500 – 1,000', '500', '1000'], ['₹1,000 – 2,500', '1000', '2500'], ['₹2,500 – 5,000', '2500', '5000'], ['₹5,000+', '5000', null]];
const TOGGLES: [string, string, string, typeof Flame][] = [
  ['deals', 'Live deals', 'Extra off for a limited time', Flame],
  ['inStock', 'In stock only', 'Ready to ship today', PackageCheck],
  ['wholesale', 'Wholesale prices', 'Lower price per unit in bulk', Building2],
];
const rupees = (v: string | number) => `₹${Number(v).toLocaleString('en-IN')}`;
const MONO = ['#174b37', '#7a5715', '#8a2c2c', '#2c4f8a', '#5b3c88', '#1f6f6a'];
const monoTone = (s: string) => MONO[[...s].reduce((t, c) => t + c.charCodeAt(0), 0) % MONO.length];

function Section({ title, icon: Icon, children, defaultOpen = true, hint }: { title: string; icon: typeof Star; children: React.ReactNode; defaultOpen?: boolean; hint?: string | null }) {
  return (
    <details open={defaultOpen} className="group/sec border-t border-line/80 first:border-t-0">
      <summary className="flex items-center gap-3 cursor-pointer list-none px-5 py-4 select-none hover:bg-cream/70 transition-colors">
        <span className="grid size-8 place-items-center rounded-xl bg-mint text-forest group-open/sec:bg-forest group-open/sec:text-gold-light transition-colors"><Icon size={16} /></span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14.5px] font-semibold text-ink">{title}</span>
          {hint && <span className="block text-[12px] font-semibold text-gold-ink truncate">{hint}</span>}
        </span>
        <ChevronDown size={17} className="text-muted transition-transform duration-300 group-open/sec:rotate-180" />
      </summary>
      <div className="px-5 pb-5">{children}</div>
    </details>
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <span className={cn('relative inline-flex h-[22px] w-[38px] shrink-0 rounded-full transition-colors', on ? 'bg-forest' : 'bg-line-strong')} aria-hidden>
      <span className={cn('absolute top-[3px] size-4 rounded-full bg-white shadow transition-all', on ? 'left-[19px]' : 'left-[3px]')} />
    </span>
  );
}

/** Two-handled price slider with exact inputs; applies on release / Apply. */
function PriceRange({ bounds, min, max, onApply }: { bounds: { min: number; max: number }; min: string; max: string; onApply: (lo: string | null, hi: string | null) => void }) {
  const floor = Math.max(0, Math.floor(bounds.min / 100) * 100);
  const ceil = Math.max(floor + 100, Math.ceil(bounds.max / 100) * 100);
  const step = ceil - floor > 20000 ? 500 : ceil - floor > 5000 ? 100 : 50;
  const [lo, setLo] = useState(min ? Number(min) : floor);
  const [hi, setHi] = useState(max ? Number(max) : ceil);
  const pct = (v: number) => ((Math.min(Math.max(v, floor), ceil) - floor) / (ceil - floor)) * 100;
  const commit = (a = lo, b = hi) => onApply(a > floor ? String(a) : null, b < ceil ? String(b) : null);
  return (
    <div>
      <div className="ib-range relative h-9" style={{ ['--lo' as string]: `${pct(lo)}%`, ['--hi' as string]: `${pct(hi)}%` }}>
        <span className="ib-range-track" aria-hidden />
        <input type="range" aria-label="Minimum price" min={floor} max={ceil} step={step} value={Math.min(lo, ceil)}
          onChange={(e) => setLo(Math.min(Number(e.target.value), hi - step))} onPointerUp={() => commit()} onKeyUp={() => commit()} />
        <input type="range" aria-label="Maximum price" min={floor} max={ceil} step={step} value={Math.min(hi, ceil)}
          onChange={(e) => setHi(Math.max(Number(e.target.value), lo + step))} onPointerUp={() => commit()} onKeyUp={() => commit()} />
      </div>
      <form className="flex items-center gap-2 mt-1" onSubmit={(e) => { e.preventDefault(); commit(); }}>
        <label className="flex-1 rounded-xl border border-line bg-cream/60 px-3 py-1.5 focus-within:border-forest">
          <span className="block text-[10.5px] font-bold uppercase tracking-wider text-muted">Min</span>
          <span className="flex items-center text-[14px] font-semibold">₹<input inputMode="numeric" className="w-full bg-transparent outline-none pl-0.5" value={lo} onChange={(e) => setLo(Number(e.target.value.replace(/\D/g, '') || 0))} /></span>
        </label>
        <span className="text-muted">–</span>
        <label className="flex-1 rounded-xl border border-line bg-cream/60 px-3 py-1.5 focus-within:border-forest">
          <span className="block text-[10.5px] font-bold uppercase tracking-wider text-muted">Max</span>
          <span className="flex items-center text-[14px] font-semibold">₹<input inputMode="numeric" className="w-full bg-transparent outline-none pl-0.5" value={hi} onChange={(e) => setHi(Number(e.target.value.replace(/\D/g, '') || 0))} /></span>
        </label>
        <button className="grid size-11 shrink-0 place-items-center rounded-xl bg-forest text-white hover:bg-emerald" aria-label="Apply price"><Check size={18} /></button>
      </form>
    </div>
  );
}

function FilterBody({ categories, facets }: { categories: Category[]; facets: Facets }) {
  const { params, set } = useFilterNav();
  const brands = params.getAll('brand');
  const [brandQuery, setBrandQuery] = useState('');
  const [allBrands, setAllBrands] = useState(false);
  const active = FILTER_KEYS.filter((k) => params.getAll(k).length).length;
  const brandList = facets.brands.filter((b) => b.name.toLowerCase().includes(brandQuery.toLowerCase()));
  const shownBrands = allBrands || brandQuery ? brandList : brandList.slice(0, 6);
  const pMin = params.get('min'); const pMax = params.get('max');
  const priceHint = pMin || pMax ? `${pMin ? rupees(pMin) : '₹0'} – ${pMax ? rupees(pMax) : 'any'}` : null;
  const cat = categories.find((c) => c.slug === params.get('category'));
  const bounds = facets.price && facets.price.max > 0 ? facets.price : { min: 0, max: 10000 };
  return (
    <div>
      <div className="relative overflow-hidden px-5 py-4 bg-gradient-to-br from-emerald to-forest text-white">
        <span className="absolute -right-8 -top-10 size-28 rounded-full bg-gold/25 blur-2xl" aria-hidden />
        <div className="relative flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15 text-gold-light"><SlidersHorizontal size={18} /></span>
          <div className="flex-1 min-w-0">
            <p className="font-display text-[19px] font-semibold leading-tight whitespace-nowrap">Refine results</p>
            <p className="text-[12px] text-white/65">{active ? `${active} filter${active > 1 ? 's' : ''} applied` : 'Pick what matters to you'}</p>
          </div>
          {active > 0 && <button onClick={() => set(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])))} className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[12px] font-semibold hover:bg-white/20"><RotateCcw size={12} />Reset</button>}
        </div>
      </div>

      <Section title="Category" icon={LayoutGrid} hint={cat?.name}>
        <div className="grid gap-1 max-h-80 overflow-y-auto -mx-1 px-1">
          {[{ id: 'all', name: 'All categories', slug: '', products: 0, imageUrl: null } as Pick<Category, 'id' | 'name' | 'slug' | 'products' | 'imageUrl'>, ...categories.filter((c) => !c.parentId)].map((c) => {
            const on = (params.get('category') ?? '') === c.slug;
            return (
              <button key={c.id} onClick={() => set({ category: c.slug || null })} aria-pressed={on}
                className={cn('relative flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-[14px] transition', on ? 'bg-forest text-white shadow-card' : 'hover:bg-mint')}>
                <span className={cn('relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg text-[12px] font-bold', on ? 'bg-white/15 text-gold-light' : 'bg-cream text-forest ring-1 ring-line')}>
                  {c.imageUrl ? <Image src={c.imageUrl} alt="" fill sizes="32px" className="object-cover" unoptimized={c.imageUrl.startsWith('/api/')} /> : c.slug ? c.name.slice(0, 1) : <LayoutGrid size={14} />}
                </span>
                <span className={cn('flex-1 truncate', on && 'font-semibold')}>{c.name}</span>
                {c.products > 0 && <span className={cn('rounded-full px-1.5 text-[11px] tabular-nums', on ? 'bg-white/15' : 'bg-mint text-forest')}>{c.products}</span>}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Price" icon={IndianRupee} hint={priceHint}>
        <PriceRange key={`${pMin}-${pMax}-${bounds.min}-${bounds.max}`} bounds={bounds} min={pMin ?? ''} max={pMax ?? ''} onApply={(lo, hi) => set({ min: lo, max: hi })} />
        <div className="flex flex-wrap gap-1.5 mt-3">
          {PRICE_PRESETS.map(([label, lo, hi]) => {
            const on = (pMin ?? null) === lo && (pMax ?? null) === hi;
            return <button key={label} onClick={() => set({ min: on ? null : lo, max: on ? null : hi })} aria-pressed={on}
              className={cn('rounded-full border px-3 py-1 text-[12.5px] font-semibold transition', on ? 'border-forest bg-forest text-white' : 'border-line bg-white text-ink/80 hover:border-forest hover:text-forest')}>{label}</button>;
          })}
        </div>
      </Section>

      {facets.brands.length > 0 && (
        <Section title="Brand" icon={BadgeCheck} hint={brands.length ? `${brands.length} selected` : null}>
          {facets.brands.length > 6 && (
            <div className="relative mb-2.5">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input aria-label="Search brands" className="w-full rounded-xl border border-line bg-cream/60 py-2 pl-9 pr-3 text-[13.5px] outline-none focus:border-forest" placeholder="Find a brand" value={brandQuery} onChange={(e) => setBrandQuery(e.target.value)} />
            </div>
          )}
          <div className="grid gap-1 max-h-72 overflow-y-auto -mx-1 px-1">
            {shownBrands.map((b) => {
              const on = brands.includes(b.slug);
              return (
                <button key={b.slug} aria-pressed={on} onClick={() => set({ brand: on ? brands.filter((x) => x !== b.slug) : [...brands, b.slug] })}
                  className={cn('flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-[14px] transition ring-1', on ? 'bg-mint ring-forest/40' : 'ring-transparent hover:bg-cream')}>
                  <span className="grid size-8 shrink-0 place-items-center rounded-full text-[12px] font-bold text-white" style={{ background: monoTone(b.name) }}>{b.name.slice(0, 1)}</span>
                  <span className={cn('flex-1 truncate', on && 'font-semibold text-forest')}>{b.name}</span>
                  <span className="text-[11.5px] text-muted tabular-nums">{b.count}</span>
                  <span className={cn('grid size-5 place-items-center rounded-md border transition', on ? 'border-forest bg-forest text-white' : 'border-line-strong bg-white')}>{on && <Check size={13} strokeWidth={3} />}</span>
                </button>
              );
            })}
            {!shownBrands.length && <p className="text-sm text-muted py-1">No brand matches “{brandQuery}”.</p>}
          </div>
          {!brandQuery && brandList.length > 6 && <button className="mt-2 text-[13px] font-semibold text-forest hover:underline" onClick={() => setAllBrands((s) => !s)}>{allBrands ? 'Show fewer' : `+ ${brandList.length - 6} more brands`}</button>}
        </Section>
      )}

      <Section title="Customer rating" icon={Star} hint={params.get('minRating') ? `${params.get('minRating')}★ & above` : null}>
        <div className="grid grid-cols-2 gap-2">
          {['4', '3'].map((r) => {
            const on = params.get('minRating') === r;
            return (
              <button key={r} aria-pressed={on} onClick={() => set({ minRating: on ? null : r })}
                className={cn('rounded-2xl border p-3 text-left transition', on ? 'border-gold bg-[#fdf6e6] shadow-card' : 'border-line hover:border-gold/60')}>
                <span className="flex gap-0.5 text-gold">{[0, 1, 2, 3, 4].map((i) => <Star key={i} size={13} fill={i < Number(r) ? 'currentColor' : 'none'} />)}</span>
                <span className="block mt-1 text-[13.5px] font-bold">{r}.0 & above</span>
                <span className="block text-[11.5px] text-muted">{r === '4' ? 'Loved by buyers' : 'Well rated'}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Offers & availability" icon={Sparkles} hint={TOGGLES.filter(([k]) => params.get(k) === 'true').map(([, l]) => l).join(', ') || null}>
        <div className="grid gap-1.5">
          {TOGGLES.map(([k, l, d, Icon]) => {
            const on = params.get(k) === 'true';
            return (
              <button key={k} role="switch" aria-checked={on} onClick={() => set({ [k]: on ? null : 'true' })}
                className={cn('flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition', on ? 'border-forest/40 bg-mint' : 'border-line hover:bg-cream')}>
                <Icon size={17} className={on ? 'text-forest' : 'text-muted'} />
                <span className="flex-1"><span className="block text-[13.5px] font-semibold">{l}</span><span className="block text-[11.5px] text-muted">{d}</span></span>
                <Switch on={on} />
              </button>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

/** Desktop filter column (scrolls with the page). */
export function FilterSidebar(props: { categories: Category[]; facets: Facets }) {
  return <aside className="hidden lg:block w-[292px] shrink-0 self-start overflow-hidden rounded-3xl border border-line bg-white shadow-card" aria-label="Filters"><FilterBody {...props} /></aside>;
}

/** Phone and tablet: a Filters button that opens the same filters in a bottom sheet. */
export function FilterSheet(props: { categories: Category[]; facets: Facets; total?: number }) {
  const [open, setOpen] = useState(false);
  const { params } = useFilterNav();
  const active = FILTER_KEYS.filter((k) => params.getAll(k).length).length;
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="relative inline-flex items-center gap-2 rounded-full border border-line-strong bg-white px-4 py-2 text-[14px] font-semibold lg:hidden">
        <SlidersHorizontal size={16} />Filters{active > 0 && <span className="grid size-5 place-items-center rounded-full bg-forest text-[11px] text-white">{active}</span>}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-deep/55 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white shadow-lift">
          <Dialog.Title className="sr-only">Filters</Dialog.Title>
          <Dialog.Description className="sr-only">Narrow the product list</Dialog.Description>
          <Dialog.Close className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-full bg-white/15 text-white" aria-label="Close filters"><X size={19} /></Dialog.Close>
          <FilterBody {...props} />
          <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-line p-3"><Dialog.Close className="btn btn-primary w-full">Show {props.total != null ? `${props.total.toLocaleString('en-IN')} ` : ''}results</Dialog.Close></div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const SORTS: [string, string][] = [['', 'Popular'], ['discount', 'Biggest discount'], ['price-asc', 'Price: low to high'], ['price-desc', 'Price: high to low'], ['rating', 'Top rated'], ['newest', 'Newest']];

/** Sort as a segmented track on wide screens and a styled select on phones. */
export function SortSelect() {
  const { params, set } = useFilterNav();
  const current = params.get('sort') ?? '';
  const sorts = SORTS.map(([v, l]) => [v, v === '' && params.get('q') ? 'Relevance' : l] as [string, string]);
  return (
    <>
      <div className="hidden md:flex items-center gap-1 rounded-full bg-[#eef1ea] p-1 text-[13.5px] max-w-full overflow-x-auto no-scrollbar" role="tablist" aria-label="Sort by">
        <span className="flex items-center gap-1 pl-2.5 pr-1.5 font-semibold text-muted whitespace-nowrap"><ArrowUpDown size={14} />Sort</span>
        {sorts.map(([v, l]) => (
          <button key={v || 'default'} role="tab" aria-selected={current === v} onClick={() => set({ sort: v || null })}
            className={cn('whitespace-nowrap rounded-full px-3.5 py-1.5 transition', current === v ? 'bg-white text-forest font-bold shadow-card' : 'text-ink/75 hover:text-ink')}>{l}</button>
        ))}
      </div>
      <label className="md:hidden relative inline-flex items-center">
        <span className="sr-only">Sort by</span>
        <ArrowUpDown size={15} className="pointer-events-none absolute left-3.5 text-muted" />
        <select className="appearance-none rounded-full border border-line-strong bg-white py-2 pl-9 pr-8 text-[14px] font-semibold" value={current} onChange={(e) => set({ sort: e.target.value || null })}>
          {sorts.map(([v, l]) => <option key={v || 'default'} value={v}>{l}</option>)}
        </select>
        <ChevronDown size={15} className="pointer-events-none absolute right-3 text-muted" />
      </label>
    </>
  );
}

/** One-tap filters above the results (Myntra/Meesho style). */
export function QuickFilters() {
  const { params, set } = useFilterNav();
  const items: [string, React.ReactNode, boolean, () => void][] = [
    ['deals', <><Flame size={14} />Live deals</>, params.get('deals') === 'true', () => set({ deals: params.get('deals') === 'true' ? null : 'true' })],
    ['rating', <><Star size={14} fill="currentColor" />4★ & above</>, params.get('minRating') === '4', () => set({ minRating: params.get('minRating') === '4' ? null : '4' })],
    ['under', <><IndianRupee size={14} />Under ₹500</>, !params.get('min') && params.get('max') === '500', () => set({ min: null, max: !params.get('min') && params.get('max') === '500' ? null : '500' })],
    ['stock', <><PackageCheck size={14} />In stock</>, params.get('inStock') === 'true', () => set({ inStock: params.get('inStock') === 'true' ? null : 'true' })],
    ['bulk', <><Building2 size={14} />Wholesale</>, params.get('wholesale') === 'true', () => set({ wholesale: params.get('wholesale') === 'true' ? null : 'true' })],
  ];
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0" aria-label="Quick filters">
      {items.map(([k, l, on, toggle]) => (
        <button key={k} aria-pressed={on} onClick={toggle}
          className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition', on ? 'border-gold bg-gold-light/90 text-deep shadow-card' : 'border-white/20 bg-white/10 text-white hover:bg-white/20')}>
          {l}{on && <X size={13} />}
        </button>
      ))}
    </div>
  );
}

export function ActiveFilters({ categories }: { categories: Category[] }) {
  const { params, set } = useFilterNav();
  const chips: [string, string, () => void][] = [];
  const cat = categories.find((c) => c.slug === params.get('category'));
  if (cat) chips.push(['category', cat.name, () => set({ category: null })]);
  for (const b of params.getAll('brand')) chips.push([`brand-${b}`, b.replace(/-/g, ' ').replace(/\b\w/g, (x) => x.toUpperCase()), () => set({ brand: params.getAll('brand').filter((x) => x !== b) })]);
  if (params.get('min') || params.get('max')) chips.push(['price', `${params.get('min') ? rupees(params.get('min')!) : '₹0'} – ${params.get('max') ? rupees(params.get('max')!) : 'any'}`, () => set({ min: null, max: null })]);
  if (params.get('minRating')) chips.push(['rating', `${params.get('minRating')}★ & above`, () => set({ minRating: null })]);
  for (const [k, l] of [['inStock', 'In stock'], ['deals', 'Live deals'], ['wholesale', 'Wholesale']]) if (params.get(k) === 'true') chips.push([k, l, () => set({ [k]: null })]);
  if (params.get('q')) chips.push(['q', `“${params.get('q')}”`, () => set({ q: null })]);
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[12px] font-bold uppercase tracking-wider text-muted">Applied</span>
      {chips.map(([k, l, clear]) => <button key={k} onClick={clear} className="group inline-flex items-center gap-1.5 rounded-full bg-forest/[0.07] pl-3 pr-1.5 py-1 text-[13px] font-semibold text-forest hover:bg-forest hover:text-white transition" aria-label={`Remove filter ${l}`}>{l}<span className="grid size-4 place-items-center rounded-full bg-forest/10 group-hover:bg-white/20"><X size={11} /></span></button>)}
      {chips.length > 1 && <Link href="/products" className="text-[13px] font-semibold text-danger hover:underline underline-offset-2">Clear all</Link>}
    </div>
  );
}
