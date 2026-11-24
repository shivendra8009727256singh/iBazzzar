import type { Metadata } from 'next';
import { tryServerApi } from '@/lib/server-api';
import { BrandDirectory, type BrandCard } from '@/components/brand-directory';
import { Empty } from '@/components/ui';

export const metadata: Metadata = { title: 'Brands', description: 'Browse brands sold by approved sellers on IBazzzar.' };
export const dynamic = 'force-dynamic'; // rendered per request; API data is cached via fetch revalidate

export default async function BrandsPage() {
  const data = await tryServerApi<{ brands: BrandCard[] }>('/brands', { revalidate: 300 });
  if (!data?.brands.length) return <div className="container-page py-12"><div className="card"><Empty title="No brands yet" body="Brands appear here as approved sellers list their products." /></div></div>;
  return <BrandDirectory brands={data.brands} />;
}
