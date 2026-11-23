'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { Empty, PageHeader, Spinner, StatusBadge } from '@/components/ui';

type Data = {
  returns: { id: string; orderId: string; orderNumber: string; status: string; reason: string; note: string | null; refundPaise: number; createdAt: string; items: { name: string; quantity: number }[] }[];
  refunds: { id: string; orderId: string; orderNumber: string; amountPaise: number; status: string; reason: string; createdAt: string; processedAt: string | null }[];
};

export default function ReturnsPage() {
  const { data } = useQuery({ queryKey: ['account-returns'], queryFn: () => api<Data>('/account/returns') });
  if (!data) return <Spinner />;
  return (
    <>
      <PageHeader title="Returns & refunds" description="Follow each return from request to refund. Refunds go back to your original payment method; COD refunds are paid by bank transfer." />
      {!data.returns.length && !data.refunds.length ? <div className="card"><Empty icon={<RotateCcw size={26} />} title="No returns or refunds" body="Start a return from a delivered order’s page." action={<Link href="/account/orders" className="btn btn-primary">My orders</Link>} /></div> : (
        <div className="grid gap-8">
          {data.returns.length > 0 && (
            <section><h2 className="text-xl mb-3">Returns</h2>
              <div className="grid gap-3">
                {data.returns.map((r) => (
                  <Link key={r.id} href={`/account/orders/${r.orderId}`} className="card p-4 flex flex-wrap items-center gap-4 hover:shadow-lift">
                    <div className="flex-1 min-w-[200px]"><p className="font-semibold">{r.items.map((i) => `${i.name} × ${i.quantity}`).join(', ')}</p><p className="text-sm text-muted">Order {r.orderNumber} · requested {formatDate(r.createdAt)}</p>{r.note && <p className="text-sm mt-1">Seller: {r.note}</p>}</div>
                    <StatusBadge status={r.status} /><p className="font-semibold">{formatMoney(r.refundPaise)}</p>
                  </Link>
                ))}
              </div>
            </section>
          )}
          {data.refunds.length > 0 && (
            <section><h2 className="text-xl mb-3">Refunds</h2>
              <div className="table-wrap"><table className="table"><thead><tr><th>Order</th><th>Reason</th><th>Status</th><th className="text-right">Amount</th></tr></thead>
                <tbody>{data.refunds.map((r) => <tr key={r.id}><td><Link className="link" href={`/account/orders/${r.orderId}`}>{r.orderNumber}</Link><span className="block text-xs text-muted">{formatDate(r.createdAt)}</span></td><td>{r.reason}</td><td><StatusBadge status={r.status} text={r.status === 'PENDING_PROVIDER' ? 'Processing' : undefined} /></td><td className="text-right font-semibold">{formatMoney(r.amountPaise)}</td></tr>)}</tbody>
              </table></div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
