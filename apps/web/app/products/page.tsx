import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { Suspense } from 'react';
import { SearchX, ChevronRight, ChevronLeft, LayoutGrid, ShieldCheck, Tags, PackageSearch } from 'lucide-react';
import { serverApi, tryServerApi } from '@/lib/server-api';
import type { Category, Product } from '@/lib/types';
import { cn } from '@/lib/format';
import { ProductGrid } from '@/components/product-card';
import { FilterSidebar, FilterSheet, SortSelect, ActiveFilters, QuickFilters, type Facets } from '@/components/filters';
import { Empty } from '@/components/ui';

type Search = Record<string, string | string[] | undefined>;
type Result = { products: Product[]; total: number; page: number; pages: number; facets: Facets };
const PAGE_SIZE = 24;

function toQuery(sp: Search) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) for (const x of [v].flat()) if (x) q.append(k, x);
  return q;
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<Search> }): Promise<Metadata> {
  const sp = await searchParams;
  const cats = await tryServerApi<{ categories: Category[] }>('/categories', { revalidate: 300 });
  const cat = cats?.categories.find((c) => c.slug === sp.category);
  const title = sp.q ? `Search results for “${sp.q}”` : cat ? `${cat.name}` : 'Shop all products';
  return { title, description: cat?.description ?? 'Browse products from verified sellers on IBazzzar.', alternates: { canonical: cat ? `/products?category=${cat.slug}` : '/products' } };
}

