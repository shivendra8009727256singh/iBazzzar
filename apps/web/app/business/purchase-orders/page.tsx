'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileCheck2, CheckCircle2, FileText, Repeat2, MapPin, AlertTriangle } from 'lucide-react';
import { api, post } from '@/lib/api';
import type { Address } from '@/lib/types';
import { cn, formatDate, formatDateTime, formatMoney, label } from '@/lib/format';
import { AddressFields, addressPayload, emptyAddress } from '@/components/address-form';
import { Alert, Button, ConfirmButton, Empty, Field, Modal, PageHeader, Select, Spinner, StatusBadge, useFormErrors } from '@/components/ui';

type Po = {
  id: string; number: string; status: string; paymentTerms: string; sellerName: string; requestedByName: string; approvedByName: string | null;
  items: { name: string; variantLabel: string; quantity: number; unitPaise: number }[]; subtotalPaise: number; shippingPaise: number; taxPaise: number; totalPaise: number; createdAt: string;
  history: { status: string; note: string | null; at: string }[]; order: { id: string | null; number: string; status: string; paymentStatus: string } | null; canApprove: boolean; canCheckout: boolean;
};
type Saved = Address & { id: string; label: string; gstin: string | null; isDefault: boolean };
type Dept = { id: string; name: string; monthlyBudgetPaise: number; spentThisMonthPaise: number };

