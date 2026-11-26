'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { UserPlus, Layers, Pencil } from 'lucide-react';
import { api, post, patch, del } from '@/lib/api';
import { formatDate, formatMoney, rupeesToPaise } from '@/lib/format';
import { useSession } from '@/components/providers';
import { Alert, Badge, Button, ConfirmButton, Field, Input, PageHeader, Select, Spinner, useFormErrors } from '@/components/ui';

type Overview = { role: string; organization: { approvalThresholdPaise: number }; members: { id: string; name: string; email: string; role: string; since: string; departmentId: string | null }[] };
type Dept = { id: string; name: string; monthlyBudgetPaise: number; members: number; spentThisMonthPaise: number };
const ROLE_HELP: Record<string, string> = { OWNER: 'Manages the team and settings; can approve anything', APPROVER: 'Approves purchase orders (not their own)', BUYER: 'Requests quotes and places approved orders' };

function Departments({ owner, onChange }: { owner: boolean; onChange: () => void }) {
  const { data, refetch } = useQuery({ queryKey: ['business-departments'], queryFn: () => api<{ departments: Dept[] }>('/business/departments') });
  const [form, setForm] = useState({ name: '', budget: '' });
  const [edit, setEdit] = useState<{ id: string; name: string; budget: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const errors = useFormErrors();
  const add = async () => {
    setBusy(true); errors.clear();
    try { await post('/business/departments', { name: form.name, monthlyBudgetPaise: rupeesToPaise(form.budget || '0') }); toast.success('Department added'); setForm({ name: '', budget: '' }); refetch(); onChange(); } catch (e) { errors.set(e); } finally { setBusy(false); }
  };
  const save = async () => {
    if (!edit) return;
    try { await patch(`/business/departments/${edit.id}`, { name: edit.name, monthlyBudgetPaise: rupeesToPaise(edit.budget || '0') }); toast.success('Saved'); setEdit(null); refetch(); } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <section id="departments" className="card scroll-mt-28">
      <header className="flex flex-wrap items-center justify-between gap-2 p-5 border-b border-line">
        <div><h2 className="text-lg flex items-center gap-2"><Layers size={18} />Departments & budgets</h2><p className="text-sm text-muted">Orders are booked to the buyer’s department. A monthly budget warns before an order goes over it.</p></div>
      </header>
      {data?.departments.length ? (
        <ul className="divide-y divide-line">
          {data.departments.map((d) => (
            <li key={d.id} className="p-4 flex flex-wrap items-center gap-3">
              {edit?.id === d.id ? (
                <div className="flex flex-wrap items-end gap-2 flex-1">
                  <Field label="Name"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
                  <Field label="Monthly budget (₹, 0 = none)"><Input inputMode="numeric" value={edit.budget} onChange={(e) => setEdit({ ...edit, budget: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
                  <Button size="sm" onClick={save}>Save</Button><Button size="sm" variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-[180px]">
                    <p className="font-semibold">{d.name}</p>
                    <p className="text-xs text-muted">{d.members} member{d.members === 1 ? '' : 's'} · spent {formatMoney(d.spentThisMonthPaise)} this month{d.monthlyBudgetPaise ? ` of ${formatMoney(d.monthlyBudgetPaise)}` : ''}</p>
                    {d.monthlyBudgetPaise > 0 && <span className="mt-1.5 block h-1.5 max-w-xs rounded-full bg-line/60 overflow-hidden"><span className={d.spentThisMonthPaise > d.monthlyBudgetPaise ? 'block h-full bg-danger' : 'block h-full bg-forest'} style={{ width: `${Math.min(100, (d.spentThisMonthPaise / d.monthlyBudgetPaise) * 100)}%` }} /></span>}
                  </div>
                  {owner && <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEdit({ id: d.id, name: d.name, budget: d.monthlyBudgetPaise ? String(d.monthlyBudgetPaise / 100) : '' })}><Pencil size={14} />Edit</Button>
                    <ConfirmButton variant="ghost" danger title={`Remove ${d.name}?`} body="Members and past orders stay; they just won’t have a department." confirmLabel="Remove" onConfirm={async () => { await del(`/business/departments/${d.id}`); refetch(); onChange(); }}>Remove</ConfirmButton>
                  </div>}
                </>
              )}
            </li>
          ))}
        </ul>
      ) : <p className="p-5 text-sm text-muted">No departments yet.</p>}
      {owner && (
        <div className="p-5 border-t border-line grid gap-3">
          {errors.message && <Alert>{errors.message}</Alert>}
          <div className="grid gap-3 sm:grid-cols-[1fr_200px_auto] items-end">
            <Field label="New department" error={errors.field('name')}><Input placeholder="e.g. Facilities" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Monthly budget (₹, optional)" error={errors.field('monthlyBudgetPaise')}><Input inputMode="numeric" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
            <Button loading={busy} onClick={add} disabled={form.name.trim().length < 2}>Add</Button>
          </div>
        </div>
      )}
    </section>
  );
}

export default function TeamPage() {
  const { user } = useSession();
  const { data, refetch } = useQuery({ queryKey: ['business-overview'], queryFn: () => api<Overview>('/business/overview') });
  const { data: depts, refetch: refetchDepts } = useQuery({ queryKey: ['business-departments'], queryFn: () => api<{ departments: Dept[] }>('/business/departments') });
  const [invite, setInvite] = useState({ email: '', role: 'BUYER' });
  const [limit, setLimit] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const errors = useFormErrors();
  if (!data) return <Spinner />;
  const owner = data.role === 'OWNER';
  const add = async () => {
    setBusy('add'); errors.clear();
    try { await post('/business/members', invite); toast.success('Team member added'); setInvite({ email: '', role: 'BUYER' }); refetch(); } catch (e) { errors.set(e); } finally { setBusy(null); }
  };
  const saveLimit = async () => {
    setBusy('limit');
    try { await patch('/business/settings', { approvalThresholdPaise: rupeesToPaise(limit ?? '0') }); toast.success('Approval limit saved'); refetch(); setLimit(null); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  return (
    <>
      <PageHeader title="Team & settings" description="Roles control who can request, approve and order." />
      <div className="grid gap-5">
        <section className="card">
          <div className="table-wrap border-0"><table className="table"><thead><tr><th>Member</th><th>Role</th><th>Department</th><th>Since</th>{owner && <th />}</tr></thead>
            <tbody>{data.members.map((m) => (
              <tr key={m.id}>
                <td><p className="font-semibold">{m.name}{m.id === user?.id && <Badge tone="neutral" className="ml-2">You</Badge>}</p><p className="text-xs text-muted">{m.email}</p></td>
                <td>{owner && m.role !== 'OWNER' ? <select aria-label={`Role for ${m.name}`} className="input min-h-[36px] py-1 w-auto" value={m.role} onChange={async (e) => { await patch(`/business/members/${m.id}`, { role: e.target.value }); refetch(); }}><option value="BUYER">Buyer</option><option value="APPROVER">Approver</option></select> : <Badge tone={m.role === 'OWNER' ? 'gold' : 'default'}>{m.role.toLowerCase()}</Badge>}<p className="text-xs text-muted mt-1">{ROLE_HELP[m.role]}</p></td>
                <td>{owner && depts?.departments.length ? (
                  <select aria-label={`Department for ${m.name}`} className="input min-h-[36px] py-1 w-auto" value={m.departmentId ?? ''} onChange={async (e) => { await patch(`/business/members/${m.id}/department`, { departmentId: e.target.value || null }); refetch(); refetchDepts(); }}>
                    <option value="">—</option>{depts.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                ) : <span className="text-sm">{depts?.departments.find((d) => d.id === m.departmentId)?.name ?? '—'}</span>}</td>
                <td>{formatDate(m.since)}</td>
                {owner && <td>{m.role !== 'OWNER' && <ConfirmButton variant="ghost" danger title={`Remove ${m.name}?`} confirmLabel="Remove" onConfirm={async () => { await del(`/business/members/${m.id}`); refetch(); }}>Remove</ConfirmButton>}</td>}
              </tr>
            ))}</tbody></table></div>
        </section>
        <Departments owner={owner} onChange={() => { refetch(); refetchDepts(); }} />
        {owner && (
          <section className="card card-pad grid gap-4 max-w-2xl">
            <h2 className="text-lg flex items-center gap-2"><UserPlus size={18} />Add a colleague</h2>
            {errors.message && <Alert>{errors.message}</Alert>}
            <p className="text-sm text-muted">They need an IBazzzar account first. We never create accounts on someone’s behalf.</p>
            <div className="grid gap-3 sm:grid-cols-[1fr_160px_auto] items-end">
              <Field label="Their email" error={errors.field('email')}><Input type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} /></Field>
              <Field label="Role"><Select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}><option value="BUYER">Buyer</option><option value="APPROVER">Approver</option></Select></Field>
              <Button loading={busy === 'add'} onClick={add}>Add</Button>
            </div>
          </section>
        )}
        <section className="card card-pad grid gap-3 max-w-2xl">
          <h2 className="text-lg">Purchase-order approval limit</h2>
          <p className="text-sm text-muted">POs up to this amount are approved automatically. Set ₹0 to require an approver for every PO. Currently: <strong>{data.organization.approvalThresholdPaise ? formatMoney(data.organization.approvalThresholdPaise) : '₹0 — every PO needs approval'}</strong>.</p>
          {owner && <div className="flex gap-2 items-end"><Field label="Limit (₹)"><Input inputMode="numeric" value={limit ?? String(data.organization.approvalThresholdPaise / 100)} onChange={(e) => setLimit(e.target.value.replace(/[^\d.]/g, ''))} /></Field><Button loading={busy === 'limit'} onClick={saveLimit}>Save</Button></div>}
        </section>
      </div>
    </>
  );
}
