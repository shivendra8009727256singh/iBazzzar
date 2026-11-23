'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Category } from '@/lib/types';
import { Checkbox, Field, Input, Select, Textarea } from './ui';
import { PostalFields, TaxFields, cleanTax, type Postal, type TaxIdentity } from './business-fields';

export type BusinessProfile = { legalName: string; tradeName: string; contactPhone: string; address: Postal; tax: TaxIdentity };
export type SellerProfile = { storeName: string; description: string; legalName: string; primaryCategory: string; contactPhone: string; pickupAddress: Postal; tax: TaxIdentity; acceptSellerTerms: boolean };

const emptyPostal: Postal = { line1: '', city: '', state: '', pincode: '' };
const emptyTax: TaxIdentity = { businessType: '', gstRegistered: false };
export const emptyBusiness: BusinessProfile = { legalName: '', tradeName: '', contactPhone: '', address: emptyPostal, tax: emptyTax };
export const emptySeller: SellerProfile = { storeName: '', description: '', legalName: '', primaryCategory: '', contactPhone: '', pickupAddress: emptyPostal, tax: emptyTax, acceptSellerTerms: false };

export const businessPayload = (b: BusinessProfile) => ({ legalName: b.legalName, ...(b.tradeName ? { tradeName: b.tradeName } : {}), contactPhone: b.contactPhone, address: b.address, ...cleanTax(b.tax) });
export const sellerPayload = (s: SellerProfile) => ({ storeName: s.storeName, description: s.description, legalName: s.legalName, primaryCategory: s.primaryCategory, contactPhone: s.contactPhone, pickupAddress: s.pickupAddress, acceptSellerTerms: s.acceptSellerTerms, ...cleanTax(s.tax) });

type Err = (k: string) => string | undefined;

export function BusinessProfileFields({ value, onChange, err, prefix = '' }: { value: BusinessProfile; onChange: (v: BusinessProfile) => void; err: Err; prefix?: string }) {
  const e = (k: string) => err(`${prefix}${k}`);
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Legal business name" required error={e('legalName')} hint="As on your GST or company registration" className="sm:col-span-2"><Input value={value.legalName} onChange={(x) => onChange({ ...value, legalName: x.target.value })} /></Field>
        <Field label="Trade name (optional)" error={e('tradeName')}><Input value={value.tradeName} onChange={(x) => onChange({ ...value, tradeName: x.target.value })} /></Field>
        <Field label="Business phone" required error={e('contactPhone')}><Input inputMode="numeric" maxLength={10} value={value.contactPhone} onChange={(x) => onChange({ ...value, contactPhone: x.target.value.replace(/\D/g, '') })} /></Field>
      </div>
      <TaxFields value={value.tax} onChange={(tax) => onChange({ ...value, tax })} err={e} />
      <div><p className="label mb-3">Registered address</p><PostalFields value={value.address} onChange={(address) => onChange({ ...value, address })} err={(k) => e(`address.${k}`)} /></div>
      <p className="text-[13px] text-muted">We review business details before enabling quotations and wholesale checkout. Self-entered details are not treated as verified.</p>
    </div>
  );
}

export function SellerProfileFields({ value, onChange, err, prefix = '' }: { value: SellerProfile; onChange: (v: SellerProfile) => void; err: Err; prefix?: string }) {
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => api<{ categories: Category[] }>('/categories').then((r) => r.categories) });
  const e = (k: string) => err(`${prefix}${k}`);
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Store name" required error={e('storeName')} hint="Shown to customers"><Input value={value.storeName} onChange={(x) => onChange({ ...value, storeName: x.target.value })} /></Field>
        <Field label="Main category" required error={e('primaryCategory')}>
          <Select value={value.primaryCategory} onChange={(x) => onChange({ ...value, primaryCategory: x.target.value })}><option value="">Select…</option>{(categories ?? []).filter((c) => !c.parentId).map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}</Select>
        </Field>
        <Field label="About your store" required error={e('description')} className="sm:col-span-2"><Textarea rows={3} value={value.description} onChange={(x) => onChange({ ...value, description: x.target.value })} /></Field>
        <Field label="Legal business name" required error={e('legalName')}><Input value={value.legalName} onChange={(x) => onChange({ ...value, legalName: x.target.value })} /></Field>
        <Field label="Store phone" required error={e('contactPhone')}><Input inputMode="numeric" maxLength={10} value={value.contactPhone} onChange={(x) => onChange({ ...value, contactPhone: x.target.value.replace(/\D/g, '') })} /></Field>
      </div>
      <TaxFields value={value.tax} onChange={(tax) => onChange({ ...value, tax })} err={e} />
      <div><p className="label mb-1">Pickup address</p><p className="hint mb-3">Where couriers collect parcels. It also sets your GST state.</p><PostalFields value={value.pickupAddress} onChange={(pickupAddress) => onChange({ ...value, pickupAddress })} err={(k) => e(`pickupAddress.${k}`)} /></div>
      <Checkbox checked={value.acceptSellerTerms} onChange={(x) => onChange({ ...value, acceptSellerTerms: x.target.checked })} error={e('acceptSellerTerms')}
        label={<>I agree to the <a href="/pages/seller-agreement" target="_blank" className="link">Seller Agreement</a>, including accurate listings, honest pricing and the returns policy.</>} />
    </div>
  );
}
