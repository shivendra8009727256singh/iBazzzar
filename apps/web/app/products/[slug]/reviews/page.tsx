import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ChevronRight, ArrowLeft } from 'lucide-react';
import { serverApi } from '@/lib/server-api';
import { formatMoney } from '@/lib/format';
import type { Detail } from '@/components/product-detail';
import { AllReviews } from '@/components/reviews';

async function load(slug: string) {
  try { return await serverApi<Detail>(`/products/${encodeURIComponent(slug)}`, { revalidate: 30 }); } catch { return null; }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await load(slug);
  return data ? { title: `Reviews of ${data.product.name}`, description: `Ratings, reviews and customer photos for ${data.product.name} from verified buyers.`, alternates: { canonical: `/products/${data.product.slug}/reviews` } } : { title: 'Product not found' };
}

export default async function ProductReviewsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ photos?: string }> }) {
  const { slug } = await params;
  const { photos } = await searchParams;
  const data = await load(slug);
  if (!data) notFound();
  const p = data.product;
  const offer = data.offer;
  return (
    <div className="bg-[#f5f6f2] min-h-screen pb-12">
      <div className="container-page py-5 md:py-6 grid gap-5">
        <nav aria-label="Breadcrumb" className="text-[13px] text-muted">
          <ol className="flex flex-wrap items-center gap-1">
            <li><Link href="/" className="hover:text-forest">Home</Link></li>
            <ChevronRight size={13} /><li><Link href="/products" className="hover:text-forest">Products</Link></li>
            <ChevronRight size={13} /><li><Link href={`/products/${p.slug}`} className="hover:text-forest line-clamp-1 max-w-[30ch]">{p.name}</Link></li>
            <ChevronRight size={13} /><li aria-current="page" className="text-ink">Reviews</li>
          </ol>
        </nav>
        <header className="card p-4 md:p-5 flex flex-wrap items-center gap-4">
          <span className="relative size-20 shrink-0 rounded-xl bg-white border border-line overflow-hidden">
            {p.images[0] && <Image src={p.images[0].url} alt="" fill sizes="80px" className="object-contain p-2" unoptimized={p.images[0].url.startsWith('/api/')} />}
          </span>
          <div className="flex-1 min-w-[180px]">
            <p className="text-[12px] font-bold uppercase tracking-wider text-gold-ink">{p.brand.name}</p>
            <h1 className="text-[22px] md:text-[28px] leading-tight">Ratings & reviews</h1>
            <p className="text-sm text-muted line-clamp-1">{p.name}{offer ? ` · ${formatMoney(offer.pricePaise)}` : ''}</p>
          </div>
          <Link href={`/products/${p.slug}`} className="btn btn-outline max-sm:w-full"><ArrowLeft size={16} />Back to product</Link>
        </header>
        <AllReviews productId={p.id} initialPhotos={photos === 'true'} />
      </div>
    </div>
  );
}
