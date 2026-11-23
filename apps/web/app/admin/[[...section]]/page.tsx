'use client';
import { Suspense, use, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard, Users, Shield, Building2, Store, ClipboardCheck, FolderTree, Tag, Package, Boxes, ShoppingCart, FileText, CreditCard, RotateCcw,
  Wallet, Truck, Undo2, Zap, Ticket, LayoutTemplate, Image as ImageIcon, Bell, LifeBuoy, BarChart3, ScrollText, Settings, LogOut, LineChart, Star,
  PanelLeftClose, PanelLeftOpen, ExternalLink, ChevronDown, ChevronRight, X, CheckCircle2,
} from 'lucide-react';
import { api, post } from '@/lib/api';
import { cn } from '@/lib/format';
import { useSession } from '@/components/providers';
import { Alert, Spinner } from '@/components/ui';
import { GlobalSearch } from '@/components/admin/kit';
import * as P from '@/components/admin/people';
import * as K from '@/components/admin/catalog';
import * as C from '@/components/admin/commerce';
import * as X2 from '@/components/admin/platform';
import { AnalyticsPage } from '@/components/admin/insights';

type Item = { id: string; label: string; icon: typeof Users; cap: string; group: string };
const ITEMS: Item[] = [
  { id: '', label: 'Dashboard', icon: LayoutDashboard, cap: 'dashboard', group: 'Overview' },
  { id: 'analytics', label: 'Analytics', icon: LineChart, cap: 'reports.view', group: 'Overview' },
  { id: 'customers', label: 'People', icon: Users, cap: 'users.view', group: 'People' },
  { id: 'organizations', label: 'Business accounts', icon: Building2, cap: 'users.view', group: 'People' },
  { id: 'sellers', label: 'Sellers', icon: Store, cap: 'users.view', group: 'People' },
  { id: 'staff', label: 'Staff & permissions', icon: Shield, cap: 'staff.manage', group: 'People' },
  { id: 'moderation', label: 'Moderation', icon: ClipboardCheck, cap: 'catalogue.manage', group: 'Catalogue' },
  { id: 'products', label: 'Products', icon: Package, cap: 'catalogue.manage', group: 'Catalogue' },
  { id: 'categories', label: 'Categories & GST', icon: FolderTree, cap: 'catalogue.manage', group: 'Catalogue' },
  { id: 'brands', label: 'Brands', icon: Tag, cap: 'catalogue.manage', group: 'Catalogue' },
  { id: 'inventory', label: 'Inventory', icon: Boxes, cap: 'catalogue.manage', group: 'Catalogue' },
  { id: 'reviews', label: 'Ratings & reviews', icon: Star, cap: 'catalogue.manage', group: 'Catalogue' },
  { id: 'orders', label: 'Orders', icon: ShoppingCart, cap: 'orders.view', group: 'Commerce' },
  { id: 'b2b', label: 'RFQs & POs', icon: FileText, cap: 'b2b.view', group: 'Commerce' },
  { id: 'shipping', label: 'Shipping', icon: Truck, cap: 'orders.view', group: 'Commerce' },
  { id: 'returns', label: 'Returns', icon: Undo2, cap: 'returns.manage', group: 'Commerce' },
  { id: 'promotions', label: 'Flash deals', icon: Zap, cap: 'promotions.manage', group: 'Commerce' },
  { id: 'coupons', label: 'Coupons', icon: Ticket, cap: 'promotions.manage', group: 'Commerce' },
  { id: 'payments', label: 'Payments', icon: CreditCard, cap: 'finance.view', group: 'Finance' },
  { id: 'refunds', label: 'Refunds', icon: RotateCcw, cap: 'finance.view', group: 'Finance' },
  { id: 'finance', label: 'Settlements', icon: Wallet, cap: 'finance.view', group: 'Finance' },
  { id: 'cms', label: 'Homepage & content', icon: LayoutTemplate, cap: 'cms.manage', group: 'Platform' },
  { id: 'media', label: 'Media library', icon: ImageIcon, cap: 'media.manage', group: 'Platform' },
  { id: 'notifications', label: 'Notifications', icon: Bell, cap: 'notifications.send', group: 'Platform' },
  { id: 'support', label: 'Support', icon: LifeBuoy, cap: 'support.manage', group: 'Platform' },
  { id: 'reports', label: 'Reports', icon: BarChart3, cap: 'reports.view', group: 'Reports' },
  { id: 'audit', label: 'Audit log', icon: ScrollText, cap: 'audit.view', group: 'Reports' },
  { id: 'settings', label: 'Settings', icon: Settings, cap: 'settings.manage', group: 'Reports' },
];

