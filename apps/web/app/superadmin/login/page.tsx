'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, ShieldCheck, Lock } from 'lucide-react';
import { post } from '@/lib/api';
import type { User } from '@/lib/types';
import { Logo } from '@/components/logo';
import { Alert, Button, Field, Input, useFormErrors } from '@/components/ui';

/** Separate sign-in for the single Super Admin account. Other accounts are refused here, and this account is refused on /login. */
export default function SuperAdminLoginPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const errors = useFormErrors();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); errors.clear();
    try {
      const { user } = await post<{ user: User }>('/auth/superadmin/login', { email, password });
      qc.setQueryData(['me'], user);
      await qc.invalidateQueries();
      router.push('/admin');
      router.refresh();
    } catch (err) { errors.set(err); setBusy(false); }
  };

  return (
    <div className="min-h-[calc(100vh-140px)] surface-emerald flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6"><Logo size="auth" plate /></div>
        <div className="card card-pad">
          <div className="flex items-center gap-3 mb-1">
            <span className="size-10 rounded-xl bg-emerald text-gold-light grid place-items-center"><ShieldCheck size={20} /></span>
            <div><h1 className="text-2xl">Super Admin sign in</h1><p className="text-sm text-muted">Restricted area. Every attempt is recorded.</p></div>
          </div>
          <form onSubmit={submit} className="grid gap-4 mt-6" noValidate>
            {errors.message && <Alert>{errors.message}</Alert>}
            <Field label="Email" required error={errors.field('email')}><Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Password" required error={errors.field('password')}>
              <div className="relative">
                <Input type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="pr-12" />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-muted" aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </div>
            </Field>
            <Button size="lg" loading={busy}><Lock size={16} />Sign in to the console</Button>
            <p className="text-[13px] text-muted">Sessions end after 12 hours. Five wrong passwords lock the account for 15 minutes. The password is managed with the server’s superadmin script, not by email reset.</p>
          </form>
        </div>
      </div>
    </div>
  );
}
