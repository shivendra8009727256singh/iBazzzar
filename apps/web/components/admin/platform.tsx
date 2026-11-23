'use client';
import { useState } from 'react';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, ImagePlus } from 'lucide-react';
import { api, post, put, del, upload } from '@/lib/api';
import type { Ticket } from '@/lib/types';
import { cn, formatDate, formatDateTime, formatMoney, rupeesToPaise } from '@/lib/format';
import { SupportThread } from '../support-thread';
import { Alert, Badge, Button, ConfirmButton, Field, Input, Select, StatusBadge, Textarea, Checkbox } from '../ui';
import { Loadable, Pager, SearchInput, Section, Table, useAdminList } from './kit';

// ───────────── Homepage CMS ─────────────
type CmsData = {
  sections: { id: string; label: string; heading: string; body: string; data: { ctaLabel?: string; ctaLink?: string }; published: boolean; version: number; updatedAt: string | null }[];
  pages: { slug: string; title: string; body: string; published: boolean; version: number; updatedAt: string }[];
  banners: { id: string; placement: string; title: string; subtitle: string | null; imageUrl: string; alt: string; link: string | null; active: boolean }[];
  featured: { id: string; name: string; status: string }[];
};
export function Cms() {
  const query = useQuery({ queryKey: ['admin', 'cms'], queryFn: () => api<CmsData>('/admin/cms') });
  const [drafts, setDrafts] = useState<Record<string, { heading: string; body: string; ctaLabel?: string; ctaLink?: string; published: boolean }>>({});
  const [page, setPage] = useState<CmsData['pages'][number] | null>(null);
  const saveSection = async (s: CmsData['sections'][number]) => {
    const d = drafts[s.id];
    try { await put(`/admin/cms/${s.id}`, { heading: d.heading, body: d.body, published: d.published, data: { ...(d.ctaLabel ? { ctaLabel: d.ctaLabel } : {}), ...(d.ctaLink ? { ctaLink: d.ctaLink } : {}) }, version: s.version }); toast.success('Published'); setDrafts((x) => { const n = { ...x }; delete n[s.id]; return n; }); query.refetch(); } catch (e) { toast.error((e as Error).message); }
  };
  const savePage = async () => { if (!page) return; try { await put(`/admin/pages/${page.slug}`, { title: page.title, body: page.body, published: page.published, version: page.version }); toast.success('Page saved'); setPage(null); query.refetch(); } catch (e) { toast.error((e as Error).message); } };
  return (
    <Section title="Homepage & content" description="Edits are versioned: if someone else saved first, you’ll be asked to reload instead of overwriting their work.">
      <Loadable query={query}>{(d) => (
        <div className="grid gap-6">
          <div className="grid gap-4 xl:grid-cols-2">
            {d.sections.map((s) => {
              const draft = drafts[s.id] ?? { heading: s.heading, body: s.body, ctaLabel: s.data.ctaLabel, ctaLink: s.data.ctaLink, published: s.published };
              const set = (patch: Partial<typeof draft>) => setDrafts({ ...drafts, [s.id]: { ...draft, ...patch } });
              return (
                <section key={s.id} className="card card-pad grid gap-3">
                  <div className="flex justify-between"><h2 className="text-lg">{s.label}</h2><span className="text-xs text-muted">v{s.version}{s.updatedAt ? ` · ${formatDateTime(s.updatedAt)}` : ''}</span></div>
                  <Field label="Heading"><Input value={draft.heading} onChange={(e) => set({ heading: e.target.value })} /></Field>
                  <Field label="Text"><Textarea rows={3} value={draft.body} onChange={(e) => set({ body: e.target.value })} /></Field>
                  <div className="grid grid-cols-2 gap-3"><Field label="Button label"><Input value={draft.ctaLabel ?? ''} onChange={(e) => set({ ctaLabel: e.target.value })} /></Field><Field label="Button link" hint="e.g. /deals"><Input value={draft.ctaLink ?? ''} onChange={(e) => set({ ctaLink: e.target.value })} /></Field></div>
                  <Checkbox checked={draft.published} onChange={(e) => set({ published: e.target.checked })} label="Published" />
                  <Button className="justify-self-start" disabled={!drafts[s.id]} onClick={() => saveSection(s)}>Publish</Button>
                </section>
              );
            })}
          </div>
          <section className="card card-pad"><h2 className="text-lg mb-2">Featured on homepage</h2><p className="text-sm text-muted mb-2">Choose these in Products.</p><div className="flex flex-wrap gap-2">{d.featured.map((f) => <Badge key={f.id} tone="gold">{f.name}</Badge>)}{!d.featured.length && <span className="text-sm text-muted">None — the homepage shows best sellers instead.</span>}</div></section>
          <section className="card card-pad">
            <h2 className="text-lg mb-3">Policy and help pages</h2>
            <Table head={['Page', 'Updated', 'Status', '']}>{d.pages.map((p) => <tr key={p.slug}><td>{p.title}<span className="block text-xs text-muted">/pages/{p.slug}</span></td><td>{formatDate(p.updatedAt)}</td><td>{p.published ? <Badge tone="success">Published</Badge> : <Badge tone="neutral">Draft</Badge>}</td><td><Button size="sm" variant="outline" onClick={() => setPage(p)}>Edit</Button></td></tr>)}</Table>
            {page && (
              <div className="grid gap-3 mt-4 border-t border-line pt-4">
                <Field label="Title"><Input value={page.title} onChange={(e) => setPage({ ...page, title: e.target.value })} /></Field>
                <Field label="Body" hint="Plain text. Use ## for headings, - for lists, > for notes. HTML is not rendered."><Textarea rows={14} value={page.body} onChange={(e) => setPage({ ...page, body: e.target.value })} /></Field>
                <Checkbox checked={page.published} onChange={(e) => setPage({ ...page, published: e.target.checked })} label="Published" />
                <div className="flex gap-2"><Button onClick={savePage}>Save page</Button><Button variant="ghost" onClick={() => setPage(null)}>Cancel</Button></div>
              </div>
            )}
          </section>
          <Banners banners={d.banners} refetch={query.refetch} />
        </div>
      )}</Loadable>
    </Section>
  );
}

