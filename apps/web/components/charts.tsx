'use client';
import { useState } from 'react';
import { formatDate } from '@/lib/format';

/** Daily bar chart with a hover/focus readout and a hidden data table for screen readers. */
export function DailyBars({ data, value, format, label }: { data: { date: string }[]; value: (d: never) => number; format: (n: number) => string; label: string }) {
  const values = data.map((d) => value(d as never));
  const max = Math.max(1, ...values);
  const [active, setActive] = useState<number | null>(null);
  const shown = active ?? values.length - 1;
  const total = values.reduce((a, b) => a + b, 0);
  return (
    <figure>
      <figcaption className="flex items-baseline justify-between gap-3 mb-3">
        <span className="text-sm text-muted">{label} · last 30 days</span>
        <span className="text-sm"><strong>{format(values[shown] ?? 0)}</strong> <span className="text-muted">on {formatDate(data[shown]?.date, { day: 'numeric', month: 'short' })}</span> · total {format(total)}</span>
      </figcaption>
      <div className="flex items-end gap-[3px] h-40" onMouseLeave={() => setActive(null)} aria-hidden>
        {values.map((v, i) => (
          <button key={i} tabIndex={-1} onMouseEnter={() => setActive(i)} className="flex-1 h-full flex items-end group">
            <span className={`w-full rounded-t-[3px] transition-colors ${i === shown ? 'bg-gold' : 'bg-forest/70 group-hover:bg-forest'}`} style={{ height: `${Math.max(v ? 4 : 1, (v / max) * 100)}%` }} />
          </button>
        ))}
      </div>
      <table className="sr-only"><caption>{label}</caption><thead><tr><th>Date</th><th>Value</th></tr></thead><tbody>{data.map((d, i) => <tr key={d.date}><td>{d.date}</td><td>{format(values[i])}</td></tr>)}</tbody></table>
    </figure>
  );
}

export function Meter({ items }: { items: { label: string; value: number; tone?: string }[] }) {
  const total = Math.max(1, items.reduce((s, i) => s + i.value, 0));
  const tones = ['bg-forest', 'bg-gold', 'bg-leaf', 'bg-info', 'bg-danger', 'bg-muted'];
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden bg-mint" aria-hidden>
        {items.map((i, n) => <span key={i.label} className={i.tone ?? tones[n % tones.length]} style={{ width: `${(i.value / total) * 100}%` }} />)}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {items.map((i, n) => <li key={i.label} className="flex items-center gap-2"><span className={`size-2.5 rounded-full ${i.tone ?? tones[n % tones.length]}`} aria-hidden /><span className="flex-1 text-muted">{i.label}</span><strong>{i.value}</strong></li>)}
      </ul>
    </div>
  );
}
