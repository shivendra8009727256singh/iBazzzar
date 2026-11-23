'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, MapPin, Truck, CreditCard, Banknote, Landmark, CheckCircle2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { api, post, newKey, ApiError } from '@/lib/api';
import { formatMoney, cn, pct } from '@/lib/format';
import type { Address, Order, PaymentInfo, Quote } from '@/lib/types';
import { useCart, useSession } from '@/components/providers';
import { useQuote } from '@/components/use-quote';
import { AddressFields, addressPayload, emptyAddress } from '@/components/address-form';
import { Alert, Button, Checkbox, Field, Input, Skeleton, Steps, useFormErrors, Empty } from '@/components/ui';
import { payDemo, payOnline } from '@/components/pay';

type Method = 'ONLINE' | 'COD' | 'BANK_TRANSFER';
const STEPS = ['Address', 'Delivery', 'Payment', 'Review'];

function Summary({ quote, fetching }: { quote?: Quote; fetching: boolean }) {
  if (!quote) return <Skeleton className="h-72" />;
  return (
    <aside className={cn('card card-pad lg:sticky lg:top-28 h-fit', fetching && 'opacity-60')} aria-label="Order summary">
      <h2 className="text-xl mb-4">Order summary</h2>
      <ul className="grid gap-3 mb-4 max-h-64 overflow-y-auto">
        {quote.lines.map((l) => (
          <li key={l.listingId} className="flex gap-3 items-center">
            <span className="relative size-12 shrink-0 rounded-lg bg-cream"><Image src={l.image} alt="" fill sizes="48px" className="object-contain p-1" unoptimized /><span className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-emerald text-white text-[11px] grid place-items-center">{l.quantity}</span></span>
            <span className="flex-1 min-w-0 text-sm"><span className="block truncate font-medium">{l.name}</span><span className="text-muted">{l.sellerName}</span></span>
            <span className="text-sm font-semibold">{formatMoney(l.totalPaise)}</span>
          </li>
        ))}
      </ul>
      <dl className="grid gap-2 text-[15px] border-t border-line pt-4">
        <div className="flex justify-between"><dt className="text-muted">Items</dt><dd>{formatMoney(quote.subtotalPaise)}</dd></div>
        {!!quote.discountPaise && <div className="flex justify-between text-success"><dt>Discount{quote.coupon ? ` (${quote.coupon.code})` : ''}</dt><dd>−{formatMoney(quote.discountPaise)}</dd></div>}
        <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd>{quote.shippingPaise ? formatMoney(quote.shippingPaise) : 'Free'}</dd></div>
        {!!quote.codFeePaise && <div className="flex justify-between"><dt className="text-muted">Cash on delivery fee</dt><dd>{formatMoney(quote.codFeePaise)}</dd></div>}
        <div className="flex justify-between border-t border-line pt-3 mt-1 text-lg font-bold"><dt>Total to pay</dt><dd>{formatMoney(quote.totalPaise)}</dd></div>
        {quote.taxPaise != null && <div className="flex justify-between text-[13px] text-muted"><dt>Includes GST</dt><dd>{formatMoney(quote.taxPaise)}</dd></div>}
      </dl>
    </aside>
  );
}

