'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MapPin, Plus, Star, Building2 } from 'lucide-react';
import { api, post, patch, del } from '@/lib/api';
import type { Address } from '@/lib/types';
import { AddressFields, addressPayload, emptyAddress } from '@/components/address-form';
import { Alert, Badge, Button, ConfirmButton, Empty, Field, Input, Modal, PageHeader, Spinner, useFormErrors } from '@/components/ui';

type Saved = Address & { id: string; label: string; gstin: string | null; isDefault: boolean };

function Editor({ initial, onClose, onSaved }: { initial: Saved | null; onClose: () => void; onSaved: () => void }) {
  const [a, setA] = useState<Address>(initial ?? emptyAddress);
  const [labelText, setLabel] = useState(initial?.label ?? '');
  const [gstin, setGstin] = useState(initial?.gstin ?? '');
  const [busy, setBusy] = useState(false);
  const errors = useFormErrors();
  const save = async () => {
    setBusy(true); errors.clear();
    const body = { ...addressPayload(a), label: labelText, ...(gstin ? { gstin: gstin.toUpperCase() } : {}) };
    try {
      if (initial) await patch(`/business/addresses/${initial.id}`, body); else await post('/business/addresses', body);
      toast.success('Address saved'); onSaved(); onClose();
    } catch (e) { errors.set(e); } finally { setBusy(false); }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={initial ? `Edit ${initial.label}` : 'Add a business address'} description="Buyers can pick saved addresses when they place a purchase order." wide>
      <div className="grid gap-4">
        {errors.message && <Alert>{errors.message}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name for this address" required error={errors.field('label')} hint="e.g. Head office, Pune warehouse"><Input value={labelText} onChange={(e) => setLabel(e.target.value)} /></Field>
          <Field label="GSTIN for this branch (optional)" error={errors.field('gstin')} hint="Only if this location is registered separately"><Input value={gstin} maxLength={15} onChange={(e) => setGstin(e.target.value.toUpperCase())} /></Field>
        </div>
        <AddressFields value={a} onChange={setA} errors={Object.fromEntries(['name', 'phone', 'line1', 'line2', 'city', 'state', 'pincode'].map((k) => [k, errors.field(k)]))} />
        <Button loading={busy} onClick={save}>Save address</Button>
      </div>
    </Modal>
  );
}

export default function BusinessAddressesPage() {
  const { data, refetch } = useQuery({ queryKey: ['business-addresses'], queryFn: () => api<{ addresses: Saved[] }>('/business/addresses') });
  const { data: me } = useQuery({ queryKey: ['business-overview'], queryFn: () => api<{ role: string }>('/business/overview') });
  const [editing, setEditing] = useState<Saved | null | 'new'>(null);
  if (!data) return <Spinner />;
  const owner = me?.role === 'OWNER';
  return (
    <>
      <PageHeader eyebrow="Business" title="Addresses" description="Head office, warehouses and branches. A branch registered separately under GST can carry its own GSTIN, which then goes on the invoice."
        actions={owner && <Button onClick={() => setEditing('new')}><Plus size={16} />Add address</Button>} />
      {!owner && <div className="mb-5"><Alert tone="info">Only the account owner can add or change addresses. Anyone on the team can use them at checkout.</Alert></div>}
      {data.addresses.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.addresses.map((a) => (
            <article key={a.id} className="card card-pad flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-mint text-forest">{a.gstin ? <Building2 size={18} /> : <MapPin size={18} />}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{a.label}{a.isDefault && <Badge tone="gold" className="ml-2">Default</Badge>}</p>
                  <p className="text-sm text-muted">{a.name} · {a.phone}</p>
                </div>
              </div>
              <p className="text-sm">{a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.city}, {a.state} {a.pincode}</p>
              {a.gstin && <p className="text-sm">GSTIN <strong>{a.gstin}</strong></p>}
              {owner && (
                <div className="mt-auto flex flex-wrap gap-2 pt-2 border-t border-line">
                  <Button size="sm" variant="outline" onClick={() => setEditing(a)}>Edit</Button>
                  {!a.isDefault && <Button size="sm" variant="ghost" onClick={async () => { await patch(`/business/addresses/${a.id}`, { isDefault: true }); refetch(); }}><Star size={14} />Make default</Button>}
                  <ConfirmButton variant="ghost" danger title={`Remove ${a.label}?`} body="Orders already placed keep their delivery address." confirmLabel="Remove" onConfirm={async () => { await del(`/business/addresses/${a.id}`); refetch(); }}>Remove</ConfirmButton>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : <div className="card"><Empty icon={<MapPin size={26} />} title="No saved addresses" body="Save your offices and warehouses so the team can pick them when ordering." action={owner && <Button onClick={() => setEditing('new')}><Plus size={16} />Add address</Button>} /></div>}
      {editing && <Editor initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={refetch} />}
    </>
  );
}
