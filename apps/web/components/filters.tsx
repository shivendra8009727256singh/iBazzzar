'use client';
import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { SlidersHorizontal, X } from 'lucide-react';
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

function FilterBody({ categories, facets }: { categories: Category[]; facets: Facets }) {
  const { params, set } = useFilterNav();
  const brands = params.getAll('brand');
  const [min, setMin] = useState(params.get('min') ?? '');
  const [max, setMax] = useState(params.get('max') ?? '');
  const toggle = (key: string, on: boolean) => set({ [key]: on ? 'true' : null });
  return (
    <div className="grid gap-7">
      <fieldset>
        <legend className="font-semibold mb-3">Category</legend>
        <div className="grid gap-1 max-h-72 overflow-y-auto pr-1">
          <button onClick={() => set({ category: null })} className={cn('text-left rounded-lg px-2.5 py-1.5 text-[14.5px] hover:bg-mint', !params.get('category') && 'bg-mint font-semibold text-emerald')}>All categories</button>
          {categories.filter((c) => !c.parentId).map((c) => (
            <button key={c.id} onClick={() => set({ category: c.slug })} aria-pressed={params.get('category') === c.slug}
              className={cn('text-left rounded-lg px-2.5 py-1.5 text-[14.5px] hover:bg-mint', params.get('category') === c.slug && 'bg-mint font-semibold text-emerald')}>
              {c.name}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="font-semibold mb-3">Price (₹)</legend>
        <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); set({ min: min || null, max: max || null }); }}>
          <label className="sr-only" htmlFor="f-min">Minimum price</label>
          <input id="f-min" inputMode="numeric" className="input min-h-[40px]" placeholder="Min" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ''))} />
          <span className="text-muted">–</span>
          <label className="sr-only" htmlFor="f-max">Maximum price</label>
          <input id="f-max" inputMode="numeric" className="input min-h-[40px]" placeholder="Max" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ''))} />
          <button className="btn btn-outline btn-sm">Go</button>
        </form>
      </fieldset>
      {facets.brands.length > 0 && (
        <fieldset>
          <legend className="font-semibold mb-3">Brand</legend>
          <div className="grid gap-2 max-h-60 overflow-y-auto">
            {facets.brands.map((b) => (
              <label key={b.slug} className="flex items-center gap-2.5 text-[14.5px] cursor-pointer">
                <input type="checkbox" className="checkbox mt-0" checked={brands.includes(b.slug)} onChange={(e) => set({ brand: e.target.checked ? [...brands, b.slug] : brands.filter((x) => x !== b.slug) })} />
                <span className="flex-1">{b.name}</span><span className="text-xs text-muted">{b.count}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset>
        <legend className="font-semibold mb-3">Customer rating</legend>
        <div className="flex flex-wrap gap-2">
          {['4', '3'].map((r) => (
            <button key={r} onClick={() => set({ minRating: params.get('minRating') === r ? null : r })} aria-pressed={params.get('minRating') === r}
              className={cn('badge py-1.5 px-3 cursor-pointer', params.get('minRating') === r ? 'bg-emerald text-white' : 'badge-neutral')}>{r}★ & above</button>
          ))}
        </div>
      </fieldset>
      <fieldset className="grid gap-2.5">
        <legend className="font-semibold mb-3">Availability & offers</legend>
        {[['inStock', 'In stock only'], ['deals', 'On a live deal'], ['wholesale', 'Wholesale available']].map(([k, l]) => (
          <label key={k} className="flex items-center gap-2.5 text-[14.5px] cursor-pointer">
            <input type="checkbox" className="checkbox mt-0" checked={params.get(k) === 'true'} onChange={(e) => toggle(k, e.target.checked)} />{l}
          </label>
        ))}
      </fieldset>
    </div>
  );
}

export function FilterPanel(props: { categories: Category[]; facets: Facets }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <aside className="hidden lg:block w-64 shrink-0" aria-label="Filters"><FilterBody {...props} /></aside>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger className="btn btn-outline btn-sm lg:hidden"><SlidersHorizontal size={16} />Filters</Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-deep/50" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white p-5 shadow-lift">
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="text-xl font-display font-semibold">Filters</Dialog.Title>
              <Dialog.Close className="btn btn-ghost btn-icon" aria-label="Close filters"><X size={20} /></Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">Narrow the product list</Dialog.Description>
            <FilterBody {...props} />
            <Dialog.Close className="btn btn-primary w-full mt-6">Show results</Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

export function SortSelect() {
  const { params, set } = useFilterNav();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted hidden sm:inline">Sort by</span>
      <select className="input min-h-[38px] py-1.5 text-sm w-auto" value={params.get('sort') ?? ''} onChange={(e) => set({ sort: e.target.value || null })}>
        <option value="">{params.get('q') ? 'Relevance' : 'Popularity'}</option>
        <option value="newest">Newest first</option>
        <option value="price-asc">Price: low to high</option>
        <option value="price-desc">Price: high to low</option>
        <option value="rating">Customer rating</option>
        <option value="discount">Biggest discount</option>
      </select>
    </label>
  );
}

export function ActiveFilters({ categories }: { categories: Category[] }) {
  const { params, set } = useFilterNav();
  const chips: [string, string, () => void][] = [];
  const cat = categories.find((c) => c.slug === params.get('category'));
  if (cat) chips.push(['category', cat.name, () => set({ category: null })]);
  for (const b of params.getAll('brand')) chips.push([`brand-${b}`, b, () => set({ brand: params.getAll('brand').filter((x) => x !== b) })]);
  if (params.get('min') || params.get('max')) chips.push(['price', `₹${params.get('min') || 0} – ${params.get('max') ? `₹${params.get('max')}` : 'any'}`, () => set({ min: null, max: null })]);
  if (params.get('minRating')) chips.push(['rating', `${params.get('minRating')}★ & above`, () => set({ minRating: null })]);
  for (const [k, l] of [['inStock', 'In stock'], ['deals', 'Deals'], ['wholesale', 'Wholesale']]) if (params.get(k) === 'true') chips.push([k, l, () => set({ [k]: null })]);
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {chips.map(([k, l, clear]) => <button key={k} onClick={clear} className="badge py-1.5 px-3 hover:bg-forest hover:text-white" aria-label={`Remove filter ${l}`}>{l}<X size={13} /></button>)}
    </div>
  );
}
