'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Package, Truck, RotateCcw, FileText, FileCheck2, AlertTriangle, IndianRupee, Star, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { DailyBars } from '@/components/charts';
import { Alert, Empty, PageHeader, Spinner, Stat, StatusBadge, Stars } from '@/components/ui';

type Overview = {
  store: { name: string; status: string; role: string; slug: string; payoutAccount: { verified: boolean } | null };
  pending?: boolean;
  queues?: { toPack: number; toShip: number; returns: number; rfqs: number; posToConfirm: number; lowStock: number };
  metrics?: { revenue30dPaise: number; orders30d: number; rating: { average: number; count: number } | null; payablePaise: number | null };
  series?: { date: string; orders: number; revenuePaise: number }[];
  topProducts?: { name: string; units: number; revenuePaise: number }[];
};

export default function SellerOverview() {
  const { data, error } = useQuery({ queryKey: ['seller-overview'], queryFn: () => api<Overview>('/seller/overview') });
  if (error) return <Alert>{(error as Error).message}</Alert>;
  if (!data) return <Spinner />;
  if (data.pending) {
    return (
      <>
        <PageHeader eyebrow="Seller hub" title={data.store.name} />
        <div className="card"><Empty title={data.store.status === 'PENDING' ? 'Application under review' : 'Store not active'} body={data.store.status === 'PENDING' ? 'Our team checks your store and tax details, usually within one working day. You’ll get a notification when you can start listing.' : 'Please contact seller support for details.'} action={<StatusBadge status={data.store.status} />} /></div>
      </>
    );
  }
  const q = data.queues!;
  const m = data.metrics!;
  const tasks = [
    { n: q.toPack, label: 'orders to pack', href: '/seller/orders?status=PENDING', icon: Package },
    { n: q.toShip, label: 'packed, ready to ship', href: '/seller/orders?status=PACKED', icon: Truck },
    { n: q.returns, label: 'returns to handle', href: '/seller/returns', icon: RotateCcw },
    { n: q.rfqs, label: 'quotation requests', href: '/seller/rfqs', icon: FileText },
    { n: q.posToConfirm, label: 'POs to confirm', href: '/seller/purchase-orders', icon: FileCheck2 },
    { n: q.lowStock, label: 'listings low on stock', href: '/seller/products?filter=low', icon: AlertTriangle },
  ].filter((t) => t.n > 0);
  return (
    <>
      <PageHeader eyebrow="Seller hub" title={data.store.name} actions={<><Link href={`/sellers/${data.store.slug}`} className="btn btn-outline">View storefront</Link><Link href="/seller/products/new" className="btn btn-primary"><Plus size={16} />Add product</Link></>} />
      {data.store.role === 'OWNER' && !data.store.payoutAccount && <div className="mb-5"><Alert tone="warning" title="Add your bank account">Payouts are made only to a verified bank account. <Link href="/seller/settings" className="underline">Add it in store settings</Link>.</Alert></div>}
      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4 mb-6">
        <Stat label="Sales, last 30 days" value={formatMoney(m.revenue30dPaise)} icon={<IndianRupee size={18} />} tone="gold" />
        <Stat label="Orders, last 30 days" value={m.orders30d} icon={<Package size={18} />} />
        <Stat label="Customer rating" value={m.rating ? <Stars value={m.rating.average} count={m.rating.count} /> : '—'} icon={<Star size={18} />} tone="gold" />
        <Stat label="Payable balance" value={m.payablePaise == null ? 'Owner only' : formatMoney(m.payablePaise)} hint="Delivered sales minus commission and refunds" icon={<IndianRupee size={18} />} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <section className="card card-pad"><DailyBars data={data.series!} value={(d: { revenuePaise: number }) => d.revenuePaise} format={formatMoney} label="Sales" /></section>
        <section className="card card-pad">
          <h2 className="text-lg mb-3">Needs your attention</h2>
          {tasks.length ? <ul className="grid gap-2">{tasks.map((t) => <li key={t.label}><Link href={t.href} className="flex items-center gap-3 rounded-xl border border-line p-3 hover:border-forest"><t.icon size={18} className="text-forest" /><span className="flex-1"><strong>{t.n}</strong> {t.label}</span>→</Link></li>)}</ul>
            : <p className="text-muted text-sm">All caught up. Nice work.</p>}
        </section>
      </div>
      <section className="card card-pad mt-6">
        <h2 className="text-lg mb-3">Top products this month</h2>
        {data.topProducts!.length ? <div className="table-wrap border-0"><table className="table"><thead><tr><th>Product</th><th className="text-right">Units</th><th className="text-right">Revenue</th></tr></thead><tbody>{data.topProducts!.map((t) => <tr key={t.name}><td>{t.name}</td><td className="text-right">{t.units}</td><td className="text-right">{formatMoney(t.revenuePaise)}</td></tr>)}</tbody></table></div>
          : <p className="text-muted text-sm">Sales appear here once customers start ordering.</p>}
      </section>
    </>
  );
}
