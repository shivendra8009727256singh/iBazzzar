'use client';
import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Paperclip, MessageSquare, Store, Trophy, Repeat2 } from 'lucide-react';
import { api, post } from '@/lib/api';
import { cn, formatDate, formatDateTime, formatMoney, label } from '@/lib/format';
import { Alert, Badge, Button, ConfirmButton, Spinner, StatusBadge, Textarea } from '@/components/ui';

type Revision = { revision: number; terms: string; validUntil: string; deliveryDays: number; paymentTerms: string; shippingPaise: number; subtotalPaise: number; taxPaise: number; totalPaise: number; createdAt: string; items: { rfqItemId: string; quantity: number; unitPaise: number; taxRateBps: number }[] };
type Detail = {
  rfq: { id: string; number: string; title: string; status: string; notes: string; deliveryPincode: string; neededBy: string | null; createdAt: string; requestedBy: string; items: { id: string; description: string; quantity: number }[] };
  attachments: { id: string; name: string; url: string }[];
  quotations: { storeId: string; seller: { name: string; slug: string }; quotationId: string | null; status: string; current: Revision | null; revisions: Revision[]; messages: { id: string; side: string; body: string; at: string }[] }[];
  purchaseOrderId: string | null;
};

function Chat({ rfqId, storeId, messages, onSent }: { rfqId: string; storeId: string; messages: Detail['quotations'][number]['messages']; onSent: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { await post(`/business/rfqs/${rfqId}/messages/${storeId}`, { body: text }); setText(''); onSent(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="border-t border-line pt-3 mt-3">
      <p className="text-sm font-semibold flex items-center gap-1.5 mb-2"><MessageSquare size={14} />Negotiation</p>
      <ol className="grid gap-2 max-h-48 overflow-y-auto mb-2">
        {messages.map((m) => <li key={m.id} className={cn('rounded-xl px-3 py-2 text-sm max-w-[90%]', m.side === 'BUYER' ? 'ml-auto bg-emerald text-white' : 'bg-cream border border-line')}>{m.body}<span className={cn('block text-[11px] mt-0.5', m.side === 'BUYER' ? 'text-white/70' : 'text-muted')}>{formatDateTime(m.at)}</span></li>)}
        {!messages.length && <li className="text-xs text-muted">Ask about price, delivery or specifications.</li>}
      </ol>
      <div className="flex gap-2"><label className="sr-only" htmlFor={`m-${storeId}`}>Message</label><Textarea id={`m-${storeId}`} rows={2} className="min-h-[44px]" value={text} onChange={(e) => setText(e.target.value)} /><Button size="sm" loading={busy} disabled={text.trim().length < 2} onClick={send}>Send</Button></div>
    </div>
  );
}

export default function RfqDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const { data, error, refetch } = useQuery({ queryKey: ['rfq', id], queryFn: () => api<Detail>(`/business/rfqs/${id}`) });
  if (error) return <Alert>{(error as Error).message}</Alert>;
  if (!data) return <Spinner />;
  const { rfq } = data;
  const quoted = data.quotations.filter((q) => q.current);
  const best = quoted.filter((q) => q.status === 'OPEN').sort((a, b) => a.current!.totalPaise - b.current!.totalPaise)[0];
  const accept = async (quotationId: string) => {
    const r = await post<{ purchaseOrder: { number: string; status: string } }>(`/business/quotes/${quotationId}/accept`);
    toast.success(`${r.purchaseOrder.number} created — ${label(r.purchaseOrder.status).toLowerCase()}`);
    qc.invalidateQueries(); router.push('/business/purchase-orders');
  };
  return (
    <div className="grid gap-5">
      <div>
        <Link href="/business/rfqs" className="link text-sm">← All requests</Link>
        <div className="flex flex-wrap items-center gap-3 mt-2"><h1 className="text-3xl">{rfq.title}</h1><StatusBadge status={rfq.status} /></div>
        <p className="text-muted mt-1">{rfq.number} · by {rfq.requestedBy} · {formatDate(rfq.createdAt)} · deliver to {rfq.deliveryPincode}{rfq.neededBy ? ` · needed by ${formatDate(rfq.neededBy)}` : ''}</p>
      </div>
      <section className="card card-pad grid gap-3">
        <h2 className="text-lg">What you asked for</h2>
        <ul className="grid gap-1">{rfq.items.map((i) => <li key={i.id} className="flex justify-between text-[15px]"><span>{i.description}</span><strong>{i.quantity} units</strong></li>)}</ul>
        <p className="text-muted whitespace-pre-line text-[15px]">{rfq.notes}</p>
        {data.attachments.length > 0 && <div className="flex flex-wrap gap-2">{data.attachments.map((a) => <a key={a.id} href={a.url} className="badge badge-neutral" target="_blank" rel="noreferrer"><Paperclip size={12} />{a.name}</a>)}</div>}
        <div className="flex flex-wrap gap-2">
          {['OPEN', 'QUOTED'].includes(rfq.status) && <ConfirmButton danger title="Cancel this request?" body="Sellers will stop quoting. Open quotations are withdrawn." confirmLabel="Cancel request" onConfirm={async () => { await post(`/business/rfqs/${id}/cancel`); refetch(); }}>Cancel request</ConfirmButton>}
          <Link href={`/business/rfqs/new?from=${id}`} className="btn btn-outline btn-sm"><Repeat2 size={15} />Request again</Link>
        </div>
      </section>
      {data.purchaseOrderId && <Alert tone="success" title="A quotation was accepted">See it under <Link href="/business/purchase-orders" className="underline">Purchase orders</Link>.</Alert>}

      <h2 className="text-xl">Quotations ({quoted.length} of {data.quotations.length} sellers)</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {data.quotations.map((q) => (
          <article key={q.storeId} className={cn('card card-pad', best?.storeId === q.storeId && 'ring-2 ring-gold')}>
            <header className="flex items-start justify-between gap-3">
              <div><p className="font-semibold flex items-center gap-2"><Store size={16} className="text-forest" /><Link href={`/sellers/${q.seller?.slug}`} className="hover:underline">{q.seller?.name}</Link></p>{q.current && <p className="text-xs text-muted">Revision {q.current.revision} · valid till {formatDate(q.current.validUntil)}</p>}</div>
              <div className="flex flex-col items-end gap-1"><StatusBadge status={q.status} text={q.status === 'REQUESTED' ? 'Awaiting quote' : undefined} />{best?.storeId === q.storeId && <Badge tone="gold"><Trophy size={12} />Lowest total</Badge>}</div>
            </header>
            {q.current ? (
              <>
                <table className="w-full text-sm mt-4"><thead><tr className="text-muted text-left"><th className="font-medium">Item</th><th className="font-medium text-right">Qty</th><th className="font-medium text-right">Unit</th></tr></thead>
                  <tbody>{q.current.items.map((i) => <tr key={i.rfqItemId} className="border-t border-line"><td className="py-1.5">{rfq.items.find((r) => r.id === i.rfqItemId)?.description}</td><td className="text-right">{i.quantity}</td><td className="text-right">{formatMoney(i.unitPaise)}</td></tr>)}</tbody></table>
                <dl className="grid gap-1 text-sm mt-3">
                  <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd>{q.current.shippingPaise ? formatMoney(q.current.shippingPaise) : 'Included'} · {q.current.deliveryDays} days</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">Payment terms</dt><dd>{label(q.current.paymentTerms)}</dd></div>
                  <div className="flex justify-between font-bold text-base border-t border-line pt-1.5"><dt>Total (incl. GST)</dt><dd>{formatMoney(q.current.totalPaise)}</dd></div>
                </dl>
                <p className="text-sm text-muted mt-2">{q.current.terms}</p>
                {q.revisions.length > 1 && <details className="mt-2 text-sm"><summary className="link cursor-pointer">Earlier revisions</summary><ul className="mt-1 grid gap-1">{q.revisions.slice(1).map((r) => <li key={r.revision} className="text-muted">Rev {r.revision}: {formatMoney(r.totalPaise)} · {formatDate(r.createdAt)}</li>)}</ul></details>}
                {q.status === 'OPEN' && !data.purchaseOrderId && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    <ConfirmButton variant="primary" size="sm" title="Accept this quotation?" body={`A purchase order for ${formatMoney(q.current.totalPaise)} will be created. Other sellers’ quotes on this request will be closed.`} confirmLabel="Accept and create PO" onConfirm={() => accept(q.quotationId!)}>Accept quotation</ConfirmButton>
                    <ConfirmButton title="Decline this quotation?" body="The seller can send a revised quote." confirmLabel="Decline" reason={{ label: 'Reason for the seller (optional)', min: 0 }} onConfirm={async (reason) => { await post(`/business/quotes/${q.quotationId}/reject`, { reason: reason || undefined }); refetch(); }}>Decline</ConfirmButton>
                  </div>
                )}
              </>
            ) : <p className="text-sm text-muted mt-3">This seller hasn’t quoted yet.</p>}
            {['OPEN', 'QUOTED'].includes(rfq.status) && <Chat rfqId={id} storeId={q.storeId} messages={q.messages} onSent={() => refetch()} />}
          </article>
        ))}
      </div>
    </div>
  );
}
