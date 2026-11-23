'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Package } from 'lucide-react';
import { api } from '@/lib/api';
import type { Order } from '@/lib/types';
import { OrderRow } from '@/components/order-bits';
import { Empty, PageHeader, Pagination, Skeleton, Tabs } from '@/components/ui';

const FILTERS = [
  { value: '', label: 'All' }, { value: 'AWAITING_PAYMENT', label: 'Awaiting payment' }, { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'SHIPPED', label: 'Shipped' }, { value: 'DELIVERED', label: 'Delivered' }, { value: 'CANCELLED', label: 'Cancelled' },
];

export default function OrdersPage() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['orders', page, status],
    queryFn: () => api<{ orders: Order[]; page: number; pages: number; total: number }>(`/orders?page=${page}${status ? `&status=${status}` : ''}`),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader title="Your orders" description="Track every parcel, download invoices and request returns." />
      <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} items={FILTERS} />
      {isLoading ? <div className="grid gap-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
        : data?.orders.length ? (
          <>
            <div className="grid gap-3">{data.orders.map((o) => <OrderRow key={o.id} order={o} href={`/account/orders/${o.id}`} />)}</div>
            <Pagination page={data.page} pages={data.pages} onChange={setPage} />
          </>
        ) : <div className="card"><Empty icon={<Package size={26} />} title={status ? 'No orders with this status' : 'No orders yet'} action={<Link href="/products" className="btn btn-primary">Start shopping</Link>} /></div>}
    </>
  );
}
