'use client';
import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Users, Store, ClipboardCheck, Package, IndianRupee, Building2, RotateCcw, LifeBuoy, Landmark, AlertTriangle } from 'lucide-react';
import { api, patch, post, put } from '@/lib/api';
import { formatDate, formatDateTime, formatMoney, label, pct } from '@/lib/format';
import { DailyBars, Meter } from '../charts';
import { Alert, Badge, Button, ConfirmButton, Field, Input, Modal, Select, Stat, StatusBadge, Textarea, Checkbox } from '../ui';
import { Loadable, Pager, SearchInput, Section, Table, useAdminList } from './kit';

// ───────────── Overview ─────────────
type Dashboard = {
  metrics: { orders: number; awaitingPayment: number; toShip: number; customers: number; activeSellers: number; activeRfqs: number; paidGmvPaise: number | null; averageOrderPaise: number | null; platformRevenuePaise: number | null; demoGmvPaise: number | null; refundsPendingPaise: number | null; refundsPending: number };
  queues: { sellers: number; products: number; offers: number; organizations: number; returns: number; tickets: number; bankTransfers: number };
  series: { date: string; orders: number; paidGmvPaise: number | null }[];
  statusMix: { value: string; count: number }[];
  recentOrders: { id: string; number: string; createdAt: string; status: string; paymentStatus: string; totalPaise: number; customer: string }[];
  topSellers: { id: string; name: string; grossPaise: number | null }[];
};

export function Overview() {
  const query = useQuery({ queryKey: ['admin', 'dashboard'], queryFn: () => api<Dashboard>('/admin/dashboard'), refetchInterval: 60_000 });
  return (
    <Section title="Marketplace overview" description="Every figure is calculated from stored records. Demo-simulated payments are reported separately and never counted as GMV.">
      <Loadable query={query}>{(d) => {
        const queue = [
          [d.queues.sellers, 'seller applications', 'sellers', Store], [d.queues.products, 'new products to review', 'moderation', ClipboardCheck],
          [d.queues.offers, 'new offers to review', 'moderation', ClipboardCheck], [d.queues.organizations, 'business accounts to verify', 'organizations', Building2],
          [d.queues.returns, 'return requests', 'returns', RotateCcw], [d.queues.tickets, 'open support tickets', 'support', LifeBuoy], [d.queues.bankTransfers, 'bank transfers to match', 'orders', Landmark],
        ].filter(([n]) => (n as number) > 0) as [number, string, string, typeof Store][];
        return (
          <div className="grid gap-6">
            <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
              <Stat label="Paid GMV" value={d.metrics.paidGmvPaise == null ? 'Finance only' : formatMoney(d.metrics.paidGmvPaise)} hint={d.metrics.averageOrderPaise ? `Avg order ${formatMoney(d.metrics.averageOrderPaise)}` : undefined} icon={<IndianRupee size={18} />} tone="gold" />
              <Stat label="Net platform revenue" value={d.metrics.platformRevenuePaise == null ? 'Finance only' : formatMoney(d.metrics.platformRevenuePaise)} hint="Commission on delivered orders" icon={<IndianRupee size={18} />} />
              <Stat label="Orders" value={d.metrics.orders} hint={`${d.metrics.awaitingPayment} awaiting payment · ${d.metrics.toShip} to ship`} icon={<Package size={18} />} />
              <Stat label="Customers · sellers" value={`${d.metrics.customers} · ${d.metrics.activeSellers}`} hint={`${d.metrics.activeRfqs} open RFQs`} icon={<Users size={18} />} tone="gold" />
            </div>
            {!!d.metrics.demoGmvPaise && <Alert tone="info">Demo-simulated orders total {formatMoney(d.metrics.demoGmvPaise)}. Not real money; excluded from GMV.</Alert>}
            <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
              <section className="card card-pad"><DailyBars data={d.series} value={(x: { orders: number }) => x.orders} format={(n) => String(n)} label="Orders per day" /></section>
              <section className="card card-pad">
                <h2 className="text-lg mb-3">Review queues</h2>
                {queue.length ? <ul className="grid gap-2">{queue.map(([n, t, href, Icon]) => <li key={t}><Link href={`/admin/${href}`} className="flex items-center gap-3 rounded-xl border border-line p-3 hover:border-forest"><Icon size={17} className="text-forest" /><span className="flex-1"><strong>{n}</strong> {t}</span>→</Link></li>)}</ul> : <p className="text-sm text-muted">Every queue is clear.</p>}
                {d.metrics.refundsPending > 0 && <Link href="/admin/refunds" className="flex items-center gap-2 mt-3 text-sm text-warning font-semibold"><AlertTriangle size={15} />{d.metrics.refundsPending} refunds waiting to be paid</Link>}
              </section>
            </div>
            <div className="grid gap-6 xl:grid-cols-3">
              <section className="card card-pad"><h2 className="text-lg mb-3">Order status</h2><Meter items={d.statusMix.map((s) => ({ label: label(s.value), value: s.count }))} /></section>
              <section className="card card-pad xl:col-span-2">
                <h2 className="text-lg mb-3">Recent orders</h2>
                <ul className="divide-y divide-line">{d.recentOrders.map((o) => <li key={o.id}><Link href={`/admin/orders?open=${o.id}`} className="flex flex-wrap items-center gap-3 py-2.5 text-sm hover:bg-cream"><span className="font-semibold w-44">{o.number}</span><span className="flex-1 text-muted">{o.customer} · {formatDateTime(o.createdAt)}</span><StatusBadge status={o.status} /><span className="font-semibold w-24 text-right">{formatMoney(o.totalPaise)}</span></Link></li>)}</ul>
              </section>
            </div>
            {d.topSellers.length > 0 && <section className="card card-pad"><h2 className="text-lg mb-3">Top sellers by delivered sales</h2><ol className="grid gap-1.5">{d.topSellers.map((s, i) => <li key={s.id} className="flex justify-between text-sm"><span>{i + 1}. {s.name}</span><strong>{s.grossPaise == null ? '—' : formatMoney(s.grossPaise)}</strong></li>)}</ol></section>}
          </div>
        );
      }}</Loadable>
    </Section>
  );
}

