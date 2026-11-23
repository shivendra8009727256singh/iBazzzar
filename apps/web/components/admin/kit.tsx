'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { Search, X, ArrowUp, ArrowDown, ArrowUpDown, Columns3, Download, CalendarRange, StickyNote, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { api, post } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/format';
import { Pagination, Spinner, Alert, Empty, Button, Field, Textarea, Modal } from '../ui';

// ───────────── Legacy helpers (still used by simpler sections) ─────────────
/** Fetches a paged admin list with search; shared by sections that don't need the full table. */
export function useAdminList<T>(path: string, key: string, extra: Record<string, string> = {}) {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const params = new URLSearchParams({ page: String(page), ...(q ? { q } : {}), ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v)) });
  const query = useQuery({ queryKey: ['admin', key, params.toString()], queryFn: () => api<T>(`${path}?${params}`), placeholderData: keepPreviousData });
  return { ...query, page, setPage, q, setQ: (v: string) => { setQ(v); setPage(1); } };
}

export function SearchInput({ value, onChange, placeholder = 'Search' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative w-full max-w-xs">
      <Search size={16} className="absolute left-3 top-3 text-muted" aria-hidden />
      <label className="sr-only" htmlFor={`s-${placeholder}`}>{placeholder}</label>
      <input id={`s-${placeholder}`} className="input pl-9 min-h-[40px]" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function Section({ title, description, actions, children }: { title: string; description?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div><h1 className="text-2xl md:text-[28px]">{title}</h1>{description && <p className="text-muted text-[14.5px] mt-1 max-w-3xl">{description}</p>}</div>
        {actions && <div className="flex flex-wrap gap-2 items-center">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function Loadable<T>({ query, children, empty }: { query: { data?: T; error: unknown; isLoading: boolean }; children: (d: T) => React.ReactNode; empty?: (d: T) => boolean }) {
  if (query.error) return <Alert>{(query.error as Error).message}</Alert>;
  if (!query.data) return <Spinner />;
  if (empty?.(query.data)) return <div className="card"><Empty title="Nothing to show" /></div>;
  return <>{children(query.data)}</>;
}

export function Table({ head, children, empty }: { head: React.ReactNode[]; children: React.ReactNode; empty?: boolean }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>{empty ? <tr><td colSpan={head.length} className="text-center text-muted py-10">Nothing here yet.</td></tr> : children}</tbody>
      </table>
    </div>
  );
}

export function Pager({ data, setPage }: { data?: { page: number; pages: number }; setPage: (n: number) => void }) {
  return data ? <Pagination page={data.page} pages={data.pages} onChange={setPage} /> : null;
}

/** Shows a toast for a failed action and rethrows nothing. Returns true on success. */
export async function attempt(fn: () => Promise<unknown>, success?: string) {
  try { await fn(); if (success) toast.success(success); return true; } catch (e) { toast.error((e as Error).message); return false; }
}

// ───────────── URL-synced table state ─────────────
const TABLE_KEYS = ['page', 'limit', 'sort', 'dir', 'q', 'from', 'to'];

/** Reads and writes the table's state (page, sort, filters, open row) in the address bar, so views can be shared and survive reloads. */
export function useUrlState() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const get = useCallback((k: string) => params.get(k) ?? '', [params]);
  const set = useCallback((patch: Record<string, string | null | undefined>, { resetPage = true } = {}) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === undefined || v === '') next.delete(k); else next.set(k, v); }
    if (resetPage && !('page' in patch)) next.delete('page');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, router, pathname]);
  return { params, get, set };
}

export type ListResponse = { total: number; page: number; pages: number; limit: number; sort: string; dir: 'asc' | 'desc' };

/** Fetches an admin list using whatever is in the URL (minus UI-only keys like `open`). */
export function useAdminTable<T extends ListResponse>(path: string, filterKeys: string[] = [], defaults: Record<string, string> = {}) {
  const { params } = useUrlState();
  // Cheap to rebuild on each render; the query key is the string form, so identical params never refetch.
  const apiParams = new URLSearchParams();
  for (const [k, v] of Object.entries(defaults)) apiParams.set(k, v);
  for (const k of [...TABLE_KEYS, ...filterKeys]) { const v = params.get(k); if (v) apiParams.set(k, v); }
  const query = useQuery({ queryKey: ['admin', path, apiParams.toString()], queryFn: () => api<T>(`${path}?${apiParams}`), placeholderData: keepPreviousData });
  return { ...query, apiParams, exportHref: `/api${path}?${(() => { const p = new URLSearchParams(apiParams); p.delete('page'); p.delete('limit'); p.set('format', 'csv'); return p; })()}` };
}

