'use client';
import { Printer } from 'lucide-react';
import { formatDate, formatMoney, pct } from '@/lib/format';
import { Logo } from './logo';

export type Invoice = {
  number: string; financialYear: string; issuedAt: string; orderNumber: string; orderDate: string;
  seller: { name: string; tradeName: string; gstin: string | null; pan: string | null; address: { line1: string; city: string; state: string; pincode: string }; stateCode: string; gstRegistered: boolean };
  buyer: { name: string; tradeName?: string | null; address: Addr | null; gstin: string | null; business?: boolean };
  shipTo?: { name: string; address: Addr };
  placeOfSupply: string; reverseCharge: boolean;
  items: { name: string; variantLabel: string; sku: string; hsnCode: string | null; quantity: number; unitPaise: number; discountPaise: number; taxablePaise: number; taxRateBps: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number }[];
  totals: { taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; shippingPaise: number; totalPaise: number };
  note: string | null;
};

type Addr = { line1?: string; line2?: string; city?: string; state?: string; pincode?: string };
const fmtAddr = (a: Addr) => [a.line1, a.line2, a.city, a.state && `${a.state} ${a.pincode ?? ''}`].filter(Boolean).join(', ');

/** Printable GST tax invoice (or bill of supply for unregistered sellers), issued by the seller. */
export function InvoiceView({ invoice: v }: { invoice: Invoice }) {
  const intra = v.totals.igstPaise === 0;
  return (
    <div className="bg-white">
      <div className="flex justify-end mb-4 print:hidden"><button className="btn btn-outline btn-sm" onClick={() => window.print()}><Printer size={15} />Print or save as PDF</button></div>
      <article className="border border-line rounded-2xl p-6 md:p-8 text-[14px] print:border-0 print:p-0">
        <header className="flex flex-wrap justify-between gap-6 border-b border-line pb-5">
          <div>
            <h1 className="text-2xl">{v.seller.gstRegistered ? 'Tax Invoice' : 'Bill of Supply'}</h1>
            <p className="mt-1">Invoice <strong>{v.number}</strong> · {formatDate(v.issuedAt)}</p>
            <p className="text-muted">Order {v.orderNumber} · {formatDate(v.orderDate)}</p>
          </div>
          <div className="text-right"><Logo size="footer" /><p className="text-xs text-muted mt-1">Marketplace operator. The seller below is the supplier.</p></div>
        </header>
        <div className="grid md:grid-cols-2 gap-6 py-5 border-b border-line">
          <div>
            <p className="eyebrow mb-1">Sold by</p>
            <p className="font-semibold">{v.seller.name}</p>
            <p>{v.seller.tradeName}</p>
            <p className="text-muted">{v.seller.address.line1}, {v.seller.address.city}, {v.seller.address.state} {v.seller.address.pincode}</p>
            {v.seller.gstin && <p>GSTIN: <strong>{v.seller.gstin}</strong></p>}
            {v.seller.pan && <p>PAN: {v.seller.pan}</p>}
          </div>
          <div>
            <p className="eyebrow mb-1">{v.buyer.business ? 'Bill to' : 'Bill and ship to'}</p>
            <p className="font-semibold">{v.buyer.name}</p>
            {v.buyer.tradeName && v.buyer.tradeName !== v.buyer.name && <p>{v.buyer.tradeName}</p>}
            {v.buyer.address && <p className="text-muted">{fmtAddr(v.buyer.address)}</p>}
            {v.buyer.gstin && <p>GSTIN: <strong>{v.buyer.gstin}</strong></p>}
            {v.buyer.business && v.shipTo && (
              <div className="mt-3">
                <p className="eyebrow mb-1">Ship to</p>
                <p className="font-semibold">{v.shipTo.name}</p>
                <p className="text-muted">{fmtAddr(v.shipTo.address)}</p>
              </div>
            )}
            <p className="mt-1">Place of supply: state code {v.placeOfSupply} · Reverse charge: {v.reverseCharge ? 'Yes' : 'No'}</p>
          </div>
        </div>
        <div className="overflow-x-auto py-5">
          <table className="table text-[13px]">
            <thead><tr><th>Item</th><th>HSN</th><th className="text-right">Qty</th><th className="text-right">Taxable value</th><th className="text-right">GST</th>{intra ? <><th className="text-right">CGST</th><th className="text-right">SGST</th></> : <th className="text-right">IGST</th>}<th className="text-right">Total</th></tr></thead>
            <tbody>
              {v.items.map((i, n) => (
                <tr key={n}>
                  <td><span className="font-medium">{i.name}</span>{i.variantLabel !== 'Standard' ? ` · ${i.variantLabel}` : ''}<span className="block text-muted">SKU {i.sku}</span></td>
                  <td>{i.hsnCode ?? '—'}</td><td className="text-right">{i.quantity}</td><td className="text-right">{formatMoney(i.taxablePaise)}</td><td className="text-right">{pct(i.taxRateBps)}</td>
                  {intra ? <><td className="text-right">{formatMoney(i.cgstPaise)}</td><td className="text-right">{formatMoney(i.sgstPaise)}</td></> : <td className="text-right">{formatMoney(i.igstPaise)}</td>}
                  <td className="text-right font-semibold">{formatMoney(i.totalPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="ml-auto max-w-xs grid gap-1.5">
          <div className="flex justify-between"><dt className="text-muted">Taxable value</dt><dd>{formatMoney(v.totals.taxablePaise)}</dd></div>
          {intra ? <><div className="flex justify-between"><dt className="text-muted">CGST</dt><dd>{formatMoney(v.totals.cgstPaise)}</dd></div><div className="flex justify-between"><dt className="text-muted">SGST</dt><dd>{formatMoney(v.totals.sgstPaise)}</dd></div></>
            : <div className="flex justify-between"><dt className="text-muted">IGST</dt><dd>{formatMoney(v.totals.igstPaise)}</dd></div>}
          <div className="flex justify-between"><dt className="text-muted">Delivery (incl. GST)</dt><dd>{formatMoney(v.totals.shippingPaise)}</dd></div>
          <div className="flex justify-between border-t border-line pt-2 font-bold text-base"><dt>Invoice total</dt><dd>{formatMoney(v.totals.totalPaise)}</dd></div>
        </dl>
        {v.note && <p className="mt-5 text-muted">{v.note}</p>}
        <p className="mt-6 text-xs text-muted">This is a computer-generated document issued by the seller through IBazzzar and does not require a signature.</p>
      </article>
    </div>
  );
}
