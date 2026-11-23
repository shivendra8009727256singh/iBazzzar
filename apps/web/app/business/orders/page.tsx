'use client';
import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Package } from 'lucide-react';
import { api } from '@/lib/api';
import type { Order } from '@/lib/types';
import { OrderRow } from '@/components/order-bits';
import { Empty, PageHeader, Pagination, Spinner } from '@/components/ui';

export default function BusinessOrdersPage() {
  const [page, setPage] = useState(1);
  const { data } = useQuery({ queryKey: ['business-orders', page], queryFn: () => api<{ orders: Order[]; page: number; pages: number }>(`/business/orders?page=${page}`), placeholderData: keepPreviousData });
  if (!data) return <Spinner />;
  return (
    <>
      <PageHeader title="Organisation orders" description="Every order placed for this business. Delivery addresses are visible only on your own orders." />
      {data.orders.length ? (
        <>
          <div className="grid gap-3">{data.orders.map((o) => <OrderRow key={o.id} order={o} href={o.mine ? `/account/orders/${o.id}` : '#'} />)}</div>
          <Pagination page={data.page} pages={data.pages} onChange={setPage} />
        </>
      ) : <div className="card"><Empty icon={<Package size={26} />} title="No business orders yet" /></div>}
    </>
  );
}
