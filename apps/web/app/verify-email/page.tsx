'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { post } from '@/lib/api';

function Verify() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<{ ok?: boolean; message?: string }>({});
  useEffect(() => {
    if (!token) { setState({ ok: false, message: 'This verification link is incomplete.' }); return; }
    post<{ message: string }>('/auth/verify-email', { token }).then((r) => setState({ ok: true, message: r.message })).catch((e) => setState({ ok: false, message: e.message }));
  }, [token]);
  return (
    <div className="container-page py-20 max-w-lg text-center">
      {state.ok == null ? <Loader2 className="mx-auto animate-spin text-forest" size={40} /> : state.ok ? <CheckCircle2 className="mx-auto text-success" size={48} /> : <XCircle className="mx-auto text-danger" size={48} />}
      <h1 className="text-3xl mt-4">{state.ok == null ? 'Confirming your email…' : state.ok ? 'Email confirmed' : 'We couldn’t confirm your email'}</h1>
      {state.message && <p className="text-muted mt-2" role="status">{state.message}</p>}
      <Link href="/account" className="btn btn-primary mt-6">Go to my account</Link>
    </div>
  );
}

export default function VerifyEmailPage() {
  return <Suspense><Verify /></Suspense>;
}
