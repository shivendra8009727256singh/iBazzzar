'use client';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronRight } from 'lucide-react';
import type { Order } from '@/lib/types';
import { formatDate, formatMoney, ORDER_STATUS_TEXT, PAYMENT_TEXT } from '@/lib/format';
import { StatusBadge, Badge } from './ui';

export function OrderRow({ order: o, href }: { order: Order; href: string }) {
  const images = o.parcels.flatMap((p) => p.items).slice(0, 3);
  return (
    <Link href={href} className="card p-4 md:p-5 flex flex-wrap md:flex-nowrap items-center gap-4 hover:shadow-lift transition">
      <div className="flex -space-x-3">
        {images.map((i) => <span key={i.id} className="relative size-14 rounded-xl border-2 border-white bg-cream overflow-hidden"><Image src={i.image ?? '/products/placeholder.svg'} alt="" fill sizes="56px" className="object-contain p-1" unoptimized /></span>)}
      </div>
      <div className="flex-1 min-w-[180px]">
        <p className="font-semibold">{o.number}</p>
        <p className="text-sm text-muted">{formatDate(o.createdAt)} · {o.itemCount} item{o.itemCount === 1 ? '' : 's'}{o.placedBy ? ` · by ${o.placedBy}` : ''}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <StatusBadge status={o.status} text={ORDER_STATUS_TEXT[o.status]} />
        <StatusBadge status={o.paymentStatus} text={PAYMENT_TEXT[o.paymentStatus]} />
        {o.mode === 'BUSINESS' && <Badge tone="info">Business</Badge>}
        {o.demo && <Badge tone="gold">Demo</Badge>}
      </div>
      <p className="price md:w-28 md:text-right">{formatMoney(o.totalPaise)}</p>
      <ChevronRight size={18} className="text-muted hidden md:block" />
    </Link>
  );
}

const TRACK = ['CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED'];
export function ParcelProgress({ status }: { status: string }) {
  if (status === 'CANCELLED') return <p className="text-sm text-danger font-medium">This parcel was cancelled</p>;
  const index = status === 'PENDING' ? 0 : TRACK.indexOf(status);
  return (
    <ol className="grid grid-cols-4 gap-1" aria-label="Parcel progress">
      {TRACK.map((s, i) => (
        <li key={s} className="grid gap-1.5" aria-current={i === index ? 'step' : undefined}>
          <span className={`h-1.5 rounded-full ${i <= index ? 'bg-forest' : 'bg-mint'}`} />
          <span className={`text-[12px] ${i <= index ? 'text-ink font-semibold' : 'text-muted'}`}>{s.charAt(0) + s.slice(1).toLowerCase()}</span>
        </li>
      ))}
    </ol>
  );
}