export default function CheckoutPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user, loading } = useSession();
  const { lines, mode, ready, clearLocal } = useCart();
  const [step, setStep] = useState(0);
  const [address, setAddress] = useState<Address>(emptyAddress);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [saveAddress, setSaveAddress] = useState(true);
  const [guest, setGuest] = useState({ name: '', email: '', phone: '', acceptTerms: false });
  const [method, setMethod] = useState<Method>(mode === 'BUSINESS' ? 'BANK_TRANSFER' : 'ONLINE');
  const [gstin, setGstin] = useState('');
  const [coupon, setCoupon] = useState<string | undefined>();
  useEffect(() => { try { setCoupon(sessionStorage.getItem('ibazzzar.coupon') || undefined); } catch { /* ignore */ } }, []);
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState<{ order: Order; payment: PaymentInfo } | null>(null);
  const [idempotencyKey] = useState(newKey);
  const errors = useFormErrors();

  const { data: saved } = useQuery({ queryKey: ['addresses'], queryFn: () => api<{ addresses: (Address & { id: string })[] }>('/account/addresses').then((r) => r.addresses), enabled: !!user });
  useEffect(() => {
    if (saved?.length && !addressId && !address.line1) {
      const d = saved.find((a) => a.isDefault) ?? saved[0];
      setAddressId(d.id); setAddress(d);
    }
  }, [saved, addressId, address.line1]);
  useEffect(() => { if (user && !guest.name) setAddress((a) => (a.name ? a : { ...a, name: user.name, phone: user.phone ?? '' })); }, [user, guest.name]);

  const addressReady = address.state && /^[1-9]\d{5}$/.test(address.pincode);
  const { data: quote, error: quoteError, isFetching } = useQuote({ lines, mode, couponCode: coupon, state: addressReady ? address.state : undefined, pincode: addressReady ? address.pincode : undefined, paymentMethod: step >= 2 ? method : undefined });
  const codAvailable = quote?.payment.cod.available;
  const methods = useMemo(() => [
    { id: 'ONLINE' as const, icon: CreditCard, title: 'Pay online', body: 'UPI, cards, net banking or wallets through Razorpay', show: true },
    { id: 'COD' as const, icon: Banknote, title: 'Cash on delivery', body: codAvailable ? `Pay when your parcel arrives · ${formatMoney(quote?.payment.cod.feePaise)} fee` : quote?.payment.cod.reason ?? 'Checking availability…', show: mode === 'RETAIL', disabled: !codAvailable },
    { id: 'BANK_TRANSFER' as const, icon: Landmark, title: 'Bank transfer (NEFT/RTGS)', body: 'Stock is held while we wait for your transfer; confirmed once finance matches it', show: mode === 'BUSINESS' },
  ].filter((m) => m.show), [codAvailable, quote, mode]);

  if (!ready || loading) return <div className="container-page py-10"><Skeleton className="h-96" /></div>;

  if (placed) {
    const o = placed.order;
    const awaiting = placed.payment.required;
    const pay = async () => {
      setBusy(true);
      try {
        if (placed.payment.provider === 'razorpay') { const r = await payOnline(o.id); if (r === 'dismissed') { setBusy(false); return; } }
        else await payDemo(o.id);
        qc.invalidateQueries();
        router.push(`/account/orders/${o.id}?placed=1`);
      } catch (e) { toast.error(e instanceof Error ? e.message : 'Payment failed'); setBusy(false); }
    };
    return (
      <div className="container-page py-12 max-w-2xl">
        <div className="card card-pad text-center">
          <CheckCircle2 size={48} className="mx-auto text-success" />
          <h1 className="text-3xl mt-3">{awaiting ? 'Your order is reserved' : 'Order confirmed'}</h1>
          <p className="text-muted mt-2">Order <strong className="text-ink">{o.number}</strong> · {formatMoney(o.totalPaise)}</p>
          {awaiting && o.paymentMethod === 'ONLINE' && (
            <div className="mt-6 grid gap-3">
              <p className="text-sm text-muted">We’re holding your items until {new Date(o.paymentDueAt!).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}. Complete payment to confirm.</p>
              <Button size="lg" loading={busy} onClick={pay}>{placed.payment.provider === 'demo' ? 'Simulate payment (demo — no money moves)' : `Pay ${formatMoney(o.totalPaise)} securely`}</Button>
            </div>
          )}
          {o.paymentMethod === 'BANK_TRANSFER' && <p className="mt-6 text-sm">Bank details and your reference are on the order page. Your items are held until {new Date(o.paymentDueAt!).toLocaleDateString('en-IN')}.</p>}
          <div className="mt-6 flex justify-center gap-3"><Link href={`/account/orders/${o.id}`} className="btn btn-outline">View order</Link><Link href="/products" className="btn btn-ghost">Continue shopping</Link></div>
        </div>
      </div>
    );
  }

  if (!lines.length) return <div className="container-page py-12"><div className="card"><Empty title="Nothing to check out" body="Your cart is empty." action={<Link href="/products" className="btn btn-primary">Browse products</Link>} /></div></div>;

  const toDelivery = () => {
    errors.clear();
    const local: Record<string, string> = {};
    if (!user) {
      if (guest.name.trim().length < 2) local.name = 'Please enter your name';
      if (!/^\S+@\S+\.\S+$/.test(guest.email)) local.email = 'Please enter a valid email';
      if (!/^[6-9]\d{9}$/.test(guest.phone)) local.phone = 'Please enter a valid 10-digit mobile number';
      if (!guest.acceptTerms) local.acceptTerms = 'Please accept the Terms of Use';
    }
    if (address.name.trim().length < 2) local['address.name'] = 'Please enter the recipient’s name';
    if (!/^[6-9]\d{9}$/.test(address.phone)) local['address.phone'] = 'Please enter a valid 10-digit mobile number';
    if (address.line1.trim().length < 5) local['address.line1'] = 'Please enter the full building and street';
    if (address.city.trim().length < 2) local['address.city'] = 'Please enter your city';
    if (!/^[1-9]\d{5}$/.test(address.pincode)) local['address.pincode'] = 'Please enter a valid 6-digit PIN code';
    if (!address.state) local['address.state'] = 'Please select your state';
    if (Object.keys(local).length) { errors.set(new ApiError('Please check the highlighted fields.', 400, local)); return; }
    setStep(1);
  };

  const place = async () => {
    if (!quote) return;
    setBusy(true); errors.clear();
    try {
      const res = await post<{ order: Order; payment: PaymentInfo }>('/checkout', {
        items: lines.map(({ listingId, quantity }) => ({ listingId, quantity })), mode, ...(coupon ? { couponCode: coupon } : {}),
        address: addressPayload(address), saveAddress: !!user && !addressId && saveAddress, paymentMethod: method,
        ...(gstin ? { billingGstin: gstin.toUpperCase() } : {}), expectedTotalPaise: quote.totalPaise,
        ...(!user ? { guest } : {}),
      }, { idempotencyKey });
      clearLocal(lines.map((l) => l.listingId));
      qc.invalidateQueries({ queryKey: ['me'] });
      setPlaced(res);
      if (res.payment.required && res.order.paymentMethod === 'ONLINE' && res.payment.provider === 'razorpay') {
        try { const r = await payOnline(res.order.id); if (r === 'paid') { router.push(`/account/orders/${res.order.id}?placed=1`); return; } } catch (e) { toast.error(e instanceof Error ? e.message : 'Payment failed'); }
      }
    } catch (e) {
      errors.set(e);
      if (e instanceof ApiError && e.status === 409 && e.fields.quote) qc.invalidateQueries({ queryKey: ['cart-quote'] });
    } finally { setBusy(false); }
  };

  const editButton = (to: number) => <button className="link text-sm inline-flex items-center gap-1" onClick={() => setStep(to)}><Pencil size={13} />Change</button>;

  return (
    <div className="container-page py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <h1 className="text-3xl flex items-center gap-2"><Lock size={22} className="text-forest" />Secure checkout</h1>
        <Steps steps={STEPS} current={step} />
      </div>
      {errors.message && <div className="mb-5"><Alert>{errors.message}</Alert></div>}
      {quoteError && <div className="mb-5"><Alert>{(quoteError as Error).message} <Link href="/cart" className="underline">Review your cart</Link></Alert></div>}

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="grid gap-5 content-start">
          {/* 1. Address */}
          <section className="card card-pad" aria-labelledby="s-address">
            <div className="flex items-center justify-between mb-4"><h2 id="s-address" className="text-xl flex items-center gap-2"><MapPin size={20} className="text-forest" />Delivery address</h2>{step > 0 && editButton(0)}</div>
            {step === 0 ? (
              <div className="grid gap-5">
                {!user && (
                  <div className="grid gap-4 sm:grid-cols-2 rounded-xl bg-cream p-4">
                    <p className="sm:col-span-2 text-sm">Checking out as a guest. Have an account? <Link href="/login?next=/checkout" className="link">Sign in</Link> — your cart comes with you.</p>
                    <Field label="Your name" required error={errors.field('name')}><Input value={guest.name} autoComplete="name" onChange={(e) => setGuest({ ...guest, name: e.target.value })} /></Field>
                    <Field label="Email" required error={errors.field('email')} hint="For your order confirmation"><Input type="email" autoComplete="email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} /></Field>
                    <Field label="Mobile number" required error={errors.field('phone')}><Input inputMode="numeric" maxLength={10} value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value.replace(/\D/g, '') })} /></Field>
                    <div className="sm:col-span-2"><Checkbox checked={guest.acceptTerms} onChange={(e) => setGuest({ ...guest, acceptTerms: e.target.checked })} error={errors.field('acceptTerms')} label={<>I accept the <Link href="/pages/terms" className="link">Terms of Use</Link> and <Link href="/pages/privacy" className="link">Privacy Policy</Link>. An account is created so I can track this order.</>} /></div>
                  </div>
                )}
                {saved && saved.length > 0 && (
                  <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Saved addresses">
                    {saved.map((a) => (
                      <label key={a.id} className={cn('rounded-xl border p-3 cursor-pointer text-sm', addressId === a.id ? 'border-emerald bg-mint' : 'border-line')}>
                        <input type="radio" className="sr-only" name="addr" checked={addressId === a.id} onChange={() => { setAddressId(a.id); setAddress(a); }} />
                        <span className="font-semibold">{a.label} · {a.name}</span><span className="block text-muted">{a.line1}, {a.city}, {a.state} {a.pincode}</span>
                      </label>
                    ))}
                    <button className={cn('rounded-xl border border-dashed p-3 text-sm font-semibold', !addressId ? 'border-emerald text-emerald' : 'border-line-strong text-muted')} onClick={() => { setAddressId(null); setAddress({ ...emptyAddress, name: user?.name ?? '', phone: user?.phone ?? '' }); }}>+ New address</button>
                  </div>
                )}
                {!addressId && <AddressFields value={address} onChange={setAddress} errors={Object.fromEntries(['name', 'phone', 'line1', 'line2', 'city', 'state', 'pincode'].map((k) => [`address.${k}`, errors.field(`address.${k}`)]))} />}
                {user && !addressId && <Checkbox checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} label="Save this address for next time" />}
                {mode === 'BUSINESS' && <Field label="GSTIN for the invoice (optional)" hint="Claim input tax credit on the seller’s invoice"><Input value={gstin} maxLength={15} className="uppercase" onChange={(e) => setGstin(e.target.value)} /></Field>}
                <Button size="lg" onClick={toDelivery} className="justify-self-start">Continue to delivery</Button>
              </div>
            ) : (
              <p className="text-[15px]"><strong>{address.name}</strong>, {address.line1}{address.line2 ? `, ${address.line2}` : ''}, {address.city}, {address.state} {address.pincode} · {address.phone}</p>
            )}
          </section>

          {/* 2. Delivery */}
          <section className={cn('card card-pad', step < 1 && 'opacity-60')} aria-labelledby="s-delivery">
            <div className="flex items-center justify-between mb-4"><h2 id="s-delivery" className="text-xl flex items-center gap-2"><Truck size={20} className="text-forest" />Delivery</h2>{step > 1 && editButton(1)}</div>
            {step >= 1 && quote && (
              <div className="grid gap-3">
                {quote.sellers.map((g) => (
                  <div key={g.sellerId} className="rounded-xl border border-line p-4 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span><strong>{g.sellerName}</strong> · {quote.lines.filter((l) => l.sellerId === g.sellerId).length} item(s)</span>
                    {g.estimate?.serviceable === false ? <span className="text-danger font-medium">{g.estimate.reason}</span>
                      : <span>{g.estimate ? `Arrives in ${g.estimate.minDays}–${g.estimate.maxDays} days` : 'Standard delivery'} · <strong>{g.shippingPaise ? formatMoney(g.shippingPaise) : 'Free'}</strong></span>}
                  </div>
                ))}
                <p className="text-[13px] text-muted">Each seller ships separately. Dates are estimates from your PIN code, not courier guarantees.</p>
                {step === 1 && <Button size="lg" className="justify-self-start" disabled={!quote.serviceable} onClick={() => setStep(2)}>Continue to payment</Button>}
              </div>
            )}
          </section>

          {/* 3. Payment */}
          <section className={cn('card card-pad', step < 2 && 'opacity-60')} aria-labelledby="s-payment">
            <div className="flex items-center justify-between mb-4"><h2 id="s-payment" className="text-xl flex items-center gap-2"><CreditCard size={20} className="text-forest" />Payment</h2>{step > 2 && editButton(2)}</div>
            {step >= 2 && (
              <div className="grid gap-3" role="radiogroup" aria-label="Payment method">
                {methods.map((m) => (
                  <label key={m.id} className={cn('flex items-start gap-3 rounded-xl border p-4', m.disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer', method === m.id ? 'border-emerald bg-mint' : 'border-line')}>
                    <input type="radio" name="method" className="checkbox" disabled={m.disabled} checked={method === m.id} onChange={() => setMethod(m.id)} />
                    <m.icon size={20} className="text-forest shrink-0 mt-0.5" />
                    <span><span className="font-semibold block">{m.title}</span><span className="text-sm text-muted">{m.body}</span></span>
                  </label>
                ))}
                {step === 2 && <Button size="lg" className="justify-self-start" onClick={() => setStep(3)} disabled={method === 'COD' && !codAvailable}>Review order</Button>}
              </div>
            )}
          </section>

          {/* 4. Review */}
          {step === 3 && quote && (
            <section className="card card-pad" aria-labelledby="s-review">
              <h2 id="s-review" className="text-xl mb-3">Review and place order</h2>
              <p className="text-sm text-muted">By placing this order you agree to the <Link href="/pages/terms" className="link">Terms</Link> and the sellers’ <Link href="/pages/returns" className="link">return policy</Link>. Prices include GST{quote.lines.some((l) => l.taxRateBps) ? ` (${[...new Set(quote.lines.map((l) => l.taxRateBps))].filter(Boolean).map(pct).join(', ')})` : ''}; there are no other charges.</p>
              <Button size="lg" className="w-full mt-5" loading={busy} onClick={place}>
                {method === 'COD' ? `Place order · pay ${formatMoney(quote.totalPaise)} on delivery` : method === 'BANK_TRANSFER' ? `Place order · ${formatMoney(quote.totalPaise)} by bank transfer` : `Place order and pay ${formatMoney(quote.totalPaise)}`}
              </Button>
            </section>
          )}
        </div>
        <Summary quote={quote} fetching={isFetching} />
      </div>
    </div>
  );
}
