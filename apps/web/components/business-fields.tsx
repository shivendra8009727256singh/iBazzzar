'use client';
import { indianStates, panFromGstin } from '@ibazzzar/shared';
import { Checkbox, Field, Input, Select } from './ui';

export const BUSINESS_TYPES: [string, string][] = [
  ['PROPRIETORSHIP', 'Sole proprietorship'], ['PARTNERSHIP', 'Partnership firm'], ['LLP', 'Limited liability partnership (LLP)'],
  ['PRIVATE_LIMITED', 'Private limited company'], ['PUBLIC_LIMITED', 'Public limited company'], ['ONE_PERSON_COMPANY', 'One person company (OPC)'],
  ['TRUST_SOCIETY', 'Trust, society or NGO'], ['OTHER', 'Other'],
];

export type Postal = { line1: string; line2?: string; city: string; state: string; pincode: string };
export type TaxIdentity = { businessType: string; gstRegistered: boolean; gstin?: string; pan?: string };

export function PostalFields({ value, onChange, err }: { value: Postal; onChange: (v: Postal) => void; err: (k: string) => string | undefined }) {
  const set = (k: keyof Postal) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Building and street" required error={err('line1')} className="sm:col-span-2"><Input value={value.line1} onChange={set('line1')} autoComplete="address-line1" /></Field>
      <Field label="City" required error={err('city')}><Input value={value.city} onChange={set('city')} autoComplete="address-level2" /></Field>
      <Field label="PIN code" required error={err('pincode')}><Input inputMode="numeric" maxLength={6} value={value.pincode} onChange={(e) => onChange({ ...value, pincode: e.target.value.replace(/\D/g, '') })} /></Field>
      <Field label="State or union territory" required error={err('state')} className="sm:col-span-2">
        <Select value={value.state} onChange={set('state')}><option value="">Select…</option>{indianStates.map((s: { code: string; name: string }) => <option key={s.code} value={s.name}>{s.name}</option>)}</Select>
      </Field>
    </div>
  );
}

/** GST is optional for small Indian businesses; when registered, the GSTIN is checked and the PAN is read from it. */
export function TaxFields({ value, onChange, err }: { value: TaxIdentity; onChange: (v: TaxIdentity) => void; err: (k: string) => string | undefined }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Business type" required error={err('businessType')} className="sm:col-span-2">
        <Select value={value.businessType} onChange={(e) => onChange({ ...value, businessType: e.target.value })}>
          <option value="">Select…</option>{BUSINESS_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </Field>
      <div className="sm:col-span-2"><Checkbox checked={value.gstRegistered} onChange={(e) => onChange({ ...value, gstRegistered: e.target.checked, ...(e.target.checked ? {} : { gstin: undefined }) })} label="Registered under GST" hint="Leave unticked if your business is below the GST threshold. You can add a GSTIN later." error={err('gstRegistered')} /></div>
      {value.gstRegistered && (
        <Field label="GSTIN" required error={err('gstin')} hint="15 characters, e.g. 27ABCDE1234F1Z5">
          <Input className="uppercase" maxLength={15} value={value.gstin ?? ''} onChange={(e) => { const g = e.target.value.toUpperCase(); onChange({ ...value, gstin: g, pan: g.length >= 12 ? panFromGstin(g) : value.pan }); }} />
        </Field>
      )}
      <Field label="PAN (optional)" error={err('pan')} hint={value.gstRegistered ? 'Filled from your GSTIN' : '10 characters, e.g. ABCDE1234F'}>
        <Input className="uppercase" maxLength={10} value={value.pan ?? ''} onChange={(e) => onChange({ ...value, pan: e.target.value.toUpperCase() || undefined })} />
      </Field>
    </div>
  );
}

export const cleanTax = (t: TaxIdentity) => ({ businessType: t.businessType, gstRegistered: t.gstRegistered, ...(t.gstin ? { gstin: t.gstin } : {}), ...(t.pan ? { pan: t.pan } : {}) });
