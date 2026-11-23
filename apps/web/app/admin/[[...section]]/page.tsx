'use client';
import { Suspense, use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard, Users, Shield, Building2, Store, ClipboardCheck, FolderTree, Tag, Package, Boxes, ShoppingCart, FileText, CreditCard, RotateCcw,
  Wallet, Truck, Undo2, Zap, Ticket, LayoutTemplate, Image as ImageIcon, Bell, LifeBuoy, BarChart3, ScrollText, Settings, LogOut, Menu, X, LineChart, Star,
} from 'lucide-react';
import { api, post } from '@/lib/api';
import { cn } from '@/lib/format';
import { useSession } from '@/components/providers';
import { Logo } from '@/components/logo';
import { Alert, Spinner } from '@/components/ui';
import { GlobalSearch } from '@/components/admin/kit';
import * as P from '@/components/admin/people';
import * as K from '@/components/admin/catalog';
import * as C from '@/components/admin/commerce';
import * as X2 from '@/components/admin/platform';
import { AnalyticsPage } from '@/components/admin/insights';

type Item = { id: string; label: string; icon: typeof Users; cap: string; group: string };
const ITEMS: Item[] = [
  { id: '', label: 'Overview', icon: LayoutDashboard, cap: 'dashboard', group: 'Marketplace' },
  { id: 'analytics', label: 'Analytics', icon: LineChart, cap: 'reports.view', group: 'Marketplace' },
  { id: 'customers', label: 'People', icon: Users, cap: 'users.view', group: 'People' },
  { id: 'organizations', label: 'Business accounts', icon: Building2, cap: 'users.view', group: 'People' },
  { id: 'sellers', label: 'Sellers', icon: Store, cap: 'users.view', group: 'People' },
  { id: 'staff', label: 'Staff & permissions', icon: Shield, cap: 'staff.manage', group: 'People' },
  { id: 'moderation', label: 'Moderation', icon: ClipboardCheck, cap: 'catalogue.manage', group: 'Catalogue' },
  { id: 'products', label: 'Products', icon: Package, cap: 'catalogue.manage', group: 'Catalogue' },
  { id: 'categories', label: 'Categories & GST', icon: FolderTree, cap: 'catalogue.manage', group: 'Catalogue' },
  { id: 'brands', label: 'Brands', icon: Tag, cap: 'catalogue.manage', group: 'Catalogue' },
  { id: 'inventory', label: 'Inventory', icon: Boxes, cap: 'catalogue.manage', group: 'Catalogue' },
  { id: 'reviews', label: 'Reviews', icon: Star, cap: 'catalogue.manage', group: 'Catalogue' },
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
  { id: 'reports', label: 'Reports', icon: BarChart3, cap: 'reports.view', group: 'Platform' },
  { id: 'audit', label: 'Audit log', icon: ScrollText, cap: 'audit.view', group: 'Platform' },
  { id: 'settings', label: 'Settings', icon: Settings, cap: 'settings.manage', group: 'Platform' },
];

type Meta = { roles: string[]; capabilities: string[]; labels: Record<string, string> };

export default function AdminPage({ params }: { params: Promise<{ section?: string[] }> }) {
  const { section } = use(params);
  const current = section?.[0] ?? '';
  const { user, loading } = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const [menu, setMenu] = useState(false);
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
  const visible = ITEMS.filter((i) => can(i.cap));
  const active = visible.find((i) => i.id === current) ?? visible[0];
  const groups = [...new Set(visible.map((i) => i.group))];
  const views: Record<string, React.ReactNode> = {
    '': <P.Overview can={can} />, analytics: <AnalyticsPage />, customers: <P.Customers can={can} />, organizations: <P.Organizations can={can} />, sellers: <P.Sellers can={can} />, staff: <P.StaffRoles isAdmin={isAdmin} />,
    moderation: <K.Moderation />, products: <K.Products can={can} />, categories: <K.Categories can={can} />, brands: <K.Brands />, inventory: <K.Inventory />, reviews: <K.Reviews />,
    orders: <C.Orders can={can} />, b2b: <C.B2B />, shipping: <C.Shipping can={can} />, returns: <C.Returns />, promotions: <C.Promotions />, coupons: <C.Coupons />,
    payments: <C.Payments />, refunds: <C.Refunds can={can} />, finance: <C.Finance can={can} />,
    cms: <X2.Cms />, media: <X2.Media />, notifications: <X2.Broadcast />, support: <X2.SupportQueue />, reports: <X2.Reports caps={caps} />, audit: <X2.Audit />, settings: <X2.SettingsPanel canFinance={can('finance.manage')} />,
  };
  const nav = (
    <nav className="grid gap-5" aria-label="Admin sections">
      {groups.map((g) => (
        <div key={g}>
          <p className="px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-gold-light/70 mb-1.5">{g}</p>
          {visible.filter((i) => i.group === g).map((i) => (
            <Link key={i.id} href={`/admin/${i.id}`} onClick={() => setMenu(false)} aria-current={active?.id === i.id ? 'page' : undefined}
              className={cn('flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] transition', active?.id === i.id ? 'bg-white/12 text-white font-semibold' : 'text-white/70 hover:bg-white/6 hover:text-white')}>
              <i.icon size={16} className={active?.id === i.id ? 'text-gold-light' : ''} />{i.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
  return (
    <div className="min-h-screen bg-[#f6f7f4] lg:grid lg:grid-cols-[250px_1fr] print:block print:bg-white">
      <aside className={cn('surface-emerald lg:sticky lg:top-0 lg:h-screen overflow-y-auto p-4 fixed inset-y-0 left-0 z-50 w-[260px] transition-transform lg:translate-x-0 print:hidden', menu ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex items-center justify-between mb-6"><Logo size="header" plate /><button className="lg:hidden text-white p-1" onClick={() => setMenu(false)} aria-label="Close menu"><X size={20} /></button></div>
        {nav}
        <div className="mt-8 border-t border-white/10 pt-4 text-white/70 text-sm">
          <p className="font-semibold text-white truncate">{user.name}</p>
          <p className="text-xs">{meta.data.roles.map((r) => meta.data.labels[r] ?? r).join(', ')}</p>
          <div className="flex gap-3 mt-3"><Link href="/" className="hover:text-white">Storefront</Link><button className="flex items-center gap-1 hover:text-white" onClick={async () => { await post('/auth/logout'); qc.clear(); router.push(isAdmin ? '/admin/login' : '/login?portal=staff'); }}><LogOut size={14} />Sign out</button></div>
        </div>
      </aside>
      {menu && <button className="fixed inset-0 z-40 bg-deep/50 lg:hidden" aria-label="Close menu" onClick={() => setMenu(false)} />}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-line flex items-center gap-3 px-4 md:px-8 h-14 print:hidden">
          <button onClick={() => setMenu(true)} aria-label="Open admin menu" className="btn btn-ghost btn-icon lg:hidden"><Menu size={20} /></button>
          <span className="font-semibold lg:hidden truncate">{active?.label}</span>
          <div className="flex-1 flex justify-end lg:justify-start"><Suspense fallback={null}><GlobalSearch /></Suspense></div>
        </header>
        <main className="p-4 md:p-8 max-w-[1440px] print:p-0"><Suspense fallback={<Spinner />}>{active ? views[active.id] : <p>No sections are available for your role.</p>}</Suspense></main>
      </div>
    </div>
  );
}
