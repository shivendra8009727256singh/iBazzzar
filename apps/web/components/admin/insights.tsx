'use client';
import Link from 'next/link';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, Download, Printer, Info } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, formatDate, formatMoney, label, pct } from '@/lib/format';
import { DailyBars, Meter } from '../charts';
import { Alert, Badge, Spinner, Tabs } from '../ui';
import { DateRange, Section, Table, useUrlState } from './kit';

type Summary = { orders: number; gmvPaise: number; averageOrderPaise: number; units: number; customers: number; newCustomers: number; returningCustomers: number; discountPaise: number; taxPaise: number; parcels: number; cancelledParcels: number; cancellationRate: number; returns: number; refunds: number; refundsPaise: number | null; commissionPaise: number | null };
type Analytics = {
  window: { from: string; to: string; days: number; previousFrom: string; previousTo: string; mode: string | null };
  definitions: string;
  summary: Summary; previous: Summary; change: Record<string, number | null>;
  series: { date: string; orders: number; gmvPaise: number }[];
  modes: { mode: string; orders: number; gmvPaise: number; customers: number }[];
  categories: { name: string; gmvPaise: number; units: number; orders: number }[];
  sellers: { id: string; name: string; parcels: number; gmvPaise: number; delivered: number; cancelled: number; open: number; cancellationRate: number; returns: number; dispatchHours: number | null }[];
  states: { state: string; orders: number; gmvPaise: number }[];
  products: { top: { id: string; name: string; units: number; gmvPaise: number; orders: number }[]; mostReturned: { id: string; name: string; returned: number; sold: number; returnRate: number | null }[]; lowStock: { threshold: number; items: { id: string; sku: string; productId: string; name: string; variant: string; seller: string; available: number }[] }; neverSold: { id: string; name: string; brand: string; offers: number; createdAt: string }[] };
  customers: { new: number; returning: number; top: { id: string; name: string; email: string; orders: number; gmvPaise: number; lastOrderAt: string }[] };
  payments: { mix: { method: string; orders: number; gmvPaise: number }[]; attempts: { captured: number; failed: number; failureRate: number | null }; abandoned: { onlineOrders: number; unpaidExpired: number; rate: number | null } };
  gst: { hsn: string; rateBps: number; quantity: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number }[] | null;
  settlements: { storeId: string; seller: string; salesPaise: number; shippingPaise: number; commissionPaise: number; refundsPaise: number; payoutsPaise: number; netPaise: number }[] | null;
  b2bFunnel: { rfqs: number; quoted: number; accepted: number; purchaseOrders: number; approved: number; ordered: number; orderedValuePaise: number } | null;
  conversion: { available: boolean; reason: string };
};

/** Change versus the previous period. `goodWhenUp` flips colours for metrics where a rise is bad (cancellations, returns). */
function Delta({ value, goodWhenUp = true }: { value: number | null | undefined; goodWhenUp?: boolean }) {
  if (value === null || value === undefined) return <span className="text-xs text-muted">new</span>;
  if (value === 0) return <span className="text-xs text-muted">no change</span>;
  const up = value > 0;
  const good = up === goodWhenUp;
  return <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold', good ? 'text-success' : 'text-danger')}>{up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(value)}%</span>;
}

function Kpi({ title, value, before, change, goodWhenUp, hint }: { title: string; value: string; before: string; change?: number | null; goodWhenUp?: boolean; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-sm text-muted font-medium">{title}</p>
      <p className="text-2xl font-bold tabular-nums mt-1">{value}</p>
      <p className="text-xs text-muted mt-1 flex flex-wrap items-center gap-1.5"><Delta value={change} goodWhenUp={goodWhenUp} /><span>vs {before}</span></p>
      {hint && <p className="text-[11px] text-muted mt-1">{hint}</p>}
    </div>
  );
}

