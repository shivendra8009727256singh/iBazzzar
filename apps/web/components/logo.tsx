'use client';
import Link from 'next/link';
import { cn } from '@/lib/format';
import { useSite } from './site-context';

// The logo comes from Admin → Settings → Brand & site, so a change there updates the header, footer, sign-in pages,
// invoices and the admin console at once. It is shown as supplied (never recoloured); on dark surfaces it sits on an
// ivory plate because logos usually have a light background.
export function Logo({ size = 'header', plate = false, className, href = '/' }: { size?: 'header' | 'footer' | 'auth'; plate?: boolean; className?: string; href?: string | null }) {
  const site = useSite();
  const heights = { header: 'h-[44px] md:h-[56px]', footer: 'h-[64px]', auth: 'h-[78px]' };
  // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded logo of unknown size; a plain img keeps its aspect ratio
  const img = <img src={site.logoUrl} alt={`${site.siteName}${site.tagline ? ` — ${site.tagline}` : ''}`} className={cn('w-auto max-w-[220px] object-contain', heights[size])} />;
  const cls = cn('inline-flex shrink-0 items-center', plate && 'bg-ivory rounded-xl px-3 py-2', className);
  return href ? <Link href={href} aria-label={`${site.siteName} home`} className={cls}>{img}</Link> : <span className={cls}>{img}</span>;
}

/** The small square logo mark (loader, collapsed admin sidebar, avatars). */
export function LogoMark({ size = 40, className }: { size?: number; className?: string }) {
  const site = useSite();
  // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded mark
  return <img src={site.logoMarkUrl} alt={site.siteName} width={size} height={size} className={cn('object-cover', className)} style={{ width: size, height: size }} />;
}
