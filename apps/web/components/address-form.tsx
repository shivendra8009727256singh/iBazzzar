'use client';
import { indianStates } from '@ibazzzar/shared';
import type { Address } from '@/lib/types';
import { Field, Input, Select } from './ui';

export const emptyAddress: Address = { name: '', phone: '', line1: '', line2: '', city: '', state: '', pincode: '' };

/** Controlled address fields. Validation messages come from the server's shared schema via `errors`. */
export function AddressFields({ value, onChange, errors = {}, prefix = 'address' }: { value: Address; onChange: (a: Address) => void; errors?: Record<string, string | undefined>; prefix?: string }) {
  const set = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...value, [k]: e.target.value });
  const err = (k: string) => errors[`${prefix}.${k}`] ?? errors[k];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Full name" required error={err('name')}><Input autoComplete="name" value={value.name} onChange={set('name')} /></Field>
      <Field label="Mobile number" required error={err('phone')} hint="10 digits, for delivery updates"><Input autoComplete="tel-national" inputMode="numeric" maxLength={10} value={value.phone} onChange={(e) => onChange({ ...value, phone: e.target.value.replace(/\D/g, '') })} /></Field>
      <Field label="House, building and street" required error={err('line1')} className="sm:col-span-2"><Input autoComplete="address-line1" value={value.line1} onChange={set('line1')} /></Field>
      <Field label="Area, landmark (optional)" error={err('line2')} className="sm:col-span-2"><Input autoComplete="address-line2" value={value.line2 ?? ''} onChange={set('line2')} /></Field>
      <Field label="City" required error={err('city')}><Input autoComplete="address-level2" value={value.city} onChange={set('city')} /></Field>
      <Field label="PIN code" required error={err('pincode')}><Input autoComplete="postal-code" inputMode="numeric" maxLength={6} value={value.pincode} onChange={(e) => onChange({ ...value, pincode: e.target.value.replace(/\D/g, '') })} /></Field>
      <Field label="State or union territory" required error={err('state')} className="sm:col-span-2">
        <Select autoComplete="address-level1" value={value.state} onChange={set('state')}>
          <option value="">Select…</option>
          {indianStates.map((s: { code: string; name: string }) => <option key={s.code} value={s.name}>{s.name}</option>)}
        </Select>
      </Field>
    </div>
  );
}

export function addressPayload(a: Address) {
  const { name, phone, line1, line2, city, state, pincode } = a;
  return { name, phone, line1, ...(line2 ? { line2 } : {}), city, state, pincode };
}
