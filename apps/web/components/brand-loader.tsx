'use client';
import { ShoppingBag, Tag, Gift, Truck } from 'lucide-react';
import { cn } from '@/lib/format';
import { useSite } from './site-context';

/** Messages that rotate under the full-screen loader when no specific label is given. */
const MESSAGES = ['Curating today’s best deals', 'Checking prices & stock', 'Packing the good stuff', 'Almost there'];
const ORBIT = [ShoppingBag, Tag, Gift, Truck];

/**
 * The IBazzzar "bazaar orbit" loader: the logo mark under a sweeping gloss, a gold comet ring racing around it,
 * and shopping icons (bag, tag, gift, delivery) orbiting the mark and lighting up in turn. Full-screen loads add
 * a progress sweep and rotating messages. Motion is calmed for people who ask their device to reduce motion
 * (see .ib-loader rules in globals.css). Used for page loads (full screen) and wherever a section is loading.
 */
export function BrandLoader({ label = 'Loading', size = 'md', fullScreen = false, className }: { label?: string; size?: 'sm' | 'md' | 'lg'; fullScreen?: boolean; className?: string }) {
  const site = useSite();
  const px = { sm: 64, md: 128, lg: 176 }[size];
  const withOrbit = size !== 'sm';
  const mark = Math.round(px * (withOrbit ? 0.42 : 0.66));
  const chip = Math.round(px * 0.2);
  const radius = px / 2 - chip / 2 - 2;
  const rotating = fullScreen && label === 'Loading';
  const loader = (
    <div role="status" aria-live="polite" className={cn('ib-loader flex flex-col items-center justify-center gap-5', !fullScreen && (size === 'sm' ? 'py-8' : 'py-12 min-h-[42vh]'), className)}>
      <span className="sr-only">{label}</span>
      <div className="relative grid place-items-center" style={{ width: px, height: px }} aria-hidden>
        {/* Halo */}
        <span className="ib-loader-glow absolute inset-[18%] rounded-full bg-gold/35 blur-2xl" />
        {/* Faint orbit track */}
        {withOrbit && <span className="absolute rounded-full border border-dashed border-forest/15" style={{ inset: chip / 2 + 2 }} />}
        {/* Gold comet ring around the mark */}
        <span className="ib-loader-comet absolute rounded-full" style={{ inset: withOrbit ? px * 0.18 : 0 }}>
          <span className="ib-loader-comet-head" />
        </span>
        {/* Orbiting shopping icons, kept upright while they travel */}
        {withOrbit && (
          <span className="ib-loader-orbit absolute inset-0">
            {ORBIT.map((Icon, i) => (
              <span key={i} className="absolute left-1/2 top-1/2" style={{ width: chip, height: chip, margin: -chip / 2, transform: `rotate(${i * 90}deg) translateY(-${radius}px) rotate(-${i * 90}deg)` }}>
                <span className="ib-loader-upright block size-full">
                  <span className="ib-loader-chip grid size-full place-items-center rounded-full bg-white text-forest ring-1 ring-gold/40 shadow-[0_6px_14px_-6px_rgb(9_44_32/0.45)]" style={{ animationDelay: `${i * 0.6}s` }}>
                    <Icon size={Math.round(chip * 0.5)} strokeWidth={2.2} />
                  </span>
                </span>
              </span>
            ))}
          </span>
        )}
        {/* The logo mark with a gloss sweep */}
        <span className="ib-loader-mark relative rounded-full overflow-hidden bg-white ring-[3px] ring-white shadow-[0_10px_28px_-8px_rgb(9_44_32/0.55)]" style={{ width: mark, height: mark }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- admin-uploaded logo mark */}
          <img src={site.logoMarkUrl} alt="" width={mark} height={mark} className="size-full object-cover" />
          <span className="ib-loader-gloss absolute inset-0" />
        </span>
      </div>

      <div className="text-center grid justify-items-center gap-2" aria-hidden>
        <p className={cn('ib-loader-word font-display font-semibold tracking-wide', size === 'sm' ? 'text-[15px]' : 'text-[20px]')}>{site.siteName}</p>
        {fullScreen && <span className="ib-loader-bar block h-[3px] w-40 rounded-full bg-forest/10 overflow-hidden" />}
        {rotating ? (
          <span className="grid text-[13px] text-muted">
            {MESSAGES.map((m, i) => <span key={m} className="ib-loader-msg [grid-area:1/1]" style={{ animationDelay: `${i * 1.8}s` }}>{m}</span>)}
          </span>
        ) : (
          <p className="text-[12.5px] text-muted">{label}<span className="ib-loader-dots" /></p>
        )}
      </div>
    </div>
  );
  if (!fullScreen) return loader;
  return (
    <div className="ib-loader-backdrop fixed inset-0 z-[60] grid place-items-center animate-[ib-fade-in_0.25s_ease-out_0.15s_both]">
      {loader}
    </div>
  );
}
