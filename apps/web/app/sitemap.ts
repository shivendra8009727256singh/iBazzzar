import type { MetadataRoute } from 'next';
import { tryServerApi } from '@/lib/server-api';
import type { Category, Product } from '@/lib/types';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://ibazzzar.com';
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [cats, sellers] = await Promise.all([
    tryServerApi<{ categories: Category[] }>('/categories', { revalidate: 3600 }),
    tryServerApi<{ sellers: { slug: string }[] }>('/sellers', { revalidate: 3600 }),
  ]);
  const products: Product[] = [];
  for (let page = 1; page <= 50; page++) {
    const r = await tryServerApi<{ products: Product[]; pages: number }>(`/products?limit=60&page=${page}&sort=newest`, { revalidate: 3600 });
    if (!r) break;
    products.push(...r.products);
    if (page >= r.pages) break;
  }
  const now = new Date();
  return [
    ...['', '/products', '/deals', '/brands', '/sellers', '/wholesale', '/sell', '/support'].map((p) => ({ url: `${SITE}${p}`, lastModified: now })),
    ...(cats?.categories ?? []).map((c) => ({ url: `${SITE}/products?category=${c.slug}`, lastModified: now })),
    ...(sellers?.sellers ?? []).map((s) => ({ url: `${SITE}/sellers/${s.slug}`, lastModified: now })),
    ...products.map((p) => ({ url: `${SITE}/products/${p.productSlug}`, lastModified: now })),
  ];
}
