'use client';
import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { InvoiceView, type Invoice } from '@/components/invoice-view';
import { Alert, Spinner } from '@/components/ui';

export default function InvoicePage({ params }: { params: Promise<{ id: string; parcelId: string }> }) {
  const { id, parcelId } = use(params);
  const { data, error } = useQuery({ queryKey: ['invoice', id, parcelId], queryFn: () => api<{ invoice: Invoice }>(`/orders/${id}/invoices/${parcelId}`) });
  return (
    <div>
      <Link href={`/account/orders/${id}`} className="link text-sm print:hidden">← Back to order</Link>
      <div className="mt-4">{error ? <Alert>{(error as Error).message}</Alert> : data ? <InvoiceView invoice={data.invoice} /> : <Spinner />}</div>
    </div>
  );
}
