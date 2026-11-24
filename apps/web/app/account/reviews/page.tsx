'use client';
import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Star, MessageSquareHeart, EyeOff } from 'lucide-react';
import { api, post } from '@/lib/api';
import { cn, formatDate } from '@/lib/format';
import { Alert, Button, Empty, Field, Input, Modal, PageHeader, Skeleton, Textarea, useFormErrors } from '@/components/ui';

type Data = {
  reviews: { id: string; rating: number; title: string; body: string; status: string; createdAt: string; product: { id: string; name: string; slug: string; image: string | null } }[];
  pending: { productId: string; name: string; image: string | null; orderId: string; orderNumber: string; orderedAt: string }[];
};

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  const words = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n === 1 ? '' : 's'}`} onMouseEnter={() => setHover(n)} onClick={() => onChange(n)} className="p-0.5">
            <Star size={30} className={cn('transition', (hover || value) >= n ? 'text-gold fill-gold' : 'text-line-strong')} />
          </button>
        ))}
      </div>
      <span className="text-sm font-semibold text-muted">{words[hover || value]}</span>
    </div>
  );
}

function WriteReview({ item, onDone }: { item: Data['pending'][number]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ rating: 0, title: '', body: '' });
  const [busy, setBusy] = useState(false);
  const errors = useFormErrors();
  const submit = async () => {
    setBusy(true); errors.clear();
    try { await post(`/products/${item.productId}/reviews`, f); toast.success('Thank you for your review'); setOpen(false); onDone(); } catch (e) { errors.set(e); } finally { setBusy(false); }
  };
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Star size={15} />Rate & review</Button>
      <Modal open={open} onOpenChange={setOpen} title="Rate this product" description={item.name}>
        <div className="grid gap-4">
          {errors.message && <Alert>{errors.message}</Alert>}
          <StarPicker value={f.rating} onChange={(rating) => setF({ ...f, rating })} />
          <Field label="Title" error={errors.field('title')}><Input value={f.title} maxLength={120} placeholder="Sum it up in a few words" onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Your review" error={errors.field('body')} hint="What did you like or dislike? Avoid personal details."><Textarea rows={4} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
          <Button loading={busy} disabled={!f.rating} onClick={submit}>Submit review</Button>
        </div>
      </Modal>
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
                      <p className="text-[14.5px] mt-1.5">{r.body}</p>
                      <p className="text-xs text-muted mt-2 flex items-center gap-2">{formatDate(r.createdAt)}{r.status === 'HIDDEN' && <span className="inline-flex items-center gap-1 text-warning font-semibold"><EyeOff size={13} />Hidden by our team for breaking the review policy</span>}</p>
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
