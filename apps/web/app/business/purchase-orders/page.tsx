'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileCheck2, CheckCircle2 } from 'lucide-react';
import { api, post } from '@/lib/api';
import type { Address } from '@/lib/types';
import { formatDate, formatDateTime, formatMoney, label } from '@/lib/format';
import { AddressFields, addressPayload, emptyAddress } from '@/components/address-form';
import { Alert, Button, ConfirmButton, Empty, Modal, PageHeader, Spinner, StatusBadge, useFormErrors } from '@/components/ui';

type Po = {
  id: string; number: string; status: string; paymentTerms: string; sellerName: string; requestedByName: string; approvedByName: string | null;
  items: { name: string; variantLabel: string; quantity: number; unitPaise: number }[]; subtotalPaise: number; shippingPaise: number; taxPaise: number; totalPaise: number; createdAt: string;
  history: { status: string; note: string | null; at: string }[]; order: { id: string | null; number: string; status: string; paymentStatus: string } | null; canApprove: boolean; canCheckout: boolean;
};

function Checkout({ po, onDone }: { po: Po; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState<Address>(emptyAddress);
  const [method, setMethod] = useState<'BANK_TRANSFER' | 'ONLINE' | 'CREDIT_TERMS'>('BANK_TRANSFER');
  const [busy, setBusy] = useState(false);
  const errors = useFormErrors();
  const router = useRouter();
  const submit = async () => {
    setBusy(true); errors.clear();
    try {
      const r = await post<{ order: { id: string; number: string } }>(`/business/purchase-orders/${po.id}/checkout`, { address: addressPayload(address), paymentMethod: method });
      toast.success(`Order ${r.order.number} placed`); setOpen(false); onDone(); router.push(`/account/orders/${r.order.id}`);
    } catch (e) { errors.set(e); } finally { setBusy(false); }
  };
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>Place order</Button>
      <Modal open={open} onOpenChange={setOpen} title={`Place order for ${po.number}`} description={`${formatMoney(po.totalPaise)} at the negotiated price. Coupons don’t apply to purchase orders.`} wide>
        <div className="grid gap-5">
          {errors.message && <Alert>{errors.message}</Alert>}
          <AddressFields value={address} onChange={setAddress} errors={Object.fromEntries(['name', 'phone', 'line1', 'line2', 'city', 'state', 'pincode'].map((k) => [`address.${k}`, errors.field(`address.${k}`)]))} />
          <fieldset className="grid gap-2"><legend className="label mb-2">Payment</legend>
            {[['BANK_TRANSFER', 'Bank transfer (NEFT/RTGS)'], ['ONLINE', 'Pay online now'], ...(po.paymentTerms !== 'PREPAID' ? [['CREDIT_TERMS', `Credit terms — ${label(po.paymentTerms)} (needs finance approval on your account)`]] : [])].map(([v, l]) => (
              <label key={v} className="flex items-center gap-2.5 text-[15px]"><input type="radio" className="checkbox mt-0" name="po-pay" checked={method === v} onChange={() => setMethod(v as typeof method)} />{l}</label>
            ))}
          </fieldset>
          <Button size="lg" loading={busy} onClick={submit}>Place order for {formatMoney(po.totalPaise)}</Button>
        </div>
      </Modal>
    </>
  );
}

export default function PurchaseOrdersPage() {
  const qc = useQueryClient();
  const { data, refetch } = useQuery({ queryKey: ['business-pos'], queryFn: () => api<{ purchaseOrders: Po[] }>('/business/purchase-orders') });
  const done = () => { refetch(); qc.invalidateQueries({ queryKey: ['business-overview'] }); };
  if (!data) return <Spinner />;
  return (
    <>
      <PageHeader title="Purchase orders" description="Accepted quotations become POs. Orders above your auto-approval limit need an approver — never the person who requested them." />
      {data.purchaseOrders.length ? (
        <div className="grid gap-4">
          {data.purchaseOrders.map((p) => (
            <article key={p.id} className="card card-pad">
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-semibold text-lg">{p.number}</p><p className="text-sm text-muted">{p.sellerName} · requested by {p.requestedByName} · {formatDate(p.createdAt)}{p.approvedByName ? ` · approved by ${p.approvedByName}` : ''}</p></div>
                <div className="flex items-center gap-2"><StatusBadge status={p.status} /><span className="price text-lg">{formatMoney(p.totalPaise)}</span></div>
              </header>
              <table className="w-full text-sm mt-4"><tbody>{p.items.map((i, n) => <tr key={n} className="border-t border-line"><td className="py-1.5">{i.name}{i.variantLabel && i.variantLabel !== 'Standard' ? ` · ${i.variantLabel}` : ''}</td><td className="text-right">{i.quantity} × {formatMoney(i.unitPaise)}</td></tr>)}</tbody></table>
              <p className="text-sm text-muted mt-2">Delivery {formatMoney(p.shippingPaise)} · GST included {formatMoney(p.taxPaise)} · Terms {label(p.paymentTerms)}</p>
              <details className="mt-3 text-sm"><summary className="link cursor-pointer">History</summary><ol className="mt-2 grid gap-1">{p.history.map((h, i) => <li key={i} className="flex gap-2"><CheckCircle2 size={14} className="text-forest mt-0.5" />{label(h.status)}{h.note ? ` — ${h.note}` : ''} <span className="text-muted">{formatDateTime(h.at)}</span></li>)}</ol></details>
              <div className="flex flex-wrap gap-2 mt-4">
                {p.canApprove && <>
                  <ConfirmButton variant="primary" title={`Approve ${p.number}?`} body={`The seller will be asked to confirm ${formatMoney(p.totalPaise)}.`} confirmLabel="Approve" onConfirm={async () => { await post(`/business/purchase-orders/${p.id}/approve`); toast.success('Approved'); done(); }}>Approve</ConfirmButton>
                  <ConfirmButton danger title={`Reject ${p.number}?`} reason={{ label: 'Reason (shared with the requester)', min: 3 }} confirmLabel="Reject" onConfirm={async (reason) => { await post(`/business/purchase-orders/${p.id}/reject`, { reason }); done(); }}>Reject</ConfirmButton>
                </>}
                {p.canCheckout && !p.order && <Checkout po={p} onDone={done} />}
                {p.status === 'APPROVED' && <span className="text-sm text-muted">Waiting for the seller to confirm.</span>}
                {p.order && (p.order.id ? <Link href={`/account/orders/${p.order.id}`} className="btn btn-outline btn-sm">Order {p.order.number}</Link> : <span className="text-sm text-muted">Ordered as {p.order.number} by a teammate · {label(p.order.status)}</span>)}
              </div>
            </article>
          ))}
        </div>
      ) : <div className="card"><Empty icon={<FileCheck2 size={26} />} title="No purchase orders yet" body="Accept a quotation to create one." action={<Link href="/business/rfqs" className="btn btn-primary">View quotations</Link>} /></div>}
    </>
  );
}
