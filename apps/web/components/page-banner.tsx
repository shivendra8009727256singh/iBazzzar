import { cn } from '@/lib/format';

const TONES = {
  emerald: 'bg-[linear-gradient(120deg,#062a1e_0%,#0d3d2c_45%,#1e5a42_100%)] text-white',
  deal: 'bg-[linear-gradient(120deg,#5c1010_0%,#a3201a_48%,#c99a3d_100%)] text-white',
  royal: 'bg-[linear-gradient(120deg,#0f2742_0%,#1d4f7a_55%,#3b7cb5_100%)] text-white',
  ivory: 'bg-[linear-gradient(120deg,#fbf6e9_0%,#f4ecd6_55%,#e6efe9_100%)] text-ink',
} as const;

export type BannerStat = { label: string; value: React.ReactNode };

/** Large page header used across the storefront: gradient band, decorative rings, optional stats and actions. */
export function PageBanner({ eyebrow, title, description, icon, tone = 'emerald', stats, actions, children, className }: {
  eyebrow?: string; title: React.ReactNode; description?: React.ReactNode; icon?: React.ReactNode; tone?: keyof typeof TONES;
  stats?: BannerStat[]; actions?: React.ReactNode; children?: React.ReactNode; className?: string;
}) {
  const light = tone === 'ivory';
  return (
    <section className={cn('relative overflow-hidden rounded-3xl shadow-lift', TONES[tone], className)}>
      <span className={cn('absolute -right-20 -top-24 size-80 rounded-full', light ? 'bg-white/60' : 'bg-white/[0.07]')} aria-hidden />
      <span className={cn('absolute right-[22%] -bottom-28 size-64 rounded-full blur-2xl', light ? 'bg-gold/25' : 'bg-gold/20')} aria-hidden />
      <span className={cn('absolute inset-0 opacity-[0.07] bg-[radial-gradient(circle_at_1px_1px,currentColor_1px,transparent_0)] [background-size:22px_22px]')} aria-hidden />
      <div className="relative grid gap-6 p-6 md:p-10 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            {icon && <span className={cn('size-12 shrink-0 rounded-2xl grid place-items-center', light ? 'bg-white text-forest shadow-card' : 'bg-white/12 text-gold-light')}>{icon}</span>}
            {eyebrow && <span className={cn('inline-flex rounded-full px-3 py-1 text-[11px] md:text-xs font-bold uppercase tracking-[0.14em]', light ? 'bg-forest/10 text-forest' : 'bg-gold-light/15 text-gold-light')}>{eyebrow}</span>}
          </div>
          <h1 className={cn('mt-4 text-[30px] leading-[1.1] md:text-[46px]', light ? 'text-ink' : 'text-white')}>{title}</h1>
          {description && <p className={cn('mt-3 max-w-2xl text-[15px] md:text-[17px]', light ? 'text-ink/70' : 'text-white/78')}>{description}</p>}
          {actions && <div className="mt-6 flex flex-wrap gap-3">{actions}</div>}
          {children}
        </div>
        {stats?.length ? (
          <dl className={cn('grid gap-2.5 lg:grid-cols-1 lg:min-w-[200px]', stats.length >= 3 ? 'grid-cols-3' : 'grid-cols-2')}>
            {stats.map((s) => (
              <div key={s.label} className={cn('rounded-2xl px-3 sm:px-4 py-3 backdrop-blur min-w-0', light ? 'bg-white/80 border border-line' : 'bg-white/[0.08] border border-white/12')}>
                <dt className={cn('text-[11.5px] sm:text-[12px] font-medium truncate', light ? 'text-muted' : 'text-white/65')}>{s.label}</dt>
                <dd className={cn('text-lg sm:text-xl md:text-2xl font-bold tabular-nums truncate', light ? 'text-ink' : 'text-white')}>{s.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </section>
  );
}

/** White card section with a title row, used to group content below a banner. */
export function Panel({ title, subtitle, action, children, className, id }: { title?: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn('rounded-3xl bg-white border border-line shadow-card p-4 md:p-6 min-w-0', className)}>
      {(title || action) && (
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div className="min-w-0">{title && <h2 className="text-2xl md:text-[28px]">{title}</h2>}{subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}</div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
