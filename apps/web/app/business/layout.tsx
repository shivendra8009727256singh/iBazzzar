'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { LayoutDashboard, ClipboardList, FileCheck2, Package, Users, Building2 } from 'lucide-react';
import { post } from '@/lib/api';
import { WorkspaceShell } from '@/components/workspace';
import { useSession } from '@/components/providers';
import { Empty, StatusBadge } from '@/components/ui';

const NAV = [
  { href: '/business', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/business/rfqs', label: 'Quotations', icon: ClipboardList },
  { href: '/business/purchase-orders', label: 'Purchase orders', icon: FileCheck2 },
  { href: '/business/orders', label: 'Orders', icon: Package },
  { href: '/business/team', label: 'Team & settings', icon: Users },
];

function OrgSwitcher() {
  const { user } = useSession();
  const qc = useQueryClient();
  if (!user || user.organizations.length < 2) return null;
  return (
    <label className="flex items-center gap-2 text-sm mb-5">
      <Building2 size={16} className="text-forest" />Buying for
      <select className="input w-auto min-h-[38px] py-1" value={user.activeOrganizationId ?? ''} onChange={async (e) => { await post('/auth/context', { organizationId: e.target.value }); qc.invalidateQueries(); }}>
        {user.organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
}

export default function BusinessLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/business/register') return <>{children}</>;
  return (
    <WorkspaceShell title="Business" nav={NAV} header={<OrgSwitcher />}
      gate={(u) => {
        if (!u.organizations.length) return <div className="card"><Empty icon={<Building2 size={26} />} title="Set up a business account" body="Get wholesale prices, request quotations and manage purchase orders with your team." action={<Link href="/business/register" className="btn btn-primary">Add business details</Link>} /></div>;
        const org = u.organizations.find((o) => o.id === u.activeOrganizationId) ?? u.organizations[0];
        if (org.status !== 'APPROVED' && pathname !== '/business') return <div className="card"><Empty icon={<Building2 size={26} />} title="Verification in progress" body={<>We’re reviewing <strong>{org.name}</strong>. Quotations and wholesale checkout open once it’s approved.</>} action={<StatusBadge status={org.status} />} /></div>;
        return null;
      }}>
      {children}
    </WorkspaceShell>
  );
}
