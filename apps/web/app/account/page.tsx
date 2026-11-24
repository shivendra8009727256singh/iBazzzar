'use client';
import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Package, Heart, LifeBuoy, Bell, Building2, Store, ArrowRight, MailWarning, MapPin, RotateCcw, Star, UserCog, BadgeCheck, ShieldCheck, CalendarDays } from 'lucide-react';
import { api, post } from '@/lib/api';
import type { Order, User } from '@/lib/types';
import { cn, formatDate } from '@/lib/format';
import { OrderRow } from '@/components/order-bits';
import { Alert, Button, Empty, Skeleton, StatusBadge } from '@/components/ui';

type Summary = { user: User; orderCount: number; activeOrders: number; wishlist: number; openTickets: number; unread: number };

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

const QUICK = [
  { href: '/account/orders', label: 'Orders', body: 'Track, cancel, invoices', icon: Package, tone: 'bg-mint text-forest' },
  { href: '/account/returns', label: 'Returns', body: 'Refund status', icon: RotateCcw, tone: 'bg-[#fde8e2] text-[#b42318]' },
  { href: '/account/addresses', label: 'Addresses', body: 'Saved delivery places', icon: MapPin, tone: 'bg-[#e7f0f8] text-[#1d4f7a]' },
  { href: '/account/reviews', label: 'My reviews', body: 'Rate what you bought', icon: Star, tone: 'bg-[#f7ead0] text-gold-ink' },
  { href: '/account/support', label: 'Help', body: 'Talk to support', icon: LifeBuoy, tone: 'bg-[#efeafd] text-[#6941c6]' },
  { href: '/account/profile', label: 'Profile & security', body: 'Password, devices, privacy', icon: UserCog, tone: 'bg-mint text-forest' },
];

