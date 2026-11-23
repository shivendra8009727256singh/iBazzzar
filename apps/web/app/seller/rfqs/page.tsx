'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileText, Paperclip } from 'lucide-react';
import { api, post } from '@/lib/api';
import { cn, formatDate, formatDateTime, formatMoney, label, rupeesToPaise } from '@/lib/format';
import { Alert, Badge, Button, Empty, Field, Input, Modal, PageHeader, Select, Spinner, StatusBadge, Textarea, useFormErrors } from '@/components/ui';

type Req = {
  rfqId: string; number: string; title: string; status: string; notes: string; deliveryPincode: string; neededBy: string | null; createdAt: string; buyer: string; buyerGstin: string | null;
  items: { id: string; description: string; quantity: number; catalogProductId: string | null }[]; attachments: { name: string; url?: string }[];
  quotation: { id: string; status: string; revisions: { revision: number; totalPaise: number; validUntil: string; paymentTerms: string; deliveryDays: number; terms: string; createdAt: string; items: { rfqItemId: string; listingId: string; quantity: number; unitPaise: number }[] }[] } | null;
  messages: { id: string; side: string; body: string; at: string }[];
};
type MyListing = { id: string; name: string; variantLabel: string; sku: string; catalogProductId: string; pricePaise: number; status: string };

function QuoteForm({ r, listings, onDone }: { r: Req; listings: MyListing[]; onDone: () => void }) {
  const last = r.quotation?.revisions[0];
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState(r.items.map((i) => {
    const prev = last?.items.find((x) => x.rfqItemId === i.id);
    const match = listings.find((l) => l.catalogProductId === i.catalogProductId);
    return { rfqItemId: i.id, listingId: prev?.listingId ?? match?.id ?? '', quantity: String(prev?.quantity ?? i.quantity), unit: prev ? String(prev.unitPaise / 100) : match ? String(match.pricePaise / 100) : '' };
  }));
  const [f, setF] = useState({ terms: last?.terms ?? 'Prices include GST. Delivery to the PIN code on the request.', days: String(last?.deliveryDays ?? 7), shipping: '0', validDays: '7', paymentTerms: last?.paymentTerms ?? 'PREPAID' });
  const [busy, setBusy] = useState(false);
  const errors = useFormErrors();
  const total = lines.reduce((s, l) => s + rupeesToPaise(l.unit || 0) * Number(l.quantity || 0), 0) + rupeesToPaise(f.shipping || 0);
  const send = async () => {
    setBusy(true); errors.clear();
    try {
      await post(`/seller/rfqs/${r.rfqId}/quotes`, {
        items: lines.map((l) => ({ rfqItemId: l.rfqItemId, listingId: l.listingId, quantity: Number(l.quantity), unitPaise: rupeesToPaise(l.unit || 0) })),
        terms: f.terms, deliveryDays: Number(f.days), shippingPaise: rupeesToPaise(f.shipping || 0), paymentTerms: f.paymentTerms,
        validUntil: new Date(Date.now() + Number(f.validDays || 7) * 86_400_000).toISOString(),
      });
      toast.success(last ? 'Revised quote sent' : 'Quote sent'); setOpen(false); onDone();
    } catch (e) { errors.set(e); } finally { setBusy(false); }
  };
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>{last ? 'Send revised quote' : 'Send quote'}</Button>
      <Modal open={open} onOpenChange={setOpen} title={`Quote for ${r.number}`} description={`${r.buyer} · deliver to ${r.deliveryPincode}`} wide>
        <div className="grid gap-4">
          {errors.message && <Alert>{errors.message}</Alert>}
          {lines.map((l, i) => (
            <div key={l.rfqItemId} className="rounded-xl border border-line p-3 grid gap-2 sm:grid-cols-[1.5fr_100px_120px]">
              <Field label={`${r.items[i].description} — your listing`}><Select value={l.listingId} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, listingId: e.target.value } : x)))}><option value="">Choose…</option>{listings.filter((x) => x.status === 'APPROVED').map((x) => <option key={x.id} value={x.id}>{x.name} · {x.variantLabel} ({x.sku})</option>)}</Select></Field>
              <Field label="Qty"><Input inputMode="numeric" value={l.quantity} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} /></Field>
              <Field label="₹ / unit (incl. GST)"><Input inputMode="decimal" value={l.unit} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} /></Field>
            </div>
          ))}
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Delivery charge (₹)"><Input inputMode="decimal" value={f.shipping} onChange={(e) => setF({ ...f, shipping: e.target.value })} /></Field>
            <Field label="Delivery in (days)" error={errors.field('deliveryDays')}><Input inputMode="numeric" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} /></Field>
            <Field label="Valid for (days)"><Input inputMode="numeric" value={f.validDays} onChange={(e) => setF({ ...f, validDays: e.target.value })} /></Field>
            <Field label="Payment terms"><Select value={f.paymentTerms} onChange={(e) => setF({ ...f, paymentTerms: e.target.value })}><option value="PREPAID">Prepaid</option><option value="NET_15">Net 15</option><option value="NET_30">Net 30</option><option value="NET_45">Net 45</option></Select></Field>
          </div>
          <Field label="Terms" error={errors.field('terms')}><Textarea rows={3} value={f.terms} onChange={(e) => setF({ ...f, terms: e.target.value })} /></Field>
          <p className="text-right font-semibold">Quote total {formatMoney(total)}</p>
          <Button loading={busy} onClick={send}>Send to buyer</Button>
        </div>
      </Modal>
    </>
  );
}

