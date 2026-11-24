import Image from 'next/image';
import { cn } from '@/lib/format';

/**
 * The IBazzzar loader: the iB mark inside a spinning gold ring with a soft glow and a shimmering wordmark.
 * Used for page loads (full screen) and wherever a section is loading (inline). Motion is calmed for people
 * who ask their device to reduce motion (see .ib-loader rules in globals.css).
 */
export function BrandLoader({ label = 'Loading', size = 'md', fullScreen = false, className }: { label?: string; size?: 'sm' | 'md' | 'lg'; fullScreen?: boolean; className?: string }) {
  const px = { sm: 56, md: 84, lg: 112 }[size];
  const mark = Math.round(px * 0.62);
  const loader = (
    <div role="status" aria-live="polite" className={cn('ib-loader flex flex-col items-center justify-center gap-4', !fullScreen && (size === 'sm' ? 'py-8' : 'py-12 min-h-[42vh]'), className)}>
      <div className="relative grid place-items-center" style={{ width: px, height: px }}>
        {/* Soft glow behind the mark */}
        <span className="ib-loader-glow absolute inset-[12%] rounded-full bg-gold/30 blur-xl" aria-hidden />
        {/* Track and spinning gold arc */}
        <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden>
          <defs>
            <linearGradient id="ib-loader-arc" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#e7be67" />
              <stop offset="55%" stopColor="#c99a3d" />
              <stop offset="100%" stopColor="#c99a3d" stopOpacity="0" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="3" className="text-forest/10" />
          <g className="ib-loader-spin" style={{ transformOrigin: '50% 50%' }}>
            <circle cx="50" cy="50" r="45" fill="none" stroke="url(#ib-loader-arc)" strokeWidth="4" strokeLinecap="round" strokeDasharray="160 283" />
            <circle cx="50" cy="5" r="3.6" fill="#e7be67" />
          </g>
          <g className="ib-loader-spin-reverse" style={{ transformOrigin: '50% 50%' }}>
            <circle cx="50" cy="50" r="38" fill="none" stroke="#174b37" strokeOpacity="0.35" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="40 199" />
          </g>
        </svg>
        {/* The iB mark */}
        <span className="ib-loader-mark relative rounded-full overflow-hidden bg-white shadow-[0_6px_18px_-6px_rgb(9_44_32/0.45)] ring-2 ring-white" style={{ width: mark, height: mark }}>
          <Image src="/icon.png" alt="" width={mark} height={mark} className="size-full object-cover" priority />
        </span>
      </div>
      <div className="text-center">
        <p className="ib-loader-word font-display font-semibold tracking-wide text-[17px]" aria-hidden>IBazzzar</p>
        <p className="text-[12.5px] text-muted mt-0.5">{label}<span className="ib-loader-dots" aria-hidden /></p>
      </div>
    </div>
  );
  if (!fullScreen) return loader;
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-[#f8f7f1]/85 backdrop-blur-sm animate-[ib-fade-in_0.25s_ease-out_0.15s_both]">{loader}</div>;
}
