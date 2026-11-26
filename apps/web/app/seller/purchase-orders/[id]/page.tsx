'use client';
import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PurchaseOrderView, type PoDocument } from '@/components/purchase-order-view';
import { Alert, Spinner } from '@/components/ui';

export default function SellerPurchaseOrderDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error } = useQuery({ queryKey: ['seller-po-document', id], queryFn: () => api<{ document: PoDocument }>(`/seller/purchase-orders/${id}`) });
  return (
    <div>
      <Link href="/seller/purchase-orders" className="link text-sm print:hidden">← Purchase orders</Link>
      <div className="mt-3">{error ? <Alert>{(error as Error).message}</Alert> : data ? <PurchaseOrderView doc={data.document} /> : <Spinner />}</div>
    </div>
  );
}