/** Horizontal bars for ranked lists (category, state, product). Values are shown as text too. */
function BarList({ items, format }: { items: { key: string; label: React.ReactNode; value: number; meta?: string }[]; format: (n: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className="text-sm text-muted">No sales in this period.</p>;
  return (
    <ul className="grid gap-2">
      {items.map((i) => (
        <li key={i.key} className="text-sm">
          <div className="flex justify-between gap-3"><span className="truncate">{i.label}</span><span className="font-semibold tabular-nums whitespace-nowrap">{format(i.value)}{i.meta && <span className="text-muted font-normal"> · {i.meta}</span>}</span></div>
          <div className="h-2 rounded-full bg-mint mt-1 overflow-hidden" aria-hidden><div className="h-full rounded-full bg-forest" style={{ width: `${Math.max(2, (i.value / max) * 100)}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

function Card({ title, csv, children, className }: { title: string; csv?: string; children: React.ReactNode; className?: string }) {
  const { params } = useUrlState();
  const base = new URLSearchParams();
  for (const k of ['from', 'to', 'mode']) { const v = params.get(k); if (v) base.set(k, v); }
  return (
    <section className={cn('card card-pad break-inside-avoid', className)}>
      <div className="flex items-center justify-between gap-2 mb-3"><h2 className="text-lg">{title}</h2>{csv && <a className="text-xs font-semibold text-forest hover:underline print:hidden" href={`/api/admin/analytics/export?${base}&format=csv&section=${csv}`} download>CSV</a>}</div>
      {children}
    </section>
  );
}

export function AnalyticsPage() {
  const { get, set, params } = useUrlState();
  const qs = new URLSearchParams();
  for (const k of ['from', 'to', 'mode']) { const v = params.get(k); if (v) qs.set(k, v); }
  const query = useQuery({ queryKey: ['admin', 'analytics', qs.toString()], queryFn: () => api<Analytics>(`/admin/analytics?${qs}`), placeholderData: keepPreviousData });
  const a = query.data;
  const mode = get('mode');
  const s = a?.summary;
  const p = a?.previous;
  const prevLabel = a ? `${formatDate(a.window.previousFrom, { day: 'numeric', month: 'short' })}–${formatDate(a.window.previousTo, { day: 'numeric', month: 'short' })}` : '';
  return (
    <Section title="Analytics" description={a ? `${formatDate(a.window.from)} to ${formatDate(a.window.to)} (${a.window.days} days), compared with the ${a.window.days} days before.` : 'Sales, customers, sellers and tax for any period.'}
      actions={<div className="flex flex-wrap gap-2 print:hidden">
        <DateRange from={get('from')} to={get('to')} onChange={(f, t) => set({ from: f, to: t })} label="Last 30 days" />
        <a className="btn btn-outline btn-sm min-h-[40px]" href={`/api/admin/analytics/export?${qs}`} download><Download size={15} />Excel</a>
        <button type="button" className="btn btn-outline btn-sm min-h-[40px]" onClick={() => window.print()}><Printer size={15} />PDF / print</button>
      </div>}>
      <div className="print:hidden"><Tabs value={mode || 'ALL'} onChange={(v) => set({ mode: v === 'ALL' ? null : v })} items={[{ value: 'ALL', label: 'All channels' }, { value: 'RETAIL', label: 'B2C retail' }, { value: 'BUSINESS', label: 'B2B business' }]} /></div>
      {query.error ? <Alert>{(query.error as Error).message}</Alert> : !a || !s || !p ? <Spinner label="Crunching the numbers" /> : (
        <div className={cn('grid gap-6 transition-opacity', query.isFetching && 'opacity-60')}>
          <p className="text-xs text-muted flex items-start gap-1.5"><Info size={14} className="mt-0.5 shrink-0" />{a.definitions}</p>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Kpi title="Sales" value={formatMoney(s.gmvPaise)} before={`${formatMoney(p.gmvPaise)} (${prevLabel})`} change={a.change.gmvPaise} />
            <Kpi title="Orders" value={s.orders.toLocaleString('en-IN')} before={String(p.orders)} change={a.change.orders} />
            <Kpi title="Average order" value={formatMoney(s.averageOrderPaise)} before={formatMoney(p.averageOrderPaise)} change={a.change.averageOrderPaise} />
            <Kpi title="Units sold" value={s.units.toLocaleString('en-IN')} before={String(p.units)} change={a.change.units} />
            <Kpi title="Customers" value={s.customers.toLocaleString('en-IN')} before={String(p.customers)} change={a.change.customers} hint={`${s.newCustomers} new · ${s.returningCustomers} returning`} />
            <Kpi title="Parcel cancellation rate" value={`${s.cancellationRate}%`} before={`${p.cancellationRate}%`} change={a.change.cancellationRate} goodWhenUp={false} hint={`${s.cancelledParcels} of ${s.parcels} parcels`} />
            <Kpi title="Return requests" value={String(s.returns)} before={String(p.returns)} change={a.change.returns} goodWhenUp={false} />
            {s.commissionPaise !== null ? <Kpi title="Commission earned" value={formatMoney(s.commissionPaise)} before={formatMoney(p.commissionPaise ?? 0)} change={a.change.commissionPaise} hint={`Refunds ${formatMoney(s.refundsPaise ?? 0)}`} /> : <Kpi title="Coupon discounts" value={formatMoney(s.discountPaise)} before={formatMoney(p.discountPaise)} change={a.change.discountPaise} goodWhenUp={false} />}
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
            <Card title="Daily sales" csv="daily"><DailyBars data={a.series} value={(x: { gmvPaise: number }) => x.gmvPaise} format={(n) => formatMoney(n)} label="Sales per day" period={`${a.window.days} days`} /></Card>
            <Card title="B2C vs B2B" csv="modes">
              <Meter items={a.modes.map((m) => ({ label: m.mode === 'RETAIL' ? 'B2C retail' : 'B2B business', value: m.orders }))} />
              <Table head={['Channel', 'Orders', 'Customers', 'Sales']}>{a.modes.map((m) => <tr key={m.mode}><td>{m.mode === 'RETAIL' ? 'B2C retail' : 'B2B business'}</td><td>{m.orders}</td><td>{m.customers}</td><td className="font-semibold">{formatMoney(m.gmvPaise)}</td></tr>)}</Table>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Sales by category" csv="categories"><BarList format={formatMoney} items={a.categories.slice(0, 12).map((c) => ({ key: c.name, label: c.name, value: c.gmvPaise, meta: `${c.units} units` }))} /></Card>
            <Card title="Sales by state" csv="states"><BarList format={formatMoney} items={a.states.slice(0, 12).map((x) => ({ key: x.state, label: x.state, value: x.gmvPaise, meta: `${x.orders} orders` }))} /></Card>
          </div>

          <Card title="Seller performance" csv="sellers">
            <Table head={['Seller', 'Parcels', 'Sales', 'Delivered', 'Open', 'Cancelled', 'Returns', 'Avg dispatch']} empty={!a.sellers.length}>
              {a.sellers.map((x) => <tr key={x.id}><td><Link href={`/admin/sellers?open=${x.id}`} className="font-semibold hover:underline">{x.name}</Link></td><td>{x.parcels}</td><td className="font-semibold">{formatMoney(x.gmvPaise)}</td><td>{x.delivered}</td><td>{x.open}</td><td className={x.cancellationRate > 5 ? 'text-danger font-semibold' : ''}>{x.cancelled} ({x.cancellationRate}%)</td><td>{x.returns}</td><td>{x.dispatchHours == null ? '—' : `${x.dispatchHours} h`}</td></tr>)}
            </Table>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Top products" csv="top-products"><BarList format={formatMoney} items={a.products.top.map((x) => ({ key: x.id, label: <Link href={`/admin/products?open=${x.id}`} className="hover:underline">{x.name}</Link>, value: x.gmvPaise, meta: `${x.units} units` }))} /></Card>
            <Card title="Most returned" csv="returned">
              <Table head={['Product', 'Returned', 'Sold', 'Rate']} empty={!a.products.mostReturned.length}>{a.products.mostReturned.map((x) => <tr key={x.id}><td><Link href={`/admin/products?open=${x.id}`} className="hover:underline">{x.name}</Link></td><td>{x.returned}</td><td>{x.sold}</td><td className={(x.returnRate ?? 0) > 10 ? 'text-danger font-semibold' : ''}>{x.returnRate == null ? '—' : `${x.returnRate}%`}</td></tr>)}</Table>
            </Card>
            <Card title={`Low stock (≤ ${a.products.lowStock.threshold})`} csv="low-stock">
              <Table head={['Product', 'Seller', 'Available']} empty={!a.products.lowStock.items.length}>{a.products.lowStock.items.map((x) => <tr key={x.id}><td><Link href={`/admin/products?open=${x.productId}`} className="hover:underline">{x.name}</Link><span className="block text-xs text-muted">{x.variant} · {x.sku}</span></td><td>{x.seller}</td><td className={x.available <= 0 ? 'text-danger font-bold' : 'text-warning font-semibold'}>{x.available}</td></tr>)}</Table>
              <Link href="/admin/inventory" className="text-sm text-forest font-semibold mt-3 inline-block print:hidden">Full inventory →</Link>
            </Card>
            <Card title="Never sold" csv="never-sold">
              <Table head={['Product', 'Live offers', 'Live since']} empty={!a.products.neverSold.length}>{a.products.neverSold.map((x) => <tr key={x.id}><td><Link href={`/admin/products?open=${x.id}`} className="hover:underline">{x.name}</Link><span className="block text-xs text-muted">{x.brand}</span></td><td>{x.offers}</td><td>{formatDate(x.createdAt)}</td></tr>)}</Table>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
            <Card title="New vs returning customers">
              <Meter items={[{ label: 'New (first order in period)', value: a.customers.new }, { label: 'Returning', value: a.customers.returning }]} />
              <p className="text-xs text-muted mt-3">A customer is new when their first placed order falls in this period.</p>
            </Card>
            <Card title="Top customers" csv="customers">
              <Table head={['Customer', 'Orders', 'Sales', 'Last order']} empty={!a.customers.top.length}>{a.customers.top.map((c) => <tr key={c.id}><td><Link href={`/admin/customers?open=${c.id}`} className="font-semibold hover:underline">{c.name}</Link><span className="block text-xs text-muted">{c.email}</span></td><td>{c.orders}</td><td className="font-semibold">{formatMoney(c.gmvPaise)}</td><td>{formatDate(c.lastOrderAt)}</td></tr>)}</Table>
            </Card>
          </div>

          <Card title="Payments" csv="payments">
            <div className="grid gap-6 md:grid-cols-[1.3fr_1fr]">
              <Table head={['Method', 'Orders', 'Sales']} empty={!a.payments.mix.length}>{a.payments.mix.map((m) => <tr key={m.method}><td>{label(m.method)}</td><td>{m.orders}</td><td className="font-semibold">{formatMoney(m.gmvPaise)}</td></tr>)}</Table>
              <div className="grid gap-3 content-start">
                <div className="rounded-xl border border-line p-3"><p className="text-sm text-muted">Online payment attempts that failed</p><p className="text-xl font-bold">{a.payments.attempts.failureRate == null ? '—' : `${a.payments.attempts.failureRate}%`}</p><p className="text-xs text-muted">{a.payments.attempts.failed} failed · {a.payments.attempts.captured} succeeded</p></div>
                <div className="rounded-xl border border-line p-3"><p className="text-sm text-muted">Online orders never paid (expired)</p><p className="text-xl font-bold">{a.payments.abandoned.rate == null ? '—' : `${a.payments.abandoned.rate}%`}</p><p className="text-xs text-muted">{a.payments.abandoned.unpaidExpired} of {a.payments.abandoned.onlineOrders} online orders</p></div>
              </div>
            </div>
          </Card>

          {a.b2bFunnel && (
            <Card title="B2B funnel" csv="b2b">
              <BarList format={(n) => n.toLocaleString('en-IN')} items={[['RFQs raised', a.b2bFunnel.rfqs], ['Got at least one quote', a.b2bFunnel.quoted], ['Quote accepted', a.b2bFunnel.accepted], ['Purchase orders', a.b2bFunnel.purchaseOrders], ['POs approved', a.b2bFunnel.approved], ['POs ordered', a.b2bFunnel.ordered]].map(([l, v]) => ({ key: String(l), label: String(l), value: Number(v) }))} />
              <p className="text-sm mt-3">Ordered value <strong>{formatMoney(a.b2bFunnel.orderedValuePaise)}</strong>{a.b2bFunnel.rfqs ? <> · RFQ to order {Math.round((a.b2bFunnel.ordered / a.b2bFunnel.rfqs) * 100)}%</> : null}</p>
            </Card>
          )}

          {a.gst && (
            <Card title="GST summary by HSN" csv="gst-hsn">
              <Table head={['HSN', 'Rate', 'Qty', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total']} empty={!a.gst.length}>
                {a.gst.map((g) => <tr key={`${g.hsn}-${g.rateBps}`}><td className="font-mono">{g.hsn}</td><td>{pct(g.rateBps)}</td><td>{g.quantity}</td><td>{formatMoney(g.taxablePaise)}</td><td>{formatMoney(g.cgstPaise)}</td><td>{formatMoney(g.sgstPaise)}</td><td>{formatMoney(g.igstPaise)}</td><td className="font-semibold">{formatMoney(g.totalPaise)}</td></tr>)}
                {a.gst.length > 1 && <tr className="font-bold"><td colSpan={3}>Total</td><td>{formatMoney(a.gst.reduce((t, g) => t + g.taxablePaise, 0))}</td><td>{formatMoney(a.gst.reduce((t, g) => t + g.cgstPaise, 0))}</td><td>{formatMoney(a.gst.reduce((t, g) => t + g.sgstPaise, 0))}</td><td>{formatMoney(a.gst.reduce((t, g) => t + g.igstPaise, 0))}</td><td>{formatMoney(a.gst.reduce((t, g) => t + g.totalPaise, 0))}</td></tr>}
              </Table>
              <p className="text-xs text-muted mt-2">For filing, also use the invoice-level GST report in Reports. Each seller files GST under their own GSTIN.</p>
            </Card>
          )}

          {a.settlements && (
            <Card title="Settlement statement" csv="settlements">
              <Table head={['Seller', 'Sales', 'Delivery', 'Commission', 'Refunds', 'Net earned', 'Paid out']} empty={!a.settlements.length}>
                {a.settlements.map((x) => <tr key={x.storeId}><td><Link href={`/admin/finance?store=${x.storeId}`} className="font-semibold hover:underline">{x.seller}</Link></td><td>{formatMoney(x.salesPaise)}</td><td>{formatMoney(x.shippingPaise)}</td><td>{formatMoney(x.commissionPaise)}</td><td>{formatMoney(x.refundsPaise)}</td><td className="font-semibold">{formatMoney(x.netPaise)}</td><td>{formatMoney(x.payoutsPaise)}</td></tr>)}
              </Table>
              <p className="text-xs text-muted mt-2">Ledger entries dated in this period (earnings are recorded when a parcel is delivered).</p>
            </Card>
          )}

          <Alert tone="info" title="Visitor conversion rate: not available">{a.conversion.reason}</Alert>
          {!a.gst && <p className="text-sm text-muted"><Badge tone="neutral">Finance only</Badge> GST, refunds, commission and settlement figures are shown to finance staff.</p>}
        </div>
      )}
    </Section>
  );
}
