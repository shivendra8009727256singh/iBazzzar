'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LifeBuoy, Plus } from 'lucide-react';
import { api, post } from '@/lib/api';
import type { Order, Ticket } from '@/lib/types';
import { cn, formatDate } from '@/lib/format';
import { SupportThread } from '@/components/support-thread';
import { Alert, Button, Empty, Field, Input, Modal, PageHeader, Select, Spinner, StatusBadge, Textarea, useFormErrors } from '@/components/ui';

function Support() {
  const params = useSearchParams();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['tickets'], queryFn: () => api<{ tickets: Ticket[] }>('/support/tickets').then((r) => r.tickets) });
  const { data: orders } = useQuery({ queryKey: ['orders', 'for-support'], queryFn: () => api<{ orders: Order[] }>('/orders?limit=20').then((r) => r.orders) });
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState(!!params.get('order'));
  const [form, setForm] = useState({ subject: '', message: '', orderId: params.get('order') ?? '' });
  const [busy, setBusy] = useState(false);
  const errors = useFormErrors();
  if (!data) return <Spinner />;
  const current = data.find((t) => t.id === selected) ?? data[0];
  const create = async () => {
    setBusy(true); errors.clear();
    try {
      const r = await post<{ ticket: Ticket }>('/support/tickets', { subject: form.subject, message: form.message, ...(form.orderId ? { orderId: form.orderId } : {}) });
      toast.success(`Request ${r.ticket.number} created`); setOpen(false); setForm({ subject: '', message: '', orderId: '' }); setSelected(r.ticket.id);
      qc.invalidateQueries({ queryKey: ['tickets'] });
    } catch (e) { errors.set(e); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader title="Support" description="Talk to the IBazzzar team. Every reply is kept here and in your notifications." actions={<Button onClick={() => setOpen(true)}><Plus size={16} />New request</Button>} />
      {data.length ? (
        <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
          <ul className="grid gap-2 content-start">
            {data.map((t) => (
              <li key={t.id}><button onClick={() => setSelected(t.id)} className={cn('w-full text-left card p-3', current?.id === t.id && 'ring-2 ring-emerald')}>
                <p className="font-semibold truncate">{t.subject}</p><p className="text-xs text-muted flex justify-between mt-1"><span>{t.number} · {formatDate(t.updatedAt)}</span><StatusBadge status={t.status} /></p>
              </button></li>
            ))}
          </ul>
          {current && <SupportThread ticket={current} side="CUSTOMER" onReply={async (message) => { await post(`/support/tickets/${current.id}/messages`, { message }); qc.invalidateQueries({ queryKey: ['tickets'] }); }} />}
        </div>
      ) : <div className="card"><Empty icon={<LifeBuoy size={26} />} title="No support requests" body="Questions about an order, a payment or your account? We’re here to help." action={<Button onClick={() => setOpen(true)}>Contact support</Button>} /></div>}
      <Modal open={open} onOpenChange={setOpen} title="New support request">
        <div className="grid gap-4">
          {errors.message && <Alert>{errors.message}</Alert>}
          <Field label="Related order (optional)"><Select value={form.orderId} onChange={(e) => setForm({ ...form, orderId: e.target.value })}><option value="">Not about an order</option>{orders?.map((o) => <option key={o.id} value={o.id}>{o.number} · {formatDate(o.createdAt)}</option>)}</Select></Field>
          <Field label="Subject" required error={errors.field('subject')}><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>
          <Field label="How can we help?" required error={errors.field('message')}><Textarea rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></Field>
          <Button loading={busy} onClick={create}>Send request</Button>
        </div>
      </Modal>
    </>
  );
}

export default function SupportPage() {
  return <Suspense><Support /></Suspense>;
}
