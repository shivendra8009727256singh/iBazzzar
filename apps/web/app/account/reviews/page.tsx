'use client';
import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Star, MessageSquareHeart, EyeOff } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, formatDate } from '@/lib/format';
import { Button, Empty, PageHeader, Skeleton } from '@/components/ui';
import { ReviewComposer } from '@/components/reviews';

type Data = {
  reviews: { id: string; rating: number; title: string; body: string; images: string[]; helpfulCount: number; status: string; createdAt: string; product: { id: string; name: string; slug: string; image: string | null } }[];
  pending: { productId: string; name: string; image: string | null; orderId: string; orderNumber: string; orderedAt: string }[];
};

function WriteReview({ item, onDone }: { item: Data['pending'][number]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Star size={15} />Rate & review</Button>
      {open && <ReviewComposer productId={item.productId} productName={item.name} open={open} onOpenChange={setOpen} onDone={onDone} />}
    </>
  );
}

export default function MyReviewsPage() {
  const { data, refetch, isLoading } = useQuery({ queryKey: ['my-reviews'], queryFn: () => api<Data>('/account/reviews') });
  return (
    <>
      <PageHeader title="My reviews" description="Your reviews help other shoppers. Only products you received can be reviewed." />
      {isLoading || !data ? <div className="grid gap-3">{[1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div> : (
        <div className="grid gap-6">
          {data.pending.length > 0 && (
            <section aria-labelledby="pending">
              <h2 id="pending" className="text-lg mb-3">Waiting for your review ({data.pending.length})</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {data.pending.map((p) => (
                  <div key={p.productId} className="card p-4 flex gap-4 items-center">
                    <span className="relative size-16 shrink-0 rounded-xl bg-white border border-line">{p.image && <Image src={p.image} alt="" fill sizes="64px" className="object-contain p-1.5" unoptimized />}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold line-clamp-2">{p.name}</p>
                      <p className="text-xs text-muted">Order {p.orderNumber} · {formatDate(p.orderedAt)}</p>
                      <div className="mt-2"><WriteReview item={p} onDone={() => refetch()} /></div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          <section aria-labelledby="written">
            <h2 id="written" className="text-lg mb-3">Your reviews ({data.reviews.length})</h2>
            {data.reviews.length ? (
              <div className="grid gap-3">
                {data.reviews.map((r) => (
                  <article key={r.id} className="card p-4 flex gap-4">
                    <Link href={`/products/${r.product.slug}`} className="relative size-16 shrink-0 rounded-xl bg-white border border-line">{r.product.image && <Image src={r.product.image} alt="" fill sizes="64px" className="object-contain p-1.5" unoptimized />}</Link>
                    <div className="flex-1 min-w-0">
                      <Link href={`/products/${r.product.slug}`} className="text-sm text-muted hover:text-forest line-clamp-1">{r.product.name}</Link>
                      <p className="flex items-center gap-2 mt-1"><span className={cn('inline-flex items-center gap-0.5 rounded px-1.5 py-px text-xs font-bold text-white', r.rating >= 4 ? 'bg-success' : r.rating === 3 ? 'bg-[#c27c0e]' : 'bg-danger')}>{r.rating}<Star size={10} fill="currentColor" /></span><span className="font-semibold">{r.title}</span></p>
                      <p className="text-[14.5px] mt-1.5 whitespace-pre-line">{r.body}</p>
                      {r.images.length > 0 && <div className="flex gap-2 mt-2 flex-wrap">{r.images.map((u) => <span key={u} className="relative size-14 rounded-lg overflow-hidden border border-line bg-cream"><Image src={u} alt="" fill sizes="56px" className="object-cover" unoptimized /></span>)}</div>}
                      <p className="text-xs text-muted mt-2 flex items-center gap-2">{formatDate(r.createdAt)}{r.helpfulCount > 0 && <span>· {r.helpfulCount} found it helpful</span>}{r.status === 'HIDDEN' && <span className="inline-flex items-center gap-1 text-warning font-semibold"><EyeOff size={13} />Hidden by our team for breaking the review policy</span>}</p>
                    </div>
                  </article>
                ))}
              </div>
            ) : <div className="card"><Empty icon={<MessageSquareHeart size={26} />} title="No reviews yet" body={data.pending.length ? 'Start with one of the products above.' : 'Once an order is delivered, you can review it here.'} /></div>}
          </section>
        </div>
      )}
    </>
  );
}
