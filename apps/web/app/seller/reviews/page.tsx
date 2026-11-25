'use client';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { Empty, PageHeader, Spinner, Stars } from '@/components/ui';

export default function SellerReviewsPage() {
  const { data } = useQuery({ queryKey: ['seller-reviews'], queryFn: () => api<{ reviews: { id: string; rating: number; title: string; body: string; images: string[]; helpfulCount: number; authorName: string; createdAt: string; product: string }[] }>('/seller/reviews') });
  if (!data) return <Spinner />;
  return (
    <>
      <PageHeader title="Reviews" description="Verified reviews of items you delivered. Reviews can’t be edited or removed by sellers." />
      {data.reviews.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {data.reviews.map((r) => <article key={r.id} className="card card-pad"><Stars value={r.rating} /><p className="font-semibold mt-2">{r.title}</p><p className="text-sm text-muted mt-1 whitespace-pre-line">{r.body}</p>{r.images?.length > 0 && <div className="flex gap-2 mt-2 flex-wrap">{r.images.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" className="relative size-14 rounded-lg overflow-hidden border border-line bg-cream" aria-label="Open customer photo"><Image src={u} alt="" fill sizes="56px" className="object-cover" unoptimized /></a>)}</div>}<p className="text-xs text-muted mt-3">{r.authorName} · {r.product} · {formatDate(r.createdAt)}{r.helpfulCount > 0 ? ` · ${r.helpfulCount} found it helpful` : ""}</p></article>)}
        </div>
      ) : <div className="card"><Empty icon={<Star size={26} />} title="No reviews yet" /></div>}
    </>
  );
}