function Banners({ banners, refetch }: { banners: CmsData['banners']; refetch: () => void }) {
  const [f, setF] = useState({ placement: 'home', title: '', subtitle: '', imageUrl: '', alt: '', link: '' });
  const [busy, setBusy] = useState(false);
  const addImage = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try { const r = await upload<{ media: { url: string } }>('/admin/media', file, { 'X-File-Name': file.name }); setF((x) => ({ ...x, imageUrl: r.media.url })); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const save = async () => { try { await post('/admin/banners', { ...f, subtitle: f.subtitle || null, link: f.link || null }); toast.success('Banner added'); setF({ placement: 'home', title: '', subtitle: '', imageUrl: '', alt: '', link: '' }); refetch(); } catch (e) { toast.error((e as Error).message); } };
  return (
    <section className="card card-pad">
      <h2 className="text-lg mb-1">Banners</h2>
      <p className="text-sm text-muted mb-3">Use licensed or original artwork only. Uploaded images are re-encoded and stripped of metadata.</p>
      <div className="grid gap-3 md:grid-cols-2 mb-4">
        {banners.map((b) => <div key={b.id} className="rounded-xl border border-line overflow-hidden"><div className="relative aspect-[3/1] bg-cream"><Image src={b.imageUrl} alt={b.alt} fill sizes="400px" className="object-cover" unoptimized /></div><div className="p-3 flex justify-between items-center"><span className="text-sm"><strong>{b.title}</strong> · {b.placement}</span><ConfirmButton variant="ghost" danger title="Delete banner?" confirmLabel="Delete" onConfirm={async () => { await del(`/admin/banners/${b.id}`); refetch(); }}>Delete</ConfirmButton></div></div>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Placement"><Select value={f.placement} onChange={(e) => setF({ ...f, placement: e.target.value })}>{['home', 'home-secondary', 'deals', 'wholesale', 'category'].map((p) => <option key={p}>{p}</option>)}</Select></Field>
        <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Alt text" hint="Describe the image for screen readers"><Input value={f.alt} onChange={(e) => setF({ ...f, alt: e.target.value })} /></Field>
        <Field label="Link (optional)"><Input value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="/deals" /></Field>
        <div className="sm:col-span-2 flex items-center gap-3"><label className="btn btn-outline btn-sm cursor-pointer"><ImagePlus size={15} />{busy ? 'Uploading…' : f.imageUrl ? 'Replace image' : 'Upload image'}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => addImage(e.target.files?.[0])} /></label>{f.imageUrl && <span className="text-sm text-success">Image ready</span>}</div>
        <Button className="sm:col-span-2 justify-self-start" disabled={!f.imageUrl || !f.title || !f.alt} onClick={save}>Add banner</Button>
      </div>
    </section>
  );
}

// ───────────── Media ─────────────
export function Media() {
  const [owner, setOwner] = useState('');
  const list = useAdminList<{ media: { id: string; url: string; ownerType: string; seller: string | null; width: number | null; height: number | null; bytes: number; mime: string; createdAt: string; usedBy: { id: string; name: string }[] }[]; page: number; pages: number }>('/admin/media', 'media', { owner });
  return (
    <Section title="Media library" description="Removing an image takes it off every product that used it and sends those products back to review." actions={<Select aria-label="Owner" className="min-h-[40px] py-1 w-auto" value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">All</option><option value="SELLER">Seller photos</option><option value="PLATFORM">Platform artwork</option><option value="RFQ">RFQ attachments</option></Select>}>
      <Loadable query={list}>{(d) => (
        <>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {d.media.map((m) => (
              <figure key={m.id} className="card overflow-hidden">
                <div className="relative aspect-square bg-cream">{m.mime === 'application/pdf' ? <span className="absolute inset-0 grid place-items-center text-sm text-muted">PDF</span> : <Image src={m.url} alt="" fill sizes="200px" className="object-contain p-2" unoptimized />}</div>
                <figcaption className="p-2.5 text-xs grid gap-1"><span>{m.seller ?? m.ownerType.toLowerCase()} · {(m.bytes / 1024).toFixed(0)} KB</span><span className="text-muted truncate">{m.usedBy.length ? `Used by ${m.usedBy.map((u) => u.name).join(', ')}` : 'Unused'}</span>
                  <ConfirmButton variant="ghost" danger title="Remove this file?" reason={{ label: 'Reason (sent to the seller)' }} confirmLabel="Remove" onConfirm={async (reason) => { await del(`/admin/media/${m.id}`, { reason }); list.refetch(); }}>Remove</ConfirmButton>
                </figcaption>
              </figure>
            ))}
          </div>
          <Pager data={d} setPage={list.setPage} />
        </>
      )}</Loadable>
    </Section>
  );
}

// ───────────── Notifications, support, reports, audit ─────────────
export function Broadcast() {
  const [f, setF] = useState({ audience: 'ALL', title: '', body: '', link: '' });
  const [busy, setBusy] = useState(false);
  return (
    <Section title="Notifications" description="Send an in-app message to a group. It appears in each person’s notification centre.">
      <div className="card card-pad grid gap-4 max-w-2xl">
        <Field label="Audience"><Select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}><option value="ALL">Everyone</option><option value="CUSTOMERS">Customers</option><option value="SELLERS">Sellers</option><option value="BUSINESSES">Business buyers</option><option value="STAFF">Staff</option></Select></Field>
        <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Message"><Textarea rows={3} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        <Field label="Link (optional)" hint="A page on IBazzzar, e.g. /deals"><Input value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} /></Field>
        <ConfirmButton variant="primary" size="md" title="Send this notification?" body="It can’t be recalled once sent." confirmLabel="Send" onConfirm={async () => { setBusy(true); try { const r = await post<{ sent: number }>('/admin/notifications', { ...f, link: f.link || undefined }); toast.success(`Sent to ${r.sent} people`); setF({ audience: 'ALL', title: '', body: '', link: '' }); } finally { setBusy(false); } }}>{busy ? 'Sending…' : 'Send notification'}</ConfirmButton>
      </div>
    </Section>
  );
}

export function SupportQueue() {
  const [status, setStatus] = useState('');
  const list = useAdminList<{ tickets: Ticket[]; page: number; pages: number }>('/support/queue', 'tickets', { status });
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <Section title="Support" description="Customer requests. Replies notify the customer; they can answer from their account." actions={<Select aria-label="Status" className="min-h-[40px] py-1 w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Open</option><option value="AWAITING_CUSTOMER">Awaiting customer</option><option value="CLOSED">Closed</option></Select>}>
      <Loadable query={list}>{(d) => {
        const current = d.tickets.find((t) => t.id === selected) ?? d.tickets[0];
        return d.tickets.length ? (
          <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
            <ul className="grid gap-2 content-start">{d.tickets.map((t) => <li key={t.id}><button onClick={() => setSelected(t.id)} className={cn('w-full text-left card p-3', current?.id === t.id && 'ring-2 ring-emerald')}><p className="font-semibold truncate">{t.subject}</p><p className="text-xs text-muted flex justify-between mt-1"><span>{t.customer?.name} · {formatDate(t.updatedAt)}</span><StatusBadge status={t.status} /></p></button></li>)}</ul>
            {current && <SupportThread ticket={current} side="SUPPORT" onReply={async (message) => { await post(`/support/queue/${current.id}/messages`, { message }); list.refetch(); }} actions={<Button size="sm" variant="outline" onClick={async () => { await api(`/support/queue/${current.id}`, { method: 'PATCH', body: { status: current.status === 'CLOSED' ? 'OPEN' : 'CLOSED' } }); list.refetch(); }}>{current.status === 'CLOSED' ? 'Reopen' : 'Close'}</Button>} />}
          </div>
        ) : <p className="text-muted">No tickets in this view.</p>;
      }}</Loadable>
    </Section>
  );
}

export function Reports({ caps }: { caps: string[] }) {
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const reports = [
    ['orders', 'Orders', 'orders.view', 'Every order with totals, GST and payment status'],
    ['gst', 'GST summary', 'finance.view', 'Line-level taxable value, CGST/SGST/IGST and HSN per invoice'],
    ['ledger', 'Seller ledger', 'finance.view', 'Sales, commission, refunds and payouts'],
    ['users', 'Users', 'users.view', 'Accounts with roles and consent flags'],
    ['products', 'Listings', 'catalogue.manage', 'Every listing with price and stock'],
  ].filter(([, , cap]) => caps.includes(cap));
  return (
    <Section title="Reports" description="CSV exports open in Excel or Google Sheets. Every export is recorded in the audit log.">
      <div className="flex flex-wrap gap-3 mb-5"><Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field></div>
      <div className="grid gap-3 md:grid-cols-2">{reports.map(([kind, title, , body]) => <a key={kind} href={`/api/admin/reports/${kind}?from=${from}&to=${to}`} className="card card-pad flex items-center gap-4 hover:shadow-lift"><Download className="text-forest" /><span className="flex-1"><span className="font-semibold block">{title}</span><span className="text-sm text-muted">{body}</span></span></a>)}</div>
    </Section>
  );
}

export function Audit() {
  const list = useAdminList<{ entries: { id: string; actor: string; action: string; entityType: string; entityId: string; metadata: Record<string, unknown>; ip: string | null; createdAt: string }[]; page: number; pages: number }>('/admin/audit', 'audit');
  return (
    <Section title="Audit log" description="Append-only record of sign-ins, approvals, money movements, role changes and content edits." actions={<SearchInput value={list.q} onChange={list.setQ} placeholder="Action or record id" />}>
      <Loadable query={list}>{(d) => (
        <>
          <Table head={['When', 'Who', 'Action', 'Record', 'Details']} empty={!d.entries.length}>{d.entries.map((e) => <tr key={e.id}><td className="whitespace-nowrap text-sm">{formatDateTime(e.createdAt)}</td><td>{e.actor}</td><td className="font-mono text-xs">{e.action}</td><td className="text-xs">{e.entityType} {e.entityId.slice(0, 12)}</td><td className="text-xs text-muted max-w-xs truncate">{Object.keys(e.metadata ?? {}).length ? JSON.stringify(e.metadata) : ''}{e.ip ? ` · ${e.ip}` : ''}</td></tr>)}</Table>
          <Pager data={d} setPage={list.setPage} />
        </>
      )}</Loadable>
    </Section>
  );
}

// ───────────── Settings ─────────────
type Settings = {
  platform: { returnWindowDays: number; lowStockThreshold: number; paymentWindowMinutes: number; bankTransferWindowDays: number };
  commission: { rateBps: number };
  shipping: { freeShippingThresholdPaise: number; baseShippingPaise: number; perExtraKgPaise: number; codEnabled: boolean; codFeePaise: number; codMaxOrderPaise: number; blockedPincodePrefixes: string[]; codBlockedPincodePrefixes: string[] };
  bank: { accountName: string; accountNumber: string; ifsc: string; bankName: string; note: string };
};
export function SettingsPanel({ canFinance }: { canFinance: boolean }) {
  const query = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => api<Settings>('/admin/settings') });
  const save = async (key: string, body: object) => { try { await put(`/admin/settings/${key}`, body); toast.success('Saved'); query.refetch(); } catch (e) { toast.error((e as Error).message); } };
  return (
    <Section title="Platform settings" description="Changes apply immediately and are recorded in the audit log.">
      <Loadable query={query}>{(d) => <SettingsForms d={d} save={save} canFinance={canFinance} />}</Loadable>
    </Section>
  );
}

