'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Users, Store, ClipboardCheck, Package, IndianRupee, Building2, RotateCcw, LifeBuoy, Landmark, AlertTriangle, Boxes, BarChart3, Lock, UserCheck, MailWarning, Ban, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { api, patch, post, put } from '@/lib/api';
import { formatDate, formatDateTime, formatMoney, label, pct, PAYMENT_TEXT, rupeesToPaise } from '@/lib/format';
import { DailyBars, Meter } from '../charts';
import { Alert, Badge, Button, ConfirmButton, Field, Input, Select, Stat, StatusBadge, Checkbox, Textarea } from '../ui';
import { ActionButton, DataTable, Drawer, KV, Loadable, MiniStats, NotesPanel, Panel, Section, SummaryCards, TabPills, Table, Timeline, attempt, useAdminTable, useOpenParam, useSummary, type CardDef, type Column, type ListResponse } from './kit';

/** Status cards shared by sellers and business accounts (both use the approval workflow). */
const approvalCards = (allLabel: string): CardDef[] => [
  { key: 'ALL', label: allLabel, icon: Users, tone: 'green', params: { status: null } },
  { key: 'PENDING', label: 'Pending', icon: Clock, tone: 'amber', params: { status: 'PENDING' } },
  { key: 'APPROVED', label: 'Approved', icon: CheckCircle2, tone: 'green', params: { status: 'APPROVED' } },
  { key: 'REJECTED', label: 'Rejected', icon: XCircle, tone: 'red', params: { status: 'REJECTED' } },
  { key: 'SUSPENDED', label: 'Suspended', icon: AlertTriangle, tone: 'violet', params: { status: 'SUSPENDED' } },
];

export type Can = (capability: string) => boolean;

// ───────────── Overview ─────────────
type Dashboard = {
  metrics: { orders: number; awaitingPayment: number; toShip: number; customers: number; activeSellers: number; activeRfqs: number; lowStock: number; paidGmvPaise: number | null; averageOrderPaise: number | null; platformRevenuePaise: number | null; demoGmvPaise: number | null; refundsPendingPaise: number | null; refundsPending: number };
  queues: { sellers: number; products: number; offers: number; organizations: number; returns: number; tickets: number; bankTransfers: number };
  series: { date: string; orders: number; paidGmvPaise: number | null }[];
  statusMix: { value: string; count: number }[];
  recentOrders: { id: string; number: string; createdAt: string; status: string; paymentStatus: string; totalPaise: number; customer: string }[];
  topSellers: { id: string; name: string; grossPaise: number | null }[];
};

export function Overview({ can }: { can: Can }) {
  const query = useQuery({ queryKey: ['admin', 'dashboard'], queryFn: () => api<Dashboard>('/admin/dashboard'), refetchInterval: 60_000 });
  return (
    <Section title="Marketplace overview" description="Every figure is calculated from stored records. Demo-simulated payments are reported separately and never counted as GMV." actions={can('reports.view') && <Link href="/admin/analytics" className="btn btn-outline btn-sm"><BarChart3 size={15} />Open analytics</Link>}>
      <Loadable query={query}>{(d) => {
        const queue = [
          [d.queues.sellers, 'seller applications', 'sellers?status=PENDING', Store], [d.queues.products, 'new products to review', 'moderation', ClipboardCheck],
          [d.queues.offers, 'new offers to review', 'moderation', ClipboardCheck], [d.queues.organizations, 'business accounts to verify', 'organizations?status=PENDING', Building2],
          [d.queues.returns, 'return requests', 'returns?status=REQUESTED', RotateCcw], [d.queues.tickets, 'open support tickets', 'support', LifeBuoy],
          [d.queues.bankTransfers, 'bank transfers to match', 'orders?payment=BANK_TRANSFER_PENDING', Landmark], [d.metrics.lowStock, 'offers low on stock', 'inventory', Boxes],
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
                <h2 className="text-lg mb-3">Needs attention</h2>
                {queue.length ? <ul className="grid gap-2">{queue.map(([n, t, href, Icon]) => <li key={t}><Link href={`/admin/${href}`} className="flex items-center gap-3 rounded-xl border border-line p-3 hover:border-forest"><Icon size={17} className="text-forest" /><span className="flex-1"><strong>{n}</strong> {t}</span>→</Link></li>)}</ul> : <p className="text-sm text-muted">Every queue is clear.</p>}
                {d.metrics.refundsPending > 0 && <Link href="/admin/refunds?status=PENDING_PROVIDER" className="flex items-center gap-2 mt-3 text-sm text-warning font-semibold"><AlertTriangle size={15} />{d.metrics.refundsPending} refunds waiting to be paid</Link>}
              </section>
            </div>
            <div className="grid gap-6 xl:grid-cols-3">
              <section className="card card-pad"><h2 className="text-lg mb-3">Order status</h2><Meter items={d.statusMix.map((s) => ({ label: label(s.value), value: s.count }))} /></section>
              <section className="card card-pad xl:col-span-2">
                <div className="flex justify-between items-center mb-3"><h2 className="text-lg">Recent orders</h2><Link href="/admin/orders" className="text-sm text-forest font-semibold">All orders →</Link></div>
                <ul className="divide-y divide-line">{d.recentOrders.map((o) => <li key={o.id}><Link href={`/admin/orders?open=${o.id}`} className="flex flex-wrap items-center gap-3 py-2.5 text-sm hover:bg-cream"><span className="font-semibold w-44">{o.number}</span><span className="flex-1 text-muted">{o.customer} · {formatDateTime(o.createdAt)}</span><StatusBadge status={o.status} /><span className="font-semibold w-24 text-right">{formatMoney(o.totalPaise)}</span></Link></li>)}</ul>
              </section>
            </div>
            {d.topSellers.length > 0 && <section className="card card-pad"><h2 className="text-lg mb-3">Top sellers by delivered sales</h2><ol className="grid gap-1.5">{d.topSellers.map((s, i) => <li key={s.id} className="flex justify-between text-sm"><Link href={`/admin/sellers?open=${s.id}`} className="hover:underline">{i + 1}. {s.name}</Link><strong>{s.grossPaise == null ? '—' : formatMoney(s.grossPaise)}</strong></li>)}</ol></section>}
          </div>
        );
      }}</Loadable>
    </Section>
  );
}