// ───────────── Customers & staff ─────────────
type UserRow = { id: string; name: string; email: string; phone: string | null; status: string; createdAt: string; roles: string[]; locked: boolean; orders: number; stores: number; organizations: number; guest: boolean };
export function Customers({ canManage, canStaff }: { canManage: boolean; canStaff: boolean }) {
  const [type, setType] = useState('');
  const list = useAdminList<{ users: UserRow[]; page: number; pages: number; total: number }>('/admin/users', 'users', { type });
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Section title="People" description="Customers, business buyers, sellers and staff." actions={<><Select className="min-h-[40px] py-1 w-auto" aria-label="Type" value={type} onChange={(e) => setType(e.target.value)}><option value="">Everyone</option><option value="business">Business buyers</option><option value="seller">Sellers</option><option value="staff">Staff</option></Select><SearchInput value={list.q} onChange={list.setQ} placeholder="Name, email or phone" /></>}>
      <Loadable query={list}>{(d) => (
        <>
          <Table head={['Person', 'Joined', 'Orders', 'Roles', 'Status', '']} empty={!d.users.length}>
            {d.users.map((u) => (
              <tr key={u.id}>
                <td><p className="font-semibold">{u.name}</p><p className="text-xs text-muted">{u.email}{u.phone ? ` · ${u.phone}` : ''}</p></td>
                <td>{formatDate(u.createdAt)}</td><td>{u.orders}</td>
                <td className="flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r} tone="gold">{r}</Badge>)}{u.stores > 0 && <Badge>Seller</Badge>}{u.organizations > 0 && <Badge tone="info">Business</Badge>}{u.guest && <Badge tone="neutral">Guest</Badge>}</td>
                <td><StatusBadge status={u.status} />{u.locked && <Badge tone="warning" className="ml-1">Locked</Badge>}</td>
                <td><Button size="sm" variant="outline" onClick={() => setOpen(u.id)}>Open</Button></td>
              </tr>
            ))}
          </Table>
          <Pager data={d} setPage={list.setPage} />
        </>
      )}</Loadable>
      {open && <UserPanel id={open} onClose={() => { setOpen(null); list.refetch(); }} canManage={canManage} canStaff={canStaff} />}
    </Section>
  );
}

