'use client';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { motion, animate, useReducedMotion } from 'motion/react';
import {
  IndianRupee, ShoppingBag, Users, Store, Package, TrendingUp, TrendingDown, ArrowRight, Hourglass, PackageOpen, PackageCheck, Truck, CircleCheckBig,
  ClipboardCheck, Building2, RotateCcw, LifeBuoy, Landmark, Boxes, AlertTriangle, Star, Activity, FileText, Wallet, BarChart3, Sparkles, CheckCircle2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn, formatDate, formatDateTime, formatMoney, label } from '@/lib/format';
import { useSession } from '../providers';
import { Alert, StatusBadge } from '../ui';
import type { Can } from './people';

type Win = { orders: number; buyers: number; gmvPaise: number | null; demoOrders: number; demoGmvPaise: number | null; awaitingPayment: number };
type Dashboard = {
  metrics: { orders: number; awaitingPayment: number; toShip: number; customers: number; activeSellers: number; activeRfqs: number; lowStock: number; paidGmvPaise: number | null; averageOrderPaise: number | null; platformRevenuePaise: number | null; demoGmvPaise: number | null; refundsPendingPaise: number | null; refundsPending: number };
  queues: { sellers: number; products: number; offers: number; organizations: number; returns: number; tickets: number; bankTransfers: number };
  series: { date: string; orders: number; paidGmvPaise: number | null }[];
  statusMix: { value: string; count: number }[];
  recentOrders: { id: string; number: string; createdAt: string; status: string; paymentStatus: string; totalPaise: number; customer: string }[];
  topSellers: { id: string; name: string; grossPaise: number | null }[];
};
type Extra = {
  today: Win; yesterday: Win; last30: Win; prev30: Win;
  pipeline: { awaitingPayment: number; toPack: number; packed: number; inTransit: number; delivered30: number };
  topProducts: { id: string; name: string; image: string | null; units: number; gmvPaise: number | null }[];
  topCategories: { name: string; units: number; gmvPaise: number }[];
  paymentMix: { method: string; orders: number; gmvPaise: number | null }[];
  lowStock: { threshold: number; items: { id: string; productId: string; name: string; variant: string; seller: string; available: number }[] };
  newCustomers: { id: string; name: string; email: string; createdAt: string; orders: number }[];
  reviews: { average: number | null; count: number; latest: { id: string; rating: number; title: string; authorName: string; createdAt: string; product: { id: string; name: string } }[] };
  b2b: { openRfqs: number; openPurchaseOrders: number; creditOutstandingPaise: number | null; creditOrders: number; businesses: number } | null;
  liveProducts: number;
  activity: { id: string; action: string; entityType: string; createdAt: string; actor: string }[];
};

// ───────────── Motion helpers ─────────────
/** Counts up from the previous value to the new one. Shows the final number straight away when motion is reduced. */
function CountUp({ value, format = (n) => Math.round(n).toLocaleString('en-IN') }: { value: number; format?: (n: number) => string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reduce) { setShown(value); from.current = value; return; }
    const controls = animate(from.current, value, { duration: 1.1, ease: [0.16, 1, 0.3, 1], onUpdate: setShown });
    from.current = value;
    return () => controls.stop();
  }, [value, reduce]);
  return <span className="tabular-nums">{format(shown)}</span>;
}
const rupees = (paise: number) => formatMoney(Math.round(paise));

/** Fades and lifts each block into place, one after another. */
function Reveal({ i = 0, className, children }: { i?: number; className?: string; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={cn('min-w-0', className)} initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: Math.min(i, 12) * 0.05, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  );
}

/** A bar that grows to its width on load. */
function Bar({ pct, className }: { pct: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <div className="h-2 rounded-full bg-mint overflow-hidden" aria-hidden>
      <motion.div className={cn('h-full rounded-full', className ?? 'bg-forest')} initial={reduce ? false : { width: 0 }} animate={{ width: `${Math.max(2, pct)}%` }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.15 }} />
    </div>
  );
}

