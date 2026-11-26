'use client';
import { formatDate, formatMoney, label, pct } from '@/lib/format';
import { Logo } from './logo';
import { DocActions } from './business-bits';

type Addr = { line1?: string; line2?: string; city?: string; state?: string; pincode?: string } | null | undefined;
export type PoDocument = {
  id: string; number: string; status: string; date: string; paymentTerms: string; intraState: boolean;
  buyer: { legalName: string; tradeName: string | null; gstin: string | null; address: Addr; phone: string | null };
  supplier: { name: string; tradeName: string; gstin: string | null; pan: string | null; gstRegistered: boolean; address: Addr; phone: string | null } | null;
  rfq: { number: string; title: string; deliveryPincode: string; neededBy: string | null } | null;
  terms: string; deliveryDays: number | null; quoteValidUntil: string | null;
  requestedBy: string | null; approvedBy: string | null; approvedAt: string | null; confirmedAt: string | null;
  lines: { n: number; name: string; variantLabel: string; sku: string; hsnCode: string | null; quantity: number; unitPaise: number; taxRateBps: number; totalPaise: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number }[];
  shipping: { totalPaise: number; taxablePaise: number; taxPaise: number };
  totals: { taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; taxPaise: number; totalPaise: number };
};

const addr = (a: Addr) => (a ? [a.line1, a.line2, a.city, a.state && `${a.state} ${a.pincode ?? ''}`].filter(Boolean).join(', ') : '—');