// ───────────── Customers ─────────────
type UserRow = { id: string; name: string; email: string; phone: string | null; status: string; createdAt: string; emailVerifiedAt: string | null; roles: string[]; locked: boolean; orders: number; stores: number; organizations: number; guest: boolean; marketingOptIn: boolean };
type Customer360 = {
  user: UserRow & { isAdmin: boolean };
  stats: { orders: number; byStatus: Record<string, number>; spentPaise: number; paidOrders: number; averageOrderPaise: number; lastOrderAt: string | null; returns: number; refundsPaise: number; activeSessions: number; wishlist: number; cartItems: number };
  addresses: { id: string; name: string; line1: string; line2: string | null; city: string; state: string; pincode: string; phone: string; label: string; isDefault: boolean }[];
  organizations: { id: string; name: string; status: string; role: string }[];
  stores: { id: string; name: string; status: string; role: string }[];
  orders: { id: string; number: string; createdAt: string; status: string; paymentStatus: string; paymentMethod: string; mode: string; totalPaise: number }[];
  tickets: { id: string; number: string; subject: string; status: string; updatedAt: string }[];
  activity: { id: string; action: string; createdAt: string; metadata: Record<string, unknown> }[];
  notes: { id: string; body: string; authorName: string; authorId: string; createdAt: string }[];
};

