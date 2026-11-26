'use client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import Link from 'next/link';
import { FileCheck2, FileText } from 'lucide-react';
import { api, post } from '@/lib/api';
import { formatDate, formatMoney, label } from '@/lib/format';
import { ConfirmButton, Empty, PageHeader, Spinner, StatusBadge } from '@/components/ui';

type Po = { id: string; number: string; status: string; paymentTerms: string; buyer: { legalName: string; tradeName: string | null; gstin: string | null }; items: { name: string; variantLabel: string; quantity: number; unitPaise: number }[]; totalPaise: number; shippingPaise: number; createdAt: string; order: { number: string; status: string } | null };

export default function SellerPosPage() {
  const { data, refetch } = useQuery({ queryKey: ['seller-pos'], queryFn: () => api<{ purchaseOrders: Po[] }>('/seller/purchase-orders') });
  if (!data) return <Spinner />;
  return (
    <>
      <PageHeader title="Purchase orders" description="Approved POs from business buyers. Confirm to commit the stock; the buyer then places and pays for the order." />
      {data.purchaseOrders.length ? (
        <div className="grid gap-4">
          {data.purchaseOrders.map((p) => (
            <article key={p.id} className="card card-pad">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-semibold text-lg">{p.number}</p><p className="text-sm text-muted">{p.buyer.tradeName || p.buyer.legalName}{p.buyer.gstin ? ` · GSTIN ${p.buyer.gstin}` : ''} · {formatDate(p.createdAt)} · {label(p.paymentTerms)}</p></div>
                <div className="flex items-center gap-2"><StatusBadge status={p.status} /><span className="price">{formatMoney(p.totalPaise)}</span></div>
              </div>
              <ul className="mt-3 text-sm grid gap-1">{p.items.map((i, n) => <li key={n} className="flex justify-between"><span>{i.name}{i.variantLabel && i.variantLabel !== 'Standard' ? ` · ${i.variantLabel}` : ''}</span><span>{i.quantity} × {formatMoney(i.unitPaise)}</span></li>)}</ul>
              <div className="mt-4 flex flex-wrap gap-2 items-center">
                {p.status === 'APPROVED' && <ConfirmButton variant="primary" title={`Confirm ${p.number}?`} body="You commit to supplying these items at the agreed price." confirmLabel="Confirm PO" onConfirm={async () => { await post(`/seller/purchase-orders/${p.id}/confirm`); toast.success('Confirmed'); refetch(); }}>Confirm</ConfirmButton>}
                {p.order && <span className="text-sm text-muted">Ordered as {p.order.number} · {label(p.order.status)}</span>}
                <Link href={`/seller/purchase-orders/${p.id}`} className="btn btn-ghost btn-sm"><FileText size={15} />PO document (PDF)</Link>
              </div>
            </article>
          ))}
        </div>
      ) : <div className="card"><Empty icon={<FileCheck2 size={26} />} title="No purchase orders yet" /></div>}
    </>
  );
}