// ───────────── Data table ─────────────
export type Column<T> = { key: string; label: string; sort?: string; render: (row: T) => React.ReactNode; className?: string; hidden?: boolean; always?: boolean };
export type FilterDef = { key: string; label: string; options: [string, string][] };
export type BulkAction = { id: string; label: string; danger?: boolean; reason?: 'required' | 'optional'; confirm?: string };

function useColumnPrefs(tableId: string, columns: Column<never>[]) {
  const storageKey = `ib-admin-cols:${tableId}`;
  const defaults = useMemo(() => columns.filter((c) => !c.hidden).map((c) => c.key), [columns]);
  const [shown, setShown] = useState<string[]>(defaults);
  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null'); if (Array.isArray(saved)) setShown(saved); } catch { /* ignore broken prefs */ }
  }, [storageKey]);
  const toggle = (key: string) => setShown((cur) => {
    const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* storage may be unavailable */ }
    return next;
  });
  const reset = () => { try { localStorage.removeItem(storageKey); } catch { /* ignore */ } setShown(defaults); };
  return { shown, toggle, reset };
}

function DebouncedSearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [text, setText] = useState(value);
  const first = useRef(true);
  useEffect(() => { setText(value); }, [value]);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => { if (text.trim() !== value) onChange(text.trim()); }, 350);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="relative w-full sm:w-64">
      <Search size={16} className="absolute left-3 top-3 text-muted" aria-hidden />
      <input aria-label={placeholder} className="input pl-9 pr-8 min-h-[40px]" placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} />
      {text && <button type="button" aria-label="Clear search" className="absolute right-2 top-2.5 text-muted hover:text-ink" onClick={() => { setText(''); onChange(''); }}><X size={16} /></button>}
    </div>
  );
}

const PRESETS: [string, number][] = [['Today', 0], ['7 days', 6], ['30 days', 29], ['90 days', 89]];
const istToday = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() + 5.5 * 3600_000 - n * 86_400_000).toISOString().slice(0, 10);

/** From/to date pickers with quick presets. Dates are India-time calendar days. */
export function DateRange({ from, to, onChange, label = 'Date' }: { from: string; to: string; onChange: (from: string, to: string) => void; label?: string }) {
  return (
    <details className="relative">
      <summary className={cn('btn btn-outline btn-sm min-h-[40px] list-none cursor-pointer', (from || to) && 'border-forest text-forest')}><CalendarRange size={15} />{from || to ? `${from || '…'} → ${to || '…'}` : label}</summary>
      <div className="absolute z-30 mt-2 right-0 sm:left-0 sm:right-auto w-72 card p-4 shadow-lift grid gap-3">
        <div className="flex flex-wrap gap-1.5">{PRESETS.map(([l, n]) => <button key={l} type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(daysAgo(n), istToday())}>{l}</button>)}</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-semibold text-muted">From<input type="date" className="input mt-1 min-h-[38px]" value={from} max={to || undefined} onChange={(e) => onChange(e.target.value, to)} /></label>
          <label className="text-xs font-semibold text-muted">To<input type="date" className="input mt-1 min-h-[38px]" value={to} min={from || undefined} onChange={(e) => onChange(from, e.target.value)} /></label>
        </div>
        {(from || to) && <button type="button" className="btn btn-ghost btn-sm justify-self-start" onClick={() => onChange('', '')}>Clear dates</button>}
      </div>
    </details>
  );
}

