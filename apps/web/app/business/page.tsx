'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, FileCheck2, Hourglass, IndianRupee, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import type { Order } from '@/lib/types';
import { formatDate, formatMoney } from '@/lib/format';
import { OrderRow } from '@/components/order-bits';
import { CreditMeter, type CreditSnapshot } from '@/components/business-bits';
import { Alert, Empty, PageHeader, Spinner, Stat, StatusBadge } from '@/components/ui';

type Overview = {
  organization: { legalName: string; tradeName: string | null; status: string; gstin: string | null; approvalThresholdPaise: number; creditApproved: boolean; allowedTerms: string };
  role: string;
  credit: CreditSnapshot;
  metrics: { activeRfqs: number; quotesWaiting: number; pendingApprovals: number; spendPaise: number };
  rfqs: { id: string; number: string; title: string; status: string; createdAt: string; items: number; sellers: number; quotes: number }[];
  purchaseOrders: { id: string; number: string; status: string; sellerName: string; totalPaise: number; createdAt: string }[];
  orders: Order[];
};

export default function BusinessOverview() {
  const { data, error } = useQuery({ queryKey: ['business-overview'], queryFn: () => api<Overview>('/business/overview') });
  if (error) return <Alert>{(error as Error).message}</Alert>;
  if (!data) return <Spinner />;
  const o = data.organization;
  return (
    <>
      <PageHeader eyebrow={`Business · ${data.role.toLowerCase()}`} title={o.tradeName || o.legalName} description={<>{o.gstin ? `GSTIN ${o.gstin} · ` : 'Not GST-registered · '}Auto-approve purchase orders up to {o.approvalThresholdPaise ? formatMoney(o.approvalThresholdPaise) : '—'}{o.creditApproved ? ` · Credit terms: ${o.allowedTerms.replace('_', ' ')}` : ''}</>}
        actions={o.status === 'APPROVED' && <Link href="/business/rfqs/new" className="btn btn-primary"><Plus size={16} />Request a quote</Link>} />
      {o.status !== 'APPROVED' && <div className="mb-5"><Alert tone="warning" title="Verification in progress">Our team is reviewing your business details. You’ll be notified when quotations and wholesale checkout are enabled.</Alert></div>}
      {o.status === 'APPROVED' && <div className="mb-6"><CreditMeter credit={data.credit} compact /></div>}
      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4 mb-8">
        <Stat label="Open requests" value={data.metrics.activeRfqs} icon={<ClipboardList size={18} />} />
        <Stat label="Quotes to review" value={data.metrics.quotesWaiting} icon={<Hourglass size={18} />} tone="gold" />
        <Stat label="POs awaiting approval" value={data.metrics.pendingApprovals} icon={<FileCheck2 size={18} />} />
        <Stat label="Total spend" value={formatMoney(data.metrics.spendPaise)} hint="Paid and on-terms orders" icon={<IndianRupee size={18} />} tone="gold" />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card">
          <header className="flex items-center justify-between p-5 border-b border-line"><h2 className="text-lg">Recent requests</h2><Link href="/business/rfqs" className="link text-sm">All →</Link></header>
          {data.rfqs.length ? <ul className="divide-y divide-line">{data.rfqs.map((r) => <li key={r.id}><Link href={`/business/rfqs/${r.id}`} className="flex items-center gap-3 p-4 hover:bg-cream"><div className="flex-1 min-w-0"><p className="font-semibold truncate">{r.title}</p><p className="text-xs text-muted">{r.number} · {formatDate(r.createdAt)} · {r.quotes}/{r.sellers} quoted</p></div><StatusBadge status={r.status} /></Link></li>)}</ul>
            : <Empty title="No requests yet" body="Ask several sellers for a price on bulk quantities." />}
        </section>
        <section className="card">
          <header className="flex items-center justify-between p-5 border-b border-line"><h2 className="text-lg">Purchase orders</h2><Link href="/business/purchase-orders" className="link text-sm">All →</Link></header>
          {data.purchaseOrders.length ? <ul className="divide-y divide-line">{data.purchaseOrders.map((p) => <li key={p.id} className="flex items-center gap-3 p-4"><div className="flex-1 min-w-0"><p className="font-semibold">{p.number}</p><p className="text-xs text-muted">{p.sellerName} · {formatDate(p.createdAt)}</p></div><span className="font-semibold">{formatMoney(p.totalPaise)}</span><StatusBadge status={p.status} /></li>)}</ul>
            : <Empty title="No purchase orders yet" body="Accepted quotations become purchase orders here." />}
        </section>
      </div>
      <h2 className="text-lg mt-8 mb-3">Recent orders</h2>
      {data.orders.length ? <div className="grid gap-3">{data.orders.map((x) => <OrderRow key={x.id} order={x} href={`/account/orders/${x.id}`} />)}</div> : <p className="text-muted">No business orders yet.</p>}
    </>
  );
}