function change(now: number, before: number) {
  if (!before) return now ? null : 0;
  return Math.round(((now - before) / before) * 1000) / 10;
}
function Delta({ now, before, suffix = 'vs previous 30 days' }: { now: number; before: number; suffix?: string }) {
  const c = change(now, before);
  if (c === null) return <span className="text-xs text-muted">new · {suffix}</span>;
  const up = c >= 0;
  return (
    <span className="text-xs text-muted flex items-center gap-1.5 flex-wrap">
      <span className={cn('inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold', up ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger')}>{up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{Math.abs(c)}%</span>{suffix}
    </span>
  );
}

function Card({ title, action, children, className }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('card p-5 h-full', className)}>
      {(title || action) && <div className="flex items-center justify-between gap-2 mb-4">{title && <h2 className="text-[17px] font-semibold">{title}</h2>}{action}</div>}
      {children}
    </section>
  );
}
const More = ({ href, children = 'View all' }: { href: string; children?: React.ReactNode }) => <Link href={href} className="text-sm font-semibold text-forest hover:underline inline-flex items-center gap-1">{children}<ArrowRight size={14} /></Link>;

// ───────────── Sales chart with orders / sales toggle ─────────────
function TrendChart({ series, finance }: { series: Dashboard['series']; finance: boolean }) {
  const [mode, setMode] = useState<'orders' | 'sales'>(finance ? 'sales' : 'orders');
  const reduce = useReducedMotion();
  const values = series.map((d) => (mode === 'sales' ? (d.paidGmvPaise ?? 0) : d.orders));
  const max = Math.max(1, ...values);
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? values.length - 1;
  const total = values.reduce((a, b) => a + b, 0);
  const fmt = (v: number) => (mode === 'sales' ? rupees(v) : v.toLocaleString('en-IN'));
  return (
    <Card title="Last 30 days" action={finance && (
      <div role="tablist" className="flex rounded-full bg-mint p-0.5 text-sm">
        {(['sales', 'orders'] as const).map((m) => <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={cn('rounded-full px-3 py-1 font-semibold capitalize transition', mode === m ? 'bg-white shadow-sm text-forest' : 'text-muted')}>{m === 'sales' ? 'Paid sales' : 'Orders'}</button>)}
      </div>
    )}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <p className="text-2xl font-bold"><CountUp value={total} format={fmt} /> <span className="text-sm font-normal text-muted">in 30 days</span></p>
        <p className="text-sm"><strong>{fmt(values[shown] ?? 0)}</strong> <span className="text-muted">on {formatDate(series[shown]?.date, { day: 'numeric', month: 'short' })}</span></p>
      </div>
      <div className="flex items-end gap-[3px] h-44" onMouseLeave={() => setHover(null)} aria-hidden>
        {values.map((v, i) => (
          <button key={i} tabIndex={-1} onMouseEnter={() => setHover(i)} className="flex-1 h-full flex items-end group">
            <motion.span className={cn('w-full rounded-t-[4px]', i === shown ? 'bg-gold' : 'bg-forest/75 group-hover:bg-forest')}
              initial={reduce ? false : { height: '0%' }} animate={{ height: `${Math.max(v ? 4 : 1.5, (v / max) * 100)}%` }} transition={{ duration: 0.6, delay: reduce ? 0 : i * 0.015, ease: [0.16, 1, 0.3, 1] }} />
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-muted mt-2"><span>{formatDate(series[0]?.date, { day: 'numeric', month: 'short' })}</span><span>Today</span></div>
      <table className="sr-only"><caption>{mode === 'sales' ? 'Paid sales per day' : 'Orders per day'}</caption><tbody>{series.map((d, i) => <tr key={d.date}><td>{d.date}</td><td>{fmt(values[i])}</td></tr>)}</tbody></table>
    </Card>
  );
}

// ───────────── Page ─────────────
export function Dashboard({ can }: { can: Can }) {
  const { user } = useSession();
  const main = useQuery({ queryKey: ['admin', 'dashboard'], queryFn: () => api<Dashboard>('/admin/dashboard'), refetchInterval: 60_000 });
  const extra = useQuery({ queryKey: ['admin', 'dashboard-extra'], queryFn: () => api<Extra>('/admin/dashboard/extra'), refetchInterval: 60_000 });
  const finance = can('finance.view');
  const d = main.data;
  const x = extra.data;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  if (main.error) return <Alert>{(main.error as Error).message}</Alert>;
  if (!d) return <DashboardSkeleton />;

  const queue = ([
    [d.queues.sellers, 'Seller applications', '/admin/sellers?status=PENDING', Store],
    [d.queues.products + d.queues.offers, 'Products & offers to review', '/admin/moderation', ClipboardCheck],
    [d.queues.organizations, 'Businesses to verify', '/admin/organizations?status=PENDING', Building2],
    [d.queues.returns, 'Return requests', '/admin/returns?status=REQUESTED', RotateCcw],
    [d.queues.tickets, 'Open support tickets', '/admin/support', LifeBuoy],
    [d.queues.bankTransfers, 'Bank transfers to match', '/admin/orders?payment=BANK_TRANSFER_PENDING', Landmark],
    [d.metrics.refundsPending, 'Refunds to pay', '/admin/refunds?status=PENDING_PROVIDER', Wallet],
    [d.metrics.lowStock, 'Offers low on stock', '/admin/inventory', Boxes],
  ] as [number, string, string, typeof Store][]).filter(([n]) => n > 0);

  const pipe = x?.pipeline;
  const steps: [string, number, string, typeof Store, string][] = pipe ? [
    ['Awaiting payment', pipe.awaitingPayment, '/admin/orders?status=AWAITING_PAYMENT', Hourglass, 'bg-[#fdf1d8] text-[#8a5a00]'],
    ['To pack', pipe.toPack, '/admin/orders?status=CONFIRMED', PackageOpen, 'bg-info-bg text-info'],
    ['Packed', pipe.packed, '/admin/orders?status=CONFIRMED', PackageCheck, 'bg-[#efeafd] text-[#6941c6]'],
    ['In transit', pipe.inTransit, '/admin/shipping', Truck, 'bg-mint text-forest'],
    ['Delivered (30 days)', pipe.delivered30, '/admin/orders?status=DELIVERED', CircleCheckBig, 'bg-success-bg text-success'],
  ] : [];
  const catMax = Math.max(1, ...(x?.topCategories.map((c) => c.gmvPaise) ?? [1]));
  const payTotal = Math.max(1, x?.paymentMix.reduce((s, p) => s + p.orders, 0) ?? 1);
  const payTones = ['bg-forest', 'bg-gold', 'bg-info', 'bg-[#7a5af8]'];

  return (
    <div className="grid gap-5 grid-cols-1">
      {/* Welcome banner with today's numbers */}
      <Reveal>
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-forest via-emerald to-deep text-white p-5 md:p-7 shadow-lift">
          <div className="absolute -right-16 -top-20 size-72 rounded-full bg-gold/15 blur-2xl" aria-hidden />
          <div className="absolute right-24 -bottom-24 size-56 rounded-full bg-white/5" aria-hidden />
          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-gold-light text-sm font-semibold flex items-center gap-1.5"><Sparkles size={15} />{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
              <h1 className="text-[28px] md:text-[34px] text-white mt-1">{greeting}, {user?.name.split(' ')[0]}</h1>
              <p className="text-white/75 mt-1 max-w-xl">Marketplace overview: everything here is calculated from stored records, and demo payments are never counted as sales.</p>
              <div className="flex flex-wrap gap-2 mt-4">
                {can('reports.view') && <Link href="/admin/analytics" className="btn btn-sm bg-white text-forest hover:bg-ivory"><BarChart3 size={15} />Analytics</Link>}
                {can('orders.view') && <Link href="/admin/orders" className="btn btn-sm border border-white/30 text-white hover:bg-white/10"><ShoppingBag size={15} />Orders</Link>}
                {can('catalogue.manage') && <Link href="/admin/moderation" className="btn btn-sm border border-white/30 text-white hover:bg-white/10"><ClipboardCheck size={15} />Moderation</Link>}
              </div>
            </div>
            {x && (
              <div className="grid grid-cols-2 gap-3 w-full sm:w-auto sm:min-w-[280px]">
                <div className="rounded-2xl bg-white/10 border border-white/15 backdrop-blur px-4 py-3">
                  <p className="text-xs text-white/70">Today’s orders</p>
                  <p className="text-3xl font-bold"><CountUp value={x.today.orders} /></p>
                  <p className="text-[11px] text-white/70">yesterday {x.yesterday.orders}</p>
                  {(x.today.demoOrders > 0 || x.today.awaitingPayment > 0) && <p className="text-[11px] text-gold-light mt-0.5">{[x.today.awaitingPayment ? `+${x.today.awaitingPayment} awaiting payment` : '', x.today.demoOrders ? `+${x.today.demoOrders} demo` : ''].filter(Boolean).join(' · ')}</p>}
                </div>
                <div className="rounded-2xl bg-white/10 border border-white/15 backdrop-blur px-4 py-3">
                  <p className="text-xs text-white/70">Today’s sales</p>
                  <p className="text-2xl sm:text-3xl font-bold break-words">{x.today.gmvPaise == null ? '—' : <CountUp value={x.today.gmvPaise} format={rupees} />}</p>
                  <p className="text-[11px] text-white/70">{x.yesterday.gmvPaise == null ? 'finance only' : `yesterday ${rupees(x.yesterday.gmvPaise)}`}</p>
                  {!!x.today.demoGmvPaise && <p className="text-[11px] text-gold-light mt-0.5">+{rupees(x.today.demoGmvPaise)} in demo orders</p>}
                </div>
              </div>
            )}
          </div>
        </section>
      </Reveal>

      {/* Key numbers */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { title: 'Sales · 30 days', icon: IndianRupee, tone: 'bg-[#f7ecd2] text-gold-ink', value: x?.last30.gmvPaise, fmt: rupees, delta: x && x.last30.gmvPaise != null ? [x.last30.gmvPaise, x.prev30.gmvPaise ?? 0] : null, hint: finance ? undefined : 'Finance only' },
          { title: 'Orders · 30 days', icon: ShoppingBag, tone: 'bg-mint text-forest', value: x?.last30.orders, delta: x ? [x.last30.orders, x.prev30.orders] : null },
          { title: 'Average order', icon: TrendingUp, tone: 'bg-info-bg text-info', value: x && x.last30.gmvPaise != null && x.last30.orders ? x.last30.gmvPaise / x.last30.orders : null, fmt: rupees, delta: x && x.last30.gmvPaise != null && x.prev30.orders ? [x.last30.gmvPaise / Math.max(1, x.last30.orders), (x.prev30.gmvPaise ?? 0) / x.prev30.orders] : null, hint: finance ? undefined : 'Finance only' },
          { title: 'Platform revenue', icon: Wallet, tone: 'bg-[#efeafd] text-[#6941c6]', value: d.metrics.platformRevenuePaise, fmt: rupees, hint: d.metrics.platformRevenuePaise == null ? 'Finance only' : 'Commission on delivered orders, all time' },
          { title: 'Buyers · 30 days', icon: Users, tone: 'bg-mint text-forest', value: x?.last30.buyers, delta: x ? [x.last30.buyers, x.prev30.buyers] : null },
          { title: 'Customers', icon: Users, tone: 'bg-info-bg text-info', value: d.metrics.customers, hint: 'Registered accounts' },
          { title: 'Active sellers', icon: Store, tone: 'bg-[#f7ecd2] text-gold-ink', value: d.metrics.activeSellers, hint: `${d.metrics.activeRfqs} open RFQs` },
          { title: 'Live products', icon: Package, tone: 'bg-success-bg text-success', value: x?.liveProducts, hint: x?.reviews.average ? `${x.reviews.average} ★ from ${x.reviews.count} reviews` : undefined },
        ].map((k, i) => (
          <Reveal key={k.title} i={i + 1}>
            <div className="card p-5 h-full hover:shadow-lift transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-muted font-medium">{k.title}</p>
                <span className={cn('size-10 rounded-xl grid place-items-center', k.tone)}><k.icon size={18} /></span>
              </div>
              <p className="text-[23px] sm:text-[26px] font-bold mt-1 leading-tight break-words">{k.value == null ? '—' : <CountUp value={k.value} format={k.fmt} />}</p>
              <div className="mt-1.5 min-h-5">{k.delta ? <Delta now={k.delta[0]} before={k.delta[1]} /> : k.hint ? <span className="text-xs text-muted">{k.hint}</span> : null}</div>
            </div>
          </Reveal>
        ))}
      </div>
      {!!d.metrics.demoGmvPaise && <Alert tone="info">Demo-simulated orders total {formatMoney(d.metrics.demoGmvPaise)}. Not real money; excluded from sales.</Alert>}

      {/* Chart and attention */}
      <div className="grid gap-5 grid-cols-1 xl:grid-cols-[1.7fr_1fr]">
        <Reveal i={9}><TrendChart series={d.series} finance={finance} /></Reveal>
        <Reveal i={10}>
          <Card title="Needs attention" action={<span className="rounded-full bg-[#fdf1d8] text-[#8a5a00] text-xs font-bold px-2 py-0.5">{queue.reduce((s, [n]) => s + n, 0)}</span>}>
            {queue.length ? (
              <ul className="grid gap-2">{queue.map(([n, t, href, Icon]) => (
                <li key={t}><Link href={href} className="group flex items-center gap-3 rounded-xl border border-line p-3 hover:border-forest hover:bg-cream transition">
                  <span className="size-9 rounded-lg bg-mint text-forest grid place-items-center"><Icon size={17} /></span>
                  <span className="flex-1 text-sm font-medium">{t}</span>
                  <span className="font-bold tabular-nums">{n}</span><ArrowRight size={15} className="text-muted group-hover:translate-x-0.5 transition" />
                </Link></li>
              ))}</ul>
            ) : <p className="flex items-center gap-2 text-sm text-muted py-6 justify-center"><CheckCircle2 size={18} className="text-success" />Every queue is clear.</p>}
          </Card>
        </Reveal>
      </div>

      {/* Order pipeline */}
      {pipe && (
        <Reveal i={11}>
          <Card title="Order pipeline" action={<More href="/admin/orders" />}>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
              {steps.map(([t, n, href, Icon, tone], i) => (
                <Link key={t} href={href} className="relative rounded-2xl border border-line p-4 hover:border-forest hover:shadow-card transition bg-white">
                  <span className={cn('size-10 rounded-xl grid place-items-center', tone)}><Icon size={18} /></span>
                  <p className="text-2xl font-bold mt-2"><CountUp value={n} /></p>
                  <p className="text-sm text-muted">{t}</p>
                  {i < steps.length - 1 && <ArrowRight size={16} className="hidden md:block absolute -right-[13px] top-1/2 -translate-y-1/2 text-line-strong bg-[#f3f6f1] rounded-full z-10" aria-hidden />}
                </Link>
              ))}
            </div>
          </Card>
        </Reveal>
      )}

      {/* Leaders */}
      {x && (
        <div className="grid gap-5 grid-cols-1 lg:grid-cols-3">
          <Reveal i={12}>
            <Card title="Top products · 30 days" action={<More href="/admin/analytics" />}>
              <ol className="grid gap-3 grid-cols-1">{x.topProducts.map((p, i) => (
                <li key={p.id}><Link href={`/admin/products?open=${p.id}`} className="flex items-center gap-3 group">
                  <span className="text-sm font-bold text-muted w-4">{i + 1}</span>
                  <span className="relative size-11 rounded-xl bg-cream border border-line shrink-0 overflow-hidden">{p.image && <Image src={p.image} alt="" fill sizes="44px" className="object-contain p-1" unoptimized />}</span>
                  <span className="flex-1 min-w-0"><span className="block text-sm font-semibold truncate group-hover:underline">{p.name}</span><span className="block text-xs text-muted">{p.units} sold</span></span>
                  {p.gmvPaise != null && <span className="text-sm font-semibold tabular-nums">{rupees(p.gmvPaise)}</span>}
                </Link></li>
              ))}{!x.topProducts.length && <li className="text-sm text-muted">No sales yet.</li>}</ol>
            </Card>
          </Reveal>
          <Reveal i={13}>
            <Card title="Top categories · 30 days">
              <ul className="grid gap-3.5">{x.topCategories.map((c) => (
                <li key={c.name} className="text-sm">
                  <div className="flex justify-between gap-2 mb-1"><span className="font-medium">{c.name}</span><span className="text-muted">{finance ? rupees(c.gmvPaise) : `${c.units} units`}</span></div>
                  <Bar pct={(c.gmvPaise / catMax) * 100} />
                </li>
              ))}{!x.topCategories.length && <li className="text-sm text-muted">No sales yet.</li>}</ul>
            </Card>
          </Reveal>
          <Reveal i={14}>
            <Card title="Top sellers" action={<More href="/admin/sellers" />}>
              <ol className="grid gap-3 grid-cols-1">{d.topSellers.map((s, i) => (
                <li key={s.id}><Link href={`/admin/sellers?open=${s.id}`} className="flex items-center gap-3 group">
                  <span className={cn('size-9 rounded-full grid place-items-center text-sm font-bold', i === 0 ? 'bg-gold text-white' : i === 1 ? 'bg-[#d9dee0] text-ink' : i === 2 ? 'bg-[#e8c4a0] text-ink' : 'bg-mint text-forest')}>{i + 1}</span>
                  <span className="flex-1 text-sm font-semibold truncate group-hover:underline">{s.name}</span>
                  <span className="text-sm tabular-nums">{s.grossPaise == null ? '' : rupees(s.grossPaise)}</span>
                </Link></li>
              ))}{!d.topSellers.length && <li className="text-sm text-muted">No delivered sales yet.</li>}</ol>
              <p className="text-xs text-muted mt-3">By delivered sales, all time.</p>
            </Card>
          </Reveal>
        </div>
      )}

      {/* Mixes and B2B */}
      {x && (
        <div className="grid gap-5 grid-cols-1 lg:grid-cols-3">
          <Reveal i={15}>
            <Card title="How customers pay · 30 days">
              <div className="flex h-3 rounded-full overflow-hidden bg-mint mb-4" aria-hidden>
                {x.paymentMix.map((p, i) => <motion.span key={p.method} className={payTones[i % payTones.length]} initial={{ width: 0 }} animate={{ width: `${(p.orders / payTotal) * 100}%` }} transition={{ duration: 0.9, delay: 0.2 }} />)}
              </div>
              <ul className="grid gap-2 text-sm">{x.paymentMix.map((p, i) => (
                <li key={p.method} className="flex items-center gap-2"><span className={cn('size-2.5 rounded-full', payTones[i % payTones.length])} /><span className="flex-1">{label(p.method)}</span><span className="text-muted">{Math.round((p.orders / payTotal) * 100)}%</span><strong className="w-10 text-right">{p.orders}</strong></li>
              ))}{!x.paymentMix.length && <li className="text-muted">No orders yet.</li>}</ul>
            </Card>
          </Reveal>
          <Reveal i={16}>
            <Card title="Order status">
              <ul className="grid gap-2.5 grid-cols-1">{d.statusMix.sort((a, b) => b.count - a.count).map((s) => {
                const total = Math.max(1, d.statusMix.reduce((t, x2) => t + x2.count, 0));
                return <li key={s.value} className="text-sm"><div className="flex justify-between mb-1"><StatusBadge status={s.value} /><span className="font-semibold">{s.count}</span></div><Bar pct={(s.count / total) * 100} className={s.value === 'CANCELLED' ? 'bg-danger/70' : s.value === 'DELIVERED' ? 'bg-success' : 'bg-forest/70'} /></li>;
              })}</ul>
            </Card>
          </Reveal>
          <Reveal i={17}>
            {x.b2b ? (
              <Card title="Business buying (B2B)" action={<More href="/admin/b2b" />}>
                <div className="grid grid-cols-2 gap-3">
                  {[['Approved businesses', x.b2b.businesses, Building2], ['Open RFQs', x.b2b.openRfqs, FileText], ['Open purchase orders', x.b2b.openPurchaseOrders, ClipboardCheck], ['Unpaid credit orders', x.b2b.creditOrders, Landmark]].map(([t, n, Icon]) => {
                    const I = Icon as typeof Store;
                    return <div key={t as string} className="rounded-xl bg-cream border border-line p-3"><I size={16} className="text-forest" /><p className="text-xl font-bold mt-1"><CountUp value={n as number} /></p><p className="text-xs text-muted">{t as string}</p></div>;
                  })}
                </div>
                {x.b2b.creditOutstandingPaise != null && <p className="text-sm mt-3">Credit outstanding <strong>{rupees(x.b2b.creditOutstandingPaise)}</strong></p>}
              </Card>
            ) : <Card title="Business buying (B2B)"><p className="text-sm text-muted">Your role doesn’t include B2B.</p></Card>}
          </Reveal>
        </div>
      )}

      {/* Live lists */}
      <div className="grid gap-5 grid-cols-1 xl:grid-cols-2">
        <Reveal i={18}>
          <Card title="Recent orders" action={<More href="/admin/orders" />}>
            <ul className="divide-y divide-line -my-2">{d.recentOrders.map((o) => (
              <li key={o.id}><Link href={`/admin/orders?open=${o.id}`} className="flex flex-wrap items-center gap-3 py-2.5 text-sm hover:bg-cream rounded-lg px-1">
                <span className="size-9 rounded-full bg-mint text-forest grid place-items-center text-xs font-bold">{o.customer.split(' ').map((p) => p[0]).slice(0, 2).join('')}</span>
                <span className="flex-1 min-w-0"><span className="block font-semibold">{o.number}</span><span className="block text-xs text-muted truncate">{o.customer} · {formatDateTime(o.createdAt)}</span></span>
                <StatusBadge status={o.status} /><span className="font-semibold w-24 text-right tabular-nums">{formatMoney(o.totalPaise)}</span>
              </Link></li>
            ))}</ul>
          </Card>
        </Reveal>
        <Reveal i={19}>
          <Card title="Low stock" action={<More href="/admin/inventory" />}>
            {x?.lowStock.items.length ? (
              <ul className="grid gap-2.5 grid-cols-1">{x.lowStock.items.map((s) => (
                <li key={s.id}><Link href={`/admin/products?open=${s.productId}`} className="flex items-center gap-3 rounded-xl border border-line p-2.5 hover:border-forest">
                  <span className={cn('size-9 rounded-lg grid place-items-center', s.available <= 0 ? 'bg-danger-bg text-danger' : 'bg-[#fdf1d8] text-[#8a5a00]')}><AlertTriangle size={16} /></span>
                  <span className="flex-1 min-w-0"><span className="block text-sm font-semibold truncate">{s.name}</span><span className="block text-xs text-muted truncate">{s.variant} · {s.seller}</span></span>
                  <span className={cn('text-sm font-bold', s.available <= 0 ? 'text-danger' : 'text-[#8a5a00]')}>{s.available <= 0 ? 'Out' : `${s.available} left`}</span>
                </Link></li>
              ))}</ul>
            ) : <p className="flex items-center gap-2 text-sm text-muted py-6 justify-center"><CheckCircle2 size={18} className="text-success" />Everything is above {x?.lowStock.threshold ?? 10} units.</p>}
          </Card>
        </Reveal>
      </div>

      {x && (
        <div className="grid gap-5 grid-cols-1 xl:grid-cols-3">
          {x.newCustomers.length > 0 && (
            <Reveal i={20}>
              <Card title="New customers" action={<More href="/admin/customers" />}>
                <ul className="grid gap-3 grid-cols-1">{x.newCustomers.map((u) => (
                  <li key={u.id}><Link href={`/admin/customers?open=${u.id}`} className="flex items-center gap-3 group">
                    <span className="size-9 rounded-full bg-[#f7ecd2] text-gold-ink grid place-items-center text-xs font-bold">{u.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}</span>
                    <span className="flex-1 min-w-0"><span className="block text-sm font-semibold truncate group-hover:underline">{u.name}</span><span className="block text-xs text-muted truncate">{u.email}</span></span>
                    <span className="text-xs text-muted text-right">{new Date(u.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}<span className="block">{u.orders} orders</span></span>
                  </Link></li>
                ))}</ul>
              </Card>
            </Reveal>
          )}
          <Reveal i={21}>
            <Card title="Latest reviews" action={<More href="/admin/reviews" />}>
              <ul className="grid gap-3 grid-cols-1">{x.reviews.latest.map((r) => (
                <li key={r.id} className="text-sm">
                  <p className="flex items-center gap-1 text-gold">{[1, 2, 3, 4, 5].map((s) => <Star key={s} size={13} fill={s <= r.rating ? 'currentColor' : 'none'} />)}<span className="text-xs text-muted ml-1">{r.authorName}</span></p>
                  <p className="font-semibold">{r.title}</p>
                  <Link href={`/admin/products?open=${r.product.id}`} className="text-xs text-muted hover:underline truncate block">{r.product.name}</Link>
                </li>
              ))}{!x.reviews.latest.length && <li className="text-sm text-muted">No reviews yet.</li>}</ul>
            </Card>
          </Reveal>
          {x.activity.length > 0 && (
            <Reveal i={22}>
              <Card title="Recent activity" action={<More href="/admin/audit" />}>
                <ol className="relative border-l border-line ml-1.5 grid gap-3">{x.activity.map((a) => (
                  <li key={a.id} className="pl-4 relative"><span className="absolute -left-[5px] top-1.5 size-2.5 rounded-full bg-forest ring-2 ring-white" aria-hidden />
                    <p className="text-sm"><strong>{a.actor}</strong> <span className="text-muted">{label(a.action.replace(/[.-]/g, '_')).toLowerCase()}</span></p>
                    <p className="text-xs text-muted">{formatDateTime(a.createdAt)}</p>
                  </li>
                ))}</ol>
              </Card>
            </Reveal>
          )}
        </div>
      )}
      {extra.error && <Alert tone="warning">Some dashboard sections couldn’t load: {(extra.error as Error).message}</Alert>}
      <p className="text-xs text-muted flex items-center gap-1.5"><Activity size={13} />Updates every minute.</p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-5" aria-busy="true" aria-label="Loading dashboard">
      <div className="skeleton h-44 rounded-3xl" />
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">{[...Array(8)].map((_, i) => <div key={i} className="skeleton h-32 rounded-2xl" />)}</div>
      <div className="grid gap-5 grid-cols-1 xl:grid-cols-[1.7fr_1fr]"><div className="skeleton h-72 rounded-2xl" /><div className="skeleton h-72 rounded-2xl" /></div>
    </div>
  );
}
