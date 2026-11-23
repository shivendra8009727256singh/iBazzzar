import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { SearchX } from 'lucide-react';
import { serverApi, tryServerApi } from '@/lib/server-api';
import type { Category, Product } from '@/lib/types';
import { ProductGrid } from '@/components/product-card';
import { FilterPanel, SortSelect, ActiveFilters } from '@/components/filters';
import { Pagination, Empty } from '@/components/ui';

type Search = Record<string, string | string[] | undefined>;
type Result = { products: Product[]; total: number; page: number; pages: number; facets: { brands: { name: string; slug: string; count: number }[] } };

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
  const hrefFor = (p: number) => { const n = new URLSearchParams(query); n.set('page', String(p)); return `/products?${n.toString()}`; };

  return (
    <div className="container-page py-8">
      <nav aria-label="Breadcrumb" className="text-sm text-muted mb-4">
        <ol className="flex flex-wrap gap-1.5">
          <li><Link href="/" className="hover:text-ink">Home</Link> /</li>
          <li><Link href="/products" className="hover:text-ink">Shop</Link>{cat && ' /'}</li>
          {cat && <li aria-current="page" className="text-ink">{cat.name}</li>}
        </ol>
      </nav>
      {cat && (
        <div className="surface-emerald rounded-3xl p-6 md:p-10 mb-8">
          <span className="eyebrow text-gold-light!">Department</span>
          <h1 className="text-3xl md:text-[42px] text-white mt-1">{cat.name}</h1>
          {cat.description && <p className="text-white/75 mt-2 max-w-xl">{cat.description}</p>}
        </div>
      )}
      <div className="flex gap-8">
        <Suspense><FilterPanel categories={categories} facets={result.facets} /></Suspense>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              {!cat && <h1 className="text-2xl md:text-3xl">{title}</h1>}
              <p className="text-sm text-muted mt-0.5" role="status">{result.total} product{result.total === 1 ? '' : 's'}</p>
            </div>
            <div className="flex items-center gap-2"><Suspense><SortSelect /></Suspense></div>
          </div>
          <Suspense><ActiveFilters categories={categories} /></Suspense>
          {result.products.length ? (
            <>
              <ProductGrid products={result.products} />
              <Pagination page={result.page} pages={result.pages} hrefFor={hrefFor} />
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
  );
}