function BulkBar({ count, actions, onRun, onClear }: { count: number; actions: BulkAction[]; onRun: (a: BulkAction, reason?: string) => Promise<void>; onClear: () => void }) {
  const [pending, setPending] = useState<BulkAction | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (a: BulkAction, why?: string) => { setBusy(true); try { await onRun(a, why); setPending(null); setReason(''); } finally { setBusy(false); } };
  return (
    <div className="sticky top-14 lg:top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl bg-deep text-white px-4 py-2.5 mb-3 shadow-lift" role="region" aria-label="Bulk actions">
      <span className="font-semibold mr-2">{count} selected</span>
      {actions.map((a) => <Button key={a.id} size="sm" variant={a.danger ? 'danger' : 'outline'} className={a.danger ? '' : 'bg-white/10 border-white/30 text-white hover:bg-white/20'} onClick={() => (a.reason || a.confirm ? setPending(a) : run(a))}>{a.label}</Button>)}
      <button type="button" className="ml-auto text-sm text-white/80 hover:text-white" onClick={onClear}>Clear selection</button>
      <Modal open={!!pending} onOpenChange={(o) => !o && setPending(null)} title={`${pending?.label} ${count} selected?`} description={pending?.confirm ?? 'Every change is recorded in the audit log.'}>
        {pending && <div className="grid gap-4">
          {pending.reason && <Field label={pending.reason === 'required' ? 'Reason (required)' : 'Reason (optional)'} hint="Shared with the people affected where relevant"><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setPending(null)}>Cancel</Button><Button variant={pending.danger ? 'danger' : 'primary'} loading={busy} disabled={pending.reason === 'required' && reason.trim().length < 5} onClick={() => run(pending, reason.trim() || undefined)}>{pending.label}</Button></div>
        </div>}
      </Modal>
    </div>
  );
}

/**
 * The admin data table: search, filters, date range, sortable columns, page size, column chooser, CSV export of the
 * filtered list, row selection with bulk actions, and a click-through to a detail drawer (`?open=<id>` in the URL).
 */