function UserPanel({ id, onClose, canManage, canStaff }: { id: string; onClose: () => void; canManage: boolean; canStaff: boolean }) {
  const { data, refetch } = useQuery({ queryKey: ['admin', 'user', id], queryFn: () => api<{ user: UserRow & { emailVerifiedAt: string | null; marketingOptIn: boolean }; organizations: { id: string; name: string; status: string; role: string }[]; stores: { id: string; name: string; status: string; role: string }[]; orders: { id: string; number: string; createdAt: string; status: string; totalPaise: number }[]; tickets: { id: string; number: string; subject: string; status: string }[]; activity: { id: string; action: string; createdAt: string }[] }>(`/admin/users/${id}`) });
  const [roles, setRoles] = useState<string[] | null>(null);
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={data?.user.name ?? 'Loading…'} description={data?.user.email} wide>
      {data && (
        <div className="grid gap-5">
          <div className="flex flex-wrap gap-2"><StatusBadge status={data.user.status} />{data.user.emailVerifiedAt ? <Badge tone="success">Email confirmed</Badge> : <Badge tone="warning">Email not confirmed</Badge>}{data.user.locked && <Badge tone="warning">Locked after failed sign-ins</Badge>}</div>
          {canManage && !data.user.roles.includes('ADMIN') && (
            <div className="flex flex-wrap gap-2">
              <ConfirmButton danger={data.user.status === 'ACTIVE'} title={data.user.status === 'ACTIVE' ? 'Suspend this account?' : 'Restore this account?'} body={data.user.status === 'ACTIVE' ? 'They are signed out everywhere and cannot sign in.' : undefined} reason={{ label: 'Reason (kept in the audit log)' }} confirmLabel={data.user.status === 'ACTIVE' ? 'Suspend' : 'Restore'} onConfirm={async (reason) => { await patch(`/admin/users/${id}/status`, { status: data.user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE', reason }); refetch(); }}>{data.user.status === 'ACTIVE' ? 'Suspend' : 'Restore'}</ConfirmButton>
              {data.user.locked && <Button size="sm" variant="outline" onClick={async () => { await post(`/admin/users/${id}/unlock`); refetch(); }}>Unlock sign-in</Button>}
            </div>
          )}
          {data.user.roles.includes('ADMIN') && <Alert tone="info">This is the Admin account. Its role, password and status are managed only with the server’s admin script.</Alert>}
          {canStaff && !data.user.roles.includes('ADMIN') && (
            <fieldset className="rounded-xl border border-line p-4"><legend className="label px-1">Staff roles</legend>
              <div className="flex flex-wrap gap-4">{['OPERATIONS', 'FINANCE', 'SUPPORT'].map((r) => <label key={r} className="flex items-center gap-2 text-sm"><input type="checkbox" className="checkbox mt-0" checked={(roles ?? data.user.roles).includes(r)} onChange={(e) => setRoles(e.target.checked ? [...(roles ?? data.user.roles), r] : (roles ?? data.user.roles).filter((x) => x !== r))} />{label(r)}</label>)}</div>
              {roles && <Button size="sm" className="mt-3" onClick={async () => { try { await put(`/admin/users/${id}/roles`, { roles }); toast.success('Roles updated; they’ll be asked to sign in again'); setRoles(null); refetch(); } catch (e) { toast.error((e as Error).message); } }}>Save roles</Button>}
            </fieldset>
          )}
          {(data.organizations.length > 0 || data.stores.length > 0) && <p className="text-sm">{[...data.organizations.map((o) => `Business: ${o.name} (${o.role.toLowerCase()}, ${label(o.status).toLowerCase()})`), ...data.stores.map((s) => `Store: ${s.name} (${s.role.toLowerCase()}, ${label(s.status).toLowerCase()})`)].join(' · ')}</p>}
          <div><p className="label mb-2">Orders</p><ul className="text-sm grid gap-1">{data.orders.map((o) => <li key={o.id} className="flex justify-between"><span>{o.number} · {formatDate(o.createdAt)}</span><span>{label(o.status)} · {formatMoney(o.totalPaise)}</span></li>)}{!data.orders.length && <li className="text-muted">None</li>}</ul></div>
          <div><p className="label mb-2">Recent activity</p><ul className="text-sm grid gap-1 max-h-48 overflow-y-auto">{data.activity.map((a) => <li key={a.id} className="flex justify-between gap-3"><span>{a.action}</span><span className="text-muted">{formatDateTime(a.createdAt)}</span></li>)}</ul></div>
        </div>
      )}
    </Modal>
  );
}

export function StaffRoles() {
  const query = useQuery({ queryKey: ['admin', 'staff'], queryFn: () => api<{ staff: { id: string; name: string; email: string; status: string; roles: string[] }[]; roles: { id: string; label: string; description: string }[] }>('/admin/staff') });
  return (
    <Section title="Staff roles" description="Grant Operations, Finance or Support from People → Open. Nobody can be made Admin from the console. Role changes sign the person out.">
      <Loadable query={query}>{(d) => (
        <div className="grid gap-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{d.roles.map((r) => <div key={r.id} className="card card-pad"><p className="font-semibold">{r.label}</p><p className="text-sm text-muted mt-1">{r.description}</p></div>)}</div>
          <Table head={['Staff member', 'Roles', 'Status']}>{d.staff.map((s) => <tr key={s.id}><td><p className="font-semibold">{s.name}</p><p className="text-xs text-muted">{s.email}</p></td><td className="flex gap-1">{s.roles.map((r) => <Badge key={r} tone="gold">{r}</Badge>)}</td><td><StatusBadge status={s.status} /></td></tr>)}</Table>
        </div>
      )}</Loadable>
    </Section>
  );
}

// ───────────── Business accounts ─────────────
type Org = { id: string; legalName: string; tradeName: string | null; status: string; gstRegistered: boolean; gstin: string | null; pan: string | null; businessType: string; contactPhone: string; registeredAddress: { line1: string; city: string; state: string; pincode: string }; createdAt: string; owner: { name: string; email: string } | null; memberCount: number; orders: number; creditApproved: boolean; allowedTerms: string };
export function Organizations({ canFinance }: { canFinance: boolean }) {
  const [status, setStatus] = useState('');
  const list = useAdminList<{ organizations: Org[] }>('/admin/organizations', 'orgs', { status });
  const act = async (id: string, body: object) => { try { await patch(`/admin/organizations/${id}`, body); toast.success('Saved'); list.refetch(); } catch (e) { toast.error((e as Error).message); } };
  return (
    <Section title="Business accounts" description="Verify businesses before they can request quotes. Self-entered details are not treated as verified; check GSTIN/PAN against official records." actions={<><Select aria-label="Status" className="min-h-[40px] py-1 w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></Select><SearchInput value={list.q} onChange={list.setQ} placeholder="Name or GSTIN" /></>}>
      <Loadable query={list}>{(d) => (
        <div className="grid gap-3">
          {d.organizations.map((o) => (
            <article key={o.id} className="card card-pad">
              <div className="flex flex-wrap justify-between gap-3">
                <div><p className="font-semibold">{o.legalName}{o.tradeName ? ` (${o.tradeName})` : ''}</p><p className="text-sm text-muted">{label(o.businessType)} · {o.gstin ? `GSTIN ${o.gstin}` : 'Not GST-registered'}{o.pan ? ` · PAN ${o.pan}` : ''} · {o.contactPhone}</p><p className="text-sm text-muted">{o.registeredAddress.line1}, {o.registeredAddress.city}, {o.registeredAddress.state} {o.registeredAddress.pincode}</p><p className="text-xs text-muted mt-1">Owner {o.owner?.name} ({o.owner?.email}) · {o.memberCount} members · {o.orders} orders · applied {formatDate(o.createdAt)}</p></div>
                <div className="flex flex-col items-end gap-1"><StatusBadge status={o.status} />{o.creditApproved && <Badge tone="gold">Credit: {label(o.allowedTerms)}</Badge>}</div>
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                {o.status !== 'APPROVED' && <Button size="sm" onClick={() => act(o.id, { status: 'APPROVED' })}>Approve</Button>}
                {o.status === 'PENDING' && <ConfirmButton danger title="Reject this business?" reason={{ label: 'Reason sent to the owner' }} confirmLabel="Reject" onConfirm={(note) => act(o.id, { status: 'REJECTED', note })}>Reject</ConfirmButton>}
                {o.status === 'APPROVED' && <ConfirmButton danger title="Suspend this business?" reason={{ label: 'Reason' }} confirmLabel="Suspend" onConfirm={(note) => act(o.id, { status: 'SUSPENDED', note })}>Suspend</ConfirmButton>}
                {canFinance && o.status === 'APPROVED' && (
                  <label className="flex items-center gap-2 text-sm ml-auto">Credit terms
                    <Select className="min-h-[36px] py-1 w-auto" value={o.creditApproved ? o.allowedTerms : 'NONE'} onChange={(e) => act(o.id, e.target.value === 'NONE' ? { creditApproved: false, allowedTerms: 'PREPAID' } : { creditApproved: true, allowedTerms: e.target.value })}>
                      <option value="NONE">None (prepaid)</option><option value="NET_15">Net 15</option><option value="NET_30">Net 30</option><option value="NET_45">Net 45</option>
                    </Select>
                  </label>
                )}
              </div>
            </article>
          ))}
          {!d.organizations.length && <p className="text-muted">No business accounts match.</p>}
        </div>
      )}</Loadable>
    </Section>
  );
}

// ───────────── Sellers ─────────────
type Seller = { id: string; slug: string; name: string; legalName: string; status: string; gstRegistered: boolean; gstin: string | null; pan: string | null; businessType: string; contactPhone: string; pickupAddress: { line1: string; city: string; state: string; pincode: string }; primaryCategory: string; createdAt: string; description: string; owner: { name: string; email: string } | null; staff: number; listings: number; payoutAccount: { accountHolder: string; accountLast4: string; ifsc: string; verified: boolean } | null; payablePaise: number | null };
export function Sellers({ canFinance }: { canFinance: boolean }) {
  const [status, setStatus] = useState('');
  const list = useAdminList<{ sellers: Seller[] }>('/admin/sellers', 'sellers', { status });
  const act = async (id: string, body: object) => { try { await patch(`/admin/sellers/${id}`, body); toast.success('Saved'); list.refetch(); } catch (e) { toast.error((e as Error).message); } };
  return (
    <Section title="Sellers" description="Approve stores after checking identity and tax details. Finance verifies bank accounts before any payout." actions={<><Select aria-label="Status" className="min-h-[40px] py-1 w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="PENDING">Applications</option><option value="APPROVED">Approved</option><option value="SUSPENDED">Suspended</option></Select><SearchInput value={list.q} onChange={list.setQ} placeholder="Store, legal name or GSTIN" /></>}>
      <Loadable query={list}>{(d) => (
        <div className="grid gap-3">
          {d.sellers.map((s) => (
            <article key={s.id} className="card card-pad">
              <div className="flex flex-wrap justify-between gap-3">
                <div className="max-w-2xl"><p className="font-semibold">{s.name} <span className="font-normal text-muted">· {s.legalName}</span></p><p className="text-sm text-muted">{label(s.businessType)} · {s.primaryCategory} · {s.gstin ? `GSTIN ${s.gstin}` : 'Not GST-registered'}{s.pan ? ` · PAN ${s.pan}` : ''}</p><p className="text-sm text-muted">Pickup: {s.pickupAddress.line1}, {s.pickupAddress.city}, {s.pickupAddress.state} {s.pickupAddress.pincode} · {s.contactPhone}</p><p className="text-sm mt-1">{s.description}</p><p className="text-xs text-muted mt-1">Owner {s.owner?.name} ({s.owner?.email}) · {s.listings} listings · {s.staff} team · applied {formatDate(s.createdAt)}</p></div>
                <div className="flex flex-col items-end gap-1"><StatusBadge status={s.status} />{s.payablePaise != null && <span className="text-sm">Payable {formatMoney(s.payablePaise)}</span>}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-4">
                {s.status !== 'APPROVED' && <Button size="sm" onClick={() => act(s.id, { status: 'APPROVED' })}>Approve store</Button>}
                {s.status === 'PENDING' && <ConfirmButton danger title="Reject application?" reason={{ label: 'Reason sent to the applicant' }} confirmLabel="Reject" onConfirm={(note) => act(s.id, { status: 'REJECTED', note })}>Reject</ConfirmButton>}
                {s.status === 'APPROVED' && <ConfirmButton danger title="Suspend this store?" body="Its listings stop selling immediately." reason={{ label: 'Reason' }} confirmLabel="Suspend" onConfirm={(note) => act(s.id, { status: 'SUSPENDED', note })}>Suspend</ConfirmButton>}
                {s.status === 'APPROVED' && <Link href={`/sellers/${s.slug}`} className="btn btn-ghost btn-sm">Storefront</Link>}
                <span className="ml-auto text-sm">{s.payoutAccount ? <>Bank ••••{s.payoutAccount.accountLast4} · {s.payoutAccount.ifsc} {s.payoutAccount.verified ? <Badge tone="success">Verified</Badge> : canFinance ? <Button size="sm" variant="outline" onClick={() => act(s.id, { payoutVerified: true })}>Mark verified</Button> : <Badge tone="warning">Unverified</Badge>}</> : <span className="text-muted">No bank account</span>}</span>
              </div>
            </article>
          ))}
          {!d.sellers.length && <p className="text-muted">No sellers match.</p>}
        </div>
      )}</Loadable>
    </Section>
  );
}

// ───────────── Moderation ─────────────
type ModProduct = { id: string; name: string; brand: string; category: string; status: string; description: string; highlights: string[]; hsnCode: string | null; images: string[]; specifications: { name: string; value: string }[]; listings: { id: string; variantLabel: string; seller: string; sku: string; pricePaise: number; mrpPaise: number; moq: number }[] };
export function Moderation() {
  const query = useQuery({ queryKey: ['admin', 'moderation'], queryFn: () => api<{ products: ModProduct[]; offers: { id: string; name: string; variantLabel: string; seller: string; sku: string; pricePaise: number; mrpPaise: number; image: string; stock: number }[] }>('/admin/moderation') });
  const decide = async (kind: string, id: string, decision: string, note?: string) => { try { await post(`/admin/moderation/${kind}/${id}`, { decision, ...(note ? { note } : {}) }); toast.success(label(decision)); query.refetch(); } catch (e) { toast.error((e as Error).message); } };
  const buttons = (kind: string, id: string) => (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => decide(kind, id, 'APPROVED')}>Approve</Button>
      <ConfirmButton title="Request changes" reason={{ label: 'What should the seller fix?' }} confirmLabel="Send" onConfirm={(note) => decide(kind, id, 'CHANGES_REQUESTED', note)}>Request changes</ConfirmButton>
      <ConfirmButton danger title="Reject" reason={{ label: 'Reason' }} confirmLabel="Reject" onConfirm={(note) => decide(kind, id, 'REJECTED', note)}>Reject</ConfirmButton>
    </div>
  );
  return (
    <Section title="Moderation" description="Check photos are genuine product photos, claims are accurate, HSN and category fit, and prices are honest (MRP ≥ price).">
      <Loadable query={query}>{(d) => (
        <div className="grid gap-6">
          <section><h2 className="text-lg mb-3">New products ({d.products.length})</h2>
            <div className="grid gap-4">{d.products.map((p) => (
              <article key={p.id} className="card card-pad grid gap-4 md:grid-cols-[200px_1fr]">
                <div className="grid grid-cols-3 md:grid-cols-2 gap-2 content-start">{p.images.map((u) => <span key={u} className="relative aspect-square rounded-lg bg-cream border border-line"><Image src={u} alt="" fill sizes="100px" className="object-contain p-1" unoptimized /></span>)}</div>
                <div>
                  <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-lg">{p.name}</p><StatusBadge status={p.status} /></div>
                  <p className="text-sm text-muted">{p.brand} · {p.category} · HSN {p.hsnCode ?? 'missing'}</p>
                  <p className="text-sm mt-2 whitespace-pre-line">{p.description}</p>
                  {p.highlights.length > 0 && <ul className="text-sm list-disc pl-5 mt-2">{p.highlights.map((h) => <li key={h}>{h}</li>)}</ul>}
                  {p.specifications.length > 0 && <p className="text-sm text-muted mt-2">{p.specifications.map((s) => `${s.name}: ${s.value}`).join(' · ')}</p>}
                  <ul className="text-sm mt-2">{p.listings.map((l) => <li key={l.id}>{l.seller} · {l.variantLabel} · SKU {l.sku} · {formatMoney(l.pricePaise)} (MRP {formatMoney(l.mrpPaise)}) · MOQ {l.moq}</li>)}</ul>
                  <div className="mt-3">{buttons('product', p.id)}</div>
                </div>
              </article>
            ))}{!d.products.length && <p className="text-muted">No products waiting.</p>}</div>
          </section>
          <section><h2 className="text-lg mb-3">New offers on existing products ({d.offers.length})</h2>
            <Table head={['Offer', 'Seller', 'Price', 'Stock', '']} empty={!d.offers.length}>{d.offers.map((o) => <tr key={o.id}><td>{o.name} · {o.variantLabel}<span className="block text-xs text-muted">SKU {o.sku}</span></td><td>{o.seller}</td><td>{formatMoney(o.pricePaise)} <span className="mrp text-xs">{formatMoney(o.mrpPaise)}</span></td><td>{o.stock}</td><td>{buttons('listing', o.id)}</td></tr>)}</Table>
          </section>
        </div>
      )}</Loadable>
    </Section>
  );
}

// ───────────── Catalogue ─────────────
type Cat = { id: string; name: string; slug: string; description: string | null; parentId: string | null; taxClassId: string | null; taxClass: { gstRateBps: number } | null; active: boolean; sortOrder: number; products: number; commissionBps: number | null };
export function Categories({ canFinance }: { canFinance: boolean }) {
  const query = useQuery({ queryKey: ['admin', 'categories'], queryFn: () => api<{ categories: Cat[]; taxClasses: { id: string; name: string; gstRateBps: number }[]; defaultCommissionBps: number }>('/admin/categories') });
  const [edit, setEdit] = useState<Partial<Cat> & { commission?: string } | null>(null);
  const save = async () => {
    if (!edit) return;
    const body = { name: edit.name, description: edit.description || null, parentId: edit.parentId || null, taxClassId: edit.taxClassId || null, active: edit.active ?? true, ...(canFinance ? { commissionBps: edit.commission ? Math.round(Number(edit.commission) * 100) : null } : {}) };
    try { if (edit.id) await patch(`/admin/categories/${edit.id}`, body); else await post('/admin/categories', body); toast.success('Saved'); setEdit(null); query.refetch(); } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <Section title="Categories" description="Each category sets a default GST rate (a product’s HSN can override) and, optionally, its own commission." actions={<Button onClick={() => setEdit({ active: true })}>New category</Button>}>
      <Loadable query={query}>{(d) => (
        <>
          <Table head={['Category', 'Parent', 'Default GST', 'Commission', 'Products', 'Status', '']}>
            {d.categories.map((c) => <tr key={c.id}><td className="font-semibold">{c.name}<span className="block text-xs text-muted">{c.description}</span></td><td>{d.categories.find((p) => p.id === c.parentId)?.name ?? '—'}</td><td>{c.taxClass ? pct(c.taxClass.gstRateBps) : '18% (fallback)'}</td><td>{c.commissionBps != null ? pct(c.commissionBps) : `${pct(d.defaultCommissionBps)} (default)`}</td><td>{c.products}</td><td>{c.active ? <Badge tone="success">Visible</Badge> : <Badge tone="neutral">Hidden</Badge>}</td><td><Button size="sm" variant="outline" onClick={() => setEdit({ ...c, commission: c.commissionBps != null ? String(c.commissionBps / 100) : '' })}>Edit</Button></td></tr>)}
          </Table>
          <Modal open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={edit?.id ? 'Edit category' : 'New category'}>
            {edit && <div className="grid gap-4">
              <Field label="Name"><Input value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label="Description"><Textarea rows={2} value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
              <Field label="Parent category"><Select value={edit.parentId ?? ''} onChange={(e) => setEdit({ ...edit, parentId: e.target.value || null })}><option value="">None (top level)</option>{d.categories.filter((c) => c.id !== edit.id && !c.parentId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
              <Field label="Default GST rate"><Select value={edit.taxClassId ?? ''} onChange={(e) => setEdit({ ...edit, taxClassId: e.target.value || null })}><option value="">Not set (18% fallback)</option>{d.taxClasses.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
              {canFinance && <Field label="Commission % (blank = default)"><Input inputMode="decimal" value={edit.commission ?? ''} onChange={(e) => setEdit({ ...edit, commission: e.target.value })} /></Field>}
              <Checkbox checked={edit.active ?? true} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} label="Visible to shoppers and sellers" />
              <Button onClick={save}>Save</Button>
            </div>}
          </Modal>
        </>
      )}</Loadable>
    </Section>
  );
}

export function Brands() {
  const query = useQuery({ queryKey: ['admin', 'brands'], queryFn: () => api<{ brands: { id: string; name: string; verified: boolean; products: number }[] }>('/admin/brands') });
  return (
    <Section title="Brands" description="Mark a brand verified only after checking trademark ownership or authorised-reseller documents.">
      <Loadable query={query}>{(d) => (
        <Table head={['Brand', 'Products', 'Verified', '']} empty={!d.brands.length}>{d.brands.map((b) => <tr key={b.id}><td className="font-semibold">{b.name}</td><td>{b.products}</td><td>{b.verified ? <Badge tone="success">Verified</Badge> : <Badge tone="neutral">No</Badge>}</td><td><Button size="sm" variant="outline" onClick={async () => { await patch(`/admin/brands/${b.id}`, { verified: !b.verified }); query.refetch(); }}>{b.verified ? 'Remove badge' : 'Mark verified'}</Button></td></tr>)}</Table>
      )}</Loadable>
    </Section>
  );
}

export function Products() {
  const [status, setStatus] = useState('');
  const list = useAdminList<{ products: { id: string; slug: string; name: string; brand: string; category: string; status: string; featured: boolean; demo: boolean; image: string | null; variants: number; updatedAt: string }[]; page: number; pages: number }>('/admin/products', 'products', { status });
  const act = async (id: string, body: object) => { try { await patch(`/admin/products/${id}`, body); list.refetch(); } catch (e) { toast.error((e as Error).message); } };
  return (
    <Section title="Products" description="Feature products on the homepage, or pause a product page across every seller." actions={<><Select aria-label="Status" className="min-h-[40px] py-1 w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="APPROVED">Live</option><option value="PENDING">Pending</option><option value="PAUSED">Paused</option><option value="REJECTED">Rejected</option></Select><SearchInput value={list.q} onChange={list.setQ} placeholder="Product or brand" /></>}>
      <Loadable query={list}>{(d) => (
        <>
          <Table head={['', 'Product', 'Category', 'Status', 'Homepage', '']} empty={!d.products.length}>
            {d.products.map((p) => <tr key={p.id}><td>{p.image && <Image src={p.image} alt="" width={40} height={40} className="size-10 rounded bg-cream object-contain" unoptimized />}</td><td><p className="font-semibold">{p.name}</p><p className="text-xs text-muted">{p.brand} · {p.variants} variant(s){p.demo ? ' · demo' : ''}</p></td><td>{p.category}</td><td><StatusBadge status={p.status} /></td><td>{p.status === 'APPROVED' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="checkbox mt-0" checked={p.featured} onChange={(e) => act(p.id, { featured: e.target.checked })} />Featured</label>}</td>
              <td>{p.status === 'APPROVED' ? <ConfirmButton danger title="Pause this product?" body="It disappears from the storefront for every seller." confirmLabel="Pause" onConfirm={() => act(p.id, { status: 'PAUSED', featured: false })}>Pause</ConfirmButton> : p.status === 'PAUSED' ? <Button size="sm" variant="outline" onClick={() => act(p.id, { status: 'APPROVED' })}>Resume</Button> : null}</td></tr>)}
          </Table>
          <Pager data={d} setPage={list.setPage} />
        </>
      )}</Loadable>
    </Section>
  );
}

export function Inventory() {
  const [all, setAll] = useState(false);
  const query = useQuery({ queryKey: ['admin', 'inventory', all], queryFn: () => api<{ lowStockThreshold: number; items: { id: string; sku: string; name: string; variant: string; seller: string; onHand: number; reserved: number; available: number }[] }>(`/admin/inventory${all ? '?all=true' : ''}`) });
  return (
    <Section title="Inventory overview" description="Live listings by available stock (on hand minus units held for unpaid orders)." actions={<label className="flex items-center gap-2 text-sm"><input type="checkbox" className="checkbox mt-0" checked={all} onChange={(e) => setAll(e.target.checked)} />Show all, not only low stock</label>}>
      <Loadable query={query}>{(d) => (
        <Table head={['Product', 'Seller', 'SKU', 'On hand', 'Held', 'Available']} empty={!d.items.length}>{d.items.map((i) => <tr key={i.id}><td>{i.name} · {i.variant}</td><td>{i.seller}</td><td>{i.sku}</td><td>{i.onHand}</td><td>{i.reserved}</td><td className={Number(i.available) <= d.lowStockThreshold ? 'text-warning font-semibold' : ''}>{i.available}</td></tr>)}</Table>
      )}</Loadable>
    </Section>
  );
}

