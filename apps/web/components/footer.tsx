'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck, RotateCcw, Truck, Headphones } from 'lucide-react';
import { Logo } from './logo';
import { Newsletter } from './newsletter';

const COLUMNS = [
  { title: 'Shop', links: [['All products', '/products'], ['Today’s deals', '/deals'], ['Brands', '/brands'], ['Stores', '/sellers'], ['Wishlist', '/wishlist']] },
  { title: 'Business', links: [['Wholesale catalogue', '/wholesale'], ['Request a quote', '/business/rfqs/new'], ['Business account', '/business'], ['Payment options', '/pages/payments']] },
  { title: 'Sellers', links: [['Sell on IBazzzar', '/sell'], ['Seller hub', '/seller'], ['Seller agreement', '/pages/seller-agreement']] },
  { title: 'Help', links: [['Help centre', '/support'], ['Track an order', '/account/orders'], ['Returns & refunds', '/pages/returns'], ['Shipping & delivery', '/pages/shipping'], ['Contact support', '/support']] },
];

export function Footer() {
  const pathname = usePathname();
  if (/^\/(admin|seller|business)(\/|$)/.test(pathname)) return null;
  return (
    <footer className="surface-emerald mt-16 pb-20 md:pb-0">
      <div className="container-page grid grid-cols-2 md:grid-cols-4 gap-4 py-8 border-b border-white/10">
        {[[ShieldCheck, 'Secure payments', 'Card details never touch our servers'], [RotateCcw, 'Clear returns', 'Return window shown on every product'], [Truck, 'Order tracking', 'Every parcel tracked to your door'], [Headphones, 'Real support', 'Help from the IBazzzar team']].map(([Icon, title, body]) => {
          const I = Icon as typeof ShieldCheck;
          return (
            <div key={title as string} className="flex gap-3">
              <I size={22} className="text-gold-light shrink-0 mt-0.5" />
              <div><p className="font-semibold text-white text-[15px]">{title as string}</p><p className="text-[13px] text-white/65">{body as string}</p></div>
            </div>
          );
        })}
      </div>
      <div className="container-page grid gap-10 py-12 lg:grid-cols-[1.3fr_2fr_1.3fr]">
        <div>
          <Logo size="footer" plate />
          <p className="mt-4 text-white/70 text-[15px] max-w-xs">An intelligent digital mall for shoppers, businesses and independent sellers across India.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          {COLUMNS.map((c) => (
            <div key={c.title}>
              <p className="font-semibold text-gold-light mb-3">{c.title}</p>
              <ul className="grid gap-2 text-[14.5px] text-white/75">
                {c.links.map(([l, h]) => <li key={h}><Link href={h} className="hover:text-white">{l}</Link></li>)}
              </ul>
            </div>
          ))}
        </div>
        <Newsletter />
      </div>
      <div className="border-t border-white/10">
        <div className="container-page flex flex-wrap items-center justify-between gap-3 py-5 text-[13px] text-white/60">
          <p>© {new Date().getFullYear()} IBazzzar. All rights reserved.</p>
          <nav className="flex flex-wrap gap-4" aria-label="Legal">
            <Link href="/pages/terms" className="hover:text-white">Terms of use</Link>
            <Link href="/pages/privacy" className="hover:text-white">Privacy</Link>
            <Link href="/pages/returns" className="hover:text-white">Returns</Link>
            <Link href="/pages/shipping" className="hover:text-white">Shipping</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
