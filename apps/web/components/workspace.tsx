'use client';
import { BrandLoader } from './brand-loader';
import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/format';
import type { User } from '@/lib/types';
import { useSession } from './providers';

export type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean; badge?: number };

/** Signed-in area with a side menu (desktop) and a scrollable tab row (mobile). Pages still rely on the API for access control. */
export function WorkspaceShell({ title, nav, children, header, gate }: { title: string; nav: NavItem[]; children: React.ReactNode; header?: React.ReactNode; gate?: (u: User) => React.ReactNode | null }) {
  const { user, loading } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => { if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`); }, [loading, user, router, pathname]);
  if (loading || !user) return <BrandLoader fullScreen size="lg" label="Checking your session" />;
  const blocked = gate?.(user);
  const active = (n: NavItem) => (n.exact ? pathname === n.href : pathname === n.href || pathname.startsWith(`${n.href}/`));
  return (
    <div className="container-page py-6 md:py-8">
      {header}
      <div className="grid gap-6 lg:grid-cols-[230px_1fr]">
        <aside aria-label={`${title} menu`} className="min-w-0">
          <div className="lg:sticky lg:top-28 lg:rounded-3xl lg:bg-white lg:border lg:border-line lg:shadow-card lg:p-3">
          <div className="hidden lg:flex items-center gap-3 px-2 pt-1 pb-3 mb-2 border-b border-line">
            <span className="size-10 shrink-0 rounded-xl bg-gradient-to-br from-emerald to-forest text-gold-light grid place-items-center font-display">{user.name.charAt(0).toUpperCase()}</span>
            <span className="min-w-0"><span className="block font-semibold text-[14.5px] truncate">{user.name}</span><span className="block text-[12px] text-muted">{title}</span></span>
          </div>
          <nav className="flex lg:flex-col gap-1.5 lg:gap-0.5 overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0 pb-2 lg:pb-0">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} aria-current={active(n) ? 'page' : undefined}
                className={cn('flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[14.5px] font-medium whitespace-nowrap transition max-lg:border', active(n) ? 'bg-emerald text-white max-lg:border-emerald shadow-card' : 'text-ink hover:bg-mint max-lg:bg-white max-lg:border-line')}>
                <n.icon size={17} className={active(n) ? 'text-gold-light' : 'text-forest'} />{n.label}
                {!!n.badge && <span className={cn('ml-auto rounded-full px-1.5 text-[11px] font-bold', active(n) ? 'bg-gold-light text-deep' : 'bg-gold/20 text-gold-ink')}>{n.badge}</span>}
              </Link>
            ))}
          </nav>
          </div>
        </aside>
        <section className="min-w-0">{blocked ?? children}</section>
      </div>
    </div>
  );
}
