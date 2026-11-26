'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Users, Layers, TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, formatMoney } from '@/lib/format';
import { MonthPicker, downloadCsv, monthName, recentMonths, rupees } from '@/components/business-bits';
import { Alert, Badge, Empty, PageHeader, Spinner, Stat } from '@/components/ui';

type Spend = {
  month: string; totalPaise: number; orders: number;
  people: { id: string; name: string; email: string; role: string; department: string | null; orders: number; spendPaise: number }[];
  departments: { id: string | null; name: string; budgetPaise: number; orders: number; spendPaise: number; usedPercent: number | null; overBudget: boolean }[];
  trend: { month: string; spendPaise: number }[];
};

export default function SpendPage() {
  const [month, setMonth] = useState(recentMonths()[0]);
  const { data, error, isFetching } = useQuery({ queryKey: ['business-spend', month], queryFn: () => api<{ spend: Spend }>(`/business/spend?month=${month}`), placeholderData: keepPreviousData });
  if (error) return <Alert>{(error as Error).message}</Alert>;
  if (!data) return <Spinner />;
  const s = data.spend;
  const top = Math.max(1, ...s.people.map((p) => p.spendPaise));
  const peak = Math.max(1, ...s.trend.map((t) => t.spendPaise));
  const over = s.departments.filter((d) => d.overBudget);
  const csv = () => downloadCsv(`IBazzzar-spend-${s.month}.csv`, [
    [`Spend ${monthName(s.month)}`], [],
    ['Person', 'Email', 'Role', 'Department', 'Orders', 'Spend (INR)'], ...s.people.map((p) => [p.name, p.email, p.role, p.department ?? '', p.orders, rupees(p.spendPaise)]), [],
    ['Department', 'Monthly budget (INR)', 'Orders', 'Spend (INR)', 'Budget used %'], ...s.departments.map((d) => [d.name, d.budgetPaise ? rupees(d.budgetPaise) : '', d.orders, rupees(d.spendPaise), d.usedPercent ?? '']),
  ]);
  return (
    <div className={cn('transition-opacity', isFetching && 'opacity-60')}>
      <PageHeader eyebrow="Business finance" title="Spending" description="Committed orders by person and by department, against each department’s monthly budget. Cancelled and unpaid online orders are left out."
        actions={<><MonthPicker value={month} onChange={setMonth} /><button className="btn btn-outline" onClick={csv}>Excel (CSV)</button></>} />

      {over.length > 0 && <div className="mb-5"><Alert tone="warning" title="Over budget">{over.map((d) => `${d.name} has spent ${formatMoney(d.spendPaise)} of ${formatMoney(d.budgetPaise)}`).join(' · ')}.</Alert></div>}

      <div className="grid gap-4 grid-cols-2 xl:grid-cols-3 mb-6">
        <Stat label={`Spend in ${monthName(s.month)}`} value={formatMoney(s.totalPaise)} icon={<TrendingUp size={18} />} tone="gold" />
        <Stat label="Orders" value={s.orders} icon={<Layers size={18} />} />
        <Stat label="People who bought" value={s.people.filter((p) => p.orders).length} hint={`of ${s.people.length} on the team`} icon={<Users size={18} />} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <section className="card">
          <header className="p-5 border-b border-line"><h2 className="text-lg">By person</h2></header>
          {s.people.length ? (
            <ul className="divide-y divide-line">
              {s.people.map((p) => (
                <li key={p.id} className="p-4 grid gap-2">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-mint text-forest font-bold">{p.name.slice(0, 1)}</span>
                    <div className="flex-1 min-w-0"><p className="font-semibold truncate">{p.name}</p><p className="text-xs text-muted truncate">{p.role === 'FORMER' ? 'Former member' : p.role.toLowerCase()}{p.department ? ` · ${p.department}` : ''}</p></div>
                    <div className="text-right"><p className="font-bold tabular-nums">{formatMoney(p.spendPaise)}</p><p className="text-xs text-muted">{p.orders} order{p.orders === 1 ? '' : 's'}</p></div>
                  </div>
                  <span className="block h-1.5 rounded-full bg-line/60 overflow-hidden"><span className="block h-full rounded-full bg-forest" style={{ width: `${(p.spendPaise / top) * 100}%` }} /></span>
                </li>
              ))}
            </ul>
          ) : <Empty title="No team members" />}
        </section>

        <div className="grid gap-6 content-start">
          <section className="card">
            <header className="flex items-center justify-between p-5 border-b border-line"><h2 className="text-lg">By department</h2><Link href="/business/team#departments" className="link text-sm">Manage</Link></header>
            {s.departments.length ? (
              <ul className="divide-y divide-line">
                {s.departments.map((d) => (
                  <li key={d.id ?? 'none'} className="p-4 grid gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">{d.name}{d.overBudget && <Badge tone="danger" className="ml-2">Over budget</Badge>}</p>
                      <p className="text-sm tabular-nums"><strong>{formatMoney(d.spendPaise)}</strong>{d.budgetPaise ? <span className="text-muted"> / {formatMoney(d.budgetPaise)}</span> : ''}</p>
                    </div>
                    {d.budgetPaise > 0 && (
                      <>
                        <span className="block h-2 rounded-full bg-line/60 overflow-hidden"><span className={cn('block h-full rounded-full', d.overBudget ? 'bg-danger' : (d.usedPercent ?? 0) >= 80 ? 'bg-[#c27c0e]' : 'bg-forest')} style={{ width: `${Math.min(100, d.usedPercent ?? 0)}%` }} /></span>
                        <p className="text-xs text-muted">{d.usedPercent}% of the monthly budget{d.overBudget ? ` · ${formatMoney(d.spendPaise - d.budgetPaise)} over` : ` · ${formatMoney(d.budgetPaise - d.spendPaise)} left`}</p>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            ) : <Empty icon={<Layers size={24} />} title="No departments yet" body="Create departments (e.g. Admin, Facilities) to see spend by team and set budgets." action={<Link href="/business/team#departments" className="btn btn-outline btn-sm">Add departments</Link>} />}
          </section>

          <section className="card card-pad">
            <h2 className="text-lg mb-4">Last 6 months</h2>
            <div className="flex items-end gap-3 h-36" role="img" aria-label="Monthly spend for the last six months">
              {s.trend.map((t) => (
                <div key={t.month} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full">
                  <span className="text-[10.5px] text-muted tabular-nums">{t.spendPaise ? formatMoney(t.spendPaise).replace(/\.\d+$/, '') : ''}</span>
                  <span className={cn('w-full max-w-10 rounded-t-lg', t.month === s.month ? 'bg-forest' : 'bg-mint')} style={{ height: `${Math.max(4, (t.spendPaise / peak) * 100)}%` }} />
                  <span className="text-[11px] text-muted">{new Date(`${t.month}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' })}</span>
                </div>
              ))}
              {!s.trend.length && <p className="text-sm text-muted self-center">No spend yet.</p>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
