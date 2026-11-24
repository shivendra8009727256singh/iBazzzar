'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import * as Popover from '@radix-ui/react-popover';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Heart, ShoppingBag, User as UserIcon, Menu, X, Headphones, Truck, Store, Building2, LayoutGrid, ChevronDown, Bell,
  Home, Search, Package, LogOut, Shield, Briefcase, Sparkles,
} from 'lucide-react';
import { api, post } from '@/lib/api';
import { cn } from '@/lib/format';
import type { Category, Notification } from '@/lib/types';
import { useCart, useSession } from './providers';
import { Logo } from './logo';
import { SearchBox } from './search-box';
import { useSite } from './site-context';

/** The top strip message, set in Admin → Settings → Brand & site. */
function Announcement() {
  const site = useSite();
  if (!site.announcement) return <span />;
  const body = <><Sparkles size={14} className="text-gold-light shrink-0" /><span className="truncate">{site.announcement}</span></>;
  return site.announcementLink ? <Link href={site.announcementLink} className="flex items-center gap-2 min-w-0 hover:text-white">{body}</Link> : <span className="flex items-center gap-2 min-w-0">{body}</span>;
}

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/deals', label: 'Deals' },
  { href: '/brands', label: 'Brands' },
  { href: '/sellers', label: 'Stores' },
  { href: '/wholesale', label: 'Wholesale' },
  { href: '/sell', label: 'Become a Seller' },
];

function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: () => api<{ categories: Category[] }>('/categories').then((r) => r.categories), staleTime: 5 * 60_000 });
}

function ModeToggle({ compact }: { compact?: boolean }) {
  const { mode, setMode } = useCart();
  return (
    <div role="radiogroup" aria-label="Shopping mode" className={cn('inline-flex rounded-lg bg-mint p-0.5', compact ? 'text-xs' : 'text-[13px]')}>
      {(['RETAIL', 'BUSINESS'] as const).map((m) => (
        <button key={m} role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
          className={cn('rounded-md px-2.5 py-1 font-semibold transition', mode === m ? 'bg-white text-emerald shadow-sm' : 'text-muted hover:text-ink')}>
          {m === 'RETAIL' ? 'Personal' : 'Business'}
        </button>
      ))}
    </div>
  );
}