function Thread({ r, onSent }: { r: Req; onSent: () => void }) {
  const [text, setText] = useState('');
  return (
    <div className="mt-3 border-t border-line pt-3">
      <ol className="grid gap-2 max-h-44 overflow-y-auto mb-2">
        {r.messages.map((m) => <li key={m.id} className={cn('rounded-xl px-3 py-2 text-sm max-w-[85%]', m.side === 'SELLER' ? 'ml-auto bg-emerald text-white' : 'bg-cream border border-line')}>{m.body}<span className={cn('block text-[11px]', m.side === 'SELLER' ? 'text-white/70' : 'text-muted')}>{formatDateTime(m.at)}</span></li>)}
      </ol>
      <div className="flex gap-2"><label className="sr-only" htmlFor={`sm-${r.rfqId}`}>Message the buyer</label><Input id={`sm-${r.rfqId}`} placeholder="Message the buyer" value={text} onChange={(e) => setText(e.target.value)} /><Button size="sm" variant="outline" disabled={text.trim().length < 2} onClick={async () => { try { await post(`/seller/rfqs/${r.rfqId}/messages`, { body: text }); setText(''); onSent(); } catch (e) { toast.error((e as Error).message); } }}>Send</Button></div>
    </div>
  );
}

export default function SellerRfqsPage() {
  const { data, refetch } = useQuery({ queryKey: ['seller-rfqs'], queryFn: () => api<{ requests: Req[] }>('/seller/rfqs') });
  const { data: mine } = useQuery({ queryKey: ['seller-listings', ''], queryFn: () => api<{ listings: MyListing[] }>('/seller/products') });
  if (!data) return <Spinner />;
  return (
    <>
      <PageHeader title="Quotation requests" description="Business buyers asking for bulk prices. Quote with your live listings; you can revise until they accept." />
      {data.requests.length ? (
        <div className="grid gap-4">
          {data.requests.map((r) => (
            <article key={r.rfqId} className="card card-pad">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-semibold text-lg">{r.title}</p><p className="text-sm text-muted">{r.number} · {r.buyer}{r.buyerGstin ? ` · GSTIN ${r.buyerGstin}` : ''} · {formatDate(r.createdAt)} · deliver to {r.deliveryPincode}{r.neededBy ? ` by ${formatDate(r.neededBy)}` : ''}</p></div>
                <div className="flex gap-2"><StatusBadge status={r.status} />{r.quotation && <StatusBadge status={r.quotation.status} text={`Your quote: ${label(r.quotation.status).toLowerCase()}`} />}</div>
              </div>
              <ul className="mt-3 grid gap-1 text-[15px]">{r.items.map((i) => <li key={i.id} className="flex justify-between"><span>{i.description}</span><strong>{i.quantity} units</strong></li>)}</ul>
              <p className="text-sm text-muted mt-2 whitespace-pre-line">{r.notes}</p>
              {r.attachments.length > 0 && <div className="flex flex-wrap gap-2 mt-2">{r.attachments.map((a) => <a key={a.name} href={a.url} target="_blank" rel="noreferrer" className="badge badge-neutral"><Paperclip size={12} />{a.name}</a>)}</div>}
              {r.quotation?.revisions[0] && <p className="mt-3 text-sm"><Badge tone="info">Rev {r.quotation.revisions[0].revision}</Badge> {formatMoney(r.quotation.revisions[0].totalPaise)} · valid till {formatDate(r.quotation.revisions[0].validUntil)}</p>}
              {['OPEN', 'QUOTED'].includes(r.status) && r.quotation?.status !== 'ACCEPTED' && <div className="mt-4"><QuoteForm r={r} listings={mine?.listings ?? []} onDone={refetch} /></div>}
              {['OPEN', 'QUOTED'].includes(r.status) && <Thread r={r} onSent={refetch} />}
            </article>
          ))}
        </div>
      ) : <div className="card"><Empty icon={<FileText size={26} />} title="No quotation requests yet" body="Enable wholesale on your listings so business buyers can find you." /></div>}
    </>
  );
}
