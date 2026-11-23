'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import { post } from '@/lib/api';
import { loginDestination } from '@/lib/login-destination';
import type { User } from '@/lib/types';
import { AuthShell } from '@/components/auth-shell';
import { Alert, Button, Field, Input, useFormErrors } from '@/components/ui';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const errors = useFormErrors();
  const portal = params.get('portal');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); errors.clear();
    try {
      const { user } = await post<{ user: User }>('/auth/login', { email, password });
      qc.setQueryData(['me'], user);
      await qc.invalidateQueries();
      router.push(loginDestination(user, portal, params.get('next')));
      router.refresh();
    } catch (err) { errors.set(err); setBusy(false); }
  };

  return (
    <AuthShell title={portal === 'staff' ? 'Staff sign in' : 'Welcome back'} subtitle={<>New to IBazzzar? <Link href="/register" className="link">Create an account</Link></>}>
      <div className="flex gap-1 mb-6 text-sm" role="tablist" aria-label="Sign in as">
        {[[null, 'Shopper'], ['business', 'Business'], ['seller', 'Seller'], ['staff', 'Staff']].map(([p, l]) => (
          <Link key={l} href={p ? `/login?portal=${p}` : '/login'} role="tab" aria-selected={portal === p} className={`rounded-lg px-3 py-1.5 font-semibold ${portal === p ? 'bg-emerald text-white' : 'bg-mint text-forest'}`}>{l}</Link>
        ))}
      </div>
      <form onSubmit={submit} className="grid gap-4" noValidate>
        {errors.message && <Alert>{errors.message}</Alert>}
        <Field label="Email" required error={errors.field('email')}><Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field label="Password" required error={errors.field('password')}>
          <div className="relative">
            <Input type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="pr-12" />
            <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-muted" aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </div>
        </Field>
        <div className="flex justify-end -mt-1"><Link href="/reset-password" className="link text-sm">Forgot password?</Link></div>
        <Button size="lg" loading={busy}>Sign in</Button>
        <p className="text-[13px] text-muted">After 5 wrong attempts the account is locked for 15 minutes to protect it.</p>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