/** Indian rupees in words, e.g. "Rupees Twelve Thousand Five Hundred and Paise Fifty Only". */
function inWords(paise: number) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n: number) => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ''}`);
  const three = (n: number) => `${n >= 100 ? `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ' ' : ''}` : ''}${n % 100 ? two(n % 100) : ''}`;
  const words = (n: number): string => {
    if (!n) return 'Zero';
    const parts: string[] = [];
    const crore = Math.floor(n / 10_000_000); n %= 10_000_000;
    const lakh = Math.floor(n / 100_000); n %= 100_000;
    const thousand = Math.floor(n / 1000); n %= 1000;
    if (crore) parts.push(`${words(crore)} Crore`);
    if (lakh) parts.push(`${two(lakh)} Lakh`);
    if (thousand) parts.push(`${two(thousand)} Thousand`);
    if (n) parts.push(three(n));
    return parts.join(' ');
  };
  const r = Math.floor(paise / 100); const p = paise % 100;
  return `Rupees ${words(r)}${p ? ` and Paise ${two(p)}` : ''} Only`;
}

/** Printable purchase order in the usual Indian B2B format: parties with GSTINs, HSN-wise lines, GST split, terms, sign-off. */
export function PurchaseOrderView({ doc: d }: { doc: PoDocument }) {
  const intra = d.intraState;
  return (
    <div>
      <div className="flex justify-end mb-4"><DocActions /></div>
      <article className="bg-white border border-line rounded-2xl p-6 md:p-8 text-[13.5px] print:border-0 print:p-0 print:rounded-none">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-emerald pb-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold-ink">Purchase order</p>
            <h1 className="text-[28px] leading-tight mt-1">{d.number}</h1>
            <p className="text-muted mt-1">Date {formatDate(d.date)} · Status {label(d.status)}</p>
            {d.rfq && <p className="text-muted">Against request {d.rfq.number} · “{d.rfq.title}”</p>}
          </div>
          <div className="text-right"><Logo size="footer" /><p className="text-[11px] text-muted mt-1 max-w-[240px]">Raised through the IBazzzar marketplace</p></div>
        </header>

        <div className="grid md:grid-cols-2 gap-6 py-5 border-b border-line">
          <div className="rounded-xl bg-cream/60 p-4 print:bg-transparent print:p-0">
            <p className="eyebrow mb-1">Buyer (bill to)</p>
            <p className="font-semibold text-[15px]">{d.buyer.legalName}</p>
            {d.buyer.tradeName && d.buyer.tradeName !== d.buyer.legalName && <p>{d.buyer.tradeName}</p>}
            <p className="text-muted">{addr(d.buyer.address)}</p>
            <p className="mt-1">GSTIN: <strong>{d.buyer.gstin ?? 'Unregistered'}</strong></p>
            {d.buyer.phone && <p>Phone: {d.buyer.phone}</p>}
          </div>
          <div className="rounded-xl bg-cream/60 p-4 print:bg-transparent print:p-0">
            <p className="eyebrow mb-1">Supplier</p>
            <p className="font-semibold text-[15px]">{d.supplier?.name}</p>
            {d.supplier?.tradeName && <p>{d.supplier.tradeName}</p>}
            <p className="text-muted">{addr(d.supplier?.address)}</p>
            <p className="mt-1">GSTIN: <strong>{d.supplier?.gstin ?? 'Unregistered'}</strong>{d.supplier?.pan ? ` · PAN ${d.supplier.pan}` : ''}</p>
            {d.supplier?.phone && <p>Phone: {d.supplier.phone}</p>}
          </div>
        </div>

        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4 border-b border-line">
          <div><dt className="text-[11.5px] text-muted">Payment terms</dt><dd className="font-semibold">{d.paymentTerms === 'PREPAID' ? 'Advance payment' : label(d.paymentTerms)}</dd></div>
          <div><dt className="text-[11.5px] text-muted">Delivery</dt><dd className="font-semibold">{d.deliveryDays ? `Within ${d.deliveryDays} days` : '—'}</dd></div>
          <div><dt className="text-[11.5px] text-muted">Deliver to PIN</dt><dd className="font-semibold">{d.rfq?.deliveryPincode ?? '—'}</dd></div>
          <div><dt className="text-[11.5px] text-muted">Tax</dt><dd className="font-semibold">{intra ? 'CGST + SGST' : 'IGST'}</dd></div>
        </dl>

        <div className="overflow-x-auto py-4">
          <table className="w-full text-[12.5px] border-collapse">
            <thead>
              <tr className="bg-emerald text-white print:bg-transparent print:text-ink">
                <th className="p-2 text-left">#</th><th className="p-2 text-left">Item</th><th className="p-2 text-left">HSN</th>
                <th className="p-2 text-right">Qty</th><th className="p-2 text-right">Rate (incl. GST)</th><th className="p-2 text-right">Taxable</th>
                <th className="p-2 text-right">GST</th>{intra ? <><th className="p-2 text-right">CGST</th><th className="p-2 text-right">SGST</th></> : <th className="p-2 text-right">IGST</th>}
                <th className="p-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {d.lines.map((l) => (
                <tr key={l.n} className="border-b border-line">
                  <td className="p-2">{l.n}</td>
                  <td className="p-2"><span className="font-medium">{l.name}</span>{l.variantLabel && l.variantLabel !== 'Standard' ? ` · ${l.variantLabel}` : ''}{l.sku && <span className="block text-muted text-[11px]">SKU {l.sku}</span>}</td>
                  <td className="p-2">{l.hsnCode ?? '—'}</td>
                  <td className="p-2 text-right tabular-nums">{l.quantity}</td>
                  <td className="p-2 text-right tabular-nums">{formatMoney(l.unitPaise)}</td>
                  <td className="p-2 text-right tabular-nums">{formatMoney(l.taxablePaise)}</td>
                  <td className="p-2 text-right">{pct(l.taxRateBps)}</td>
                  {intra ? <><td className="p-2 text-right tabular-nums">{formatMoney(l.cgstPaise)}</td><td className="p-2 text-right tabular-nums">{formatMoney(l.sgstPaise)}</td></> : <td className="p-2 text-right tabular-nums">{formatMoney(l.igstPaise)}</td>}
                  <td className="p-2 text-right font-semibold tabular-nums">{formatMoney(l.totalPaise)}</td>
                </tr>
              ))}
              {d.shipping.totalPaise > 0 && (
                <tr className="border-b border-line">
                  <td className="p-2" /><td className="p-2">Delivery charges</td><td className="p-2">996511</td><td className="p-2" /><td className="p-2" />
                  <td className="p-2 text-right tabular-nums">{formatMoney(d.shipping.taxablePaise)}</td><td className="p-2 text-right">18%</td>
                  {intra ? <td className="p-2 text-right tabular-nums" colSpan={2}>{formatMoney(d.shipping.taxPaise)}</td> : <td className="p-2 text-right tabular-nums">{formatMoney(d.shipping.taxPaise)}</td>}
                  <td className="p-2 text-right font-semibold tabular-nums">{formatMoney(d.shipping.totalPaise)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap justify-between gap-6">
          <p className="max-w-md text-[12.5px]"><span className="text-muted">Amount in words:</span><br /><strong>{inWords(d.totals.totalPaise)}</strong></p>
          <dl className="min-w-[260px] grid gap-1.5">
            <div className="flex justify-between"><dt className="text-muted">Taxable value</dt><dd className="tabular-nums">{formatMoney(d.totals.taxablePaise)}</dd></div>
            {intra ? <><div className="flex justify-between"><dt className="text-muted">CGST</dt><dd className="tabular-nums">{formatMoney(d.totals.cgstPaise)}</dd></div><div className="flex justify-between"><dt className="text-muted">SGST</dt><dd className="tabular-nums">{formatMoney(d.totals.sgstPaise)}</dd></div></>
              : <div className="flex justify-between"><dt className="text-muted">IGST</dt><dd className="tabular-nums">{formatMoney(d.totals.igstPaise)}</dd></div>}
            <div className="flex justify-between border-t-2 border-emerald pt-2 text-[16px] font-bold"><dt>PO total</dt><dd className="tabular-nums">{formatMoney(d.totals.totalPaise)}</dd></div>
          </dl>
        </div>

        {d.terms && <section className="mt-6"><p className="eyebrow mb-1">Terms agreed with the supplier</p><p className="whitespace-pre-line">{d.terms}</p></section>}

        <div className="mt-8 grid sm:grid-cols-3 gap-6 text-[12.5px]">
          <div className="border-t border-line pt-2"><p className="text-muted">Requested by</p><p className="font-semibold">{d.requestedBy ?? '—'}</p></div>
          <div className="border-t border-line pt-2"><p className="text-muted">Approved by</p><p className="font-semibold">{d.approvedBy ?? 'Pending'}</p>{d.approvedAt && <p className="text-muted">{formatDate(d.approvedAt)}</p>}</div>
          <div className="border-t border-line pt-2"><p className="text-muted">Supplier confirmation</p><p className="font-semibold">{d.confirmedAt ? `Confirmed ${formatDate(d.confirmedAt)}` : 'Awaiting'}</p></div>
        </div>
        <p className="mt-6 text-[11px] text-muted">Prices are tax-inclusive as agreed in the accepted quotation. The supplier issues the GST tax invoice when goods ship. This is a computer-generated purchase order and does not require a signature.</p>
      </article>
    </div>
  );
}
