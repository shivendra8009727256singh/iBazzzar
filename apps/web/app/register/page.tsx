'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ShoppingBag, Building2, Store } from 'lucide-react';
import { post } from '@/lib/api';
import { cn } from '@/lib/format';
import { AuthShell } from '@/components/auth-shell';
import { Alert, Button, Checkbox, Field, Input, useFormErrors } from '@/components/ui';
import { BusinessProfileFields, SellerProfileFields, businessPayload, sellerPayload, emptyBusiness, emptySeller } from '@/components/profile-forms';

type Kind = 'customer' | 'business' | 'seller';
const KINDS: { id: Kind; icon: typeof ShoppingBag; title: string; body: string }[] = [
  { id: 'customer', icon: ShoppingBag, title: 'Shopper', body: 'Buy for yourself and your family' },
  { id: 'business', icon: Building2, title: 'Business buyer', body: 'Wholesale prices, quotes and POs' },
  { id: 'seller', icon: Store, title: 'Seller', body: 'Sell retail and wholesale' },
];

function RegisterForm() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const initial = (params.get('as') as Kind) || 'customer';
  const [kind, setKind] = useState<Kind>(KINDS.some((k) => k.id === initial) ? initial : 'customer');
  const [account, setAccount] = useState({ name: '', email: '', phone: '', password: '', confirm: '', acceptTerms: false, marketingOptIn: false });
  const [business, setBusiness] = useState(emptyBusiness);
  const [seller, setSeller] = useState(emptySeller);
  const [busy, setBusy] = useState(false);
  const errors = useFormErrors();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    errors.clear();
    if (account.password !== account.confirm) { errors.set(Object.assign(new Error('The passwords don’t match'), {})); return; }
    setBusy(true);
    try {
      const { confirm: _c, ...base } = account;
      await post('/auth/register', { accountType: kind, ...base, ...(kind === 'business' ? { business: businessPayload(business) } : {}), ...(kind === 'seller' ? { seller: sellerPayload(seller) } : {}) });
      await qc.invalidateQueries();
      router.push(kind === 'seller' ? '/seller' : kind === 'business' ? '/business' : '/account?welcome=1');
      router.refresh();
    } catch (err) { errors.set(err); setBusy(false); }
  };

  return (
    <AuthShell wide title="Create your IBazzzar account" subtitle={<>Already have one? <Link href="/login" className="link">Sign in</Link></>}>
      <form onSubmit={submit} className="grid gap-6" noValidate>
        <fieldset>
          <legend className="label mb-3">I’m joining as</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {KINDS.map((k) => (
              <label key={k.id} className={cn('rounded-2xl border p-4 cursor-pointer transition', kind === k.id ? 'border-emerald bg-mint ring-2 ring-emerald/15' : 'border-line hover:border-line-strong')}>
                <input type="radio" name="kind" className="sr-only" checked={kind === k.id} onChange={() => setKind(k.id)} />
                <k.icon size={22} className="text-forest" /><span className="block font-semibold mt-2">{k.title}</span><span className="block text-[13px] text-muted">{k.body}</span>
              </label>
            ))}
          </div>
          <p className="hint mt-3">Team members (buyers, approvers, seller staff) join by invitation from their account owner after signing up as a shopper.</p>
        </fieldset>

        {errors.message && <Alert>{errors.message}</Alert>}

        <section className="grid gap-4 sm:grid-cols-2">
          <h2 className="sm:col-span-2 text-xl">Your details</h2>
          <Field label="Full name" required error={errors.field('name')}><Input autoComplete="name" value={account.name} onChange={(e) => setAccount({ ...account, name: e.target.value })} /></Field>
          <Field label="Mobile number" required error={errors.field('phone')}><Input inputMode="numeric" autoComplete="tel-national" maxLength={10} value={account.phone} onChange={(e) => setAccount({ ...account, phone: e.target.value.replace(/\D/g, '') })} /></Field>
          <Field label="Email" required error={errors.field('email')} className="sm:col-span-2"><Input type="email" autoComplete="email" value={account.email} onChange={(e) => setAccount({ ...account, email: e.target.value })} /></Field>
          <Field label="Password" required error={errors.field('password')} hint="At least 12 characters. A short phrase works well."><Input type="password" autoComplete="new-password" value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })} /></Field>
          <Field label="Confirm password" required error={account.confirm && account.confirm !== account.password ? 'The passwords don’t match' : undefined}><Input type="password" autoComplete="new-password" value={account.confirm} onChange={(e) => setAccount({ ...account, confirm: e.target.value })} /></Field>
        </section>

        {kind === 'business' && <section><h2 className="text-xl mb-4">Business details</h2><BusinessProfileFields value={business} onChange={setBusiness} err={errors.field} prefix="business." /></section>}
        {kind === 'seller' && <section><h2 className="text-xl mb-4">Store details</h2><SellerProfileFields value={seller} onChange={setSeller} err={errors.field} prefix="seller." /></section>}

        <div className="grid gap-3">
          <Checkbox checked={account.acceptTerms} onChange={(e) => setAccount({ ...account, acceptTerms: e.target.checked })} error={errors.field('acceptTerms')} label={<>I accept the <Link href="/pages/terms" className="link" target="_blank">Terms of Use</Link> and <Link href="/pages/privacy" className="link" target="_blank">Privacy Policy</Link>.</>} />
          <Checkbox checked={account.marketingOptIn} onChange={(e) => setAccount({ ...account, marketingOptIn: e.target.checked })} label="Send me offers and new arrivals by email (optional)" />
        </div>
        <Button size="lg" loading={busy}>{kind === 'seller' ? 'Create account and apply to sell' : kind === 'business' ? 'Create business account' : 'Create account'}</Button>
      </form>
    </AuthShell>
  );
}

export default function RegisterPage() {
  return <Suspense><RegisterForm /></Suspense>;
}
