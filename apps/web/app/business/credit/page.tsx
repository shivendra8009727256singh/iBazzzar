'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Wallet, FileText, Landmark } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, formatDate, formatMoney } from '@/lib/format';
import { CreditMeter, DueBadge, type CreditSnapshot } from '@/components/business-bits';
import { Alert, Empty, PageHeader, Spinner } from '@/components/ui';

type Credit = CreditSnapshot & {
  open: { orderId: string; number: string; purchaseOrder: string | null; placedBy: string; orderedAt: string; dueAt: string | null; amountPaise: number; daysLeft: number | null; state: string }[];
  recentlyPaid: { orderId: string; number: string; paidAt: string | null; dueAt: string | null; amountPaise: number; reference: string | null; late: boolean }[];
};

export default function CreditPage() {
  const { data, error } = useQuery({ queryKey: ['business-credit'], queryFn: () => api<{ credit: Credit }>('/business/credit') });
  if (error) return <Alert>{(error as Error).message}</Alert>;
  if (!data) return <Spinner />;
  const c = data.credit;
  return (
    <>
      <PageHeader eyebrow="Business finance" title="Credit & dues" description="What your business owes on credit terms, when each payment is due, and what has been paid."
        actions={<Link href="/business/statement" className="btn btn-outline"><FileText size={16} />Monthly statement</Link>} />
      <div className="grid gap-6">
        <CreditMeter credit={c} />

        <section className="card">
          <header className="flex flex-wrap items-center justify-between gap-2 p-5 border-b border-line">
            <h2 className="text-lg">Open dues</h2>
            <p className="text-sm text-muted">{c.open.length ? `${c.open.length} order${c.open.length === 1 ? '' : 's'} · ${formatMoney(c.outstandingPaise)}` : ''}</p>
          </header>
          {c.open.length ? (
            <div className="table-wrap border-0"><table className="table">
              <thead><tr><th>Order</th><th>Placed by</th><th>Ordered</th><th>Due date</th><th>Status</th><th className="text-right">Amount</th></tr></thead>
              <tbody>{c.open.map((o) => (
                <tr key={o.orderId} className={cn(o.state === 'OVERDUE' && 'bg-danger-bg/40')}>
                  <td><p className="font-semibold">{o.number}</p>{o.purchaseOrder && <p className="text-xs text-muted">{o.purchaseOrder}</p>}</td>
                  <td>{o.placedBy}</td><td>{formatDate(o.orderedAt)}</td><td className="font-semibold">{formatDate(o.dueAt)}</td>
                  <td><DueBadge daysLeft={o.daysLeft} /></td>
                  <td className="text-right font-bold tabular-nums">{formatMoney(o.amountPaise)}</td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <Empty icon={<Wallet size={26} />} title="Nothing owed" body={c.creditApproved ? 'Orders placed on credit terms appear here with their due dates.' : 'Your orders are prepaid.'} />}
        </section>

        <section className="card card-pad flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-mint text-forest"><Landmark size={19} /></span>
          <div className="text-sm">
            <p className="font-semibold text-[15px]">How to pay a due</p>
            <p className="text-muted mt-0.5">Pay by NEFT/RTGS to the IBazzzar account shown on your order, with the order number as the reference. Our finance team matches it and marks the order paid; you’ll get a notification and email. We remind you 3 days before, on the due date and if a payment is late. While anything is overdue, new credit purchases are paused.</p>
          </div>
        </section>

        {c.recentlyPaid.length > 0 && (
          <section className="card">
            <header className="p-5 border-b border-line"><h2 className="text-lg">Recently paid</h2></header>
            <div className="table-wrap border-0"><table className="table">
              <thead><tr><th>Order</th><th>Due</th><th>Paid on</th><th>Reference</th><th className="text-right">Amount</th></tr></thead>
              <tbody>{c.recentlyPaid.map((o) => (
                <tr key={o.orderId}>
                  <td className="font-semibold">{o.number}</td><td>{formatDate(o.dueAt)}</td>
                  <td>{formatDate(o.paidAt)} {o.late ? <span className="ml-1 text-xs font-semibold text-danger">late</span> : <span className="ml-1 text-xs font-semibold text-success">on time</span>}</td>
                  <td className="font-mono text-xs">{o.reference ?? '—'}</td>
                  <td className="text-right tabular-nums">{formatMoney(o.amountPaise)}</td>
                </tr>
              ))}</tbody>
            </table></div>
          </section>
        )}
      </div>
    </>
  );
}
