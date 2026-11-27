'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { LayoutDashboard, Boxes, ClipboardList, RotateCcw, FileText, FileCheck2, Wallet, Star, Settings, Store } from 'lucide-react';
import { post } from '@/lib/api';
import { WorkspaceShell } from '@/components/workspace';
import { useSession } from '@/components/providers';
import { Empty } from '@/components/ui';

const NAV = [
  { href: '/seller', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/seller/products', label: 'Products & stock', icon: Boxes },
  { href: '/seller/orders', label: 'Orders', icon: ClipboardList },
  { href: '/seller/returns', label: 'Returns', icon: RotateCcw },
  { href: '/seller/rfqs', label: 'Quotation requests', icon: FileText },
  { href: '/seller/purchase-orders', label: 'Purchase orders', icon: FileCheck2 },
  { href: '/seller/payments', label: 'Payments', icon: Wallet },
  { href: '/seller/reviews', label: 'Reviews', icon: Star },
  { href: '/seller/settings', label: 'Store settings', icon: Settings },
];

function StoreSwitcher() {
  const { user } = useSession();
  const qc = useQueryClient();
  if (!user || user.stores.length < 2) return null;
  return (
    <label className="flex items-center gap-2 text-sm mb-5"><Store size={16} className="text-forest" />Working in
      <select className="input w-auto min-h-[38px] py-1" value={user.activeStoreId ?? ''} onChange={async (e) => { await post('/auth/context', { storeId: e.target.value }); qc.invalidateQueries(); }}>
        {user.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </label>
  );
}

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useSession();
  const activeStore = user?.stores.find((s) => s.id === user.activeStoreId) ?? user?.stores[0];
  // Earnings and payouts are owner-only, so staff don't see a menu item that would only refuse them.
  const nav = activeStore && activeStore.role !== 'OWNER' ? NAV.filter((n) => n.href !== '/seller/payments') : NAV;
  if (pathname === '/seller/register') return <>{children}</>;
  return (
    <WorkspaceShell title="Seller hub" nav={nav} header={<StoreSwitcher />}
      gate={(u) => {
        if (!u.stores.length) return <div className="card"><Empty icon={<Store size={26} />} title="Open your IBazzzar store" body="Apply with your store and tax details. We review applications before you can list products." action={<Link href="/seller/register" className="btn btn-primary">Apply to sell</Link>} /></div>;
        const store = u.stores.find((s) => s.id === u.activeStoreId) ?? u.stores[0];
        if (store.status !== 'APPROVED' && pathname !== '/seller') return <div className="card"><Empty icon={<Store size={26} />} title="Your application is under review" body="You’ll be able to list products once our team approves your store." /></div>;
        return null;
      }}>
      {children}
    </WorkspaceShell>
  );
}