type Meta = { roles: string[]; capabilities: string[]; labels: Record<string, string> };
const COLLAPSE_KEY = 'ib-admin-sidebar-collapsed';

/** Closes a popover when the user clicks outside it or presses Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onClick); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [open, close]);
  return ref;
}

function AttentionBell() {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const { data } = useQuery({ queryKey: ['admin', 'attention'], queryFn: () => api<{ items: { label: string; href: string; count: number }[]; total: number; unread: number }>('/admin/attention'), refetchInterval: 60_000 });
  const count = (data?.total ?? 0);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={`Needs attention${count ? `: ${count}` : ''}`} aria-expanded={open}
        className="relative size-10 rounded-full border border-line bg-white grid place-items-center hover:border-forest transition">
        <Bell size={18} />
        {count > 0 && <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-danger text-white text-[11px] font-bold grid place-items-center ring-2 ring-white">{count > 99 ? '99+' : count}</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 card shadow-lift p-2 z-40">
          <p className="px-2 pt-1 pb-2 text-sm font-semibold">Needs attention</p>
          {data?.items.length ? (
            <ul className="grid gap-1">{data.items.map((i) => (
              <li key={i.label}><Link href={i.href} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-cream">
                <span className="min-w-7 h-7 px-1.5 rounded-full bg-[#fdf1d8] text-[#8a5a00] text-xs font-bold grid place-items-center">{i.count}</span>
                <span className="flex-1 text-sm">{i.label}</span><ChevronRight size={15} className="text-muted" />
              </Link></li>
            ))}</ul>
          ) : <p className="flex items-center gap-2 px-2 py-3 text-sm text-muted"><CheckCircle2 size={16} className="text-success" />All caught up. Nothing is waiting on you.</p>}
        </div>
      )}
    </div>
  );
}

function UserMenu({ name, email, role, onSignOut }: { name: string; email: string; role: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Account menu"
        className="flex items-center gap-2.5 rounded-full border border-line bg-white pl-1 pr-3 py-1 hover:border-forest transition">
        <span className="size-8 rounded-full bg-forest text-white grid place-items-center text-sm font-bold">{initials}</span>
        <span className="hidden md:block text-left leading-tight"><span className="block text-sm font-semibold">{name}</span><span className="block text-[11.5px] text-muted">{role}</span></span>
        <ChevronDown size={15} className="text-muted" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 card shadow-lift p-2 z-40">
          <div className="px-2 py-2 border-b border-line mb-1"><p className="font-semibold text-sm">{name}</p><p className="text-xs text-muted truncate">{email}</p><p className="text-xs text-forest font-semibold mt-0.5">{role}</p></div>
          <Link href="/" className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-cream"><ExternalLink size={15} />Open the storefront</Link>
          <button type="button" onClick={onSignOut} className="w-full flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-danger hover:bg-danger-bg"><LogOut size={15} />Sign out</button>
        </div>
      )}
    </div>
  );
}

export default function AdminPage({ params }: { params: Promise<{ section?: string[] }> }) {
  const { section } = use(params);
  const current = section?.[0] ?? '';
  const { user, loading } = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1'); } catch { /* storage unavailable */ } }, []);
  const toggleCollapsed = () => setCollapsed((c) => { try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1'); } catch { /* ignore */ } return !c; });
  // The server is the source of truth for permissions (the Admin can change them per role), so the menu follows it.
  const meta = useQuery({ queryKey: ['admin', 'meta', user?.id], queryFn: () => api<Meta>('/admin/meta'), enabled: !!user?.staffRole, staleTime: 30_000 });
  useEffect(() => { if (!loading && !user) router.replace('/login?portal=staff&next=/admin'); }, [loading, user, router]);
  if (loading || !user) return <Spinner label="Checking staff access" />;
  if (!user.staffRole) return <div className="container-page py-20 text-center"><h1 className="text-3xl">Staff only</h1><p className="text-muted mt-2">This console is for IBazzzar staff. Your account doesn’t have a staff role.</p><Link href="/" className="btn btn-primary mt-6">Back to the store</Link></div>;
  if (meta.error) return <div className="container-page py-20"><Alert>{(meta.error as Error).message}</Alert></div>;
  if (!meta.data) return <Spinner label="Loading your permissions" />;

  const caps = meta.data.capabilities;
  const can = (c: string) => caps.includes(c);
  const isAdmin = meta.data.roles.includes('ADMIN');
  const roleLabel = meta.data.roles.map((r) => meta.data.labels[r] ?? r).join(', ');
  const visible = ITEMS.filter((i) => can(i.cap));
  const active = visible.find((i) => i.id === current) ?? visible[0];
  const groups = [...new Set(visible.map((i) => i.group))];
  const signOut = async () => { await post('/auth/logout'); qc.clear(); router.push(isAdmin ? '/admin/login' : '/login?portal=staff'); };
  const views: Record<string, React.ReactNode> = {
    '': <P.Overview can={can} />, analytics: <AnalyticsPage />, customers: <P.Customers can={can} />, organizations: <P.Organizations can={can} />, sellers: <P.Sellers can={can} />, staff: <P.StaffRoles isAdmin={isAdmin} />,
    moderation: <K.Moderation />, products: <K.Products can={can} />, categories: <K.Categories can={can} />, brands: <K.Brands />, inventory: <K.Inventory />, reviews: <K.Reviews />,
    orders: <C.Orders can={can} />, b2b: <C.B2B />, shipping: <C.Shipping can={can} />, returns: <C.Returns />, promotions: <C.Promotions />, coupons: <C.Coupons />,
    payments: <C.Payments />, refunds: <C.Refunds can={can} />, finance: <C.Finance can={can} />,
    cms: <X2.Cms />, media: <X2.Media />, notifications: <X2.Broadcast />, support: <X2.SupportQueue />, reports: <X2.Reports caps={caps} />, audit: <X2.Audit />, settings: <X2.SettingsPanel canFinance={can('finance.manage')} />,
  };
  // On phones the sidebar is a drawer and always shows labels.
  const narrow = collapsed && !mobileOpen;

  const sidebar = (
    <aside aria-label="Admin navigation"
      className={cn('bg-[#e6f1e7] border-r border-[#d3e4d5] flex flex-col fixed inset-y-0 left-0 z-50 transition-[width,transform] duration-200 print:hidden lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
        mobileOpen ? 'translate-x-0 w-[272px]' : '-translate-x-full w-[272px]', collapsed ? 'lg:w-[84px]' : 'lg:w-[264px]')}>
      <div className={cn('flex items-center gap-2 border-b border-[#d3e4d5]', narrow ? 'lg:flex-col lg:py-3 lg:px-2 px-4 py-4' : 'px-4 py-4')}>
        <Link href="/admin" className={cn('flex flex-col gap-1.5 min-w-0', narrow && 'lg:items-center')} aria-label="IBazzzar admin home">
          {narrow
            ? <Image src="/icon.png" alt="IBazzzar" width={40} height={40} className="size-10 rounded-xl hidden lg:block" />
            : null}
          <Image src="/branding/ibazzzar-logo.png" alt="IBazzzar" width={1621} height={685} sizes="150px" className={cn('h-auto w-[140px] bg-white rounded-xl px-2.5 py-1.5 shadow-sm', narrow && 'lg:hidden')} priority />
          <span className={cn('self-start rounded-full bg-white text-forest text-[10.5px] font-bold tracking-[0.14em] uppercase px-2.5 py-0.5', narrow && 'lg:hidden')}>Admin panel</span>
        </Link>
        <button type="button" onClick={() => (mobileOpen ? setMobileOpen(false) : toggleCollapsed())} aria-label={mobileOpen ? 'Close menu' : collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn('ml-auto size-9 rounded-lg border border-line grid place-items-center text-muted hover:text-forest hover:border-forest shrink-0', narrow && 'lg:ml-0')}>
          {mobileOpen ? <X size={17} /> : collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
      </div>
      <nav className={cn('flex-1 overflow-y-auto py-4 grid content-start gap-4', narrow ? 'lg:px-3 px-3' : 'px-3')}>
        {groups.map((g) => (
          <div key={g}>
            <p className={cn('px-2.5 mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted/80', narrow && 'lg:hidden')}>{g}</p>
            {narrow && <span className="hidden lg:block h-px bg-[#d3e4d5] mx-2 mb-2" aria-hidden />}
            <ul className="grid gap-1">
              {visible.filter((i) => i.group === g).map((i) => {
                const on = active?.id === i.id;
                return (
                  <li key={i.id}>
                    <Link href={`/admin/${i.id}`} onClick={() => setMobileOpen(false)} aria-current={on ? 'page' : undefined} title={narrow ? i.label : undefined} aria-label={narrow ? i.label : undefined}
                      className={cn('group flex items-center gap-3 rounded-xl px-2 py-1.5 text-[14.5px] transition', narrow && 'lg:justify-center',
                        on ? 'bg-forest text-white font-semibold shadow-[0_6px_16px_-8px_rgb(23_75_55/0.7)]' : 'text-ink/85 hover:bg-white/70')}>
                      <span className={cn('size-9 rounded-lg grid place-items-center shrink-0 border transition', on ? 'bg-white/15 border-transparent text-gold-light' : 'bg-white border-line text-forest group-hover:border-forest/40')}><i.icon size={17} /></span>
                      <span className={cn('flex-1 truncate', narrow && 'lg:hidden')}>{i.label}</span>
                      {on && <span className={cn('size-2 rounded-full bg-gold-light mr-1', narrow && 'lg:hidden')} aria-hidden />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className={cn('border-t border-[#d3e4d5] p-3 text-xs text-muted', narrow && 'lg:hidden')}>Signed in as {roleLabel}</div>
    </aside>
  );

  return (
    <div className="admin-console min-h-screen bg-[#f3f6f1] lg:flex print:block print:bg-white">
      {sidebar}
      {mobileOpen && <button className="fixed inset-0 z-40 bg-deep/40 lg:hidden" aria-label="Close menu" onClick={() => setMobileOpen(false)} />}
      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-line print:hidden">
          <div className="flex items-center gap-3 px-4 md:px-6 h-16">
            <button type="button" onClick={() => (window.matchMedia('(min-width: 1024px)').matches ? toggleCollapsed() : setMobileOpen(true))} aria-label="Toggle sidebar"
              className="size-10 rounded-xl border border-line bg-white grid place-items-center text-muted hover:text-forest hover:border-forest shrink-0">
              {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
            <div className="flex-1 min-w-0"><Suspense fallback={null}><GlobalSearch /></Suspense></div>
            <Link href="/" target="_blank" className="hidden sm:inline-flex btn btn-outline btn-sm min-h-10 rounded-xl"><ExternalLink size={15} />Website</Link>
            <AttentionBell />
            <UserMenu name={user.name} email={user.email} role={roleLabel} onSignOut={signOut} />
          </div>
        </header>
        <main className="px-4 md:px-6 py-5 max-w-[1480px] print:p-0">
          <nav aria-label="Breadcrumb" className="mb-3 print:hidden">
            <ol className="flex items-center gap-1.5 text-sm text-muted">
              <li><Link href="/admin" className="hover:text-forest">Admin</Link></li>
              {active && active.id !== '' && active.group !== active.label && <><li aria-hidden><ChevronRight size={14} /></li><li>{active.group}</li></>}
              <li aria-hidden><ChevronRight size={14} /></li>
              <li className="font-semibold text-ink" aria-current="page">{active?.label ?? 'Console'}</li>
            </ol>
          </nav>
          <Suspense fallback={<Spinner />}>{active ? views[active.id] : <p>No sections are available for your role.</p>}</Suspense>
        </main>
      </div>
    </div>
  );
}
