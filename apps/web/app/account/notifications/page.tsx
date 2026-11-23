'use client';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { api, post } from '@/lib/api';
import type { Notification } from '@/lib/types';
import { cn, formatDateTime } from '@/lib/format';
import { Button, Empty, PageHeader, Spinner } from '@/components/ui';

export default function NotificationsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['notifications'], queryFn: () => api<{ notifications: Notification[]; unread: number }>('/notifications') });
  if (!data) return <Spinner />;
  const markAll = async () => { await post('/notifications/read', {}); qc.invalidateQueries({ queryKey: ['notifications'] }); };
  return (
    <>
      <PageHeader title="Notifications" description="Order updates, replies from support and account messages." actions={data.unread > 0 && <Button variant="outline" size="sm" onClick={markAll}>Mark all as read</Button>} />
      {data.notifications.length ? (
        <ul className="card divide-y divide-line">
          {data.notifications.map((n) => {
            const body = <><p className="font-semibold flex items-center gap-2">{!n.read && <span className="size-2 rounded-full bg-gold" aria-label="Unread" />}{n.title}</p><p className="text-sm text-muted mt-0.5">{n.body}</p><p className="text-xs text-muted mt-1">{formatDateTime(n.createdAt)}</p></>;
            return <li key={n.id} className={cn('p-4', !n.read && 'bg-cream')}>{n.link ? <Link href={n.link} className="block hover:opacity-80">{body}</Link> : body}</li>;
          })}
        </ul>
      ) : <div className="card"><Empty icon={<Bell size={26} />} title="You’re all caught up" /></div>}
    </>
  );
}
