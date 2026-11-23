'use client';
import { useState } from 'react';
import { post } from '@/lib/api';

export function Newsletter() {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<{ ok?: string; error?: string; token?: string; busy?: boolean }>({});
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState({ busy: true });
    try {
      const r = await post<{ message: string; unsubscribeToken: string }>('/newsletter', { email, consent });
      setState({ ok: r.message, token: r.unsubscribeToken });
      setEmail('');
    } catch (err) { setState({ error: err instanceof Error ? err.message : 'Could not subscribe' }); }
  };
  const undo = async () => {
    if (!state.token) return;
    await post('/newsletter/unsubscribe', { token: state.token }).catch(() => {});
    setState({ ok: 'You’ve been unsubscribed.' });
  };
  return (
    <form onSubmit={submit} className="grid gap-3" aria-labelledby="newsletter-title">
      <p id="newsletter-title" className="font-semibold text-gold-light">New arrivals & genuine deals</p>
      <p className="text-[14px] text-white/70">One email a week at most. Unsubscribe from any email.</p>
      <div className="flex gap-2">
        <label htmlFor="newsletter-email" className="sr-only">Email address</label>
        <input id="newsletter-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="input bg-white/95 min-h-[44px]" />
        <button className="btn btn-gold" disabled={state.busy}>Subscribe</button>
      </div>
      <label className="flex items-start gap-2 text-[13px] text-white/75">
        <input type="checkbox" className="checkbox mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
        I agree to receive marketing emails from IBazzzar.
      </label>
      {state.ok && <p role="status" className="text-[13px] text-gold-light">{state.ok} {state.token && <button type="button" onClick={undo} className="underline">Undo</button>}</p>}
      {state.error && <p role="alert" className="text-[13px] text-[#ffb4ab]">{state.error}</p>}
    </form>
  );
}
