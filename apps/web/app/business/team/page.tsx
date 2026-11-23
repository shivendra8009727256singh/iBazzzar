'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';
import { api, post, patch, del } from '@/lib/api';
import { formatDate, formatMoney, rupeesToPaise } from '@/lib/format';
import { useSession } from '@/components/providers';
import { Alert, Badge, Button, ConfirmButton, Field, Input, PageHeader, Select, Spinner, useFormErrors } from '@/components/ui';

type Overview = { role: string; organization: { approvalThresholdPaise: number }; members: { id: string; name: string; email: string; role: string; since: string }[] };
const ROLE_HELP: Record<string, string> = { OWNER: 'Manages the team and settings; can approve anything', APPROVER: 'Approves purchase orders (not their own)', BUYER: 'Requests quotes and places approved orders' };

export default function TeamPage() {
  const { user } = useSession();
  const { data, refetch } = useQuery({ queryKey: ['business-overview'], queryFn: () => api<Overview>('/business/overview') });
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
          <div className="table-wrap border-0"><table className="table"><thead><tr><th>Member</th><th>Role</th><th>Since</th>{owner && <th />}</tr></thead>
            <tbody>{data.members.map((m) => (
              <tr key={m.id}>
                <td><p className="font-semibold">{m.name}{m.id === user?.id && <Badge tone="neutral" className="ml-2">You</Badge>}</p><p className="text-xs text-muted">{m.email}</p></td>
                <td>{owner && m.role !== 'OWNER' ? <select aria-label={`Role for ${m.name}`} className="input min-h-[36px] py-1 w-auto" value={m.role} onChange={async (e) => { await patch(`/business/members/${m.id}`, { role: e.target.value }); refetch(); }}><option value="BUYER">Buyer</option><option value="APPROVER">Approver</option></select> : <Badge tone={m.role === 'OWNER' ? 'gold' : 'default'}>{m.role.toLowerCase()}</Badge>}<p className="text-xs text-muted mt-1">{ROLE_HELP[m.role]}</p></td>
                <td>{formatDate(m.since)}</td>
                {owner && <td>{m.role !== 'OWNER' && <ConfirmButton variant="ghost" danger title={`Remove ${m.name}?`} confirmLabel="Remove" onConfirm={async () => { await del(`/business/members/${m.id}`); refetch(); }}>Remove</ConfirmButton>}</td>}
              </tr>
            ))}</tbody></table></div>
        </section>
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
