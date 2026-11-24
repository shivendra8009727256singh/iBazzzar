'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/format';
import { useHeroSlides, type HeroSlide } from './site-context';
import { Countdown } from './home-parts';

const INTERVAL = 5500;

export function Slide({ s, index, total, active }: { s: HeroSlide; index: number; total: number; active: boolean }) {
  const dark = s.theme === 'dark';
  const cover = s.layout === 'cover' && s.imageUrl;
  // The first slide's headline is the homepage's main heading.
  const Heading = index === 0 ? 'h1' : 'h2';
  return (
    <div role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${total}: ${s.title}`} aria-hidden={!active}
      className="relative w-full shrink-0 h-full overflow-hidden" style={{ background: s.bgColor ?? (dark ? '#092c20' : '#f8f4e8') }}>
      {cover ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- admin-uploaded artwork of any size */}
          <img src={s.imageUrl!} alt={s.alt} className={cn('absolute inset-0 size-full object-cover object-[70%_center] transition-transform duration-[6000ms] ease-out', active ? 'scale-105' : 'scale-100')} loading={index === 0 ? 'eager' : 'lazy'} />
          <div className={cn('absolute inset-0', dark ? 'bg-[linear-gradient(90deg,rgba(6,30,22,.94)_0%,rgba(6,30,22,.78)_40%,rgba(6,30,22,.15)_75%,transparent_100%)] max-md:bg-[linear-gradient(180deg,rgba(6,30,22,.35)_0%,rgba(6,30,22,.9)_70%)]' : 'bg-[linear-gradient(90deg,rgba(252,250,244,.95)_0%,rgba(252,250,244,.8)_40%,transparent_80%)]')} />
        </>
      ) : (
        <>
          <span className={cn('absolute -right-24 -top-24 size-[420px] rounded-full', dark ? 'bg-white/[0.06]' : 'bg-white/50')} aria-hidden />
          <span className={cn('absolute right-[18%] -bottom-32 size-[300px] rounded-full', dark ? 'bg-gold/15' : 'bg-gold/20')} aria-hidden />
          {s.imageUrl && (
            <div className="absolute right-[4%] md:right-[8%] top-1/2 -translate-y-1/2 w-[38%] md:w-[34%] max-w-[380px] aspect-square">
              {/* eslint-disable-next-line @next/next/no-img-element -- admin-uploaded artwork */}
              <img src={s.imageUrl} alt={s.alt} className={cn('size-full object-contain drop-shadow-[0_24px_30px_rgba(0,0,0,0.25)] transition duration-700', active ? 'opacity-100 translate-y-0 animate-[hero-float_6s_ease-in-out_infinite]' : 'opacity-0 translate-y-6')} />
            </div>
          )}
        </>
      )}
      <div className="relative h-full px-5 sm:px-8 md:px-14 flex items-end md:items-center pb-8 md:pb-0">
        <div className={cn('max-w-[62%] md:max-w-xl transition-all duration-700', active ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4', cover && 'max-w-xl')}>
          {s.eyebrow && <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-[11px] md:text-xs font-bold uppercase tracking-[0.14em]', dark ? 'bg-gold-light/15 text-gold-light' : 'bg-forest/10 text-forest')}>{s.eyebrow}</span>}
          <Heading className={cn('mt-3 text-[26px] leading-[1.1] md:text-[50px] font-display', dark ? 'text-white' : 'text-ink')}>{s.title}</Heading>
          {s.subtitle && <p className={cn('mt-3 text-[14px] md:text-[17px] max-w-lg line-clamp-3', dark ? 'text-white/80' : 'text-ink/70')}>{s.subtitle}</p>}
          {s.endsAt && <p className={cn('mt-3 inline-flex rounded-full px-3 py-1 text-sm font-semibold', dark ? 'bg-white/10 text-white' : 'bg-white text-danger')}><Countdown endsAt={s.endsAt} /></p>}
          {(s.ctaLabel || s.secondaryLabel) && (
            <div className="mt-5 md:mt-7 flex flex-wrap gap-2.5">
              {s.ctaLabel && s.link && <Link href={s.link} tabIndex={active ? 0 : -1} className={cn('btn md:btn-lg', dark ? 'btn-gold' : 'btn-primary')}>{s.ctaLabel}<ArrowRight size={18} /></Link>}
              {s.secondaryLabel && s.secondaryLink && <Link href={s.secondaryLink} tabIndex={active ? 0 : -1} className={cn('btn md:btn-lg hidden sm:inline-flex', dark ? 'btn-on-dark' : 'btn-outline')}>{s.secondaryLabel}</Link>}
            </div>
          )}
        </div>
      </div>
      {s.link && !s.ctaLabel && <Link href={s.link} className="absolute inset-0" aria-label={s.title} tabIndex={active ? 0 : -1} />}
    </div>
  );
}

/** The homepage hero: admin-managed slides with autoplay, arrows (wide screens), swipe and keyboard support. */
export function HeroSlider() {
  const slides = useHeroSlides();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduce, setReduce] = useState(false);
  const drag = useRef<{ x: number; t: number } | null>(null);
  const total = slides.length;
  const go = useCallback((i: number) => setIndex(((i % total) + total) % total), [total]);
  useEffect(() => { const m = window.matchMedia('(prefers-reduced-motion: reduce)'); setReduce(m.matches); const on = () => setReduce(m.matches); m.addEventListener('change', on); return () => m.removeEventListener('change', on); }, []);
  // Autoplay pauses while the pointer or keyboard focus is on the slider, and stays off for reduced-motion users.
  const playing = total > 1 && !paused && !reduce;
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => go(index + 1), INTERVAL);
    return () => clearTimeout(t);
  }, [playing, index, go]);
  if (!total) return null;

  return (
    <section aria-roledescription="carousel" aria-label="Offers and highlights" className="relative group/hero select-none"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}
      onKeyDown={(e) => { if (e.key === 'ArrowRight') go(index + 1); if (e.key === 'ArrowLeft') go(index - 1); }}>
      <div className="relative overflow-hidden h-[340px] sm:h-[380px] md:h-[440px] lg:h-[460px] touch-pan-y"
        onPointerDown={(e) => { drag.current = { x: e.clientX, t: Date.now() }; }}
        onPointerUp={(e) => { const d = drag.current; drag.current = null; if (!d) return; const dx = e.clientX - d.x; if (Math.abs(dx) > 50 && Date.now() - d.t < 800) go(index + (dx < 0 ? 1 : -1)); }}>
        <div className="flex h-full transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none" style={{ transform: `translateX(-${index * 100}%)` }} aria-live={playing ? 'off' : 'polite'}>
          {slides.map((s, i) => <Slide key={s.id} s={s} index={i} total={total} active={i === index} />)}
        </div>
      </div>
      {total > 1 && (
        <>
          <button type="button" aria-label="Previous slide" onClick={() => go(index - 1)} className="hidden md:grid absolute left-4 top-1/2 -translate-y-1/2 size-11 place-items-center rounded-full bg-white/90 shadow-lift text-ink opacity-0 group-hover/hero:opacity-100 focus:opacity-100 transition hover:scale-105"><ChevronLeft size={22} /></button>
          <button type="button" aria-label="Next slide" onClick={() => go(index + 1)} className="hidden md:grid absolute right-4 top-1/2 -translate-y-1/2 size-11 place-items-center rounded-full bg-white/90 shadow-lift text-ink opacity-0 group-hover/hero:opacity-100 focus:opacity-100 transition hover:scale-105"><ChevronRight size={22} /></button>
        </>
      )}
    </section>
  );
}