function Checkout({ po, onDone }: { po: Po; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const { data: saved } = useQuery({ queryKey: ['business-addresses'], queryFn: () => api<{ addresses: Saved[] }>('/business/addresses'), enabled: open });
  const { data: depts } = useQuery({ queryKey: ['business-departments'], queryFn: () => api<{ departments: Dept[]; myDepartmentId: string | null }>('/business/departments'), enabled: open });
  const [addressId, setAddressId] = useState<string | null | undefined>(undefined); // undefined = default saved address, null = new address
  const [address, setAddress] = useState<Address>(emptyAddress);
  const [deptId, setDeptId] = useState<string | null | undefined>(undefined);
  const [method, setMethod] = useState<'BANK_TRANSFER' | 'ONLINE' | 'CREDIT_TERMS'>(po.paymentTerms !== 'PREPAID' ? 'CREDIT_TERMS' : 'BANK_TRANSFER');
  const [busy, setBusy] = useState(false);
  const errors = useFormErrors();
  const router = useRouter();
  const list = saved?.addresses ?? [];
  const chosenAddress = addressId === undefined ? (list.find((a) => a.isDefault)?.id ?? null) : addressId;
  const chosenDept = deptId === undefined ? (depts?.myDepartmentId ?? null) : deptId;
  const dept = depts?.departments.find((d) => d.id === chosenDept);
  const overBudget = !!dept && dept.monthlyBudgetPaise > 0 && dept.spentThisMonthPaise + po.totalPaise > dept.monthlyBudgetPaise;
  const submit = async () => {
    setBusy(true); errors.clear();
    try {
      const r = await post<{ order: { id: string; number: string } }>(`/business/purchase-orders/${po.id}/checkout`, {
        ...(chosenAddress ? { addressId: chosenAddress } : { address: addressPayload(address) }),
        departmentId: chosenDept, paymentMethod: method,
      });
      toast.success(`Order ${r.order.number} placed`); setOpen(false); onDone(); router.push(`/account/orders/${r.order.id}`);
    } catch (e) { errors.set(e); } finally { setBusy(false); }
  };
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>Place order</Button>
      <Modal open={open} onOpenChange={setOpen} title={`Place order for ${po.number}`} description={`${formatMoney(po.totalPaise)} at the negotiated price. Coupons don’t apply to purchase orders.`} wide>
        <div className="grid gap-5">
          {errors.message && <Alert>{errors.message}</Alert>}
          <fieldset className="grid gap-2">
            <legend className="label mb-2">Deliver to</legend>
            {list.map((a) => (
              <label key={a.id} className={cn('flex items-start gap-3 rounded-xl border p-3 cursor-pointer', chosenAddress === a.id ? 'border-forest bg-mint/50' : 'border-line hover:bg-cream')}>
                <input type="radio" className="checkbox mt-1" name="po-address" checked={chosenAddress === a.id} onChange={() => setAddressId(a.id)} />
                <span className="text-sm"><span className="font-semibold">{a.label}</span>{a.gstin && <span className="ml-2 text-xs text-muted">GSTIN {a.gstin}</span>}<span className="block text-muted">{a.name} · {a.line1}, {a.city}, {a.state} {a.pincode}</span></span>
              </label>
            ))}
            <label className={cn('flex items-center gap-3 rounded-xl border p-3 cursor-pointer', chosenAddress === null ? 'border-forest bg-mint/50' : 'border-line hover:bg-cream')}>
              <input type="radio" className="checkbox mt-0" name="po-address" checked={chosenAddress === null} onChange={() => setAddressId(null)} />
              <span className="text-sm font-semibold flex items-center gap-1.5"><MapPin size={14} />{list.length ? 'A different address' : 'Enter the delivery address'}</span>
            </label>
            {list.length === 0 && <p className="text-xs text-muted">Tip: the account owner can save offices and warehouses under <Link href="/business/addresses" className="link">Addresses</Link>.</p>}
          </fieldset>
          {chosenAddress === null && <AddressFields value={address} onChange={setAddress} errors={Object.fromEntries(['name', 'phone', 'line1', 'line2', 'city', 'state', 'pincode'].map((k) => [`address.${k}`, errors.field(`address.${k}`)]))} />}

          {!!depts?.departments.length && (
            <Field label="Department" hint="Spend is reported by department.">
              <Select value={chosenDept ?? ''} onChange={(e) => setDeptId(e.target.value || null)}>
                <option value="">No department</option>
                {depts.departments.map((d) => <option key={d.id} value={d.id}>{d.name}{d.monthlyBudgetPaise ? ` — ${formatMoney(d.monthlyBudgetPaise - d.spentThisMonthPaise)} left this month` : ''}</option>)}
              </Select>
            </Field>
          )}
          {overBudget && dept && <Alert tone="warning" title="Over the department budget">{dept.name} has {formatMoney(Math.max(0, dept.monthlyBudgetPaise - dept.spentThisMonthPaise))} left this month; this order is {formatMoney(po.totalPaise)}. You can still place it.</Alert>}

          <fieldset className="grid gap-2"><legend className="label mb-2">Payment</legend>
            {[...(po.paymentTerms !== 'PREPAID' ? [['CREDIT_TERMS', `Credit terms — ${label(po.paymentTerms)}`, 'Pay later by the due date. Needs approved credit on your account.']] : []), ['BANK_TRANSFER', 'Bank transfer (NEFT/RTGS)', 'Pay now; items are held for you.'], ['ONLINE', 'Pay online now', 'UPI, cards and net banking.']].map(([v, l, h]) => (
              <label key={v} className={cn('flex items-start gap-3 rounded-xl border p-3 cursor-pointer', method === v ? 'border-forest bg-mint/50' : 'border-line hover:bg-cream')}>
                <input type="radio" className="checkbox mt-1" name="po-pay" checked={method === v} onChange={() => setMethod(v as typeof method)} />
                <span className="text-sm"><span className="font-semibold">{l}</span><span className="block text-muted">{h}</span></span>
              </label>
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
  const { data: credit } = useQuery({ queryKey: ['business-credit'], queryFn: () => api<{ credit: { overdueCount: number; overduePaise: number } }>('/business/credit') });
  const done = () => { refetch(); qc.invalidateQueries({ queryKey: ['business-overview'] }); qc.invalidateQueries({ queryKey: ['business-credit'] }); };
  if (!data) return <Spinner />;
  return (
    <>
      <PageHeader title="Purchase orders" description="Accepted quotations become POs. Orders above your auto-approval limit need an approver — never the person who requested them." />
      {!!credit?.credit.overdueCount && <div className="mb-5"><Alert tone="danger" title="Credit purchases paused"><span className="inline-flex items-center gap-1"><AlertTriangle size={14} />{formatMoney(credit.credit.overduePaise)} is overdue. Clear it to buy on credit again — <Link href="/business/credit" className="underline font-semibold">see dues</Link>.</span></Alert></div>}
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
                {p.status === 'APPROVED' && <span className="text-sm text-muted self-center">Waiting for the seller to confirm.</span>}
                {p.order && (p.order.id ? <Link href={`/account/orders/${p.order.id}`} className="btn btn-outline btn-sm">Order {p.order.number}</Link> : <span className="text-sm text-muted self-center">Ordered as {p.order.number} by a teammate · {label(p.order.status)}</span>)}
                <Link href={`/business/purchase-orders/${p.id}`} className="btn btn-ghost btn-sm"><FileText size={15} />PO document (PDF)</Link>
                {['ORDERED', 'CONFIRMED_BY_SELLER'].includes(p.status) && <Link href={`/business/rfqs/new?fromPo=${p.id}`} className="btn btn-ghost btn-sm"><Repeat2 size={15} />Order again</Link>}
              </div>
            </article>
          ))}
        </div>
      ) : <div className="card"><Empty icon={<FileCheck2 size={26} />} title="No purchase orders yet" body="Accept a quotation to create one." action={<Link href="/business/rfqs" className="btn btn-primary">View quotations</Link>} /></div>}
    </>
  );
}
