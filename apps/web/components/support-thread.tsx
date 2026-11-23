'use client';
import { useState } from 'react';
import type { Ticket } from '@/lib/types';
import { cn, formatDateTime } from '@/lib/format';
import { Button, StatusBadge, Textarea } from './ui';

/** A support conversation. `side` decides which messages sit on the right. */
export function SupportThread({ ticket, side, onReply, actions }: { ticket: Ticket; side: 'CUSTOMER' | 'SUPPORT'; onReply: (message: string) => Promise<void>; actions?: React.ReactNode }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const send = async () => {
    setBusy(true); setError(undefined);
    try { await onReply(text); setText(''); } catch (e) { setError(e instanceof Error ? e.message : 'Could not send'); } finally { setBusy(false); }
  };
  return (
    <div className="card">
      <header className="flex flex-wrap items-center justify-between gap-3 p-5 border-b border-line">
        <div><p className="font-semibold">{ticket.subject}</p><p className="text-xs text-muted">{ticket.number}{ticket.customer ? ` · ${ticket.customer.name} (${ticket.customer.email})` : ''}</p></div>
        <div className="flex items-center gap-2"><StatusBadge status={ticket.status} />{actions}</div>
      </header>
      <ol className="p-5 grid gap-3 max-h-[50vh] overflow-y-auto">
        {ticket.messages.map((m) => (
          <li key={m.id} className={cn('max-w-[85%] rounded-2xl px-4 py-3 text-[15px]', m.from === side ? 'ml-auto bg-emerald text-white rounded-br-sm' : 'bg-cream border border-line rounded-bl-sm')}>
            <p className={cn('text-xs font-semibold mb-1', m.from === side ? 'text-gold-light' : 'text-gold-ink')}>{m.authorName} · {formatDateTime(m.at)}</p>
            <p className="whitespace-pre-line">{m.body}</p>
          </li>
        ))}
      </ol>
      {ticket.status !== 'CLOSED' ? (
        <div className="p-5 border-t border-line grid gap-2">
          <label htmlFor={`reply-${ticket.id}`} className="sr-only">Reply</label>
          <Textarea id={`reply-${ticket.id}`} rows={3} placeholder="Write a reply…" value={text} onChange={(e) => setText(e.target.value)} aria-invalid={error ? true : undefined} />
          {error && <p className="error-text">{error}</p>}
          <Button className="justify-self-end" loading={busy} disabled={text.trim().length < 2} onClick={send}>Send reply</Button>
        </div>
      ) : <p className="p-5 border-t border-line text-sm text-muted">This conversation is closed.</p>}
    </div>
  );
}