function Overview() {
  const welcome = useSearchParams().get('welcome');
  const { data } = useQuery({ queryKey: ['account-summary'], queryFn: () => api<Summary>('/account/summary') });
  const { data: orders } = useQuery({ queryKey: ['orders', 1, ''], queryFn: () => api<{ orders: Order[] }>('/orders?limit=3') });
  const resend = useMutation({ mutationFn: () => post<{ message: string }>('/auth/verify-email/resend'), onSuccess: (r) => toast.success(r.message), onError: (e) => toast.error(e.message) });
  if (!data) return <div className="grid gap-4"><Skeleton className="h-40 rounded-3xl" /><div className="grid grid-cols-2 xl:grid-cols-4 gap-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div></div>;
  const u = data.user;
  const initials = u.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const stats = [
    { href: '/account/orders', label: 'Orders in progress', value: data.activeOrders, hint: `${data.orderCount} in total`, icon: Package },
    { href: '/wishlist', label: 'Wishlist', value: data.wishlist, hint: 'Saved items', icon: Heart },
    { href: '/account/support', label: 'Open support requests', value: data.openTickets, hint: 'We reply within a day', icon: LifeBuoy },
    { href: '/account/notifications', label: 'Unread updates', value: data.unread, hint: 'Orders and offers', icon: Bell },
  ];

  return (
    <div className="grid gap-5 md:gap-6">
      <section className="relative overflow-hidden rounded-3xl text-white bg-[linear-gradient(120deg,#062a1e_0%,#0d3d2c_50%,#1e5a42_100%)] p-5 md:p-8 shadow-lift">
        <span className="absolute -right-16 -top-20 size-72 rounded-full bg-white/[0.07]" aria-hidden />
        <span className="absolute right-[25%] -bottom-24 size-56 rounded-full bg-gold/20 blur-2xl" aria-hidden />
        <div className="relative flex flex-wrap items-center gap-4 md:gap-5">
          <span className="size-16 md:size-20 rounded-2xl bg-gradient-to-br from-gold-light to-gold text-deep grid place-items-center font-display text-2xl md:text-3xl shadow-lift">{initials}</span>
          <div className="flex-1 min-w-[180px]">
            <p className="text-white/70 text-sm">{welcome ? 'Your account is ready. Happy shopping!' : greeting()}</p>
            <h1 className="text-[28px] md:text-[36px] text-white truncate">Hello, {u.name.split(' ')[0]}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-white/70">
              <span className="truncate">{u.email}</span>
              {u.emailVerifiedAt && <span className="flex items-center gap-1 text-gold-light"><BadgeCheck size={14} />Verified</span>}
              {u.createdAt && <span className="flex items-center gap-1"><CalendarDays size={13} />Member since {formatDate(u.createdAt, { month: 'short', year: 'numeric' })}</span>}
            </p>
          </div>
          <Link href="/products" className="btn btn-gold max-sm:w-full">Continue shopping<ArrowRight size={16} /></Link>
        </div>
      </section>

      {!u.emailVerifiedAt && (
        <Alert tone="warning" title="Please confirm your email"><span className="flex flex-wrap items-center gap-3"><MailWarning size={16} />We sent a link to {u.email}. <Button size="sm" variant="outline" loading={resend.isPending} onClick={() => resend.mutate()}>Resend link</Button></span></Alert>
      )}

      <div className="grid gap-3 md:gap-4 grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="group rounded-2xl bg-white border border-line shadow-card p-4 md:p-5 hover:shadow-lift hover:-translate-y-0.5 transition">
            <div className="flex items-start justify-between gap-2"><p className="text-[13px] md:text-sm text-muted font-medium">{s.label}</p><span className="size-9 rounded-xl bg-mint text-forest grid place-items-center group-hover:bg-forest group-hover:text-gold-light transition"><s.icon size={18} /></span></div>
            <p className="mt-2 text-3xl font-bold tabular-nums">{s.value}</p>
            <p className="text-[12.5px] text-muted mt-0.5">{s.hint}</p>
          </Link>
        ))}
      </div>

      <section className="rounded-3xl bg-white border border-line shadow-card p-4 md:p-6">
        <h2 className="text-xl md:text-2xl mb-4">Quick actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {QUICK.map((q) => (
            <Link key={q.href} href={q.href} className="group flex items-center gap-3 rounded-2xl border border-line p-3 md:p-4 hover:border-forest/40 hover:shadow-card transition min-w-0">
              <span className={cn('size-11 shrink-0 rounded-xl grid place-items-center', q.tone)}><q.icon size={20} /></span>
              <span className="min-w-0"><span className="block font-semibold text-[14.5px] group-hover:text-forest">{q.label}</span><span className="block text-[12px] text-muted truncate">{q.body}</span></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-3xl bg-white border border-line shadow-card p-4 md:p-6">
        <div className="flex items-center justify-between mb-4"><h2 className="text-xl md:text-2xl">Recent orders</h2><Link href="/account/orders" className="btn btn-outline btn-sm rounded-full">All orders<ArrowRight size={14} /></Link></div>
        {orders?.orders.length ? <div className="grid gap-3">{orders.orders.map((o) => <OrderRow key={o.id} order={o} href={`/account/orders/${o.id}`} />)}</div>
          : <Empty icon={<Package size={26} />} title="No orders yet" body="When you order, you can track it here step by step." action={<Link href="/products" className="btn btn-primary">Start shopping</Link>} />}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {u.organizations.length ? u.organizations.map((o) => (
          <Link key={o.id} href="/business" className="rounded-3xl bg-white border border-line shadow-card p-5 flex items-center gap-4 hover:shadow-lift transition"><span className="size-12 rounded-2xl bg-[#e7f0f8] text-[#1d4f7a] grid place-items-center"><Building2 size={22} /></span><div className="flex-1 min-w-0"><p className="font-semibold truncate">{o.name}</p><p className="text-sm text-muted">Business account · {o.role.toLowerCase()}</p></div><StatusBadge status={o.status} /></Link>
        )) : (
          <Link href="/business/register" className="group relative overflow-hidden rounded-3xl surface-emerald p-5 md:p-6 flex items-center gap-4">
            <span className="size-12 shrink-0 rounded-2xl bg-white/12 text-gold-light grid place-items-center"><Building2 size={22} /></span>
            <div className="flex-1 min-w-0"><p className="font-semibold text-white">Buying for a business?</p><p className="text-sm text-white/70">Add a business account for wholesale prices and quotations.</p></div>
            <ArrowRight size={18} className="text-gold-light transition group-hover:translate-x-1" />
          </Link>
        )}
        {u.stores.length ? u.stores.map((s) => (
          <Link key={s.id} href="/seller" className="rounded-3xl bg-white border border-line shadow-card p-5 flex items-center gap-4 hover:shadow-lift transition"><span className="size-12 rounded-2xl bg-[#f7ead0] text-gold-ink grid place-items-center"><Store size={22} /></span><div className="flex-1 min-w-0"><p className="font-semibold truncate">{s.name}</p><p className="text-sm text-muted">Seller hub · {s.role.toLowerCase()}</p></div><StatusBadge status={s.status} /></Link>
        )) : (
          <Link href="/sell" className="group rounded-3xl bg-ivory border border-line p-5 md:p-6 flex items-center gap-4 hover:shadow-lift transition">
            <span className="size-12 shrink-0 rounded-2xl bg-white text-gold-ink grid place-items-center shadow-card"><Store size={22} /></span>
            <div className="flex-1 min-w-0"><p className="font-semibold">Have something to sell?</p><p className="text-sm text-muted">Open your own store in the mall.</p></div>
            <ArrowRight size={18} className="text-forest transition group-hover:translate-x-1" />
          </Link>
        )}
      </div>

      <p className="flex items-center gap-2 text-[12.5px] text-muted"><ShieldCheck size={14} className="text-forest" />Your session is protected. Manage signed-in devices in <Link href="/account/profile" className="link">Profile & security</Link>.</p>
    </div>
  );
}

export default function AccountPage() {
  return <Suspense><Overview /></Suspense>;
}