export function DataTable<T extends { id: string }>({
  tableId, query, rows, columns, filters = [], search = 'Search', dateFilter = true, bulk, onOpen, toolbar, summary, rowClassName,
}: {
  tableId: string;
  query: { data?: ListResponse; isFetching: boolean; error: unknown; refetch: () => unknown; exportHref: string };
  rows: T[] | undefined;
  columns: Column<T>[];
  filters?: FilterDef[];
  search?: string | false;
  dateFilter?: boolean | string;
  bulk?: { endpoint: string; actions: BulkAction[]; body?: Record<string, unknown> };
  onOpen?: (row: T) => void;
  toolbar?: React.ReactNode;
  summary?: React.ReactNode;
  rowClassName?: (row: T) => string | undefined;
}) {
  const { get, set } = useUrlState();
  const cols = useColumnPrefs(tableId, columns as Column<never>[]);
  const [selected, setSelected] = useState<string[]>([]);
  const data = query.data;
  useEffect(() => { setSelected([]); }, [data?.page, data?.sort, data?.dir, data?.total]);
  const visible = columns.filter((c) => c.always || cols.shown.includes(c.key));
  const sortBy = (key: string) => {
    const same = (get('sort') || data?.sort) === key;
    set({ sort: key, dir: same && (get('dir') || data?.dir) === 'desc' ? 'asc' : 'desc' });
  };
  const allOnPage = !!rows?.length && rows.every((r) => selected.includes(r.id));
  const runBulk = async (a: BulkAction, reason?: string) => {
    if (!bulk) return;
    try {
      const r = await post<{ done: number; skipped: { id: string; reason: string }[] }>(bulk.endpoint, { ids: selected, action: a.id, ...(reason ? { reason } : {}), ...bulk.body });
      if (r.skipped?.length) toast.warning(`${r.done} done, ${r.skipped.length} skipped: ${[...new Set(r.skipped.map((s) => s.reason))].slice(0, 2).join('; ')}`);
      else toast.success(`${r.done} updated`);
      setSelected([]); query.refetch();
    } catch (e) { toast.error((e as Error).message); }
  };
  const activeFilters = filters.filter((f) => get(f.key)).length + (get('from') || get('to') ? 1 : 0) + (get('q') ? 1 : 0);
  const from = data ? (data.page - 1) * data.limit + 1 : 0;
  const to = data ? Math.min(data.total, data.page * data.limit) : 0;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {search && <DebouncedSearch value={get('q')} onChange={(v) => set({ q: v })} placeholder={search} />}
        {filters.map((f) => (
          <select key={f.key} aria-label={f.label} className={cn('input min-h-[40px] py-1 pl-3 w-auto max-w-[190px] text-[14px]', get(f.key) && 'border-forest text-forest font-semibold')} value={get(f.key)} onChange={(e) => set({ [f.key]: e.target.value })}>
            <option value="">{f.label}: all</option>
            {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ))}
        {dateFilter && <DateRange from={get('from')} to={get('to')} onChange={(f, t) => set({ from: f, to: t })} label={typeof dateFilter === 'string' ? dateFilter : 'Date'} />}
        {activeFilters > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => set(Object.fromEntries(['q', 'from', 'to', ...filters.map((f) => f.key)].map((k) => [k, null])))}>Reset filters</button>}
        <div className="flex items-center gap-2 ml-auto">
          {toolbar}
          <details className="relative">
            <summary className="btn btn-outline btn-sm min-h-[40px] list-none cursor-pointer" aria-label="Choose columns"><Columns3 size={15} /><span className="hidden md:inline">Columns</span></summary>
            <div className="absolute right-0 z-30 mt-2 w-56 card p-3 shadow-lift grid gap-1.5">
              {columns.filter((c) => !c.always).map((c) => <label key={c.key} className="flex items-center gap-2 text-sm"><input type="checkbox" className="checkbox mt-0" checked={cols.shown.includes(c.key)} onChange={() => cols.toggle(c.key)} />{c.label}</label>)}
              <button type="button" className="text-xs text-forest font-semibold text-left mt-1" onClick={cols.reset}>Reset to default</button>
            </div>
          </details>
          <a className="btn btn-outline btn-sm min-h-[40px]" href={query.exportHref} download><Download size={15} /><span className="hidden md:inline">Export CSV</span></a>
        </div>
      </div>
      {summary}
      {bulk && selected.length > 0 && <BulkBar count={selected.length} actions={bulk.actions} onRun={runBulk} onClear={() => setSelected([])} />}
      {query.error ? <Alert>{(query.error as Error).message}</Alert> : !data || !rows ? <Spinner /> : (
        <>
          <div className={cn('table-wrap transition-opacity', query.isFetching && 'opacity-60')}>
            <table className="table">
              <thead>
                <tr>
                  {bulk && <th className="w-10"><input type="checkbox" className="checkbox mt-0" aria-label="Select all on this page" checked={allOnPage} onChange={(e) => setSelected(e.target.checked ? [...new Set([...selected, ...rows.map((r) => r.id)])] : selected.filter((id) => !rows.some((r) => r.id === id)))} /></th>}
                  {visible.map((c) => {
                    const active = c.sort && data.sort === c.sort;
                    return (
                      <th key={c.key} className={c.className} aria-sort={active ? (data.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                        {c.sort ? <button type="button" className={cn('inline-flex items-center gap-1 font-semibold hover:text-ink', active && 'text-ink')} onClick={() => sortBy(c.sort!)}>{c.label}{active ? (data.dir === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />) : <ArrowUpDown size={13} className="opacity-40" />}</button> : c.label}
                      </th>
                    );
                  })}
                  {onOpen && <th className="w-16"><span className="sr-only">Open</span></th>}
                </tr>
              </thead>
              <tbody>
                {rows.length ? rows.map((r) => (
                  <tr key={r.id} className={cn(onOpen && 'cursor-pointer hover:bg-cream/70', selected.includes(r.id) && 'bg-mint/50', rowClassName?.(r))} onClick={(e) => { if (onOpen && !(e.target as HTMLElement).closest('button,a,input,select,label')) onOpen(r); }}>
                    {bulk && <td><input type="checkbox" className="checkbox mt-0" aria-label="Select row" checked={selected.includes(r.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, r.id] : selected.filter((x) => x !== r.id))} /></td>}
                    {visible.map((c) => <td key={c.key} className={c.className}>{c.render(r)}</td>)}
                    {onOpen && <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => onOpen(r)}>Open</button></td>}
                  </tr>
                )) : <tr><td colSpan={visible.length + (bulk ? 1 : 0) + (onOpen ? 1 : 0)} className="py-12"><Empty title={activeFilters ? 'Nothing matches these filters' : 'Nothing here yet'} body={activeFilters ? 'Try widening the date range or clearing a filter.' : undefined} /></td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 mt-4 text-sm">
            <span className="text-muted">{data.total ? <>Showing <strong className="text-ink">{from}–{to}</strong> of <strong className="text-ink">{data.total.toLocaleString('en-IN')}</strong></> : 'No results'}{query.isFetching && <Loader2 size={14} className="inline animate-spin ml-2" aria-label="Updating" />}</span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-muted">Rows<select className="input min-h-[34px] py-0.5 w-auto" value={String(data.limit)} onChange={(e) => set({ limit: e.target.value })}>{[25, 50, 100].map((n) => <option key={n}>{n}</option>)}</select></label>
              {data.pages > 1 && (
                <nav aria-label="Pagination" className="flex items-center gap-2">
                  <button type="button" className="btn btn-outline btn-sm" disabled={data.page <= 1} aria-label="Previous page" onClick={() => set({ page: String(data.page - 1) }, { resetPage: false })}><ChevronLeft size={15} /></button>
                  <span>Page <strong>{data.page}</strong> of {data.pages}</span>
                  <button type="button" className="btn btn-outline btn-sm" disabled={data.page >= data.pages} aria-label="Next page" onClick={() => set({ page: String(data.page + 1) }, { resetPage: false })}><ChevronRight size={15} /></button>
                </nav>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** The `?open=<id>` row drawer state, so links from search, the dashboard or other 360 views open the right record. */
export function useOpenParam(key = 'open') {
  const { get, set } = useUrlState();
  return [get(key) || null, (id: string | null) => set({ [key]: id }, { resetPage: false })] as const;
}

// ───────────── Drawer and detail building blocks ─────────────
export function Drawer({ open, onClose, title, subtitle, badges, actions, children, wide }: { open: boolean; onClose: () => void; title: React.ReactNode; subtitle?: React.ReactNode; badges?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-deep/45" />
        <Dialog.Content className={cn('fixed z-50 inset-y-0 right-0 w-full bg-[#f8f9f6] shadow-lift flex flex-col focus:outline-none', wide ? 'max-w-4xl' : 'max-w-2xl')}>
          <header className="bg-white border-b border-line px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Dialog.Title className="text-xl font-display font-semibold truncate">{title}</Dialog.Title>
                <Dialog.Description className={subtitle ? 'text-sm text-muted mt-0.5' : 'sr-only'}>{subtitle ?? 'Details'}</Dialog.Description>
                {badges && <div className="flex flex-wrap gap-1.5 mt-2">{badges}</div>}
              </div>
              <Dialog.Close className="btn btn-ghost btn-icon -mr-2" aria-label="Close"><X size={18} /></Dialog.Close>
            </div>
            {actions && <div className="flex flex-wrap gap-2 mt-3">{actions}</div>}
          </header>
          <div className="flex-1 overflow-y-auto p-5 grid gap-4 content-start">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Panel({ title, actions, children, className }: { title?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('card p-4', className)}>
      {(title || actions) && <div className="flex flex-wrap items-center justify-between gap-2 mb-3">{title && <h3 className="text-[15px] font-semibold">{title}</h3>}{actions}</div>}
      {children}
    </section>
  );
}

/** Label/value grid for record details. */
export function KV({ items, cols = 2 }: { items: [string, React.ReactNode][]; cols?: 2 | 3 }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-2.5 text-sm', cols === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
      {items.filter(([, v]) => v !== undefined).map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-xs text-muted font-medium">{k}</dt><dd className="font-medium break-words">{v === null || v === '' ? '—' : v}</dd></div>)}
    </dl>
  );
}

export function MiniStats({ items }: { items: [string, React.ReactNode, string?][] }) {
  return (
    <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
      {items.map(([k, v, hint]) => <div key={k} className="rounded-xl bg-white border border-line px-3 py-2.5"><p className="text-xs text-muted">{k}</p><p className="font-bold text-[17px] tabular-nums">{v}</p>{hint && <p className="text-[11px] text-muted">{hint}</p>}</div>)}
    </div>
  );
}

export function Timeline({ items }: { items: { id?: string; title: React.ReactNode; note?: React.ReactNode; at: string }[] }) {
  if (!items.length) return <p className="text-sm text-muted">Nothing recorded yet.</p>;
  return (
    <ol className="relative border-l border-line ml-1.5 grid gap-3">
      {items.map((i, n) => <li key={i.id ?? n} className="pl-4 relative"><span className="absolute -left-[5px] top-1.5 size-2.5 rounded-full bg-forest" aria-hidden /><p className="text-sm font-medium">{i.title}</p>{i.note && <p className="text-sm text-muted">{i.note}</p>}<p className="text-xs text-muted">{formatDateTime(i.at)}</p></li>)}
    </ol>
  );
}

type Note = { id: string; body: string; authorName: string; authorId: string; createdAt: string };
/** Internal staff notes on a record. Never shown to customers or sellers. */
export function NotesPanel({ entityType, entityId, initial }: { entityType: 'user' | 'organization' | 'store' | 'order' | 'product'; entityId: string; initial?: Note[] }) {
  const query = useQuery({ queryKey: ['admin', 'notes', entityType, entityId], queryFn: () => api<{ notes: Note[] }>(`/admin/notes?entityType=${entityType}&entityId=${entityId}`), initialData: initial ? { notes: initial } : undefined });
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    if (await attempt(() => post('/admin/notes', { entityType, entityId, body: body.trim() }), 'Note added')) { setBody(''); query.refetch(); }
    setBusy(false);
  };
  return (
    <Panel title="Internal notes">
      <p className="text-xs text-muted mb-2 flex items-center gap-1"><StickyNote size={13} />Visible to staff only.</p>
      <div className="grid gap-2">
        <Textarea rows={2} aria-label="New note" placeholder="Add a note for the team…" value={body} onChange={(e) => setBody(e.target.value)} />
        <Button size="sm" className="justify-self-start" disabled={body.trim().length < 2} loading={busy} onClick={add}>Add note</Button>
      </div>
      <ul className="grid gap-2 mt-3">
        {query.data?.notes.map((n) => <li key={n.id} className="rounded-lg bg-[#fffbea] border border-[#f1e3b0] px-3 py-2"><p className="text-sm whitespace-pre-line">{n.body}</p><p className="text-[11px] text-muted mt-1">{n.authorName} · {formatDateTime(n.createdAt)}</p></li>)}
        {query.data && !query.data.notes.length && <li className="text-sm text-muted">No notes yet.</li>}
      </ul>
    </Panel>
  );
}

/** Collects a reason (and optional extra fields) before running an action. */
export function ActionButton({ label, title, body, confirmLabel, danger, variant = 'outline', reasonLabel = 'Reason (kept in the audit log)', reason = true, fields, onSubmit, disabled }: {
  label: React.ReactNode; title: string; body?: string; confirmLabel?: string; danger?: boolean; variant?: 'primary' | 'outline' | 'ghost' | 'danger'; reasonLabel?: string; reason?: boolean;
  fields?: (state: Record<string, string>, setState: (patch: Record<string, string>) => void) => React.ReactNode; onSubmit: (values: Record<string, string> & { reason: string }) => Promise<unknown>; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, setStateRaw] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const setState = (p: Record<string, string>) => setStateRaw((s) => ({ ...s, ...p }));
  const why = (state.reason ?? '').trim();
  const submit = async () => {
    setBusy(true);
    const ok = await attempt(() => onSubmit({ ...state, reason: why }), 'Done');
    setBusy(false);
    if (ok) { setOpen(false); setStateRaw({}); }
  };
  return (
    <>
      <Button size="sm" variant={variant} disabled={disabled} onClick={() => setOpen(true)}>{label}</Button>
      <Modal open={open} onOpenChange={setOpen} title={title} description={body}>
        <div className="grid gap-4">
          {fields?.(state, setState)}
          {reason && <Field label={reasonLabel}><Textarea rows={3} value={state.reason ?? ''} onChange={(e) => setState({ reason: e.target.value })} /></Field>}
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} loading={busy} disabled={reason && why.length < 5} onClick={submit}>{confirmLabel ?? title}</Button></div>
        </div>
      </Modal>
    </>
  );
}

// ───────────── Global search ─────────────
type SearchResults = { results: { users: { id: string; name: string; email: string; status: string }[]; orders: { id: string; number: string; status: string; totalPaise: number; customer: string }[]; sellers: { id: string; name: string; status: string; gstin: string | null }[]; organizations: { id: string; legalName: string; status: string; gstin: string | null }[]; products: { id: string; name: string; status: string; brand: string }[]; tickets: { id: string; number: string; subject: string; status: string }[]; coupons: { id: string; code: string; active: boolean; description: string }[] }; total: number };

/** Search across people, orders, sellers, businesses, products, tickets and coupons from anywhere in the console. */
export function GlobalSearch() {
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { const t = setTimeout(() => setTerm(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { const typing = (e.target as HTMLElement).closest('input,textarea,select'); if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) { e.preventDefault(); box.current?.querySelector('input')?.focus(); } if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', key); };
  }, []);
  const query = useQuery({ queryKey: ['admin', 'search', term], queryFn: () => api<SearchResults>(`/admin/search?q=${encodeURIComponent(term)}`), enabled: term.length >= 2 });
  const r = query.data?.results;
  const groups: [string, { href: string; title: string; meta: string }[]][] = r ? [
    ['Orders', r.orders.map((o) => ({ href: `/admin/orders?open=${o.id}`, title: o.number, meta: `${o.customer} · ${o.status.toLowerCase().replace(/_/g, ' ')}` }))],
    ['People', r.users.map((u) => ({ href: `/admin/customers?open=${u.id}`, title: u.name, meta: u.email }))],
    ['Sellers', r.sellers.map((s) => ({ href: `/admin/sellers?open=${s.id}`, title: s.name, meta: s.gstin ?? s.status.toLowerCase() }))],
    ['Business accounts', r.organizations.map((o) => ({ href: `/admin/organizations?open=${o.id}`, title: o.legalName, meta: o.gstin ?? o.status.toLowerCase() }))],
    ['Products', r.products.map((p) => ({ href: `/admin/products?open=${p.id}`, title: p.name, meta: p.brand }))],
    ['Support tickets', r.tickets.map((t) => ({ href: `/admin/support`, title: `${t.number} · ${t.subject}`, meta: t.status.toLowerCase() }))],
    ['Coupons', r.coupons.map((c) => ({ href: `/admin/coupons?q=${c.code}`, title: c.code, meta: c.description }))],
  ].filter(([, items]) => (items as unknown[]).length) as [string, { href: string; title: string; meta: string }[]][] : [];
  return (
    <div ref={box} className="relative w-full max-w-xl">
      <Search size={16} className="absolute left-3 top-3 text-muted" aria-hidden />
      <input aria-label="Search the console" className="input pl-9 pr-16 min-h-[42px] rounded-xl bg-[#f6f8f4] border-line focus:bg-white" placeholder="Search orders, customers, sellers, SKUs…" value={q} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} />
      <kbd className="hidden sm:block absolute right-2.5 top-2.5 rounded-md border border-line bg-white px-1.5 py-0.5 text-[11px] font-semibold text-muted pointer-events-none">Ctrl K</kbd>
      {open && term.length >= 2 && (
        <div className="absolute z-40 mt-2 w-full card shadow-lift max-h-[70vh] overflow-y-auto p-2">
          {query.isFetching && !r && <p className="p-3 text-sm text-muted">Searching…</p>}
          {r && !groups.length && <p className="p-3 text-sm text-muted">No matches for “{term}”.</p>}
          {groups.map(([g, items]) => (
            <div key={g} className="mb-1">
              <p className="px-2 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-muted">{g}</p>
              {items.map((i) => <Link key={i.href + i.title} href={i.href} onClick={() => { setOpen(false); setQ(''); }} className="block rounded-lg px-2 py-1.5 hover:bg-cream"><span className="text-sm font-semibold block truncate">{i.title}</span><span className="text-xs text-muted block truncate">{i.meta}</span></Link>)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────────── Summary cards and tab pills ─────────────
type Tone = 'green' | 'amber' | 'red' | 'violet' | 'blue' | 'slate';
const TONES: Record<Tone, { icon: string; stroke: string; fill: string }> = {
  green: { icon: 'bg-mint text-forest', stroke: '#2f7d52', fill: '#2f7d5222' },
  amber: { icon: 'bg-[#fdf1d8] text-[#b7791f]', stroke: '#d68910', fill: '#d6891018' },
  red: { icon: 'bg-danger-bg text-danger', stroke: '#d92d20', fill: '#d92d2014' },
  violet: { icon: 'bg-[#efeafd] text-[#6941c6]', stroke: '#7a5af8', fill: '#7a5af814' },
  blue: { icon: 'bg-info-bg text-info', stroke: '#2e6ea6', fill: '#2e6ea618' },
  slate: { icon: 'bg-[#eef0ec] text-muted', stroke: '#7b877f', fill: '#7b877f14' },
};

/** Small trend line for the last 14 days. Decorative: the number next to it carries the meaning. */
export function Sparkline({ values, tone = 'green', className }: { values: number[]; tone?: Tone; className?: string }) {
  const w = 96; const h = 34;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * w, h - 3 - (v / max) * (h - 6)]);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn('w-24 h-9 shrink-0', className)} aria-hidden preserveAspectRatio="none">
      <polygon points={`0,${h} ${line} ${w},${h}`} fill={TONES[tone].fill} />
      <polyline points={line} fill="none" stroke={TONES[tone].stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

type Summary = Record<string, { total: number; last7: number; series: number[] }> & { types?: Record<string, number> };
export type CardDef = { key: string; label: string; icon: React.ComponentType<{ size?: number }>; tone: Tone; params: Record<string, string | null> };

const matches = (params: Record<string, string | null>, get: (k: string) => string) => Object.entries(params).every(([k, v]) => (get(k) || null) === (v || null));

export function useSummary(kind: string) {
  return useQuery({ queryKey: ['admin', 'summary', kind], queryFn: () => api<Summary>(`/admin/summary/${kind}`), staleTime: 30_000 });
}

/** Status cards that double as filters: click one to filter the table below; the active one is outlined. */
export function SummaryCards({ kind, cards }: { kind: string; cards: CardDef[] }) {
  const { get, set } = useUrlState();
  const { data } = useSummary(kind);
  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-[repeat(auto-fit,minmax(185px,1fr))] mb-5">
      {cards.map((c) => {
        const s = data?.[c.key];
        const active = matches(c.params, get);
        return (
          <button key={c.key} type="button" onClick={() => set(c.params)} aria-pressed={active}
            className={cn('text-left rounded-2xl border bg-white p-4 transition hover:shadow-card flex flex-col gap-2 min-w-0', active ? 'border-forest ring-1 ring-forest/30' : 'border-line')}>
            <span className="flex items-center gap-3 min-w-0">
              <span className={cn('size-11 rounded-full grid place-items-center shrink-0', TONES[c.tone].icon)}><c.icon size={19} /></span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold text-ink truncate">{c.label}</span>
                <span className="block text-2xl font-bold tabular-nums leading-tight">{s ? s.total.toLocaleString('en-IN') : '—'}</span>
              </span>
            </span>
            <span className="flex items-end justify-between gap-2">
              <span className="text-[11.5px] text-muted leading-snug">{s ? `${s.last7} new in last 7 days` : ' '}</span>
              {s && <Sparkline values={s.series} tone={c.tone} className="w-20 h-8" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Rounded tabs with count badges, synced to the URL like the table filters. */
export function TabPills({ items }: { items: { label: string; count?: number; params: Record<string, string | null> }[] }) {
  const { get, set } = useUrlState();
  return (
    <div role="tablist" className="flex gap-1.5 overflow-x-auto pb-1 mb-3">
      {items.map((t) => {
        const active = matches(t.params, get);
        return (
          <button key={t.label} role="tab" type="button" aria-selected={active} onClick={() => set(t.params)}
            className={cn('inline-flex items-center gap-2 rounded-full px-4 py-2 text-[14px] font-semibold whitespace-nowrap transition', active ? 'bg-forest text-white shadow-sm' : 'text-ink/80 hover:bg-mint')}>
            {t.label}
            {t.count != null && <span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-bold', active ? 'bg-gold-light text-deep' : 'bg-mint text-forest')}>{t.count.toLocaleString('en-IN')}</span>}
          </button>
        );
      })}
    </div>
  );
}