function SettingsForms({ d, save, canFinance }: { d: Settings; save: (k: string, b: object) => void; canFinance: boolean }) {
  const [p, setP] = useState(d.platform);
  const [c, setC] = useState(String(d.commission.rateBps / 100));
  const [s, setS] = useState({ free: String(d.shipping.freeShippingThresholdPaise / 100), base: String(d.shipping.baseShippingPaise / 100), kg: String(d.shipping.perExtraKgPaise / 100), cod: d.shipping.codEnabled, codFee: String(d.shipping.codFeePaise / 100), codMax: String(d.shipping.codMaxOrderPaise / 100), blocked: d.shipping.blockedPincodePrefixes.join(', '), codBlocked: d.shipping.codBlockedPincodePrefixes.join(', ') });
  const [b, setB] = useState(d.bank);
  const list = (v: string) => v.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
  return (
    <div className="grid gap-5 max-w-3xl">
      <section className="card card-pad grid gap-3">
        <h2 className="text-lg">Orders and stock</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Return window (days)"><Input inputMode="numeric" value={p.returnWindowDays} onChange={(e) => setP({ ...p, returnWindowDays: Number(e.target.value) || 0 })} /></Field>
          <Field label="Online payment window (minutes)" hint="Stock is held this long before an unpaid order expires"><Input inputMode="numeric" value={p.paymentWindowMinutes} onChange={(e) => setP({ ...p, paymentWindowMinutes: Number(e.target.value) || 0 })} /></Field>
          <Field label="Bank transfer window (days)"><Input inputMode="numeric" value={p.bankTransferWindowDays} onChange={(e) => setP({ ...p, bankTransferWindowDays: Number(e.target.value) || 0 })} /></Field>
          <Field label="Low-stock alert at"><Input inputMode="numeric" value={p.lowStockThreshold} onChange={(e) => setP({ ...p, lowStockThreshold: Number(e.target.value) || 0 })} /></Field>
        </div>
        <Button className="justify-self-start" onClick={() => save('platform', p)}>Save</Button>
      </section>
      <section className="card card-pad grid gap-3">
        <h2 className="text-lg">Delivery and cash on delivery</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Free delivery from (₹ per seller)"><Input inputMode="decimal" value={s.free} onChange={(e) => setS({ ...s, free: e.target.value })} /></Field>
          <Field label="Base delivery charge (₹)"><Input inputMode="decimal" value={s.base} onChange={(e) => setS({ ...s, base: e.target.value })} /></Field>
          <Field label="Per extra kg (₹)"><Input inputMode="decimal" value={s.kg} onChange={(e) => setS({ ...s, kg: e.target.value })} /></Field>
          <Field label="COD fee (₹)"><Input inputMode="decimal" value={s.codFee} onChange={(e) => setS({ ...s, codFee: e.target.value })} /></Field>
          <Field label="COD maximum order (₹)"><Input inputMode="decimal" value={s.codMax} onChange={(e) => setS({ ...s, codMax: e.target.value })} /></Field>
          <div className="self-end pb-2"><Checkbox checked={s.cod} onChange={(e) => setS({ ...s, cod: e.target.checked })} label="Offer cash on delivery" /></div>
        </div>
        <Field label="Undeliverable PIN prefixes" hint="Comma-separated, e.g. 744, 7962"><Input value={s.blocked} onChange={(e) => setS({ ...s, blocked: e.target.value })} /></Field>
        <Field label="No-COD PIN prefixes"><Input value={s.codBlocked} onChange={(e) => setS({ ...s, codBlocked: e.target.value })} /></Field>
        <Button className="justify-self-start" onClick={() => save('shipping', { freeShippingThresholdPaise: rupeesToPaise(s.free), baseShippingPaise: rupeesToPaise(s.base), perExtraKgPaise: rupeesToPaise(s.kg), codEnabled: s.cod, codFeePaise: rupeesToPaise(s.codFee), codMaxOrderPaise: rupeesToPaise(s.codMax), blockedPincodePrefixes: list(s.blocked), codBlockedPincodePrefixes: list(s.codBlocked) })}>Save</Button>
      </section>
      {canFinance ? (
        <>
          <section className="card card-pad grid gap-3">
            <h2 className="text-lg">Default commission</h2>
            <p className="text-sm text-muted">Categories can override this. Currently {formatMoney(Math.round(100000 * Number(c) / 100))} on a ₹1,000 sale.</p>
            <div className="flex gap-2 items-end"><Field label="Commission %"><Input inputMode="decimal" value={c} onChange={(e) => setC(e.target.value)} /></Field><Button onClick={() => save('commission', { rateBps: Math.round(Number(c) * 100) })}>Save</Button></div>
          </section>
          <section className="card card-pad grid gap-3">
            <h2 className="text-lg">Bank details shown for business bank transfers</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Account name"><Input value={b.accountName} onChange={(e) => setB({ ...b, accountName: e.target.value })} /></Field>
              <Field label="Bank name"><Input value={b.bankName} onChange={(e) => setB({ ...b, bankName: e.target.value })} /></Field>
              <Field label="Account number"><Input inputMode="numeric" value={b.accountNumber} onChange={(e) => setB({ ...b, accountNumber: e.target.value.replace(/\D/g, '') })} /></Field>
              <Field label="IFSC"><Input className="uppercase" value={b.ifsc} onChange={(e) => setB({ ...b, ifsc: e.target.value.toUpperCase() })} /></Field>
            </div>
            <Field label="Note to customers"><Input value={b.note} onChange={(e) => setB({ ...b, note: e.target.value })} /></Field>
            <Button className="justify-self-start" onClick={() => save('bank', Object.fromEntries(Object.entries(b).filter(([, v]) => v)))}>Save</Button>
          </section>
        </>
      ) : <Alert tone="info">Commission and bank details are managed by finance.</Alert>}
    </div>
  );
}
