'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MapPin, Plus, Star } from 'lucide-react';
import { api, post, patch, del } from '@/lib/api';
import type { Address } from '@/lib/types';
import { AddressFields, addressPayload, emptyAddress } from '@/components/address-form';
import { Alert, Badge, Button, ConfirmButton, Empty, Field, Input, Modal, PageHeader, Spinner, useFormErrors } from '@/components/ui';

export default function AddressesPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['addresses'], queryFn: () => api<{ addresses: (Address & { id: string })[] }>('/account/addresses').then((r) => r.addresses) });
  const [editing, setEditing] = useState<(Address & { id?: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const errors = useFormErrors();
  const refresh = () => qc.invalidateQueries({ queryKey: ['addresses'] });
  const save = async () => {
    if (!editing) return;
    setBusy(true); errors.clear();
    try {
      const body = { ...addressPayload(editing), label: editing.label || 'Home', isDefault: !!editing.isDefault };
      if (editing.id) await patch(`/account/addresses/${editing.id}`, body); else await post('/account/addresses', body);
      toast.success('Address saved'); setEditing(null); refresh();
    } catch (e) { errors.set(e); } finally { setBusy(false); }
  };
  if (!data) return <Spinner />;
  return (
    <>
      <PageHeader title="Saved addresses" description="Up to 10 addresses for faster checkout." actions={data.length < 10 && <Button onClick={() => setEditing({ ...emptyAddress, label: 'Home' })}><Plus size={16} />Add address</Button>} />
      {data.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((a) => (
            <div key={a.id} className="card card-pad">
              <div className="flex items-center gap-2"><MapPin size={17} className="text-forest" /><p className="font-semibold">{a.label}</p>{a.isDefault && <Badge tone="gold">Default</Badge>}</div>
              <p className="mt-2 text-[15px]">{a.name} · {a.phone}<br />{a.line1}{a.line2 ? `, ${a.line2}` : ''}<br />{a.city}, {a.state} {a.pincode}</p>
              <div className="flex flex-wrap gap-2 mt-4">
                <Button size="sm" variant="outline" onClick={() => setEditing(a)}>Edit</Button>
                {!a.isDefault && <Button size="sm" variant="ghost" onClick={async () => { await patch(`/account/addresses/${a.id}`, { isDefault: true }); refresh(); }}><Star size={14} />Make default</Button>}
                <ConfirmButton variant="ghost" danger title="Delete this address?" confirmLabel="Delete" onConfirm={async () => { await del(`/account/addresses/${a.id}`); refresh(); }}>Delete</ConfirmButton>
              </div>
            </div>
          ))}
        </div>
      ) : <div className="card"><Empty icon={<MapPin size={26} />} title="No saved addresses" body="Addresses you save at checkout appear here." /></div>}
      <Modal open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing?.id ? 'Edit address' : 'New address'} wide>
        {editing && (
          <div className="grid gap-4">
            {errors.message && <Alert>{errors.message}</Alert>}
            <Field label="Label" hint="e.g. Home, Office"><Input value={editing.label ?? ''} onChange={(e) => setEditing({ ...editing, label: e.target.value })} /></Field>
            <AddressFields value={editing} onChange={(a) => setEditing({ ...editing, ...a })} errors={Object.fromEntries(['name', 'phone', 'line1', 'line2', 'city', 'state', 'pincode'].map((k) => [k, errors.field(k)]))} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="checkbox mt-0" checked={!!editing.isDefault} onChange={(e) => setEditing({ ...editing, isDefault: e.target.checked })} />Use as my default address</label>
            <Button loading={busy} onClick={save}>Save address</Button>
          </div>
        )}
      </Modal>
    </>
  );
}
