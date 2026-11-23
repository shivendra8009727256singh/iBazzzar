import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { serverApi } from '@/lib/server-api';
import { ProductDetail, type Detail } from '@/components/product-detail';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://ibazzzar.com';

async function load(slug: string) {
  try { return await serverApi<Detail>(`/products/${encodeURIComponent(slug)}`, { revalidate: 30 }); } catch { return null; }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) return { title: 'Product not found' };
  const p = data.product;
  const description = p.description.slice(0, 158);
  return {
    title: `${p.name} by ${p.brand.name}`,
    description,
    alternates: { canonical: `/products/${p.slug}` },
    openGraph: { title: p.name, description, images: p.images.slice(0, 1).map((i) => ({ url: i.url, alt: i.alt })), type: 'website' },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) notFound();
  const p = data.product;
  const o = data.offer;
  // Structured data mirrors what the page shows. Ratings are included only when verified reviews exist.
  const jsonLd = [
    {
      '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: p.description, sku: o.listingId,
      image: p.images.map((i) => (i.url.startsWith('http') ? i.url : `${SITE}${i.url}`)), brand: { '@type': 'Brand', name: p.brand.name },
      offers: data.offers.map((x) => ({
        '@type': 'Offer', url: `${SITE}/products/${p.slug}`, priceCurrency: 'INR', price: (x.pricePaise / 100).toFixed(2),
        availability: x.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', seller: { '@type': 'Organization', name: x.sellerName },
      })),
      ...(p.rating ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: p.rating.average, reviewCount: p.rating.count } } : {}),
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
        { '@type': 'ListItem', position: 2, name: p.category.name, item: `${SITE}/products?category=${p.category.slug}` },
        { '@type': 'ListItem', position: 3, name: p.name, item: `${SITE}/products/${p.slug}` },
      ],
    },
  ];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <ProductDetail key={data.selectedVariantId} data={data} />
    </>
  );
}
