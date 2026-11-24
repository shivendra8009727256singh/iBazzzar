'use client';
import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { SlidersHorizontal, X, ChevronDown, Search, Star, Check, ArrowUpDown } from 'lucide-react';
import type { Category } from '@/lib/types';
import { cn } from '@/lib/format';

type Facets = { brands: { name: string; slug: string; count: number }[] };

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
const PRICE_PRESETS: [string, string | null, string | null][] = [['Under ₹500', null, '500'], ['₹500 – ₹1,000', '500', '1000'], ['₹1,000 – ₹2,500', '1000', '2500'], ['₹2,500 – ₹5,000', '2500', '5000'], ['Over ₹5,000', '5000', null]];

function Section({ title, children, defaultOpen = true, count }: { title: string; children: React.ReactNode; defaultOpen?: boolean; count?: number }) {
  return (
    <details open={defaultOpen} className="group border-t border-line first:border-t-0">
      <summary className="flex items-center justify-between cursor-pointer list-none px-4 py-3.5 text-[13px] font-bold uppercase tracking-[0.08em] text-ink hover:bg-cream/60">
        <span className="flex items-center gap-2">{title}{count ? <span className="rounded-full bg-forest text-white text-[10.5px] px-1.5 py-px normal-case tracking-normal">{count}</span> : null}</span>
        <ChevronDown size={16} className="text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

function CheckRow({ checked, onChange, children, meta }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2.5 py-1 text-[14px] cursor-pointer group/row">
      <input type="checkbox" className="checkbox mt-0" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={cn('flex-1 group-hover/row:text-forest', checked && 'font-semibold')}>{children}</span>
      {meta != null && <span className="text-xs text-muted tabular-nums">{meta}</span>}
    </label>
  );
}

function FilterBody({ categories, facets }: { categories: Category[]; facets: Facets }) {
  const { params, set } = useFilterNav();
  const brands = params.getAll('brand');
  const [min, setMin] = useState(params.get('min') ?? '');
  const [max, setMax] = useState(params.get('max') ?? '');
  const [brandQuery, setBrandQuery] = useState('');
  const [allBrands, setAllBrands] = useState(false);
  const toggle = (key: string, on: boolean) => set({ [key]: on ? 'true' : null });
  const active = FILTER_KEYS.filter((k) => params.getAll(k).length).length;
  const brandList = facets.brands.filter((b) => b.name.toLowerCase().includes(brandQuery.toLowerCase()));
  const shownBrands = allBrands || brandQuery ? brandList : brandList.slice(0, 7);
  return (
    <div>
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-line">
        <p className="text-lg font-display font-semibold">Filters</p>
        {active > 0 && <button onClick={() => { setMin(''); setMax(''); set(Object.fromEntries(FILTER_KEYS.map((k) => [k, null]))); }} className="text-sm font-semibold text-forest hover:underline">Clear all</button>}
      </div>
      <Section title="Categories">
        <div className="grid gap-0.5 max-h-72 overflow-y-auto -mx-1 pr-1">
          <button onClick={() => set({ category: null })} className={cn('text-left rounded-lg px-2.5 py-1.5 text-[14px] hover:bg-mint', !params.get('category') && 'bg-mint font-semibold text-forest')}>All categories</button>
          {categories.filter((c) => !c.parentId).map((c) => (
            <button key={c.id} onClick={() => set({ category: c.slug })} aria-pressed={params.get('category') === c.slug}
              className={cn('text-left rounded-lg px-2.5 py-1.5 text-[14px] hover:bg-mint flex items-center justify-between', params.get('category') === c.slug && 'bg-mint font-semibold text-forest')}>
              {c.name}{params.get('category') === c.slug && <Check size={15} />}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Price" count={params.get('min') || params.get('max') ? 1 : 0}>
        <div className="grid gap-1 mb-3">
          {PRICE_PRESETS.map(([label, lo, hi]) => {
            const on = (params.get('min') ?? null) === lo && (params.get('max') ?? null) === hi;
            return <CheckRow key={label} checked={on} onChange={(v) => { setMin(v ? lo ?? '' : ''); setMax(v ? hi ?? '' : ''); set({ min: v ? lo : null, max: v ? hi : null }); }}>{label}</CheckRow>;
          })}
        </div>
        <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); set({ min: min || null, max: max || null }); }}>
          <label className="sr-only" htmlFor="f-min">Minimum price</label>
          <input id="f-min" inputMode="numeric" className="input min-h-[38px] text-sm" placeholder="₹ Min" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ''))} />
          <span className="text-muted">to</span>
          <label className="sr-only" htmlFor="f-max">Maximum price</label>
          <input id="f-max" inputMode="numeric" className="input min-h-[38px] text-sm" placeholder="₹ Max" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ''))} />
          <button className="btn btn-primary btn-sm px-3">Go</button>
        </form>
      </Section>
      {facets.brands.length > 0 && (
        <Section title="Brand" count={brands.length}>
          {facets.brands.length > 6 && (
            <div className="relative mb-2">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input aria-label="Search brands" className="input min-h-[36px] pl-8 text-sm" placeholder="Search brand" value={brandQuery} onChange={(e) => setBrandQuery(e.target.value)} />
            </div>
          )}
          <div className="grid gap-0.5 max-h-64 overflow-y-auto">
            {shownBrands.map((b) => <CheckRow key={b.slug} checked={brands.includes(b.slug)} meta={b.count} onChange={(v) => set({ brand: v ? [...brands, b.slug] : brands.filter((x) => x !== b.slug) })}>{b.name}</CheckRow>)}
            {!shownBrands.length && <p className="text-sm text-muted py-1">No brand matches.</p>}
          </div>
          {!brandQuery && brandList.length > 7 && <button className="text-sm font-semibold text-forest mt-1" onClick={() => setAllBrands((s) => !s)}>{allBrands ? 'Show fewer' : `${brandList.length - 7} more`}</button>}
        </Section>
      )}
      <Section title="Customer ratings" count={params.get('minRating') ? 1 : 0}>
        {['4', '3'].map((r) => (
          <CheckRow key={r} checked={params.get('minRating') === r} onChange={(v) => set({ minRating: v ? r : null })}>
            <span className="inline-flex items-center gap-1">{r}<Star size={13} fill="currentColor" className="text-gold" /> & above</span>
          </CheckRow>
        ))}
      </Section>
      <Section title="Availability & offers" count={['inStock', 'deals', 'wholesale'].filter((k) => params.get(k) === 'true').length}>
        {[['inStock', 'In stock only'], ['deals', 'On a live deal'], ['wholesale', 'Wholesale prices available']].map(([k, l]) => (
          <CheckRow key={k} checked={params.get(k) === 'true'} onChange={(v) => toggle(k, v)}>{l}</CheckRow>
        ))}
      </Section>
    </div>
  );
}

