'use client';
import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Package, Heart, LifeBuoy, Bell, Building2, Store, ArrowRight, MailWarning } from 'lucide-react';
import { api, post } from '@/lib/api';
import type { Order, User } from '@/lib/types';
import { OrderRow } from '@/components/order-bits';
import { Alert, Button, Empty, PageHeader, Skeleton, Stat, StatusBadge } from '@/components/ui';

type Summary = { user: User; orderCount: number; activeOrders: number; wishlist: number; openTickets: number; unread: number };

function Overview() {
  const welcome = useSearchParams().get('welcome');
  const { data } = useQuery({ queryKey: ['account-summary'], queryFn: () => api<Summary>('/account/summary') });
  const { data: orders } = useQuery({ queryKey: ['orders', 1, ''], queryFn: () => api<{ orders: Order[] }>('/orders?limit=3') });
  const resend = useMutation({ mutationFn: () => post<{ message: string }>('/auth/verify-email/resend'), onSuccess: (r) => toast.success(r.message), onError: (e) => toast.error(e.message) });
  if (!data) return <div className="grid gap-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-28" /></div>;
  const u = data.user;
  return (
    <>
      <PageHeader eyebrow="My account" title={`Hello, ${u.name.split(' ')[0]}`} description={welcome ? 'Your account is ready. Happy shopping!' : 'Track orders, manage returns and keep your details up to date.'} />
      {!u.emailVerifiedAt && (
        <div className="mb-5"><Alert tone="warning" title="Please confirm your email"><span className="flex flex-wrap items-center gap-3"><MailWarning size={16} />We sent a link to {u.email}. <Button size="sm" variant="outline" loading={resend.isPending} onClick={() => resend.mutate()}>Resend link</Button></span></Alert></div>
      )}
      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4 mb-8">
        <Link href="/account/orders"><Stat label="Orders in progress" value={data.activeOrders} hint={`${data.orderCount} in total`} icon={<Package size={18} />} /></Link>
        <Link href="/wishlist"><Stat label="Wishlist" value={data.wishlist} icon={<Heart size={18} />} tone="gold" /></Link>
        <Link href="/account/support"><Stat label="Open support requests" value={data.openTickets} icon={<LifeBuoy size={18} />} /></Link>
        <Link href="/account/notifications"><Stat label="Unread updates" value={data.unread} icon={<Bell size={18} />} tone="gold" /></Link>
      </div>
      <div className="flex items-center justify-between mb-3"><h2 className="text-xl">Recent orders</h2><Link href="/account/orders" className="link text-sm">All orders →</Link></div>
      {orders?.orders.length ? <div className="grid gap-3">{orders.orders.map((o) => <OrderRow key={o.id} order={o} href={`/account/orders/${o.id}`} />)}</div>
        : <div className="card"><Empty icon={<Package size={26} />} title="No orders yet" action={<Link href="/products" className="btn btn-primary">Start shopping</Link>} /></div>}
      <div className="grid gap-4 md:grid-cols-2 mt-8">
        {u.organizations.length ? u.organizations.map((o) => (
          <Link key={o.id} href="/business" className="card card-pad flex items-center gap-4 hover:shadow-lift"><Building2 className="text-forest" /><div className="flex-1"><p className="font-semibold">{o.name}</p><p className="text-sm text-muted">Business account · {o.role.toLowerCase()}</p></div><StatusBadge status={o.status} /></Link>
        )) : <Link href="/business/register" className="card card-pad flex items-center gap-4 hover:shadow-lift"><Building2 className="text-forest" /><div className="flex-1"><p className="font-semibold">Buying for a business?</p><p className="text-sm text-muted">Add a business account for wholesale prices and quotations.</p></div><ArrowRight size={18} /></Link>}
        {u.stores.length ? u.stores.map((s) => (
          <Link key={s.id} href="/seller" className="card card-pad flex items-center gap-4 hover:shadow-lift"><Store className="text-forest" /><div className="flex-1"><p className="font-semibold">{s.name}</p><p className="text-sm text-muted">Seller hub · {s.role.toLowerCase()}</p></div><StatusBadge status={s.status} /></Link>
        )) : <Link href="/sell" className="card card-pad flex items-center gap-4 hover:shadow-lift"><Store className="text-forest" /><div className="flex-1"><p className="font-semibold">Have something to sell?</p><p className="text-sm text-muted">Open a store on IBazzzar.</p></div><ArrowRight size={18} /></Link>}
      </div>
    </>
  );
}

export default function AccountPage() {
  return <Suspense><Overview /></Suspense>;
}
