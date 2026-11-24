'use client';
import { ShieldCheck, BadgePercent } from 'lucide-react';
import type { Quote } from '@/lib/types';
import { cn, formatMoney } from '@/lib/format';
import { Skeleton } from './ui';

/** The "Price details" box used in the cart and at checkout: MRP, savings, coupon, delivery and the amount to pay. */
export function PriceDetails({ quote, fetching, children, showTax }: { quote?: Quote; fetching?: boolean; children?: React.ReactNode; showTax?: boolean }) {
  if (!quote) return <Skeleton className="h-72 rounded-2xl" />;
  const items = quote.lines.reduce((s, l) => s + l.quantity, 0);
  const mrp = quote.lines.reduce((s, l) => s + Math.max(l.mrpPaise, l.unitPaise) * l.quantity, 0);
  const productDiscount = Math.max(0, mrp - quote.subtotalPaise);
  const saving = productDiscount + quote.discountPaise;
  return (
    <section id="price" className={cn('rounded-2xl border border-line bg-white shadow-card overflow-hidden transition-opacity scroll-mt-32', fetching && 'opacity-60')} aria-label="Price details">
      <h2 className="px-5 py-3.5 border-b border-line text-[13px] font-bold uppercase tracking-[0.1em] text-muted">Price details</h2>
      <dl className="px-5 py-4 grid gap-3 text-[15px]">
        <div className="flex justify-between"><dt>Price ({items} item{items === 1 ? '' : 's'})</dt><dd className="tabular-nums">{formatMoney(mrp)}</dd></div>
        {productDiscount > 0 && <div className="flex justify-between"><dt>Discount</dt><dd className="text-success tabular-nums">−{formatMoney(productDiscount)}</dd></div>}
        {quote.discountPaise > 0 && <div className="flex justify-between"><dt>Coupon{quote.coupon ? ` (${quote.coupon.code})` : ''}</dt><dd className="text-success tabular-nums">−{formatMoney(quote.discountPaise)}</dd></div>}
        <div className="flex justify-between"><dt>Delivery charges</dt><dd className="tabular-nums">{quote.shippingPaise ? formatMoney(quote.shippingPaise) : <span className="text-success font-semibold">Free</span>}</dd></div>
        {!!quote.codFeePaise && <div className="flex justify-between"><dt>Cash on delivery fee</dt><dd className="tabular-nums">{formatMoney(quote.codFeePaise)}</dd></div>}
        <div className="flex justify-between border-t border-dashed border-line-strong pt-3 mt-1 text-[18px] font-bold"><dt>Total amount</dt><dd className="tabular-nums">{formatMoney(quote.totalPaise)}</dd></div>
        {showTax && quote.taxPaise != null && <div className="flex justify-between text-[12.5px] text-muted -mt-1"><dt>Includes GST</dt><dd>{formatMoney(quote.taxPaise)}</dd></div>}
      </dl>
      {saving > 0 && <p className="mx-5 mb-4 rounded-lg bg-success-bg text-success px-3 py-2 text-[14px] font-semibold flex items-center gap-2"><BadgePercent size={17} />You will save {formatMoney(saving)} on this order</p>}
      {children && <div className="px-5 pb-5">{children}</div>}
      <p className="border-t border-line px-5 py-3 text-[12.5px] text-muted flex items-center gap-2"><ShieldCheck size={16} className="text-forest shrink-0" />Safe and secure payments. Easy returns. 100% genuine products from verified sellers.</p>
    </section>
  );
}
