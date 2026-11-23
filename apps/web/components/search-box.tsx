'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Search, Clock, X } from 'lucide-react';
import { api } from '@/lib/api';
import { formatMoney, cn } from '@/lib/format';

type Suggestions = { products: { slug: string; name: string; brand: string; image: string; pricePaise: number }[]; brands: { name: string; slug: string }[]; sellers: { name: string; slug: string }[]; categories: { name: string; slug: string }[] };
const RECENT = 'ibazzzar.recent-searches';

/** Search with live suggestions and recent searches. Recent searches stay on this device and can be cleared. */
export function SearchBox({ className, autoFocus, onDone }: { className?: string; autoFocus?: boolean; onDone?: () => void }) {
  const router = useRouter();
  const listId = useId();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Suggestions | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const box = useRef<HTMLFormElement>(null);

  useEffect(() => { try { setRecent(JSON.parse(localStorage.getItem(RECENT) || '[]').slice(0, 6)); } catch { /* ignore */ } }, []);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setData(null); return; }
    const t = setTimeout(() => { api<Suggestions>(`/search/suggest?q=${encodeURIComponent(term)}`).then(setData).catch(() => setData(null)); }, 180);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const go = (term: string) => {
    const t = term.trim();
    if (!t) return;
    const next = [t, ...recent.filter((r) => r.toLowerCase() !== t.toLowerCase())].slice(0, 6);
    setRecent(next);
    try { localStorage.setItem(RECENT, JSON.stringify(next)); } catch { /* ignore */ }
    setOpen(false); onDone?.();
    router.push(`/products?q=${encodeURIComponent(t)}`);
  };
  const clearRecent = () => { setRecent([]); try { localStorage.removeItem(RECENT); } catch { /* ignore */ } };
  const close = () => { setOpen(false); onDone?.(); };
  const hasResults = data && (data.products.length || data.brands.length || data.categories.length || data.sellers.length);

  return (
    <form ref={box} role="search" className={cn('relative', className)} onSubmit={(e) => { e.preventDefault(); go(q); }}>
      <label htmlFor={`${listId}-input`} className="sr-only">Search IBazzzar</label>
      <div className="flex items-center rounded-xl border border-line-strong bg-white focus-within:border-forest focus-within:ring-3 focus-within:ring-forest/15 transition">
        <Search size={18} className="ml-3.5 text-muted shrink-0" aria-hidden />
        <input
          id={`${listId}-input`} value={q} autoFocus={autoFocus} autoComplete="off" enterKeyHint="search"
          onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
          placeholder="Search products, brands, sellers or bulk deals"
          role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
          className="w-full bg-transparent px-3 py-2.5 text-[15px] outline-none min-h-[44px]"
        />
        {q && <button type="button" aria-label="Clear search" className="p-2 text-muted hover:text-ink" onClick={() => setQ('')}><X size={16} /></button>}
        <button type="submit" className="m-1 rounded-lg bg-emerald text-white px-4 min-h-[38px] text-sm font-semibold hover:bg-forest">Search</button>
      </div>
      {open && (q.trim().length < 2 ? recent.length > 0 : true) && (
        <div id={listId} className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 card p-2 max-h-[70vh] overflow-y-auto">
          {q.trim().length < 2 ? (
            <div>
              <div className="flex items-center justify-between px-2 py-1.5"><span className="text-xs font-semibold text-muted uppercase tracking-wider">Recent searches</span><button type="button" onClick={clearRecent} className="text-xs link">Clear history</button></div>
              {recent.map((r) => <button type="button" key={r} onClick={() => { setQ(r); go(r); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-mint"><Clock size={15} className="text-muted" />{r}</button>)}
            </div>
          ) : !hasResults ? (
            <p className="px-3 py-4 text-sm text-muted">Press Enter to search for “{q.trim()}”.</p>
          ) : (
            <div className="grid gap-1">
              {data!.products.map((p) => (
                <Link key={p.slug} href={`/products/${p.slug}`} onClick={close} className="flex items-center gap-3 rounded-lg p-2 hover:bg-mint">
                  <Image src={p.image} alt="" width={40} height={40} className="size-10 rounded-md object-contain bg-cream" unoptimized />
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium text-[15px]">{p.name}</span><span className="text-xs text-muted">{p.brand}</span></span>
                  <span className="text-sm font-semibold">{formatMoney(p.pricePaise)}</span>
                </Link>
              ))}
              {[['Categories', data!.categories, (s: string) => `/products?category=${s}`], ['Brands', data!.brands, (s: string) => `/products?brand=${s}`], ['Sellers', data!.sellers, (s: string) => `/sellers/${s}`]].map(([title, list, href]) =>
                (list as { name: string; slug: string }[]).length ? (
                  <div key={title as string} className="border-t border-line pt-2 mt-1">
                    <p className="px-2 text-xs font-semibold text-muted uppercase tracking-wider">{title as string}</p>
                    <div className="flex flex-wrap gap-2 p-2">
                      {(list as { name: string; slug: string }[]).map((x) => <Link key={x.slug} onClick={close} href={(href as (s: string) => string)(x.slug)} className="badge hover:bg-forest hover:text-white">{x.name}</Link>)}
                    </div>
                  </div>
                ) : null)}
            </div>
          )}
        </div>
      )}
    </form>
  );
}
