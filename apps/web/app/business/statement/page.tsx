'use client';
import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn, formatDate, formatMoney, label } from '@/lib/format';
import { DocActions, MonthPicker, downloadCsv, monthName, recentMonths, rupees } from '@/components/business-bits';
import { Logo } from '@/components/logo';
import { Alert, Spinner, StatusBadge } from '@/components/ui';

type Statement = {
  month: string; from: string; to: string; generatedAt: string;
  business: { legalName: string; tradeName: string | null; gstin: string | null; address: { line1?: string; city?: string; state?: string; pincode?: string } | null; terms: string; creditLimitPaise: number } | null;
  summary: { orders: number; purchasesPaise: number; gstPaise: number; cancelled: number; paymentsPaise: number; payments: number; openingBalancePaise: number; creditPurchasesPaise: number; creditPaymentsPaise: number; closingBalancePaise: number; overduePaise: number; overdueCount: number };
  orders: { id: string; number: string; date: string; status: string; paymentMethod: string; paymentStatus: string; dueAt: string | null; amountPaise: number; gstPaise: number; placedBy: string; department: string | null; purchaseOrder: string | null }[];
  payments: { orderId: string; number: string; date: string; method: string; reference: string | null; amountPaise: number; late: boolean }[];
};

const METHOD: Record<string, string> = { CREDIT_TERMS: 'Credit terms', BANK_TRANSFER: 'Bank transfer', ONLINE: 'Online', COD: 'Cash on delivery' };

