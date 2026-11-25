'use client';
/* eslint-disable @next/next/no-img-element -- customer photos of unknown size, shown as uploaded */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { BadgeCheck, Camera, Check, ChevronLeft, ChevronRight, Loader2, Star, ThumbsUp, X, ArrowRight, MessageSquareText } from 'lucide-react';
import { api, post } from '@/lib/api';
import type { Review, ReviewPage, ReviewSummary } from '@/lib/types';
import { cn, formatDate } from '@/lib/format';
import { useSession } from './providers';
import { ImageUploader } from './image-uploader';
import { Alert, Button, Field, Input, Modal, Skeleton, Textarea, useFormErrors } from './ui';

export type ReviewSort = 'helpful' | 'newest' | 'highest' | 'lowest';
const tone = (s: number) => (s >= 4 ? 'bg-success' : s === 3 ? 'bg-[#c27c0e]' : 'bg-danger');
const qs = (o: Record<string, string | number | undefined>) => Object.entries(o).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');

export function RatingChip({ value, className }: { value: number; className?: string }) {
  return <span className={cn('inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[12px] font-bold text-white', tone(Math.round(value)), className)}>{value.toFixed(1).replace('.0', '')}<Star size={10} fill="currentColor" /></span>;
}

/** Live review summary for a product (always fresh: reviews show the moment they're written). */
export function useReviewPage(productId: string, params: { page?: number; size?: number; sort?: ReviewSort; rating?: number; photos?: boolean } = {}) {
  return useQuery({
    queryKey: ['reviews', productId, params],
    queryFn: () => api<ReviewPage>(`/products/${productId}/reviews?${qs({ page: params.page ?? 1, size: params.size ?? 5, sort: params.sort ?? 'helpful', rating: params.rating, photos: params.photos ? 'true' : undefined })}`),
    staleTime: 0,
  });
}

