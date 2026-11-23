'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { post } from '@/lib/api';
import { AuthShell } from '@/components/auth-shell';
import { Alert, Button, Field, Input, useFormErrors } from '@/components/ui';

function Reset() {
  const token = useSearchParams().get('token');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [done, setDone] = useState<string>();
  const [busy, setBusy] = useState(false);
  const errors = useFormErrors();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); errors.clear();
    try {
      const r = token ? await post<{ message: string }>('/auth/password-reset/confirm', { token, newPassword: password }) : await post<{ message: string }>('/auth/password-reset/request', { email });
      setDone(r.message);
    } catch (err) { errors.set(err); } finally { setBusy(false); }
  };
  return (
    <AuthShell title={token ? 'Choose a new password' : 'Reset your password'} subtitle={token ? 'All your other sessions will be signed out.' : 'We’ll email you a link that works for 30 minutes.'}>
      {done ? (
        <div className="grid gap-4"><Alert tone="success">{done}</Alert><Link href="/login" className="btn btn-primary">Back to sign in</Link></div>
      ) : (
        <form onSubmit={submit} className="grid gap-4" noValidate>
          {errors.message && <Alert>{errors.message}</Alert>}
          {token
            ? <Field label="New password" required error={errors.field('newPassword')} hint="At least 12 characters"><Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            : <Field label="Email" required error={errors.field('email')}><Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>}
          <Button size="lg" loading={busy}>{token ? 'Update password' : 'Send reset link'}</Button>
        </form>
      )}
    </AuthShell>
  );
}

export default function ResetPage() {
  return <Suspense><Reset /></Suspense>;
}