export function Customers({ can }: { can: Can }) {
  const list = useAdminTable<ListResponse & { users: UserRow[] }>('/admin/users', ['type', 'status', 'verified', 'locked']);
  const summary = useSummary('users');
  const types = summary.data?.types;
  const [open, setOpen] = useOpenParam();
  const columns: Column<UserRow>[] = [
    { key: 'name', label: 'Person', sort: 'name', always: true, render: (u) => <><p className="font-semibold">{u.name}</p><p className="text-xs text-muted">{u.email}</p></> },
    { key: 'phone', label: 'Mobile', render: (u) => u.phone ?? '—' },
    { key: 'joined', label: 'Joined', sort: 'joined', render: (u) => formatDate(u.createdAt) },
    { key: 'orders', label: 'Orders', sort: 'orders', className: 'text-right', render: (u) => u.orders },
    { key: 'type', label: 'Type', render: (u) => <span className="flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r} tone="gold">{label(r)}</Badge>)}{u.stores > 0 && <Badge>Seller</Badge>}{u.organizations > 0 && <Badge tone="info">Business</Badge>}{u.guest && <Badge tone="neutral">Guest</Badge>}{!u.roles.length && !u.stores && !u.organizations && !u.guest && <span className="text-muted text-sm">Customer</span>}</span> },
    { key: 'verified', label: 'Email', render: (u) => u.emailVerifiedAt ? <Badge tone="success">Confirmed</Badge> : <Badge tone="warning">Unconfirmed</Badge> },
    { key: 'marketing', label: 'Marketing', hidden: true, render: (u) => (u.marketingOptIn ? 'Opted in' : '—') },
    { key: 'status', label: 'Status', render: (u) => <><StatusBadge status={u.status} />{u.locked && <Badge tone="warning" className="ml-1">Locked</Badge>}</> },
  ];
  return (
    <Section title="People" description="Customers, business buyers, sellers and staff. Click a card or tab to filter; click a row for the full customer view.">
      <SummaryCards kind="users" cards={[
        { key: 'ALL', label: 'All people', icon: Users, tone: 'green', params: { status: null, verified: null, locked: null } },
        { key: 'ACTIVE', label: 'Active', icon: UserCheck, tone: 'blue', params: { status: 'ACTIVE', verified: null, locked: null } },
        { key: 'UNCONFIRMED', label: 'Email not confirmed', icon: MailWarning, tone: 'amber', params: { status: null, verified: 'no', locked: null } },
        { key: 'LOCKED', label: 'Locked sign-in', icon: Lock, tone: 'slate', params: { status: null, verified: null, locked: 'yes' } },
        { key: 'SUSPENDED', label: 'Suspended', icon: Ban, tone: 'red', params: { status: 'SUSPENDED', verified: null, locked: null } },
      ]} />
      <div className="card p-3 pb-1 mb-4">
        <TabPills items={[
          { label: 'Everyone', count: summary.data?.ALL?.total, params: { type: null } },
          { label: 'Customers', count: types?.customer, params: { type: 'customer' } },
          { label: 'Business buyers', count: types?.business, params: { type: 'business' } },
          { label: 'Sellers', count: types?.seller, params: { type: 'seller' } },
          { label: 'Staff', count: types?.staff, params: { type: 'staff' } },
          { label: 'Guest checkouts', count: types?.guest, params: { type: 'guest' } },
        ]} />
      </div>
      <DataTable tableId="users" query={list} rows={list.data?.users} columns={columns} onOpen={(u) => setOpen(u.id)} search="Name, email or mobile" dateFilter="Joined"
        bulk={can('users.manage') ? { endpoint: '/admin/users/bulk', actions: [{ id: 'sign-out', label: 'Sign out everywhere', confirm: 'They will need to sign in again on every device.' }, { id: 'suspend', label: 'Suspend', danger: true, reason: 'required' }, { id: 'restore', label: 'Restore', reason: 'optional' }] } : undefined} />
      {open && <CustomerDrawer id={open} can={can} onClose={() => { setOpen(null); list.refetch(); }} />}
    </Section>
  );
}

function CustomerDrawer({ id, can, onClose }: { id: string; can: Can; onClose: () => void }) {
  const { data, refetch, error } = useQuery({ queryKey: ['admin', 'user', id], queryFn: () => api<Customer360>(`/admin/users/${id}`) });
  const [roles, setRoles] = useState<string[] | null>(null);
  const [edit, setEdit] = useState<{ name: string; phone: string } | null>(null);
  const u = data?.user;
  const manage = can('users.manage') && u && !u.isAdmin;
  const run = async (fn: () => Promise<unknown>, msg: string) => { if (await attempt(fn, msg)) refetch(); };
  return (
    <Drawer open onClose={onClose} wide title={u?.name ?? 'Loading…'} subtitle={u ? `${u.email}${u.phone ? ` · ${u.phone}` : ''} · joined ${formatDate(u.createdAt)}` : undefined}
      badges={u && <><StatusBadge status={u.status} />{u.emailVerifiedAt ? <Badge tone="success">Email confirmed</Badge> : <Badge tone="warning">Email not confirmed</Badge>}{u.locked && <Badge tone="warning">Locked after failed sign-ins</Badge>}{u.guest && <Badge tone="neutral">Guest checkout</Badge>}{u.roles.map((r) => <Badge key={r} tone="gold">{label(r)}</Badge>)}</>}
      actions={manage && <>
        <ConfirmButton danger={u.status === 'ACTIVE'} title={u.status === 'ACTIVE' ? 'Suspend this account?' : 'Restore this account?'} body={u.status === 'ACTIVE' ? 'They are signed out everywhere and cannot sign in.' : undefined} reason={{ label: 'Reason (kept in the audit log)' }} confirmLabel={u.status === 'ACTIVE' ? 'Suspend' : 'Restore'} onConfirm={async (reason) => { await patch(`/admin/users/${id}/status`, { status: u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE', reason }); refetch(); }}>{u.status === 'ACTIVE' ? 'Suspend' : 'Restore'}</ConfirmButton>
        <ConfirmButton title="Sign out on every device?" body="Useful if the account may be compromised." confirmLabel="Sign out everywhere" onConfirm={async () => { const r = await post<{ sessions: number }>(`/admin/users/${id}/sign-out`); toast.success(`${r.sessions} sessions ended`); refetch(); }}>Sign out everywhere</ConfirmButton>
        {u.locked && <Button size="sm" variant="outline" onClick={() => run(() => post(`/admin/users/${id}/unlock`), 'Sign-in unlocked')}>Unlock sign-in</Button>}
        <Button size="sm" variant="outline" onClick={() => setEdit({ name: u.name, phone: u.phone ?? '' })}>Edit details</Button>
        <Button size="sm" variant="ghost" onClick={() => run(() => patch(`/admin/users/${id}`, { emailVerified: !u.emailVerifiedAt }), u.emailVerifiedAt ? 'Marked unconfirmed' : 'Email marked confirmed')}>{u.emailVerifiedAt ? 'Mark email unconfirmed' : 'Mark email confirmed'}</Button>
      </>}>
      {error && <Alert>{(error as Error).message}</Alert>}
      {data && u && <>
        {u.isAdmin && <Alert tone="info">This is the Admin account. Its role, password and status are managed only with the server’s admin script.</Alert>}
        {edit && (
          <Panel title="Edit details">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label="Mobile" hint="10 digits, or leave blank"><Input inputMode="numeric" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} /></Field>
            </div>
            <div className="flex gap-2 mt-3"><Button size="sm" onClick={() => run(async () => { await patch(`/admin/users/${id}`, { name: edit.name, phone: edit.phone || null }); setEdit(null); }, 'Saved')}>Save</Button><Button size="sm" variant="ghost" onClick={() => setEdit(null)}>Cancel</Button></div>
          </Panel>
        )}
        <MiniStats items={[
          ['Lifetime spend', formatMoney(data.stats.spentPaise), `${data.stats.paidOrders} paid orders`], ['Average order', formatMoney(data.stats.averageOrderPaise)],
          ['Orders', data.stats.orders, data.stats.lastOrderAt ? `last ${formatDate(data.stats.lastOrderAt)}` : 'none paid yet'], ['Returns · refunds', `${data.stats.returns} · ${formatMoney(data.stats.refundsPaise)}`],
          ['Signed-in devices', data.stats.activeSessions], ['Wishlist', data.stats.wishlist], ['In cart', data.stats.cartItems], ['Marketing', u.marketingOptIn ? 'Opted in' : 'Not opted in'],
        ]} />
        {can('staff.manage') && !u.isAdmin && (
          <Panel title="Staff roles" actions={<Link href="/admin/staff" className="text-xs text-forest font-semibold">What each role can do →</Link>}>
            <div className="flex flex-wrap gap-4">{['OPERATIONS', 'FINANCE', 'SUPPORT'].map((r) => <label key={r} className="flex items-center gap-2 text-sm"><input type="checkbox" className="checkbox mt-0" checked={(roles ?? u.roles).includes(r)} onChange={(e) => setRoles(e.target.checked ? [...(roles ?? u.roles), r] : (roles ?? u.roles).filter((x) => x !== r))} />{label(r)}</label>)}</div>
            {roles && <Button size="sm" className="mt-3" onClick={() => run(async () => { await put(`/admin/users/${id}/roles`, { roles }); setRoles(null); }, 'Roles updated; they’ll be asked to sign in again')}>Save roles</Button>}
          </Panel>
        )}
        {(data.organizations.length > 0 || data.stores.length > 0) && (
          <Panel title="Accounts">
            <ul className="grid gap-1.5 text-sm">
              {data.organizations.map((o) => <li key={o.id} className="flex justify-between"><Link className="font-semibold hover:underline" href={`/admin/organizations?open=${o.id}`}>{o.name}</Link><span className="text-muted">Business · {label(o.role)} · <StatusBadge status={o.status} /></span></li>)}
              {data.stores.map((s) => <li key={s.id} className="flex justify-between"><Link className="font-semibold hover:underline" href={`/admin/sellers?open=${s.id}`}>{s.name}</Link><span className="text-muted">Store · {label(s.role)} · <StatusBadge status={s.status} /></span></li>)}
            </ul>
          </Panel>
        )}
        <Panel title={`Orders (${data.stats.orders})`} actions={<Link href={`/admin/orders?user=${id}`} className="text-xs text-forest font-semibold">All orders →</Link>}>
          {data.orders.length ? <Table head={['Order', 'Date', 'Payment', 'Status', 'Total']}>{data.orders.map((o) => <tr key={o.id}><td><Link className="font-semibold hover:underline" href={`/admin/orders?open=${o.id}`}>{o.number}</Link>{o.mode === 'BUSINESS' && <Badge tone="info" className="ml-1">B2B</Badge>}</td><td>{formatDate(o.createdAt)}</td><td><StatusBadge status={o.paymentStatus} text={PAYMENT_TEXT[o.paymentStatus]} /></td><td><StatusBadge status={o.status} /></td><td className="font-semibold">{formatMoney(o.totalPaise)}</td></tr>)}</Table> : <p className="text-sm text-muted">No orders yet.</p>}
        </Panel>
        <div className="grid gap-4 md:grid-cols-2">
          <Panel title="Addresses">{data.addresses.length ? <ul className="grid gap-2 text-sm">{data.addresses.map((a) => <li key={a.id}><p className="font-semibold">{a.label}{a.isDefault && <Badge tone="success" className="ml-1">Default</Badge>}</p><p className="text-muted">{a.name}, {a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.city}, {a.state} {a.pincode} · {a.phone}</p></li>)}</ul> : <p className="text-sm text-muted">None saved.</p>}</Panel>
          <Panel title="Support tickets">{data.tickets.length ? <ul className="grid gap-1.5 text-sm">{data.tickets.map((t) => <li key={t.id} className="flex justify-between gap-2"><span>{t.number} · {t.subject}</span><StatusBadge status={t.status} /></li>)}</ul> : <p className="text-sm text-muted">No tickets.</p>}</Panel>
        </div>
        <NotesPanel entityType="user" entityId={id} initial={data.notes} />
        <Panel title="Activity"><Timeline items={data.activity.map((a) => ({ id: a.id, title: label(a.action.replace(/[.-]/g, '_')), at: a.createdAt, note: typeof a.metadata?.reason === 'string' ? a.metadata.reason : undefined }))} /></Panel>
      </>}
    </Drawer>
  );
}

// ───────────── Staff roles and permissions ─────────────
export function StaffRoles({ isAdmin }: { isAdmin: boolean }) {
  const staff = useQuery({ queryKey: ['admin', 'staff'], queryFn: () => api<{ staff: { id: string; name: string; email: string; status: string; roles: string[] }[]; roles: { id: string; label: string; description: string }[] }>('/admin/staff') });
  const perms = useQuery({ queryKey: ['admin', 'permissions'], queryFn: () => api<{ matrix: Record<string, string[]>; roles: { id: string; label: string }[]; capabilities: { id: string; label: string }[] }>('/admin/permissions') });
  const [draft, setDraft] = useState<Record<string, string[]> | null>(null);
  const matrix = draft ?? perms.data?.matrix;
  const toggle = (role: string, cap: string) => { if (!matrix) return; const has = matrix[role].includes(cap); setDraft({ ...matrix, [role]: has ? matrix[role].filter((c) => c !== cap) : [...matrix[role], cap] }); };
  return (
    <Section title="Staff and permissions" description="Grant Operations, Finance or Support from a person’s page. Nobody can be made Admin from the console, and role changes sign the person out.">
      <div className="grid gap-6">
        <Loadable query={staff}>{(d) => (
          <Table head={['Staff member', 'Roles', 'Status']} empty={!d.staff.length}>{d.staff.map((s) => <tr key={s.id}><td><Link href={`/admin/customers?open=${s.id}`} className="font-semibold hover:underline">{s.name}</Link><p className="text-xs text-muted">{s.email}</p></td><td><span className="flex flex-wrap gap-1">{s.roles.map((r) => <Badge key={r} tone="gold">{label(r)}</Badge>)}</span></td><td><StatusBadge status={s.status} /></td></tr>)}</Table>
        )}</Loadable>
        <Loadable query={perms}>{(d) => matrix && (
          <section className="card card-pad">
            <div className="flex flex-wrap justify-between gap-3 mb-4">
              <div><h2 className="text-lg">What each role can do</h2><p className="text-sm text-muted">{isAdmin ? 'Switch individual permissions on or off. The Admin always has everything, and managing staff is reserved for the Admin.' : 'Only the Admin can change these.'}</p></div>
              {isAdmin && draft && <div className="flex gap-2"><Button variant="ghost" size="sm" onClick={() => setDraft(null)}>Discard</Button><Button size="sm" onClick={async () => { if (await attempt(() => put('/admin/permissions', draft), 'Permissions saved. They apply within 15 seconds.')) { setDraft(null); perms.refetch(); } }}>Save permissions</Button></div>}
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Permission</th><th className="text-center">Admin</th>{d.roles.map((r) => <th key={r.id} className="text-center">{r.label}</th>)}</tr></thead>
                <tbody>
                  {d.capabilities.map((c) => (
                    <tr key={c.id}>
                      <td><p className="font-medium text-sm">{c.label}</p><p className="text-[11px] text-muted font-mono">{c.id}</p></td>
                      <td className="text-center"><Lock size={14} className="inline text-muted" aria-label="Always on" /></td>
                      {d.roles.map((r) => <td key={r.id} className="text-center"><input type="checkbox" className="checkbox mt-0" aria-label={`${r.label}: ${c.label}`} disabled={!isAdmin} checked={matrix[r.id]?.includes(c.id)} onChange={() => toggle(r.id, c.id)} /></td>)}
                    </tr>
                  ))}
                  <tr><td><p className="font-medium text-sm">Manage staff roles and permissions</p><p className="text-[11px] text-muted font-mono">staff.manage</p></td><td className="text-center"><Lock size={14} className="inline text-muted" /></td>{d.roles.map((r) => <td key={r.id} className="text-center text-xs text-muted">Admin only</td>)}</tr>
                </tbody>
              </table>
            </div>
          </section>
        )}</Loadable>
      </div>
    </Section>
  );
}

// ───────────── Business accounts ─────────────
type Addr = { line1: string; city: string; state: string; pincode: string };
type OrgRow = { id: string; legalName: string; tradeName: string | null; status: string; gstRegistered: boolean; gstin: string | null; pan: string | null; businessType: string; contactPhone: string; registeredAddress: Addr; createdAt: string; owner: { name: string; email: string } | null; memberCount: number; orders: number; purchaseOrders: number; rfqs: number; creditApproved: boolean; allowedTerms: string; creditLimitPaise: number };
type Org360 = {
  organization: OrgRow & { approvalThresholdPaise: number; verifications: { id: string; kind: string; status: string; createdAt: string }[] };
  members: { id: string; name: string; email: string; role: string }[];
  stats: { spendPaise: number; paidOrders: number; outstandingPaise: number; availableCreditPaise: number };
  orders: { id: string; number: string; createdAt: string; status: string; paymentStatus: string; paymentMethod: string; totalPaise: number; paymentDueAt: string | null }[];
  rfqs: { id: string; number: string; title: string; status: string; createdAt: string }[];
  purchaseOrders: { id: string; number: string; status: string; totalPaise: number; paymentTerms: string; createdAt: string }[];
  activity: { id: string; action: string; createdAt: string; metadata: Record<string, unknown> }[];
  notes: Customer360['notes'];
};

export function Organizations({ can }: { can: Can }) {
  const list = useAdminTable<ListResponse & { organizations: OrgRow[] }>('/admin/organizations', ['status', 'credit', 'gst']);
  const [open, setOpen] = useOpenParam();
  const columns: Column<OrgRow>[] = [
    { key: 'name', label: 'Business', sort: 'name', always: true, render: (o) => <><p className="font-semibold">{o.legalName}</p><p className="text-xs text-muted">{o.tradeName ?? label(o.businessType)}</p></> },
    { key: 'gstin', label: 'GSTIN / PAN', render: (o) => <span className="font-mono text-xs">{o.gstin ?? o.pan ?? 'Not registered'}</span> },
    { key: 'owner', label: 'Owner', render: (o) => <span className="text-sm">{o.owner?.name}<span className="block text-xs text-muted">{o.owner?.email}</span></span> },
    { key: 'city', label: 'City', hidden: true, render: (o) => `${o.registeredAddress.city}, ${o.registeredAddress.state}` },
    { key: 'orders', label: 'Orders', sort: 'orders', className: 'text-right', render: (o) => o.orders },
    { key: 'credit', label: 'Credit', render: (o) => o.creditApproved ? <span className="text-sm">{label(o.allowedTerms)}<span className="block text-xs text-muted">limit {formatMoney(o.creditLimitPaise)}</span></span> : <span className="text-muted text-sm">Prepaid</span> },
    { key: 'applied', label: 'Applied', sort: 'applied', render: (o) => formatDate(o.createdAt) },
    { key: 'status', label: 'Status', render: (o) => <StatusBadge status={o.status} /> },
  ];
  return (
    <Section title="Business accounts" description="Verify businesses before they can request quotes. Self-entered details are not treated as verified; check GSTIN/PAN against official records.">
      <SummaryCards kind="organizations" cards={approvalCards('All businesses')} />
      <DataTable tableId="orgs" query={list} rows={list.data?.organizations} columns={columns} onOpen={(o) => setOpen(o.id)} search="Name or GSTIN" dateFilter="Applied"
        filters={[{ key: 'credit', label: 'Credit', options: [['yes', 'On credit terms'], ['no', 'Prepaid']] }, { key: 'gst', label: 'GST', options: [['yes', 'GST-registered'], ['no', 'Not registered']] }]}
        bulk={can('approvals.manage') ? { endpoint: '/admin/organizations/bulk', actions: [{ id: 'approve', label: 'Approve' }, { id: 'reject', label: 'Reject', danger: true, reason: 'required' }, { id: 'suspend', label: 'Suspend', danger: true, reason: 'required' }] } : undefined} />
      {open && <OrgDrawer id={open} can={can} onClose={() => { setOpen(null); list.refetch(); }} />}
    </Section>
  );
}

function OrgDrawer({ id, can, onClose }: { id: string; can: Can; onClose: () => void }) {
  const { data, refetch, error } = useQuery({ queryKey: ['admin', 'org', id], queryFn: () => api<Org360>(`/admin/organizations/${id}`) });
  const [credit, setCredit] = useState<{ terms: string; limit: string } | null>(null);
  const o = data?.organization;
  const act = async (body: object, msg = 'Saved') => { if (await attempt(() => patch(`/admin/organizations/${id}`, body), msg)) refetch(); };
  return (
    <Drawer open onClose={onClose} wide title={o?.legalName ?? 'Loading…'} subtitle={o ? `${o.tradeName ? `${o.tradeName} · ` : ''}${label(o.businessType)} · applied ${formatDate(o.createdAt)}` : undefined}
      badges={o && <><StatusBadge status={o.status} />{o.gstRegistered ? <Badge tone="info">GSTIN {o.gstin}</Badge> : <Badge tone="neutral">Not GST-registered</Badge>}{o.creditApproved && <Badge tone="gold">Credit {label(o.allowedTerms)}</Badge>}</>}
      actions={o && can('approvals.manage') && <>
        {o.status !== 'APPROVED' && <Button size="sm" onClick={() => act({ status: 'APPROVED' }, 'Approved')}>Approve</Button>}
        {o.status === 'PENDING' && <ConfirmButton danger title="Reject this business?" reason={{ label: 'Reason sent to the owner' }} confirmLabel="Reject" onConfirm={(note) => act({ status: 'REJECTED', note })}>Reject</ConfirmButton>}
        {o.status === 'APPROVED' && <ConfirmButton danger title="Suspend this business?" body="Its team can’t place new orders or requests." reason={{ label: 'Reason sent to the owner' }} confirmLabel="Suspend" onConfirm={(note) => act({ status: 'SUSPENDED', note })}>Suspend</ConfirmButton>}
        {can('finance.manage') && o.status === 'APPROVED' && <Button size="sm" variant="outline" onClick={() => setCredit({ terms: o.creditApproved ? o.allowedTerms : 'NONE', limit: String(o.creditLimitPaise / 100) })}>Credit terms</Button>}
      </>}>
      {error && <Alert>{(error as Error).message}</Alert>}
      {data && o && <>
        {credit && (
          <Panel title="Credit terms (finance)">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Terms"><Select value={credit.terms} onChange={(e) => setCredit({ ...credit, terms: e.target.value })}><option value="NONE">None (prepaid only)</option><option value="NET_15">Net 15</option><option value="NET_30">Net 30</option><option value="NET_45">Net 45</option></Select></Field>
              <Field label="Credit limit (₹)" hint="Unpaid credit orders can never exceed this"><Input inputMode="decimal" disabled={credit.terms === 'NONE'} value={credit.limit} onChange={(e) => setCredit({ ...credit, limit: e.target.value })} /></Field>
            </div>
            <div className="flex gap-2 mt-3"><Button size="sm" onClick={async () => { await act(credit.terms === 'NONE' ? { creditApproved: false, allowedTerms: 'PREPAID', creditLimitPaise: 0 } : { creditApproved: true, allowedTerms: credit.terms, creditLimitPaise: rupeesToPaise(credit.limit || '0') }, 'Credit updated'); setCredit(null); }}>Save credit</Button><Button size="sm" variant="ghost" onClick={() => setCredit(null)}>Cancel</Button></div>
          </Panel>
        )}
        <MiniStats items={[
          ['Paid spend', formatMoney(data.stats.spendPaise), `${data.stats.paidOrders} orders`], ['Outstanding on credit', formatMoney(data.stats.outstandingPaise)],
          ['Credit limit', o.creditApproved ? formatMoney(o.creditLimitPaise) : '—'], ['Available credit', o.creditApproved ? formatMoney(data.stats.availableCreditPaise) : '—'],
        ]} />
        <Panel title="Details">
          <KV items={[['GSTIN', o.gstin], ['PAN', o.pan], ['Phone', o.contactPhone], ['Registered address', `${o.registeredAddress.line1}, ${o.registeredAddress.city}, ${o.registeredAddress.state} ${o.registeredAddress.pincode}`], ['PO approval above', o.approvalThresholdPaise ? formatMoney(o.approvalThresholdPaise) : 'Every PO'], ['Members', o.memberCount]]} />
        </Panel>
        <Panel title="Team"><ul className="grid gap-1.5 text-sm">{data.members.map((m) => <li key={m.id} className="flex justify-between"><Link href={`/admin/customers?open=${m.id}`} className="hover:underline">{m.name} <span className="text-muted">{m.email}</span></Link><Badge tone="neutral">{label(m.role)}</Badge></li>)}</ul></Panel>
        <Panel title="Orders" actions={<Link href={`/admin/orders?organization=${id}`} className="text-xs text-forest font-semibold">All orders →</Link>}>
          {data.orders.length ? <Table head={['Order', 'Date', 'Payment', 'Due', 'Total']}>{data.orders.map((x) => <tr key={x.id}><td><Link href={`/admin/orders?open=${x.id}`} className="font-semibold hover:underline">{x.number}</Link></td><td>{formatDate(x.createdAt)}</td><td><StatusBadge status={x.paymentStatus} text={PAYMENT_TEXT[x.paymentStatus]} /></td><td>{x.paymentDueAt ? formatDate(x.paymentDueAt) : '—'}</td><td className="font-semibold">{formatMoney(x.totalPaise)}</td></tr>)}</Table> : <p className="text-sm text-muted">No orders yet.</p>}
        </Panel>
        <div className="grid gap-4 md:grid-cols-2">
          <Panel title="Purchase orders">{data.purchaseOrders.length ? <ul className="grid gap-1.5 text-sm">{data.purchaseOrders.map((p) => <li key={p.id} className="flex justify-between gap-2"><span>{p.number} · {label(p.paymentTerms)}</span><span><StatusBadge status={p.status} /> {formatMoney(p.totalPaise)}</span></li>)}</ul> : <p className="text-sm text-muted">None.</p>}</Panel>
          <Panel title="RFQs">{data.rfqs.length ? <ul className="grid gap-1.5 text-sm">{data.rfqs.map((r) => <li key={r.id} className="flex justify-between gap-2"><span>{r.number} · {r.title}</span><StatusBadge status={r.status} /></li>)}</ul> : <p className="text-sm text-muted">None.</p>}</Panel>
        </div>
        <NotesPanel entityType="organization" entityId={id} initial={data.notes} />
        <Panel title="Activity"><Timeline items={data.activity.map((a) => ({ id: a.id, title: label(a.action.replace(/[.-]/g, '_')), at: a.createdAt, note: typeof a.metadata?.note === 'string' ? a.metadata.note : undefined }))} /></Panel>
      </>}
    </Drawer>
  );
}

// ───────────── Sellers ─────────────
type SellerRow = { id: string; slug: string; name: string; legalName: string; status: string; gstRegistered: boolean; gstin: string | null; pan: string | null; businessType: string; contactPhone: string; pickupAddress: Addr; primaryCategory: string | null; createdAt: string; owner: { name: string; email: string } | null; staff: number; listings: number; parcels: number; commissionBps: number | null; payoutHold: boolean; demo: boolean; payoutAccount: { accountHolder: string; accountLast4: string; ifsc: string; verified: boolean } | null; payablePaise: number | null };
type Seller360 = {
  seller: Omit<SellerRow, 'owner' | 'staff' | 'listings' | 'parcels' | 'payablePaise'> & { description: string; payoutHoldReason: string | null; codEnabled: boolean; handlingDays: number; payoutAccount: (SellerRow['payoutAccount'] & { bankName: string | null }) | null };
  team: { id: string; name: string; email: string; role: string }[];
  performance: { parcels: number; delivered: number; cancelled: number; cancelRate: number; returns: number; returnRate: number; avgHoursToShip: number | null; rating: { average: number; count: number } | null; listings: Record<string, number> };
  money: { salesPaise: number; shippingPaise: number; commissionPaise: number; refundsPaise: number; paidOutPaise: number; payablePaise: number; payouts: { id: string; amountPaise: number; providerRef: string; createdAt: string }[] } | null;
  recentParcels: { id: string; orderId: string; orderNumber: string; status: string; totalPaise: number; paymentMethod: string; createdAt: string }[];
  activity: { id: string; action: string; createdAt: string; metadata: Record<string, unknown> }[];
  notes: Customer360['notes'];
};

export function Sellers({ can }: { can: Can }) {
  const list = useAdminTable<ListResponse & { sellers: SellerRow[] }>('/admin/sellers', ['status', 'hold', 'gst']);
  const [open, setOpen] = useOpenParam();
  const columns: Column<SellerRow>[] = [
    { key: 'name', label: 'Store', sort: 'name', always: true, render: (s) => <><p className="font-semibold">{s.name}{s.demo && <Badge tone="gold" className="ml-1">Demo</Badge>}</p><p className="text-xs text-muted">{s.legalName}</p></> },
    { key: 'category', label: 'Category', render: (s) => s.primaryCategory ?? '—' },
    { key: 'gstin', label: 'GSTIN', hidden: true, render: (s) => <span className="font-mono text-xs">{s.gstin ?? 'Not registered'}</span> },
    { key: 'owner', label: 'Owner', hidden: true, render: (s) => s.owner?.email ?? '—' },
    { key: 'listings', label: 'Listings', sort: 'listings', className: 'text-right', render: (s) => s.listings },
    { key: 'parcels', label: 'Parcels', className: 'text-right', render: (s) => s.parcels },
    { key: 'commission', label: 'Commission', render: (s) => (s.commissionBps == null ? <span className="text-muted text-sm">Default</span> : pct(s.commissionBps)) },
    { key: 'bank', label: 'Bank', render: (s) => (s.payoutAccount ? (s.payoutAccount.verified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Unverified</Badge>) : <span className="text-muted text-sm">None</span>) },
    { key: 'payable', label: 'Payable', className: 'text-right', render: (s) => (s.payablePaise == null ? '—' : <>{formatMoney(s.payablePaise)}{s.payoutHold && <Badge tone="danger" className="ml-1">Hold</Badge>}</>) },
    { key: 'applied', label: 'Applied', sort: 'applied', hidden: true, render: (s) => formatDate(s.createdAt) },
    { key: 'status', label: 'Status', render: (s) => <StatusBadge status={s.status} /> },
  ];
  return (
    <Section title="Sellers" description="Approve stores after checking identity and tax details. Finance verifies bank accounts, sets commission overrides and can hold payouts.">
      <SummaryCards kind="sellers" cards={approvalCards('All sellers')} />
      <DataTable tableId="sellers" query={list} rows={list.data?.sellers} columns={columns} onOpen={(s) => setOpen(s.id)} search="Store, legal name or GSTIN" dateFilter="Applied"
        filters={[{ key: 'hold', label: 'Payouts', options: [['yes', 'On hold']] }, { key: 'gst', label: 'GST', options: [['yes', 'GST-registered'], ['no', 'Not registered']] }]}
        bulk={can('approvals.manage') ? { endpoint: '/admin/sellers/bulk', actions: [{ id: 'approve', label: 'Approve' }, { id: 'reject', label: 'Reject', danger: true, reason: 'required' }, { id: 'suspend', label: 'Suspend', danger: true, reason: 'required' }] } : undefined} />
      {open && <SellerDrawer id={open} can={can} onClose={() => { setOpen(null); list.refetch(); }} />}
    </Section>
  );
}

function SellerDrawer({ id, can, onClose }: { id: string; can: Can; onClose: () => void }) {
  const { data, refetch, error } = useQuery({ queryKey: ['admin', 'seller', id], queryFn: () => api<Seller360>(`/admin/sellers/${id}`) });
  const [commission, setCommission] = useState<string | null>(null);
  const s = data?.seller;
  const act = async (body: object, msg = 'Saved') => { if (await attempt(() => patch(`/admin/sellers/${id}`, body), msg)) refetch(); };
  const finance = can('finance.manage');
  const p = data?.performance;
  return (
    <Drawer open onClose={onClose} wide title={s?.name ?? 'Loading…'} subtitle={s ? `${s.legalName} · ${label(s.businessType)} · ${s.primaryCategory ?? 'No category'}` : undefined}
      badges={s && <><StatusBadge status={s.status} />{s.gstRegistered ? <Badge tone="info">GSTIN {s.gstin}</Badge> : <Badge tone="neutral">Not GST-registered</Badge>}{s.payoutHold && <Badge tone="danger">Payouts on hold</Badge>}{s.commissionBps != null && <Badge tone="gold">Commission {pct(s.commissionBps)}</Badge>}{s.demo && <Badge tone="gold">Demo</Badge>}</>}
      actions={s && can('approvals.manage') && <>
        {s.status !== 'APPROVED' && <Button size="sm" onClick={() => act({ status: 'APPROVED' }, 'Store approved')}>Approve store</Button>}
        {s.status === 'PENDING' && <ConfirmButton danger title="Reject application?" reason={{ label: 'Reason sent to the applicant' }} confirmLabel="Reject" onConfirm={(note) => act({ status: 'REJECTED', note })}>Reject</ConfirmButton>}
        {s.status === 'APPROVED' && <ConfirmButton danger title="Suspend this store?" body="Its listings stop selling immediately." reason={{ label: 'Reason sent to the seller' }} confirmLabel="Suspend" onConfirm={(note) => act({ status: 'SUSPENDED', note })}>Suspend</ConfirmButton>}
        <ActionButton label="Message" title="Message the seller" reason={false} confirmLabel="Send" fields={(st, set) => <>
          <Field label="Type"><Select value={st.kind ?? 'INFO'} onChange={(e) => set({ kind: e.target.value })}><option value="INFO">Information</option><option value="WARNING">Formal warning (recorded)</option></Select></Field>
          <Field label="Subject"><Input value={st.title ?? ''} onChange={(e) => set({ title: e.target.value })} /></Field>
          <Field label="Message"><Textarea rows={4} value={st.body ?? ''} onChange={(e) => set({ body: e.target.value })} /></Field>
        </>} onSubmit={(v) => post(`/admin/sellers/${id}/message`, { kind: v.kind ?? 'INFO', title: v.title, body: v.body }).then(() => refetch())} />
        {s.status === 'APPROVED' && <Link href={`/sellers/${s.slug}`} className="btn btn-ghost btn-sm">View storefront</Link>}
      </>}>
      {error && <Alert>{(error as Error).message}</Alert>}
      {data && s && p && <>
        <MiniStats items={[
          ['Parcels', p.parcels, `${p.delivered} delivered`], ['Cancellation rate', `${(p.cancelRate * 100).toFixed(1)}%`, `${p.cancelled} cancelled`],
          ['Return rate', `${(p.returnRate * 100).toFixed(1)}%`, `${p.returns} returns`], ['Avg time to ship', p.avgHoursToShip == null ? '—' : `${p.avgHoursToShip.toFixed(1)} h`],
          ['Rating', p.rating ? `${p.rating.average} ★` : '—', p.rating ? `${p.rating.count} reviews` : 'no reviews'], ['Live listings', p.listings.APPROVED ?? 0, `${p.listings.PENDING ?? 0} pending`],
          ['Handling time', `${s.handlingDays} days`], ['Cash on delivery', s.codEnabled ? 'Allowed' : 'Off'],
        ]} />
        {data.money && (
          <Panel title="Money" actions={<Link href={`/admin/finance?store=${id}`} className="text-xs text-forest font-semibold">Ledger →</Link>}>
            <KV cols={3} items={[['Sales', formatMoney(data.money.salesPaise)], ['Delivery collected', formatMoney(data.money.shippingPaise)], ['Commission', formatMoney(data.money.commissionPaise)], ['Refunds', formatMoney(data.money.refundsPaise)], ['Paid out', formatMoney(data.money.paidOutPaise)], ['Payable now', <strong key="p">{formatMoney(data.money.payablePaise)}</strong>]]} />
            {data.money.payouts.length > 0 && <ul className="mt-3 grid gap-1 text-sm">{data.money.payouts.map((x) => <li key={x.id} className="flex justify-between"><span>{formatDate(x.createdAt)} · <span className="font-mono text-xs">{x.providerRef}</span></span><strong>{formatMoney(x.amountPaise)}</strong></li>)}</ul>}
          </Panel>
        )}
        <Panel title="Finance controls">
          <div className="grid gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="text-sm flex-1 min-w-48"><p className="font-semibold">Commission</p><p className="text-muted">{s.commissionBps == null ? 'Uses the category rule or the platform default.' : `Fixed at ${pct(s.commissionBps)} for this seller, overriding category rules.`}</p></div>
              {finance && (commission === null
                ? <Button size="sm" variant="outline" onClick={() => setCommission(s.commissionBps == null ? '' : String(s.commissionBps / 100))}>Change</Button>
                : <div className="flex items-end gap-2"><Field label="Commission % (blank = default)"><Input className="w-28" inputMode="decimal" value={commission} onChange={(e) => setCommission(e.target.value)} /></Field><Button size="sm" onClick={async () => { await act({ commissionBps: commission === '' ? null : Math.round(Number(commission) * 100) }, 'Commission updated'); setCommission(null); }}>Save</Button><Button size="sm" variant="ghost" onClick={() => setCommission(null)}>Cancel</Button></div>)}
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
              <div className="text-sm flex-1 min-w-48"><p className="font-semibold">Payouts</p><p className="text-muted">{s.payoutHold ? `On hold: ${s.payoutHoldReason}` : 'Normal. Payouts can be recorded from Settlements.'}</p></div>
              {finance && (s.payoutHold
                ? <ConfirmButton title="Release the payout hold?" body="The seller is told payouts will resume." confirmLabel="Release hold" onConfirm={() => act({ payoutHold: false, payoutHoldReason: null }, 'Hold released')}>Release hold</ConfirmButton>
                : <ConfirmButton danger title="Hold this seller’s payouts?" body="No payout can be recorded until the hold is released. The seller is told why." reason={{ label: 'Reason (sent to the seller)' }} confirmLabel="Hold payouts" onConfirm={(reason) => act({ payoutHold: true, payoutHoldReason: reason }, 'Payouts held')}>Hold payouts</ConfirmButton>)}
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
              <div className="text-sm flex-1 min-w-48"><p className="font-semibold">Bank account</p><p className="text-muted">{s.payoutAccount ? `${s.payoutAccount.accountHolder} · ••••${s.payoutAccount.accountLast4} · ${s.payoutAccount.ifsc}${s.payoutAccount.bankName ? ` · ${s.payoutAccount.bankName}` : ''}` : 'Not added yet.'}</p></div>
              {s.payoutAccount && (s.payoutAccount.verified ? <Badge tone="success">Verified</Badge> : finance ? <ConfirmButton title="Mark the bank account verified?" body="Only after a penny-drop test or a cancelled-cheque check." confirmLabel="Mark verified" onConfirm={() => act({ payoutVerified: true }, 'Bank account verified')}>Mark verified</ConfirmButton> : <Badge tone="warning">Unverified</Badge>)}
            </div>
            {can('approvals.manage') && <div className="flex flex-wrap items-center gap-4 border-t border-line pt-3 text-sm">
              <Checkbox checked={s.codEnabled} onChange={(e) => act({ codEnabled: e.target.checked }, e.target.checked ? 'COD allowed' : 'COD switched off')} label="Allow cash on delivery" />
              <label className="flex items-center gap-2">Handling days<select className="input min-h-[34px] py-0.5 w-auto" value={s.handlingDays} onChange={(e) => act({ handlingDays: Number(e.target.value) })}>{[0, 1, 2, 3, 4, 5, 7, 10].map((n) => <option key={n}>{n}</option>)}</select></label>
            </div>}
          </div>
        </Panel>
        <Panel title="Details">
          <KV items={[['GSTIN', s.gstin], ['PAN', s.pan], ['Phone', s.contactPhone], ['Pickup address', `${s.pickupAddress.line1}, ${s.pickupAddress.city}, ${s.pickupAddress.state} ${s.pickupAddress.pincode}`], ['Applied', formatDate(s.createdAt)], ['About', s.description]]} />
        </Panel>
        <Panel title="Team"><ul className="grid gap-1.5 text-sm">{data.team.map((m) => <li key={m.id} className="flex justify-between"><Link href={`/admin/customers?open=${m.id}`} className="hover:underline">{m.name} <span className="text-muted">{m.email}</span></Link><Badge tone="neutral">{label(m.role)}</Badge></li>)}</ul></Panel>
        <Panel title="Recent parcels" actions={<Link href={`/admin/orders?store=${id}`} className="text-xs text-forest font-semibold">All orders →</Link>}>
          {data.recentParcels.length ? <Table head={['Order', 'Date', 'Payment', 'Status', 'Total']}>{data.recentParcels.map((x) => <tr key={x.id}><td><Link href={`/admin/orders?open=${x.orderId}`} className="font-semibold hover:underline">{x.orderNumber}</Link></td><td>{formatDate(x.createdAt)}</td><td>{label(x.paymentMethod)}</td><td><StatusBadge status={x.status} /></td><td className="font-semibold">{formatMoney(x.totalPaise)}</td></tr>)}</Table> : <p className="text-sm text-muted">No parcels yet.</p>}
        </Panel>
        <NotesPanel entityType="store" entityId={id} initial={data.notes} />
        <Panel title="Activity"><Timeline items={data.activity.map((a) => ({ id: a.id, title: label(a.action.replace(/[.-]/g, '_')), at: a.createdAt, note: typeof a.metadata?.note === 'string' ? a.metadata.note : typeof a.metadata?.body === 'string' ? a.metadata.body : undefined }))} /></Panel>
      </>}
    </Drawer>
  );
}