export default function StatementPage() {
  const [month, setMonth] = useState(recentMonths()[0]);
  const { data, error, isFetching } = useQuery({ queryKey: ['business-statement', month], queryFn: () => api<{ statement: Statement }>(`/business/statement?month=${month}`), placeholderData: keepPreviousData });
  if (error) return <Alert>{(error as Error).message}</Alert>;
  if (!data) return <Spinner />;
  const s = data.statement;
  const t = s.summary;
  const csv = () => downloadCsv(`IBazzzar-statement-${s.month}.csv`, [
    [`Statement ${monthName(s.month)}`, s.business?.legalName ?? '', s.business?.gstin ? `GSTIN ${s.business.gstin}` : ''],
    [],
    ['Opening credit balance (INR)', rupees(t.openingBalancePaise)], ['Credit purchases', rupees(t.creditPurchasesPaise)], ['Credit payments', rupees(t.creditPaymentsPaise)], ['Closing credit balance', rupees(t.closingBalancePaise)], ['Overdue', rupees(t.overduePaise)],
    [],
    ['ORDERS'], ['Date', 'Order', 'Purchase order', 'Placed by', 'Department', 'Payment', 'Status', 'Due date', 'GST (INR)', 'Amount (INR)'],
    ...s.orders.map((o) => [formatDate(o.date), o.number, o.purchaseOrder ?? '', o.placedBy, o.department ?? '', METHOD[o.paymentMethod] ?? o.paymentMethod, label(o.status), o.dueAt ? formatDate(o.dueAt) : '', rupees(o.gstPaise), rupees(o.amountPaise)]),
    [],
    ['PAYMENTS'], ['Date', 'Order', 'Method', 'Reference', 'Amount (INR)', 'On time'],
    ...s.payments.map((p) => [formatDate(p.date), p.number, METHOD[p.method] ?? p.method, p.reference ?? '', rupees(p.amountPaise), p.method === 'CREDIT_TERMS' ? (p.late ? 'Late' : 'Yes') : '']),
  ]);
  const a = s.business?.address;
  return (
    <div className={cn('transition-opacity', isFetching && 'opacity-60')}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5 print:hidden">
        <div><span className="eyebrow">Business finance</span><h1 className="text-[28px] md:text-[34px] mt-1">Statement</h1></div>
        <div className="flex flex-wrap items-center gap-3"><MonthPicker value={month} onChange={setMonth} /><DocActions onCsv={csv} /></div>
      </div>

      <article className="bg-white border border-line rounded-2xl p-6 md:p-8 text-[13.5px] print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-emerald pb-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold-ink">Account statement</p>
            <h2 className="text-[24px] mt-1">{monthName(s.month)}</h2>
            <p className="text-muted">{formatDate(s.from)} – {formatDate(s.to)} · generated {formatDate(s.generatedAt)}</p>
          </div>
          <div className="text-right">
            <Logo size="footer" />
            {s.business && <><p className="font-semibold mt-2">{s.business.legalName}</p><p className="text-muted">{[a?.line1, a?.city, a?.state, a?.pincode].filter(Boolean).join(', ')}</p><p>GSTIN {s.business.gstin ?? 'unregistered'}</p></>}
          </div>
        </header>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 py-5">
          {[
            ['Orders placed', formatMoney(t.purchasesPaise), `${t.orders} order${t.orders === 1 ? '' : 's'} · GST ${formatMoney(t.gstPaise)}`],
            ['Payments made', formatMoney(t.paymentsPaise), `${t.payments} payment${t.payments === 1 ? '' : 's'}`],
            ['Credit balance', formatMoney(t.closingBalancePaise), `opening ${formatMoney(t.openingBalancePaise)}`],
            ['Overdue', formatMoney(t.overduePaise), t.overdueCount ? `${t.overdueCount} order${t.overdueCount === 1 ? '' : 's'}` : 'none'],
          ].map(([k, v, h], i) => (
            <div key={k} className={cn('rounded-xl border p-3.5', i === 3 && t.overdueCount ? 'border-danger/40 bg-danger-bg/40' : 'border-line bg-cream/50')}>
              <p className="text-[12px] text-muted">{k}</p><p className="text-[19px] font-bold tabular-nums">{v}</p><p className="text-[11.5px] text-muted">{h}</p>
            </div>
          ))}
        </div>

        <section className="rounded-xl border border-line p-4 mb-6">
          <p className="eyebrow mb-2">Credit account</p>
          <dl className="grid gap-1.5 max-w-md">
            <div className="flex justify-between"><dt className="text-muted">Opening balance ({formatDate(s.from)})</dt><dd className="tabular-nums">{formatMoney(t.openingBalancePaise)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">+ Bought on credit</dt><dd className="tabular-nums">{formatMoney(t.creditPurchasesPaise)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">− Credit paid</dt><dd className="tabular-nums">{formatMoney(t.creditPaymentsPaise)}</dd></div>
            <div className="flex justify-between border-t border-line pt-1.5 font-bold"><dt>Closing balance</dt><dd className="tabular-nums">{formatMoney(t.closingBalancePaise)}</dd></div>
          </dl>
        </section>

        <h3 className="text-[16px] mb-2">Orders</h3>
        {s.orders.length ? (
          <div className="overflow-x-auto mb-6"><table className="table text-[12.5px]">
            <thead><tr><th>Date</th><th>Order</th><th>Placed by</th><th>Payment</th><th>Status</th><th>Due</th><th className="text-right">Amount</th></tr></thead>
            <tbody>{s.orders.map((o) => (
              <tr key={o.id} className={cn(o.status === 'CANCELLED' && 'text-muted line-through decoration-muted/50')}>
                <td>{formatDate(o.date)}</td>
                <td className="font-semibold">{o.number}{o.purchaseOrder && <span className="block text-[11px] font-normal text-muted">{o.purchaseOrder}</span>}</td>
                <td>{o.placedBy}{o.department && <span className="block text-[11px] text-muted">{o.department}</span>}</td>
                <td>{METHOD[o.paymentMethod] ?? o.paymentMethod}</td>
                <td><StatusBadge status={o.status} /></td>
                <td>{o.dueAt ? formatDate(o.dueAt) : '—'}</td>
                <td className="text-right font-semibold tabular-nums">{formatMoney(o.amountPaise)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <p className="text-muted mb-6">No orders this month.</p>}

        <h3 className="text-[16px] mb-2">Payments</h3>
        {s.payments.length ? (
          <div className="overflow-x-auto"><table className="table text-[12.5px]">
            <thead><tr><th>Date</th><th>Order</th><th>Method</th><th>Reference</th><th className="text-right">Amount</th></tr></thead>
            <tbody>{s.payments.map((p) => (
              <tr key={`${p.orderId}-${p.date}`}>
                <td>{formatDate(p.date)}</td><td className="font-semibold">{p.number}</td>
                <td>{METHOD[p.method] ?? p.method}{p.method === 'CREDIT_TERMS' && <span className={cn('ml-1.5 text-[11px] font-semibold', p.late ? 'text-danger' : 'text-success')}>{p.late ? 'late' : 'on time'}</span>}</td>
                <td className="font-mono text-[11.5px]">{p.reference ?? '—'}</td>
                <td className="text-right font-semibold tabular-nums">{formatMoney(p.amountPaise)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <p className="text-muted">No payments this month.</p>}
        <p className="mt-6 text-[11px] text-muted">Amounts include GST. Cancelled orders are shown struck through and are not counted. Credit balance is the value of credit-terms orders not yet paid.</p>
      </article>
    </div>
  );
}
