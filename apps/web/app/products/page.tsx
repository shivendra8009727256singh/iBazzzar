import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { SearchX, ChevronRight } from 'lucide-react';
import { serverApi, tryServerApi } from '@/lib/server-api';
import type { Category, Product } from '@/lib/types';
import { ProductGrid } from '@/components/product-card';
import { FilterSidebar, FilterSheet, SortSelect, ActiveFilters } from '@/components/filters';
import { Pagination, Empty } from '@/components/ui';

type Search = Record<string, string | string[] | undefined>;
type Result = { products: Product[]; total: number; page: number; pages: number; facets: { brands: { name: string; slug: string; count: number }[] } };
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

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const query = toQuery(sp);
  const [result, cats] = await Promise.all([
    serverApi<Result>(`/products?${query.toString()}`),
    tryServerApi<{ categories: Category[] }>('/categories', { revalidate: 300 }),
  ]);
  const categories = cats?.categories ?? [];
  const cat = categories.find((c) => c.slug === sp.category);
  const q = typeof sp.q === 'string' ? sp.q : '';
  const title = q ? `Results for “${q}”` : cat?.name ?? 'All products';
  const base = new URLSearchParams(query);
  base.delete('page');
  const first = (result.page - 1) * PAGE_SIZE + 1;
  const last = first + result.products.length - 1;

  return (
    <div className="bg-[#f5f6f2] min-h-screen">
      <div className="container-page py-5 md:py-6">
        <nav aria-label="Breadcrumb" className="text-[13px] text-muted mb-3">
          <ol className="flex flex-wrap items-center gap-1">
            <li><Link href="/" className="hover:text-forest">Home</Link></li>
            <ChevronRight size={13} /><li><Link href="/products" className="hover:text-forest">Shop</Link></li>
            {cat && <><ChevronRight size={13} /><li aria-current="page" className="text-ink">{cat.name}</li></>}
          </ol>
        </nav>
        {cat && (
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald via-forest to-emerald px-6 py-6 md:px-8 md:py-7 mb-5">
            <div className="absolute -right-10 -top-16 size-56 rounded-full bg-gold/20 blur-2xl" aria-hidden />
            <span className="eyebrow text-gold-light!">Department</span>
            <h1 className="relative text-2xl md:text-[34px] text-white mt-0.5">{cat.name}</h1>
            {cat.description && <p className="relative text-white/75 mt-1 max-w-xl text-[14.5px]">{cat.description}</p>}
          </div>
        )}
        <div className="flex gap-5">
          <Suspense><FilterSidebar categories={categories} facets={result.facets} /></Suspense>
          <div className="flex-1 min-w-0">
            <div className="rounded-2xl border border-line bg-white shadow-card px-4 py-3 mb-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  {!cat && <h1 className="text-xl md:text-2xl">{title}</h1>}
                  <p className="text-[13px] text-muted" role="status">{result.total ? `Showing ${first}–${last} of ${result.total.toLocaleString('en-IN')} products` : 'No products'}</p>
                </div>
                <div className="lg:hidden"><Suspense><FilterSheet categories={categories} facets={result.facets} /></Suspense></div>
              </div>
              <div className="mt-2.5 pt-2.5 border-t border-line flex items-center gap-2 overflow-x-auto"><Suspense><SortSelect /></Suspense></div>
            </div>
            <Suspense><ActiveFilters categories={categories} /></Suspense>
            {result.products.length ? (
              <>
                <ProductGrid products={result.products} />
                <Pagination page={result.page} pages={result.pages} hrefBase={`/products?${base.toString()}`} />
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
