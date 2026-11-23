'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Landmark, ShieldCheck, UserPlus } from 'lucide-react';
import { api, patch, put, post, del } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { PostalFields, type Postal } from '@/components/business-fields';
import { Alert, Badge, Button, Checkbox, ConfirmButton, Field, Input, PageHeader, Spinner, Textarea, useFormErrors } from '@/components/ui';

type Store = { name: string; description: string; legalName: string; gstin: string | null; contactPhone: string; pickupAddress: Postal; codEnabled: boolean; handlingDays: number; role: string; payoutAccount: { accountHolder: string; accountLast4: string; ifsc: string; bankName: string | null; verified: boolean } | null };

export default function SellerSettingsPage() {
  const { data, refetch } = useQuery({ queryKey: ['seller-overview'], queryFn: () => api<{ store: Store }>('/seller/overview') });
  const owner = data?.store.role === 'OWNER';
  const { data: staff, refetch: refetchStaff } = useQuery({ queryKey: ['seller-staff'], queryFn: () => api<{ staff: { id: string; name: string; email: string; role: string; since: string }[] }>('/seller/staff'), enabled: owner });
  const [form, setForm] = useState<Partial<Store> | null>(null);
  const [bank, setBank] = useState({ accountHolder: '', accountNumber: '', confirmAccountNumber: '', ifsc: '', bankName: '' });
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const storeErr = useFormErrors();
  const bankErr = useFormErrors();
  if (!data) return <Spinner />;
  const s = { ...data.store, ...form };
  if (!owner) return <><PageHeader title="Store settings" /><Alert tone="info">Only the store owner can change settings.</Alert></>;
  const saveStore = async () => {
    setBusy('store'); storeErr.clear();
    try { await patch('/seller/store', { description: s.description, contactPhone: s.contactPhone, codEnabled: s.codEnabled, handlingDays: Number(s.handlingDays), pickupAddress: s.pickupAddress }); toast.success('Store updated'); setForm(null); refetch(); } catch (e) { storeErr.set(e); } finally { setBusy(null); }
  };
  const saveBank = async () => {
    setBusy('bank'); bankErr.clear();
    try { await put('/seller/payout-account', bank); toast.success('Bank account saved. Finance will verify it before the first payout.'); setBank({ accountHolder: '', accountNumber: '', confirmAccountNumber: '', ifsc: '', bankName: '' }); refetch(); } catch (e) { bankErr.set(e); } finally { setBusy(null); }
  };
  return (
    <>
      <PageHeader title="Store settings" description={`${data.store.legalName}${data.store.gstin ? ` · GSTIN ${data.store.gstin}` : ' · not GST-registered'}. Contact seller support to change legal or tax details.`} />
      <div className="grid gap-5 max-w-3xl">
        <section className="card card-pad grid gap-4">
          <h2 className="text-lg">Store profile</h2>
          {storeErr.message && <Alert>{storeErr.message}</Alert>}
          <Field label="About your store" error={storeErr.field('description')}><Textarea rows={3} value={s.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Store phone" error={storeErr.field('contactPhone')}><Input inputMode="numeric" maxLength={10} value={s.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label="Handling time (days)" hint="Days to pack and hand over to the courier" error={storeErr.field('handlingDays')}><Input inputMode="numeric" value={String(s.handlingDays)} onChange={(e) => setForm({ ...form, handlingDays: Number(e.target.value.replace(/\D/g, '')) })} /></Field>
          </div>
          <Checkbox checked={!!s.codEnabled} onChange={(e) => setForm({ ...form, codEnabled: e.target.checked })} label="Accept cash on delivery" hint="You can also turn COD off for individual listings" />
          <div><p className="label mb-3">Pickup address</p><PostalFields value={s.pickupAddress as Postal} onChange={(pickupAddress) => setForm({ ...form, pickupAddress })} err={(k) => storeErr.field(`pickupAddress.${k}`)} /></div>
          <Button className="justify-self-start" loading={busy === 'store'} onClick={saveStore}>Save store</Button>
        </section>

        <section className="card card-pad grid gap-4">
          <h2 className="text-lg flex items-center gap-2"><Landmark size={18} />Payout bank account</h2>
          {data.store.payoutAccount ? (
            <p className="text-[15px]">{data.store.payoutAccount.accountHolder} · ••••{data.store.payoutAccount.accountLast4} · {data.store.payoutAccount.ifsc} {data.store.payoutAccount.verified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Awaiting verification</Badge>}</p>
          ) : <Alert tone="warning">No bank account yet. Payouts can’t be made until you add one.</Alert>}
          <p className="text-sm text-muted flex items-center gap-1.5"><ShieldCheck size={15} className="text-forest" />The account number is encrypted. Only the last four digits are ever shown. Changing it requires re-verification.</p>
          {bankErr.message && <Alert>{bankErr.message}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Account holder name" error={bankErr.field('accountHolder')}><Input value={bank.accountHolder} onChange={(e) => setBank({ ...bank, accountHolder: e.target.value })} /></Field>
            <Field label="IFSC" error={bankErr.field('ifsc')}><Input className="uppercase" maxLength={11} value={bank.ifsc} onChange={(e) => setBank({ ...bank, ifsc: e.target.value.toUpperCase() })} /></Field>
            <Field label="Account number" error={bankErr.field('accountNumber')}><Input inputMode="numeric" autoComplete="off" value={bank.accountNumber} onChange={(e) => setBank({ ...bank, accountNumber: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label="Confirm account number" error={bankErr.field('confirmAccountNumber')}><Input inputMode="numeric" autoComplete="off" value={bank.confirmAccountNumber} onChange={(e) => setBank({ ...bank, confirmAccountNumber: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label="Bank name (optional)"><Input value={bank.bankName} onChange={(e) => setBank({ ...bank, bankName: e.target.value })} /></Field>
          </div>
          <Button className="justify-self-start" loading={busy === 'bank'} onClick={saveBank}>{data.store.payoutAccount ? 'Replace bank account' : 'Save bank account'}</Button>
        </section>

        <section className="card card-pad grid gap-4">
          <h2 className="text-lg flex items-center gap-2"><UserPlus size={18} />Staff</h2>
          <p className="text-sm text-muted">Staff manage products, orders, returns and quotations. Settings, bank details and payments stay with you.</p>
          <ul className="grid gap-2">{staff?.staff.map((m) => <li key={m.id} className="flex items-center gap-3 text-sm"><span className="flex-1"><strong>{m.name}</strong> · {m.email}<span className="block text-xs text-muted">{m.role.toLowerCase()} since {formatDate(m.since)}</span></span>{m.role === 'STAFF' && <ConfirmButton variant="ghost" danger title={`Remove ${m.name}?`} confirmLabel="Remove" onConfirm={async () => { await del(`/seller/staff/${m.id}`); refetchStaff(); }}>Remove</ConfirmButton>}</li>)}</ul>
          <div className="flex gap-2 items-end"><Field label="Colleague’s email" hint="They need an IBazzzar account first"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field><Button loading={busy === 'staff'} onClick={async () => { setBusy('staff'); try { await post('/seller/staff', { email }); toast.success('Added to your team'); setEmail(''); refetchStaff(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); } }}>Add</Button></div>
        </section>
      </div>
    </>
  );
}
