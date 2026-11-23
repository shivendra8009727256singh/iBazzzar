'use client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { RotateCcw } from 'lucide-react';
import { api, post } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { ConfirmButton, Empty, PageHeader, Spinner, StatusBadge } from '@/components/ui';

type Ret = { id: string; orderNumber: string; status: string; reason: string; note: string | null; refundPaise: number; createdAt: string; items: { name: string; variantLabel: string; quantity: number }[] };

export default function SellerReturnsPage() {
  const { data, refetch } = useQuery({ queryKey: ['seller-returns'], queryFn: () => api<{ returns: Ret[] }>('/seller/returns') });
  if (!data) return <Spinner />;
  return (
    <>
      <PageHeader title="Returns" description="Approve or decline requests. When the item reaches you, mark it received — stock is restored and the customer refunded." />
      {data.returns.length ? (
        <div className="grid gap-3">
          {data.returns.map((r) => (
            <article key={r.id} className="card card-pad">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-semibold">{r.items.map((i) => `${i.name}${i.variantLabel !== 'Standard' ? ` (${i.variantLabel})` : ''} × ${i.quantity}`).join(', ')}</p><p className="text-sm text-muted">Order {r.orderNumber} · {formatDate(r.createdAt)} · refund {formatMoney(r.refundPaise)}</p></div>
                <StatusBadge status={r.status} />
              </div>
              <p className="mt-2 text-[15px]">“{r.reason}”</p>
              {r.note && <p className="text-sm text-muted mt-1">Your note: {r.note}</p>}
              <div className="flex flex-wrap gap-2 mt-4">
                {r.status === 'REQUESTED' && <>
                  <ConfirmButton variant="primary" title="Approve this return?" body="Arrange collection with the customer. The refund is issued when you mark the item received." confirmLabel="Approve" onConfirm={async () => { await post(`/seller/returns/${r.id}/decision`, { decision: 'APPROVED' }); toast.success('Return approved'); refetch(); }}>Approve</ConfirmButton>
                  <ConfirmButton danger title="Decline this return?" reason={{ label: 'Reason shown to the customer' }} confirmLabel="Decline" onConfirm={async (note) => { await post(`/seller/returns/${r.id}/decision`, { decision: 'REJECTED', note }); refetch(); }}>Decline</ConfirmButton>
                </>}
                {r.status === 'APPROVED' && <ConfirmButton variant="primary" title="Item received?" body="Stock is restored and the refund is issued." confirmLabel="Mark received" onConfirm={async () => { await post(`/seller/returns/${r.id}/receive`, { restock: true }); toast.success('Received and refunded'); refetch(); }}>Mark received</ConfirmButton>}
              </div>
            </article>
          ))}
        </div>
      ) : <div className="card"><Empty icon={<RotateCcw size={26} />} title="No return requests" /></div>}
    </>
  );
}
