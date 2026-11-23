'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/format';
import type { User } from '@/lib/types';
import { useSession } from './providers';
import { Spinner } from './ui';

export type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean; badge?: number };

/** Signed-in area with a side menu (desktop) and a scrollable tab row (mobile). Pages still rely on the API for access control. */
export function WorkspaceShell({ title, nav, children, header, gate }: { title: string; nav: NavItem[]; children: React.ReactNode; header?: React.ReactNode; gate?: (u: User) => React.ReactNode | null }) {
  const { user, loading } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => { if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`); }, [loading, user, router, pathname]);
  if (loading || !user) return <Spinner label="Checking your session" />;
  const blocked = gate?.(user);
  const active = (n: NavItem) => (n.exact ? pathname === n.href : pathname === n.href || pathname.startsWith(`${n.href}/`));
  return (
    <div className="container-page py-6 md:py-8">
      {header}
      <div className="grid gap-6 lg:grid-cols-[230px_1fr]">
        <aside aria-label={`${title} menu`}>
          <p className="hidden lg:block eyebrow mb-3">{title}</p>
          <nav className="flex lg:flex-col gap-1 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0 pb-2 lg:pb-0 lg:sticky lg:top-28">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} aria-current={active(n) ? 'page' : undefined}
                className={cn('flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[14.5px] font-medium whitespace-nowrap transition', active(n) ? 'bg-emerald text-white' : 'text-ink hover:bg-mint')}>
                <n.icon size={17} className={active(n) ? 'text-gold-light' : 'text-forest'} />{n.label}
                {!!n.badge && <span className={cn('ml-auto rounded-full px-1.5 text-[11px] font-bold', active(n) ? 'bg-gold-light text-deep' : 'bg-gold/20 text-gold-ink')}>{n.badge}</span>}
              </Link>
            ))}
          </nav>
        </aside>
        <section className="min-w-0">{blocked ?? children}</section>
      </div>
    </div>
  );
}