/** Desktop filter column. */
export function FilterSidebar(props: { categories: Category[]; facets: Facets }) {
  return <aside className="hidden lg:block w-[272px] shrink-0 self-start sticky top-36 max-h-[calc(100vh-10rem)] overflow-y-auto rounded-2xl border border-line bg-white shadow-card" aria-label="Filters"><FilterBody {...props} /></aside>;
}

/** Phone and tablet: a Filters button that opens the same filters in a bottom sheet. */
export function FilterSheet(props: { categories: Category[]; facets: Facets }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger className="btn btn-outline btn-sm lg:hidden"><SlidersHorizontal size={16} />Filters</Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-deep/50" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[88vh] overflow-y-auto rounded-t-3xl bg-white shadow-lift">
            <div className="flex items-center justify-between px-4 pt-4">
              <Dialog.Title className="sr-only">Filters</Dialog.Title>
              <span className="mx-auto h-1.5 w-12 rounded-full bg-line" aria-hidden />
              <Dialog.Close className="btn btn-ghost btn-icon absolute right-2 top-2" aria-label="Close filters"><X size={20} /></Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">Narrow the product list</Dialog.Description>
            <FilterBody {...props} />
            <div className="sticky bottom-0 bg-white border-t border-line p-3"><Dialog.Close className="btn btn-primary w-full">Show results</Dialog.Close></div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

const SORTS: [string, string][] = [['', 'Popularity'], ['price-asc', 'Price: low to high'], ['price-desc', 'Price: high to low'], ['newest', 'Newest first'], ['rating', 'Customer rating'], ['discount', 'Biggest discount']];

/** Sort as a row of tabs on wide screens and a compact select on phones. */
export function SortSelect() {
  const { params, set } = useFilterNav();
  const current = params.get('sort') ?? '';
  const sorts = SORTS.map(([v, l]) => [v, v === '' && params.get('q') ? 'Relevance' : l] as [string, string]);
  return (
    <>
      <div className="hidden md:flex items-center gap-1 text-[14px]" role="tablist" aria-label="Sort by">
        <span className="font-semibold mr-2 flex items-center gap-1 text-muted"><ArrowUpDown size={14} />Sort by</span>
        {sorts.map(([v, l]) => (
          <button key={v || 'default'} role="tab" aria-selected={current === v} onClick={() => set({ sort: v || null })}
            className={cn('rounded-full px-3 py-1.5 transition', current === v ? 'bg-forest text-white font-semibold' : 'text-ink/80 hover:bg-mint')}>{l}</button>
        ))}
      </div>
      <label className="md:hidden flex items-center gap-2 text-sm">
        <span className="sr-only">Sort by</span>
        <select className="input min-h-[38px] py-1.5 text-sm w-auto" value={current} onChange={(e) => set({ sort: e.target.value || null })}>
          {sorts.map(([v, l]) => <option key={v || 'default'} value={v}>{l}</option>)}
        </select>
      </label>
    </>
  );
}

export function ActiveFilters({ categories }: { categories: Category[] }) {
  const { params, set } = useFilterNav();
  const chips: [string, string, () => void][] = [];
  const cat = categories.find((c) => c.slug === params.get('category'));
  if (cat) chips.push(['category', cat.name, () => set({ category: null })]);
  for (const b of params.getAll('brand')) chips.push([`brand-${b}`, b.replace(/-/g, ' '), () => set({ brand: params.getAll('brand').filter((x) => x !== b) })]);
  if (params.get('min') || params.get('max')) chips.push(['price', `₹${params.get('min') || 0} – ${params.get('max') ? `₹${params.get('max')}` : 'any'}`, () => set({ min: null, max: null })]);
  if (params.get('minRating')) chips.push(['rating', `${params.get('minRating')}★ & above`, () => set({ minRating: null })]);
  for (const [k, l] of [['inStock', 'In stock'], ['deals', 'Deals'], ['wholesale', 'Wholesale']]) if (params.get(k) === 'true') chips.push([k, l, () => set({ [k]: null })]);
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {chips.map(([k, l, clear]) => <button key={k} onClick={clear} className="inline-flex items-center gap-1.5 rounded-full border border-forest/30 bg-mint px-3 py-1 text-[13px] font-semibold text-forest capitalize hover:bg-forest hover:text-white transition" aria-label={`Remove filter ${l}`}>{l}<X size={13} /></button>)}
      {chips.length > 1 && <button onClick={() => set(Object.fromEntries(FILTER_KEYS.map((x) => [x, null])))} className="text-[13px] font-semibold text-muted hover:text-ink underline underline-offset-2">Clear all</button>}
    </div>
  );
}