function AccountMenu() {
  const { user } = useSession();
  const qc = useQueryClient();
  const router = useRouter();
  const { data: notes } = useQuery({ queryKey: ['notifications'], queryFn: () => api<{ notifications: Notification[]; unread: number }>('/notifications'), enabled: !!user, refetchInterval: 60_000 });
  if (!user) {
    return (
      <Link href="/login" className="btn btn-ghost btn-sm gap-2"><UserIcon size={18} /><span className="hidden lg:inline">Sign in</span></Link>
    );
  }
  const signOut = async () => { await post('/auth/logout'); qc.clear(); router.push('/'); router.refresh(); };
  const item = 'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14.5px] outline-none data-[highlighted]:bg-mint cursor-pointer';
  return (
    <>
      <Link href="/account/notifications" className="btn btn-ghost btn-icon relative" aria-label={`Notifications${notes?.unread ? `, ${notes.unread} unread` : ''}`}>
        <Bell size={19} />
        {!!notes?.unread && <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-gold text-[10px] font-bold text-deep grid place-items-center">{notes.unread > 9 ? '9+' : notes.unread}</span>}
      </Link>
      <Dropdown.Root>
        <Dropdown.Trigger className="btn btn-ghost btn-sm gap-2" aria-label="Account menu">
          <span className="size-7 rounded-full bg-emerald text-gold-light grid place-items-center text-[13px] font-bold">{user.name.charAt(0).toUpperCase()}</span>
          <span className="hidden lg:inline max-w-[110px] truncate">{user.name.split(' ')[0]}</span><ChevronDown size={15} />
        </Dropdown.Trigger>
        <Dropdown.Portal>
          <Dropdown.Content align="end" sideOffset={8} className="z-50 w-64 card p-1.5 animate-fade-up">
            <div className="px-3 py-2 border-b border-line mb-1"><p className="font-semibold truncate">{user.name}</p><p className="text-xs text-muted truncate">{user.email}</p></div>
            <Dropdown.Item asChild><Link href="/account" className={item}><UserIcon size={16} />My account</Link></Dropdown.Item>
            <Dropdown.Item asChild><Link href="/account/orders" className={item}><Package size={16} />Orders</Link></Dropdown.Item>
            <Dropdown.Item asChild><Link href="/wishlist" className={item}><Heart size={16} />Wishlist</Link></Dropdown.Item>
            {user.organizations.length > 0 && <Dropdown.Item asChild><Link href="/business" className={item}><Briefcase size={16} />Business account</Link></Dropdown.Item>}
            {user.stores.length > 0 && <Dropdown.Item asChild><Link href="/seller" className={item}><Store size={16} />Seller hub</Link></Dropdown.Item>}
            {user.staffRole && <Dropdown.Item asChild><Link href="/admin" className={item}><Shield size={16} />Admin console</Link></Dropdown.Item>}
            <Dropdown.Separator className="my-1 h-px bg-line" />
            <Dropdown.Item onSelect={signOut} className={item}><LogOut size={16} />Sign out</Dropdown.Item>
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
    </>
  );
}

function CategoryMenu() {
  const { data } = useCategories();
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="inline-flex items-center gap-2 rounded-lg bg-emerald text-white px-3.5 py-2 text-sm font-semibold hover:bg-forest">
        <LayoutGrid size={16} />All categories<ChevronDown size={15} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={10} className="z-50 card p-5 w-[min(760px,calc(100vw-32px))] animate-fade-up">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
            {(data ?? []).filter((c) => !c.parentId).map((c) => (
              <Link key={c.id} href={`/products?category=${c.slug}`} onClick={() => setOpen(false)} className="rounded-lg p-3 hover:bg-mint group">
                <p className="font-semibold group-hover:text-emerald">{c.name}</p>
                <p className="text-xs text-muted line-clamp-1">{c.description}</p>
              </Link>
            ))}
          </div>
          <div className="border-t border-line mt-4 pt-4 flex flex-wrap gap-3 text-sm">
            <Link href="/products" onClick={() => setOpen(false)} className="link">Browse everything →</Link>
            <Link href="/wholesale" onClick={() => setOpen(false)} className="link">Wholesale catalogue →</Link>
            <Link href="/deals" onClick={() => setOpen(false)} className="link">Today’s deals →</Link>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function MobileMenu() {
  const [open, setOpen] = useState(false);
  const { data } = useCategories();
  const { user } = useSession();
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="btn btn-ghost btn-icon md:hidden" aria-label="Open menu"><Menu size={22} /></Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-deep/50" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-[86vw] max-w-sm bg-white overflow-y-auto p-5 shadow-lift">
          <div className="flex items-center justify-between mb-5">
            <Logo size="header" />
            <Dialog.Close className="btn btn-ghost btn-icon" aria-label="Close menu"><X size={20} /></Dialog.Close>
          </div>
          <Dialog.Title className="sr-only">Menu</Dialog.Title>
          <Dialog.Description className="sr-only">Browse categories and pages</Dialog.Description>
          <div className="mb-5"><ModeToggle /></div>
          <nav className="grid gap-1" aria-label="Main">
            {NAV.map((n) => <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 font-semibold hover:bg-mint">{n.label}</Link>)}
          </nav>
          <p className="eyebrow mt-6 mb-2">Categories</p>
          <div className="grid gap-1">
            {(data ?? []).filter((c) => !c.parentId).map((c) => <Link key={c.id} href={`/products?category=${c.slug}`} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 hover:bg-mint">{c.name}</Link>)}
          </div>
          {!user && <div className="mt-6 grid gap-2"><Link href="/login" onClick={() => setOpen(false)} className="btn btn-primary">Sign in</Link><Link href="/register" onClick={() => setOpen(false)} className="btn btn-outline">Create account</Link></div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Header() {
  const pathname = usePathname();
  const { count, wishlist } = useCart();
  const workspace = /^\/(admin|seller|business)(\/|$)/.test(pathname);
  if (/^\/(admin)(\/|$)/.test(pathname)) return null;
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-line">
      {!workspace && (
        <div className="bg-emerald text-[#dfe9df] text-[13px]">
          <div className="container-page flex h-9 items-center justify-between gap-4">
            <Announcement />
            <nav className="hidden md:flex items-center gap-5" aria-label="Utility">
              <Link href="/support" className="flex items-center gap-1.5 hover:text-white"><Headphones size={14} />Customer support</Link>
              <Link href="/account/orders" className="flex items-center gap-1.5 hover:text-white"><Truck size={14} />Track order</Link>
              <Link href="/wholesale" className="flex items-center gap-1.5 hover:text-white"><Building2 size={14} />Business buying</Link>
              <Link href="/sell" className="flex items-center gap-1.5 text-gold-light hover:text-white"><Store size={14} />Sell with us</Link>
            </nav>
          </div>
        </div>
      )}
      <div className="container-page flex items-center gap-3 md:gap-6 h-[64px] md:h-[76px]">
        <MobileMenu />
        <Logo />
        <SearchBox className="hidden md:block flex-1 max-w-2xl" />
        <div className="ml-auto flex items-center gap-1">
          <div className="hidden lg:block mr-2"><ModeToggle /></div>
          <AccountMenu />
          <Link href="/wishlist" className="btn btn-ghost btn-icon relative hidden sm:inline-flex" aria-label={`Wishlist, ${wishlist.size} items`}>
            <Heart size={19} />
            {wishlist.size > 0 && <span className="absolute top-1 right-1 size-4 rounded-full bg-emerald text-[10px] font-bold text-white grid place-items-center">{wishlist.size}</span>}
          </Link>
          <Link href="/cart" className="btn btn-ghost btn-sm relative gap-2" aria-label={`Cart, ${count} items`}>
            <ShoppingBag size={20} />
            <span className="hidden lg:inline">Cart</span>
            {count > 0 && <span className="absolute -top-0.5 left-6 min-w-5 h-5 px-1 rounded-full bg-gold text-[11px] font-bold text-deep grid place-items-center">{count > 99 ? '99+' : count}</span>}
          </Link>
        </div>
      </div>
      <div className="md:hidden container-page pb-3"><SearchBox /></div>
      {!workspace && (
        <div className="hidden md:block border-t border-line">
          <div className="container-page flex items-center gap-6 h-12">
            <CategoryMenu />
            <nav className="flex items-center gap-1" aria-label="Main">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} aria-current={pathname === n.href ? 'page' : undefined}
                  className={cn('rounded-lg px-3 py-1.5 text-[14.5px] font-medium hover:bg-mint', pathname === n.href && 'text-emerald font-semibold bg-mint')}>
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto lg:hidden"><ModeToggle compact /></div>
          </div>
        </div>
      )}
    </header>
  );
}

export function MobileTabBar() {
  const pathname = usePathname();
  const { count } = useCart();
  if (/^\/(admin|checkout)/.test(pathname)) return null;
  const tabs = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/products', label: 'Shop', icon: Search },
    { href: '/wholesale', label: 'Business', icon: Building2 },
    { href: '/cart', label: 'Cart', icon: ShoppingBag, badge: count },
    { href: '/account', label: 'Account', icon: UserIcon },
  ];
  return (
    <nav aria-label="Quick navigation" className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-line pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-5">
        {tabs.map(({ href, label, icon: Icon, badge }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={cn('relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold', active ? 'text-emerald' : 'text-muted')}>
              <Icon size={20} />{label}
              {!!badge && <span className="absolute top-1 left-[calc(50%+6px)] min-w-4 h-4 px-1 rounded-full bg-gold text-[10px] text-deep grid place-items-center">{badge}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
