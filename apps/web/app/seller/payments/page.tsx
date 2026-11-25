'use client';
import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { IndianRupee, Percent, RotateCcw, Landmark } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, formatMoney, label, pct, cn } from '@/lib/format';
import { Alert, PageHeader, Pagination, Spinner, Stat } from '@/components/ui';

type Data = {
  summary: { salesPaise: number; shippingPaise: number; commissionPaise: number; refundsPaise: number; paidOutPaise: number; payablePaise: number; commissionRateBps: number };
  entries: { id: string; kind: string; amountPaise: number; status: string; note: string | null; demo: boolean; createdAt: string }[];
  payouts: { id: string; amountPaise: number; providerRef: string; createdAt: string }[];
  page: number; pages: number;
};

export default function SellerPaymentsPage() {
  const [page, setPage] = useState(1);
  const { data, error } = useQuery({ queryKey: ['seller-settlements', page], queryFn: () => api<Data>(`/seller/settlements?page=${page}`), placeholderData: keepPreviousData });
  if (error) return <Alert>{(error as Error).message}</Alert>;
  if (!data) return <Spinner />;
  const s = data.summary;
  return (
    <>
      <PageHeader title="Payments" description={`Earnings are booked when a parcel is delivered. Commission is ${pct(s.commissionRateBps)} by default (some categories differ). Payouts go to your verified bank account.`} />
      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4 mb-6">
        <Stat label="Payable now" value={formatMoney(s.payablePaise)} icon={<IndianRupee size={18} />} tone="gold" />
        <Stat label="Delivered sales" value={formatMoney(s.salesPaise + s.shippingPaise)} hint={`incl. ${formatMoney(s.shippingPaise)} delivery charges`} icon={<IndianRupee size={18} />} />
        <Stat label="Commission" value={formatMoney(s.commissionPaise)} icon={<Percent size={18} />} />
        <Stat label="Refunds" value={formatMoney(s.refundsPaise)} icon={<RotateCcw size={18} />} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section>
          <h2 className="text-lg mb-3">Ledger</h2>
          <div className="table-wrap"><table className="table"><thead><tr><th>Date</th><th>Entry</th><th className="text-right">Amount</th></tr></thead>
            <tbody>{data.entries.map((e) => <tr key={e.id}><td className="whitespace-nowrap">{formatDate(e.createdAt)}</td><td>{label(e.kind)}<span className="block text-xs text-muted">{e.note}</span></td><td className={cn('text-right font-semibold tabular-nums', e.amountPaise < 0 ? 'text-danger' : 'text-success')}>{e.amountPaise < 0 ? '−' : '+'}{formatMoney(Math.abs(e.amountPaise))}</td></tr>)}
              {!data.entries.length && <tr><td colSpan={3} className="text-muted text-center py-8">No ledger entries yet.</td></tr>}</tbody></table></div>
          <Pagination page={data.page} pages={data.pages} onChange={setPage} />
        </section>
        <section>
          <h2 className="text-lg mb-3 flex items-center gap-2"><Landmark size={18} />Payouts</h2>
          <ul className="card divide-y divide-line">
            {data.payouts.map((p) => <li key={p.id} className="p-4 flex justify-between text-sm"><span>{formatDate(p.createdAt)}<span className="block text-xs text-muted">Ref {p.providerRef}</span></span><strong>{formatMoney(p.amountPaise)}</strong></li>)}
            {!data.payouts.length && <li className="p-6 text-sm text-muted text-center">No payouts yet. Finance pays out payable balances on the settlement schedule.</li>}
          </ul>
        </section>
      </div>
    </>
  );
}