/** Big average, star breakdown bars (clickable to filter). */
export function RatingSummary({ summary, onPick, picked }: { summary: ReviewSummary; onPick?: (stars: number | undefined) => void; picked?: number }) {
  const total = Math.max(1, summary.count);
  return (
    <div className="grid gap-6 sm:grid-cols-[200px_1fr] items-center">
      <div className="text-center sm:border-r sm:border-line sm:pr-6">
        <p className="text-5xl font-bold flex items-center justify-center gap-1.5">{summary.average?.toFixed(1) ?? '–'}<Star size={30} className="text-success" fill="currentColor" /></p>
        <p className="text-sm text-muted mt-1">{summary.count.toLocaleString('en-IN')} verified rating{summary.count === 1 ? '' : 's'}</p>
        {summary.withPhotos > 0 && <p className="text-xs text-muted mt-1 flex items-center justify-center gap-1"><Camera size={12} />{summary.withPhotos} with photos</p>}
      </div>
      <ul className="grid gap-1.5">
        {summary.breakdown.map((b) => {
          const on = picked === b.stars;
          const row = (
            <>
              <span className="w-8 font-semibold flex items-center gap-0.5">{b.stars}<Star size={12} fill="currentColor" /></span>
              <span className="flex-1 h-2 rounded-full bg-mint overflow-hidden"><span className={cn('block h-full rounded-full transition-all', tone(b.stars))} style={{ width: `${(b.count / total) * 100}%` }} /></span>
              <span className="w-10 text-right text-muted tabular-nums">{b.count.toLocaleString('en-IN')}</span>
            </>
          );
          return (
            <li key={b.stars}>
              {onPick
                ? <button type="button" onClick={() => onPick(on ? undefined : b.stars)} aria-pressed={on} className={cn('w-full flex items-center gap-3 text-sm rounded-lg px-2 py-1 transition', on ? 'bg-mint ring-1 ring-forest/30' : 'hover:bg-mint/50')}>{row}</button>
                : <div className="flex items-center gap-3 text-sm px-2 py-1">{row}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Full-screen photo viewer with previous/next. */
export function PhotoViewer({ photos, index, onClose }: { photos: string[]; index: number | null; onClose: () => void }) {
  const [i, setI] = useState(index ?? 0);
  useEffect(() => { if (index != null) setI(index); }, [index]);
  const go = (d: number) => setI((x) => (x + d + photos.length) % photos.length);
  return (
    <Dialog.Root open={index != null} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/85" />
        <Dialog.Content className="fixed z-[60] inset-0 grid place-items-center p-4 md:p-12 focus:outline-none" onKeyDown={(e) => { if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); }}>
          <Dialog.Title className="sr-only">Customer photo {i + 1} of {photos.length}</Dialog.Title>
          {photos[i] && <img src={photos[i]} alt={`Customer photo ${i + 1}`} className="max-h-full max-w-full object-contain rounded-xl bg-white" />}
          <Dialog.Close className="absolute top-4 right-4 size-10 rounded-full bg-white grid place-items-center" aria-label="Close"><X size={18} /></Dialog.Close>
          {photos.length > 1 && <>
            <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 size-11 rounded-full bg-white/95 grid place-items-center"><ChevronLeft /></button>
            <button type="button" onClick={() => go(1)} aria-label="Next photo" className="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 size-11 rounded-full bg-white/95 grid place-items-center"><ChevronRight /></button>
            <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-sm font-semibold">{i + 1} / {photos.length}</p>
          </>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Strip of customer photos across all reviews. */
export function CustomerPhotos({ photos, limit = 8, moreHref }: { photos: { url: string }[]; limit?: number; moreHref?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!photos.length) return null;
  const urls = photos.map((p) => p.url);
  const shown = urls.slice(0, limit);
  return (
    <div>
      <p className="font-semibold mb-2 flex items-center gap-2"><Camera size={16} className="text-forest" />Customer photos ({urls.length})</p>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {shown.map((u, k) => {
          const last = k === shown.length - 1 && urls.length > shown.length;
          return (
            <button key={`${u}:${k}`} type="button" onClick={() => setOpen(k)} className="relative shrink-0 size-20 md:size-24 rounded-xl overflow-hidden border border-line bg-cream hover:ring-2 hover:ring-forest/40 transition" aria-label={`Open customer photo ${k + 1}`}>
              <img src={u} alt="" className="size-full object-cover" loading="lazy" />
              {last && moreHref && <Link href={moreHref} onClick={(e) => e.stopPropagation()} className="absolute inset-0 bg-black/55 text-white grid place-items-center text-sm font-bold">+{urls.length - shown.length + 1}</Link>}
            </button>
          );
        })}
      </div>
      <PhotoViewer photos={urls} index={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function HelpfulButton({ r, productId }: { r: Review; productId: string }) {
  const { user } = useSession();
  const qc = useQueryClient();
  const [state, setState] = useState({ on: !!r.votedHelpful, count: r.helpfulCount ?? 0 });
  const [busy, setBusy] = useState(false);
  if (r.mine) return <span className="text-xs text-muted">Your review{state.count ? ` · ${state.count} found it helpful` : ''}</span>;
  const vote = async () => {
    if (!user) { toast.message('Sign in to mark reviews helpful'); return; }
    setBusy(true);
    try { const res = await post<{ helpful: boolean; helpfulCount: number }>(`/reviews/${r.id}/helpful`, {}); setState({ on: res.helpful, count: res.helpfulCount }); qc.invalidateQueries({ queryKey: ['reviews', productId] }); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <button type="button" onClick={vote} disabled={busy} aria-pressed={state.on} className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition', state.on ? 'border-forest bg-mint text-forest' : 'border-line text-muted hover:border-forest hover:text-forest')}>
      <ThumbsUp size={13} className={state.on ? 'fill-forest/20' : ''} />Helpful{state.count ? ` (${state.count})` : ''}
    </button>
  );
}

export function ReviewCard({ r, productId }: { r: Review; productId: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const long = r.body.length > 320;
  return (
    <article className="py-5">
      <div className="flex items-center gap-2 flex-wrap"><RatingChip value={r.rating} /><h3 className="font-sans font-semibold text-[15.5px]">{r.title}</h3></div>
      <p className={cn('text-[15px] text-[#33443a] mt-2 leading-relaxed whitespace-pre-line', !expanded && long && 'line-clamp-4')}>{r.body}</p>
      {long && <button type="button" onClick={() => setExpanded((x) => !x)} className="text-sm font-semibold text-forest mt-1">{expanded ? 'Show less' : 'Read more'}</button>}
      {!!r.images?.length && (
        <div className="flex gap-2 mt-3 flex-wrap">
          {r.images.map((u, k) => (
            <button key={u} type="button" onClick={() => setOpen(k)} className="size-16 md:size-20 rounded-lg overflow-hidden border border-line bg-cream hover:ring-2 hover:ring-forest/40" aria-label={`Open photo ${k + 1} from ${r.authorName}`}>
              <img src={u} alt="" className="size-full object-cover" loading="lazy" />
            </button>
          ))}
          <PhotoViewer photos={r.images} index={open} onClose={() => setOpen(null)} />
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted flex flex-wrap items-center gap-2"><span className="font-semibold text-ink">{r.authorName}</span><span className="inline-flex items-center gap-1 text-success"><Check size={13} />Verified buyer</span><span>· {formatDate(r.createdAt)}</span></p>
        <HelpfulButton r={r} productId={productId} />
      </div>
    </article>
  );
}

/** Product page section: summary, customer photos, the 5 most helpful reviews and a link to all of them. */
export function ProductReviews({ productId, slug }: { productId: string; slug: string }) {
  const { data, isLoading } = useReviewPage(productId, { size: 5, sort: 'helpful' });
  const all = `/products/${slug}/reviews`;
  return (
    <section id="reviews" className="card p-5 md:p-6 scroll-mt-32" aria-labelledby="reviews-title">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h2 id="reviews-title" className="text-2xl">Ratings & reviews</h2>
        <p className="text-sm text-muted flex items-center gap-1.5"><BadgeCheck size={15} className="text-forest" />Only customers who received this product can review it.</p>
      </div>
      {isLoading || !data ? <div className="grid gap-3"><Skeleton className="h-32" /><Skeleton className="h-20" /></div> : data.summary.count ? (
        <>
          <div className="pb-6 border-b border-line grid gap-6"><RatingSummary summary={data.summary} />{data.photos.length > 0 && <CustomerPhotos photos={data.photos} moreHref={`${all}?photos=true`} />}</div>
          <div className="divide-y divide-line">{data.reviews.map((r) => <ReviewCard key={r.id} r={r} productId={productId} />)}</div>
          {data.total > data.reviews.length && (
            <Link href={all} className="mt-2 flex items-center justify-between rounded-xl border border-line px-4 py-3 font-semibold text-forest hover:bg-mint/50 transition">
              <span className="flex items-center gap-2"><MessageSquareText size={17} />All {data.total.toLocaleString('en-IN')} reviews</span><ArrowRight size={17} />
            </Link>
          )}
        </>
      ) : <p className="text-muted py-6">No reviews yet. Bought this? You can review it from your order once it’s delivered.</p>}
    </section>
  );
}

/** All reviews of a product with sorting, star and photo filters, and infinite loading (with a "Load more" fallback). */
export function AllReviews({ productId, initialPhotos }: { productId: string; initialPhotos?: boolean }) {
  const [sort, setSort] = useState<ReviewSort>('helpful');
  const [rating, setRating] = useState<number | undefined>();
  const [photos, setPhotos] = useState(!!initialPhotos);
  const SIZE = 10;
  const q = useInfiniteQuery({
    queryKey: ['reviews', productId, 'all', sort, rating, photos],
    queryFn: ({ pageParam }) => api<ReviewPage>(`/products/${productId}/reviews?${qs({ page: pageParam, size: SIZE, sort, rating, photos: photos ? 'true' : undefined })}`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
  });
  const first = q.data?.pages[0];
  const reviews = q.data?.pages.flatMap((p) => p.reviews) ?? [];
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => { if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage(); }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)] items-start">
      <aside className="card p-5 grid gap-5 lg:sticky lg:top-32">
        {first ? <RatingSummary summary={first.summary} onPick={setRating} picked={rating} /> : <Skeleton className="h-40" />}
        {first && first.photos.length > 0 && !photos && <CustomerPhotos photos={first.photos} limit={6} />}
      </aside>
      <section className="card p-5 md:p-6 min-w-0" aria-label="Reviews">
        <div className="flex flex-wrap items-center gap-2 pb-4 border-b border-line">
          <label className="text-sm text-muted" htmlFor="review-sort">Sort</label>
          <select id="review-sort" value={sort} onChange={(e) => setSort(e.target.value as ReviewSort)} className="input min-h-[38px] py-1 w-auto text-sm">
            <option value="helpful">Most helpful</option><option value="newest">Newest</option><option value="highest">Highest rating</option><option value="lowest">Lowest rating</option>
          </select>
          <div className="flex flex-wrap gap-1.5 ml-auto">
            <button type="button" aria-pressed={photos} onClick={() => setPhotos((x) => !x)} className={cn('inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[13px] font-semibold', photos ? 'bg-forest text-white border-forest' : 'border-line hover:border-forest')}><Camera size={13} />With photos</button>
            {[5, 4, 3, 2, 1].map((s) => <button key={s} type="button" aria-pressed={rating === s} onClick={() => setRating(rating === s ? undefined : s)} className={cn('inline-flex items-center gap-0.5 rounded-full border px-2.5 py-1 text-[13px] font-semibold', rating === s ? 'bg-forest text-white border-forest' : 'border-line hover:border-forest')}>{s}<Star size={11} fill="currentColor" /></button>)}
          </div>
        </div>
        {first && <p className="text-sm text-muted pt-3">{first.total.toLocaleString('en-IN')} review{first.total === 1 ? '' : 's'}{rating ? ` with ${rating} star${rating === 1 ? '' : 's'}` : ''}{photos ? ' with photos' : ''}</p>}
        {q.isLoading ? <div className="grid gap-3 pt-4">{[1, 2, 3].map((k) => <Skeleton key={k} className="h-28" />)}</div> : reviews.length ? (
          <div className="divide-y divide-line">{reviews.map((r) => <ReviewCard key={r.id} r={r} productId={productId} />)}</div>
        ) : <p className="text-muted py-8 text-center">No reviews match these filters.</p>}
        <div ref={sentinel} aria-hidden />
        {q.hasNextPage && (
          <div className="pt-4 text-center">
            <Button variant="outline" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>{q.isFetchingNextPage ? <><Loader2 size={16} className="animate-spin" />Loading…</> : 'Load more reviews'}</Button>
          </div>
        )}
        {!q.hasNextPage && reviews.length > SIZE && <p className="text-center text-sm text-muted pt-4">You’ve seen all {reviews.length} reviews.</p>}
      </section>
    </div>
  );
}

const WORDS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
/** The review form used from an order and from "My reviews": stars, headline, text and up to 5 photos. */
export function ReviewComposer({ productId, productName, open, onOpenChange, onDone }: { productId: string; productName: string; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ rating: 0, title: '', body: '', images: [] as string[] });
  const [hover, setHover] = useState(0);
  const [busy, setBusy] = useState(false);
  const errors = useFormErrors();
  const submit = async () => {
    setBusy(true); errors.clear();
    try {
      await post(`/products/${productId}/reviews`, f);
      toast.success('Thanks! Your review is live.');
      qc.invalidateQueries({ queryKey: ['reviews', productId] });
      onOpenChange(false); onDone();
    } catch (e) { errors.set(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Rate & review" description={productName} wide>
      <div className="grid gap-5">
        {errors.message && <Alert>{errors.message}</Alert>}
        <div>
          <p className="label mb-1.5">How would you rate it? <span className="text-danger">*</span></p>
          <div className="flex items-center gap-3">
            <div className="flex gap-1" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={f.rating === n} aria-label={`${n} star${n === 1 ? '' : 's'}`} onMouseEnter={() => setHover(n)} onClick={() => setF({ ...f, rating: n })} className="p-0.5">
                  <Star size={34} className={cn('transition', (hover || f.rating) >= n ? 'text-gold fill-gold scale-105' : 'text-line-strong')} />
                </button>
              ))}
            </div>
            <span className="text-sm font-semibold text-muted">{WORDS[hover || f.rating]}</span>
          </div>
        </div>
        <Field label="Headline" required error={errors.field('title')}><Input value={f.title} maxLength={120} placeholder="Sum it up in a few words" onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Your review" required error={errors.field('body')} hint={`What did you like or dislike? Avoid personal details. ${f.body.trim().length}/3000`}>
          <Textarea rows={5} maxLength={3000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        </Field>
        <ImageUploader value={f.images} onChange={(images) => setF((x) => ({ ...x, images }))} max={5} uploadPath="/reviews/media" label="Add photos (optional)" coverLabel="First" compact
          hint="Real photos of the product you received help other shoppers. Up to 5 photos, JPEG, PNG or WebP, 5 MB each. Please don’t include faces or personal details." />
        {errors.field('images') && <p className="error-text">{errors.field('images')}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={busy} disabled={!f.rating || f.title.trim().length < 3 || f.body.trim().length < 10} onClick={submit}>Publish review</Button>
        </div>
      </div>
    </Modal>
  );
}
