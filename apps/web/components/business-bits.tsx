'use client';
import Link from 'next/link';
import { AlertTriangle, CalendarClock, CheckCircle2, Download, IndianRupee, Printer, ShieldCheck } from 'lucide-react';
import { cn, formatDate, formatMoney, label } from '@/lib/format';
import { Badge } from './ui';

export type CreditSnapshot = {
  creditApproved: boolean; terms: string; limitPaise: number; outstandingPaise: number; availablePaise: number; usedPercent: number;
  overduePaise: number; overdueCount: number; dueSoonPaise: number; dueSoonCount: number;
  nextDue: { number: string; dueAt: string | null; amountPaise: number; daysLeft: number | null } | null;
};

/** "Due in 3 days" / "Due today" / "Overdue by 2 days", coloured by urgency. */
export function DueBadge({ daysLeft, paid }: { daysLeft: number | null; paid?: boolean }) {
  if (paid) return <Badge tone="success">Paid</Badge>;
  if (daysLeft == null) return <Badge tone="neutral">No due date</Badge>;
  if (daysLeft < 0) return <Badge tone="danger">Overdue by {-daysLeft} day{daysLeft === -1 ? '' : 's'}</Badge>;
  if (daysLeft === 0) return <Badge tone="warning">Due today</Badge>;
  if (daysLeft <= 3) return <Badge tone="warning">Due in {daysLeft} day{daysLeft === 1 ? '' : 's'}</Badge>;
  return <Badge tone="info">Due in {daysLeft} days</Badge>;
}

/** Credit position at a glance: used vs available against the limit, and anything overdue or due soon. */
export function CreditMeter({ credit, compact }: { credit: CreditSnapshot; compact?: boolean }) {
  if (!credit.creditApproved) {
    return (
      <section className="card card-pad flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-mint text-forest"><ShieldCheck size={19} /></span>
        <div><p className="font-semibold">Credit terms not set up</p><p className="text-sm text-muted">Orders are prepaid (online or bank transfer). Ask IBazzzar business support to review your account for NET 15/30/45 credit.</p></div>
      </section>
    );
  }
  const tone = credit.overdueCount ? 'bg-danger' : credit.usedPercent >= 80 ? 'bg-[#c27c0e]' : 'bg-forest';
  return (
    <section className={cn('card overflow-hidden', credit.overdueCount > 0 && 'border-danger/40')}>
      <div className="relative bg-gradient-to-br from-emerald to-forest p-5 text-white">
        <span className="absolute -right-10 -top-12 size-36 rounded-full bg-gold/25 blur-2xl" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-gold-light">Credit · {label(credit.terms)}</p>
            <p className="mt-1 text-[30px] font-bold leading-none tabular-nums">{formatMoney(credit.availablePaise)}</p>
            <p className="text-[13px] text-white/70 mt-1">available of {formatMoney(credit.limitPaise)} limit</p>
          </div>
          <div className="text-right">
            <p className="text-[12px] text-white/60">Outstanding</p>
            <p className="text-xl font-bold tabular-nums">{formatMoney(credit.outstandingPaise)}</p>
          </div>
        </div>
        <div className="relative mt-4 h-2.5 rounded-full bg-white/15 overflow-hidden" role="meter" aria-valuenow={credit.usedPercent} aria-valuemin={0} aria-valuemax={100} aria-label="Credit used">
          <span className={cn('block h-full rounded-full', tone)} style={{ width: `${Math.max(credit.usedPercent, credit.outstandingPaise ? 3 : 0)}%` }} />
        </div>
        <p className="relative mt-1.5 text-[12px] text-white/60">{credit.usedPercent}% used</p>
      </div>
      {!compact && (
        <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-line">
          <div className="p-4 flex items-center gap-3">
            <AlertTriangle size={18} className={credit.overdueCount ? 'text-danger' : 'text-muted'} />
            <div><p className="text-[12px] text-muted">Overdue</p><p className={cn('font-bold tabular-nums', credit.overdueCount > 0 && 'text-danger')}>{credit.overdueCount ? `${formatMoney(credit.overduePaise)} · ${credit.overdueCount}` : 'Nothing overdue'}</p></div>
          </div>
          <div className="p-4 flex items-center gap-3">
            <CalendarClock size={18} className={credit.dueSoonCount ? 'text-[#c27c0e]' : 'text-muted'} />
            <div><p className="text-[12px] text-muted">Due in 3 days</p><p className="font-bold tabular-nums">{credit.dueSoonCount ? `${formatMoney(credit.dueSoonPaise)} · ${credit.dueSoonCount}` : '—'}</p></div>
          </div>
          <div className="p-4 flex items-center gap-3">
            <IndianRupee size={18} className="text-muted" />
            <div><p className="text-[12px] text-muted">Next due</p><p className="font-bold">{credit.nextDue?.dueAt ? `${formatMoney(credit.nextDue.amountPaise)} on ${formatDate(credit.nextDue.dueAt)}` : '—'}</p></div>
          </div>
        </div>
      )}
      {credit.overdueCount > 0 && (
        <p className="flex items-center gap-2 border-t border-danger/30 bg-danger-bg/50 px-5 py-3 text-[13.5px] text-danger">
          <AlertTriangle size={15} />New credit purchases are paused until overdue dues are cleared. <Link href="/business/credit" className="font-semibold underline">See dues</Link>
        </p>
      )}
      {compact && !credit.overdueCount && <Link href="/business/credit" className="flex items-center gap-2 border-t border-line px-5 py-3 text-[13.5px] font-semibold text-forest hover:bg-cream"><CheckCircle2 size={15} />Dues, payments and statement →</Link>}
    </section>
  );
}

/** The current month and the 11 before it, newest first, as YYYY-MM. */
export function recentMonths(count = 12) {
  const now = new Date(Date.now() + 5.5 * 3_600_000);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}
export const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function MonthPicker({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="text-muted">Month</span>
      <select className="input min-h-[40px] w-auto py-1.5 font-semibold" value={value} onChange={(e) => onChange(e.target.value)}>
        {recentMonths().map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
      </select>
    </label>
  );
}

/** Downloads rows as a CSV file (opens in Excel). Values that look like formulas are neutralised. */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob(['﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DocActions({ onCsv }: { onCsv?: () => void }) {
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      {onCsv && <button className="btn btn-outline btn-sm" onClick={onCsv}><Download size={15} />Excel (CSV)</button>}
      <button className="btn btn-primary btn-sm" onClick={() => window.print()}><Printer size={15} />Print / Save as PDF</button>
    </div>
  );
}

export const rupees = (paise: number) => (paise / 100).toFixed(2);