/** Numbered pages with first/last and ellipses: 1 … 4 5 6 … 12 */
function Pager({ page, pages, href }: { page: number; pages: number; href: (p: number) => string }) {
  if (pages <= 1) return null;
  const nums = [...new Set([1, page - 1, page, page + 1, pages].filter((n) => n >= 1 && n <= pages))].sort((a, b) => a - b);
  const cell = 'grid h-10 min-w-10 place-items-center rounded-full px-3 text-[14px] font-semibold transition';
  return (
    <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-1.5">
      {page > 1 ? <Link href={href(page - 1)} className={cn(cell, 'border border-line bg-white hover:border-forest')} aria-label="Previous page"><ChevronLeft size={17} /></Link> : <span className={cn(cell, 'border border-line bg-white opacity-40')} aria-hidden><ChevronLeft size={17} /></span>}
      {nums.map((n, i) => (
        <span key={n} className="flex items-center gap-1.5">
          {i > 0 && n - nums[i - 1] > 1 && <span className="px-1 text-muted">…</span>}
          {n === page ? <span aria-current="page" className={cn(cell, 'bg-forest text-white shadow-card')}>{n}</span> : <Link href={href(n)} className={cn(cell, 'bg-white border border-line hover:border-forest hover:text-forest')}>{n}</Link>}
        </span>
      ))}
      {page < pages ? <Link href={href(page + 1)} className={cn(cell, 'border border-line bg-white hover:border-forest')} aria-label="Next page"><ChevronRight size={17} /></Link> : <span className={cn(cell, 'border border-line bg-white opacity-40')} aria-hidden><ChevronRight size={17} /></span>}
    </nav>
  );
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const query = toQuery(sp);
  const [result, cats] = await Promise.all([
    serverApi<Result>(`/products?${query.toString()}`),
    tryServerApi<{ categories: Category[] }>('/categories', { revalidate: 300 }),
  ]);
  const categories = cats?.categories ?? [];
  const top = categories.filter((c) => !c.parentId);
  const cat = categories.find((c) => c.slug === sp.category);
  const q = typeof sp.q === 'string' ? sp.q : '';
  const title = q ? `Results for “${q}”` : cat?.name ?? 'All products';
  const eyebrow = q ? 'Search results' : cat ? 'Department' : 'The IBazzzar store';
  const subtitle = q ? `${result.total.toLocaleString('en-IN')} matching products from verified sellers` : cat?.description ?? 'Everyday essentials to bulk supplies, from verified Indian sellers, with GST invoices on every order.';
  const base = new URLSearchParams(query);
  base.delete('page');
  const pageHref = (p: number) => { const n = new URLSearchParams(base); if (p > 1) n.set('page', String(p)); return `/products${n.size ? `?${n.toString()}` : ''}`; };
  const catHref = (slug: string | null) => { const n = new URLSearchParams(base); if (slug) n.set('category', slug); else n.delete('category'); return `/products${n.size ? `?${n.toString()}` : ''}`; };
  const first = (result.page - 1) * PAGE_SIZE + 1;
  const last = first + result.products.length - 1;
  const stats: [typeof Tags, string, string][] = [
    [PackageSearch, result.total.toLocaleString('en-IN'), result.total === 1 ? 'product' : 'products'],
    [Tags, String(result.facets.brands.length), result.facets.brands.length === 1 ? 'brand' : 'brands'],
    [ShieldCheck, '100%', 'verified sellers'],
  ];

  return (
    <div className="bg-[#f5f6f2] min-h-screen -mb-16 pb-16">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-deep via-emerald to-forest text-white">
        <div className="absolute inset-0 opacity-[0.07] bg-[radial-gradient(#fff_1px,transparent_1.2px)] [background-size:20px_20px]" aria-hidden />
        <div className="absolute -right-24 -top-24 size-80 rounded-full bg-gold/25 blur-3xl" aria-hidden />
        <div className="absolute -left-20 bottom-[-6rem] size-64 rounded-full bg-[#2f7d5d]/40 blur-3xl" aria-hidden />
        <div className="container-page relative pt-5 pb-6 md:pt-6 md:pb-8">
          <nav aria-label="Breadcrumb" className="text-[13px] text-white/60 mb-4">
            <ol className="flex flex-wrap items-center gap-1">
              <li><Link href="/" className="hover:text-white">Home</Link></li>
              <ChevronRight size={13} /><li>{cat || q ? <Link href="/products" className="hover:text-white">Products</Link> : <span aria-current="page" className="text-white">Products</span>}</li>
              {cat && <><ChevronRight size={13} /><li aria-current="page" className="text-white">{cat.name}</li></>}
            </ol>
          </nav>
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div className="min-w-0 max-w-2xl">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 ring-1 ring-white/15 px-3 py-1 text-[11.5px] font-bold uppercase tracking-[0.14em] text-gold-light">{eyebrow}</span>
              <h1 className="mt-2.5 text-[30px] md:text-[42px] leading-[1.05] text-white">{title}</h1>
              <p className="mt-2 text-[14.5px] text-white/70 line-clamp-2">{subtitle}</p>
            </div>
            <div className="flex gap-2.5">
              {stats.map(([Icon, value, unit]) => (
                <div key={unit} className="rounded-2xl bg-white/[0.08] ring-1 ring-white/15 backdrop-blur px-3.5 py-2.5 min-w-[92px]">
                  <Icon size={16} className="text-gold-light" />
                  <p className="mt-1 text-[19px] font-bold leading-none tabular-nums">{value}</p>
                  <p className="text-[11.5px] text-white/60 mt-0.5">{unit}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-5"><Suspense><QuickFilters /></Suspense></div>
        </div>
      </section>

      <div className="container-page py-5 md:py-6">
        {/* Category rail (phones and tablets; desktop has it in the filter column) */}
        {top.length > 0 && (
          <div className="lg:hidden -mx-4 px-4 mb-4 flex gap-3 overflow-x-auto no-scrollbar" aria-label="Categories">
            {[{ id: 'all', name: 'All', slug: '', imageUrl: null } as Pick<Category, 'id' | 'name' | 'slug' | 'imageUrl'>, ...top].map((c) => {
              const on = (cat?.slug ?? '') === c.slug;
              return (
                <Link key={c.id} href={catHref(c.slug || null)} className="flex w-[68px] shrink-0 flex-col items-center gap-1.5 text-center">
                  <span className={cn('relative grid size-14 place-items-center overflow-hidden rounded-2xl text-[18px] font-bold transition', on ? 'bg-forest text-gold-light ring-2 ring-gold shadow-card' : 'bg-white text-forest ring-1 ring-line')}>
                    {c.imageUrl ? <Image src={c.imageUrl} alt="" fill sizes="56px" className="object-cover" unoptimized={c.imageUrl.startsWith('/api/')} /> : c.slug ? c.name.slice(0, 1) : <LayoutGrid size={20} />}
                  </span>
                  <span className={cn('text-[11.5px] leading-tight line-clamp-2', on ? 'font-bold text-forest' : 'text-ink/80')}>{c.name}</span>
                </Link>
              );
            })}
          </div>
        )}

        <div className="flex gap-6">
          <Suspense><FilterSidebar categories={categories} facets={result.facets} /></Suspense>
          <div className="flex-1 min-w-0">
            <div className="rounded-2xl border border-line bg-white shadow-card px-4 py-3 mb-4 grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[13.5px] text-muted" role="status">
                  {result.total ? <>Showing <strong className="text-ink">{first}–{last}</strong> of <strong className="text-ink">{result.total.toLocaleString('en-IN')}</strong> {result.total === 1 ? 'product' : 'products'}</> : 'No products'}
                </p>
                <div className="flex items-center gap-2 max-w-full">
                  <Suspense><FilterSheet categories={categories} facets={result.facets} total={result.total} /></Suspense>
                  <Suspense><SortSelect /></Suspense>
                </div>
              </div>
              <Suspense><ActiveFilters categories={categories} /></Suspense>
            </div>
            {result.products.length ? (
              <>
                <ProductGrid products={result.products} />
                <Pager page={result.page} pages={result.pages} href={pageHref} />
              </>
            ) : (
              <div className="card">
                <Empty icon={<SearchX size={26} />} title="No products match" body={q ? 'Check the spelling, try a more general word, or remove a filter.' : 'Try removing a filter or browsing another category.'}
                  action={<div className="flex flex-wrap justify-center gap-2"><Link href="/products" className="btn btn-primary">Clear all filters</Link><Link href="/business/rfqs/new" className="btn btn-outline">Ask sellers for a quote</Link></div>} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
