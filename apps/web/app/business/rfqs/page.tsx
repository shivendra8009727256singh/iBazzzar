'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ClipboardList, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { Empty, PageHeader, Pagination, Spinner, StatusBadge } from '@/components/ui';

type Row = { id: string; number: string; title: string; status: string; createdAt: string; neededBy: string | null; items: number; sellers: number; quotes: number };

export default function RfqsPage() {
  const [page, setPage] = useState(1);
  const { data } = useQuery({ queryKey: ['rfqs', page], queryFn: () => api<{ rfqs: Row[]; page: number; pages: number }>(`/business/rfqs?page=${page}`), placeholderData: keepPreviousData });
  return (
    <>
      <PageHeader title="Requests for quotation" description="Ask approved sellers for prices on bulk quantities, compare offers and negotiate." actions={<Link href="/business/rfqs/new" className="btn btn-primary"><Plus size={16} />New request</Link>} />
      {!data ? <Spinner /> : data.rfqs.length ? (
        <>
          <div className="table-wrap"><table className="table"><thead><tr><th>Request</th><th>Items</th><th>Quotes</th><th>Needed by</th><th>Status</th></tr></thead>
            <tbody>{data.rfqs.map((r) => (
              <tr key={r.id}><td><Link href={`/business/rfqs/${r.id}`} className="link">{r.title}</Link><span className="block text-xs text-muted">{r.number} · {formatDate(r.createdAt)}</span></td><td>{r.items}</td><td>{r.quotes} of {r.sellers}</td><td>{formatDate(r.neededBy)}</td><td><StatusBadge status={r.status} /></td></tr>
            ))}</tbody></table></div>
          <Pagination page={data.page} pages={data.pages} onChange={setPage} />
        </>
      ) : <div className="card"><Empty icon={<ClipboardList size={26} />} title="No requests yet" action={<Link href="/business/rfqs/new" className="btn btn-primary">Create your first request</Link>} /></div>}
    </>
  );
}
