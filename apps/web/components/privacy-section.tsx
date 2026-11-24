'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, ShieldAlert, Trash2 } from 'lucide-react';
import { api, post } from '@/lib/api';
import { Alert, Button, Field, Input, Modal, Textarea, useFormErrors } from './ui';

/** Download my data and delete my account (India's DPDP Act 2023: access and erasure). */
export function PrivacySection() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['deletion'], queryFn: () => api<{ canDelete: boolean; reasons: string[] }>('/account/deletion') });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ password: '', confirm: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const errors = useFormErrors();
  const remove = async () => {
    setBusy(true); errors.clear();
    try {
      await post('/account/delete', { password: form.password, confirm: form.confirm, ...(form.reason.trim() ? { reason: form.reason.trim() } : {}) });
      qc.clear();
      toast.success('Your account has been deleted.');
      router.replace('/');
    } catch (e) { errors.set(e); } finally { setBusy(false); }
  };
  return (
    <section className="card card-pad max-w-2xl grid gap-4" aria-labelledby="privacy-title">
      <h2 id="privacy-title" className="text-lg">Your data and privacy</h2>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-4">
        <div className="min-w-0"><p className="font-semibold">Download my data</p><p className="text-sm text-muted">Your profile, addresses, orders, reviews and support messages in one file.</p></div>
        <a href="/api/account/export" download className="btn btn-outline btn-sm"><Download size={15} />Download</a>
      </div>
      <div className="rounded-xl border border-danger/25 bg-danger-bg/40 p-4">
        <p className="font-semibold flex items-center gap-2 text-danger"><ShieldAlert size={17} />Delete my account</p>
        <p className="text-sm text-muted mt-1">Your name, contact details, addresses, wishlist and cart are removed and you’re signed out everywhere. Order and invoice records are kept without your identity, because GST law requires them.</p>
        {data && !data.canDelete && (
          <div className="mt-3"><Alert tone="warning" title="Not yet possible">{data.reasons.map((r) => <p key={r}>{r}</p>)}</Alert></div>
        )}
        <Button variant="danger" size="sm" className="mt-3" disabled={!data?.canDelete} onClick={() => setOpen(true)}><Trash2 size={15} />Delete my account</Button>
      </div>
      <Modal open={open} onOpenChange={setOpen} title="Delete your account?" description="This can’t be undone. You can create a new account with the same email later.">
        <div className="grid gap-4">
          {errors.message && <Alert>{errors.message}</Alert>}
          <Field label="Your password" error={errors.field('password')}><Input type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          <Field label="Type DELETE to confirm" error={errors.field('confirm')}><Input value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} autoComplete="off" /></Field>
          <Field label="Anything we could do better? (optional)"><Textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Keep my account</Button>
            <Button variant="danger" loading={busy} disabled={form.confirm !== 'DELETE' || !form.password} onClick={remove}>Delete permanently</Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
