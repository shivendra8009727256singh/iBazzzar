'use client';
import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import { Pagination, Spinner, Alert, Empty } from '../ui';

/** Fetches a paged admin list with search; shared by most console sections. */
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
      <Search size={16} className="absolute left-3 top-3 text-muted" />
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
