'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck, RotateCcw, Truck, Headphones, Mail, Phone, MapPin, MessageCircle, Clock, Instagram, Facebook, Youtube, Linkedin, Twitter } from 'lucide-react';
import { Logo } from './logo';
import { Newsletter } from './newsletter';
import { useSite } from './site-context';

const COLUMNS = [
  { title: 'Shop', links: [['All products', '/products'], ['Today’s deals', '/deals'], ['Brands', '/brands'], ['Stores', '/sellers'], ['Wishlist', '/wishlist']] },
  { title: 'Business', links: [['Wholesale catalogue', '/wholesale'], ['Request a quote', '/business/rfqs/new'], ['Business account', '/business'], ['Payment options', '/pages/payments']] },
  { title: 'Sellers', links: [['Sell with us', '/sell'], ['Seller hub', '/seller'], ['Seller agreement', '/pages/seller-agreement']] },
  { title: 'Help', links: [['Help centre', '/support'], ['Track an order', '/account/orders'], ['Returns & refunds', '/pages/returns'], ['Shipping & delivery', '/pages/shipping'], ['Contact support', '/support']] },
];

export function Footer() {
  const pathname = usePathname();
  const site = useSite();
  if (/^\/(admin|seller|business)(\/|$)/.test(pathname)) return null;
  const a = site.address;
  const address = [a.line1, a.line2, [a.city, a.state].filter(Boolean).join(', '), a.pincode].filter(Boolean).join(', ');
  const socials = ([['instagram', Instagram, 'Instagram'], ['facebook', Facebook, 'Facebook'], ['x', Twitter, 'X'], ['youtube', Youtube, 'YouTube'], ['linkedin', Linkedin, 'LinkedIn']] as const).filter(([k]) => site.socials[k]);
  return (
    <footer className="surface-emerald mt-16 pb-20 md:pb-0">
      <div className="container-page grid grid-cols-2 md:grid-cols-4 gap-4 py-8 border-b border-white/10">
        {[[ShieldCheck, 'Secure payments', 'Card details never touch our servers'], [RotateCcw, 'Clear returns', 'Return window shown on every product'], [Truck, 'Order tracking', 'Every parcel tracked to your door'], [Headphones, 'Real support', `Help from the ${site.siteName} team`]].map(([Icon, title, body]) => {
          const I = Icon as typeof ShieldCheck;
          return (
            <div key={title as string} className="flex gap-3">
              <span className="size-10 shrink-0 rounded-xl bg-white/8 grid place-items-center"><I size={20} className="text-gold-light" /></span>
              <div><p className="font-semibold text-white text-[15px]">{title as string}</p><p className="text-[13px] text-white/65">{body as string}</p></div>
            </div>
          );
        })}
      </div>
      <div className="container-page grid gap-10 py-12 lg:grid-cols-[1.4fr_2fr_1.3fr]">
        <div>
          <Logo size="footer" plate />
          <p className="mt-4 text-white/70 text-[15px] max-w-xs">{site.about}</p>
          <ul className="mt-5 grid gap-2 text-[14px] text-white/75">
            {site.supportPhone && <li><a href={`tel:${site.supportPhone.replace(/[^\d+]/g, '')}`} className="flex items-center gap-2 hover:text-white"><Phone size={15} className="text-gold-light" />{site.supportPhone}</a></li>}
            {site.whatsapp && <li><a href={`https://wa.me/91${site.whatsapp}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-white"><MessageCircle size={15} className="text-gold-light" />WhatsApp +91 {site.whatsapp}</a></li>}
            {site.supportEmail && <li><a href={`mailto:${site.supportEmail}`} className="flex items-center gap-2 hover:text-white"><Mail size={15} className="text-gold-light" />{site.supportEmail}</a></li>}
            {site.supportHours && <li className="flex items-center gap-2"><Clock size={15} className="text-gold-light" />{site.supportHours}</li>}
            {address && <li className="flex items-start gap-2"><MapPin size={15} className="text-gold-light mt-0.5 shrink-0" /><span>{address}</span></li>}
          </ul>
          {socials.length > 0 && (
            <div className="flex gap-2 mt-5">
              {socials.map(([k, Icon, label]) => <a key={k} href={site.socials[k]} target="_blank" rel="noopener noreferrer" aria-label={`${site.siteName} on ${label}`} className="size-9 rounded-full bg-white/10 grid place-items-center hover:bg-gold-light hover:text-deep transition"><Icon size={16} /></a>)}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          {COLUMNS.map((c) => (
            <div key={c.title}>
              <p className="font-semibold text-gold-light mb-3">{c.title}</p>
              <ul className="grid gap-2 text-[14.5px] text-white/75">
                {c.links.map(([l, h]) => <li key={`${h}:${l}`}><Link href={h} className="hover:text-white">{l}</Link></li>)}
              </ul>
            </div>
          ))}
        </div>
        <Newsletter />
      </div>
      <div className="border-t border-white/10">
        <div className="container-page flex flex-wrap items-center justify-between gap-3 py-5 text-[13px] text-white/60">
          <p>© {new Date().getFullYear()} {site.legalName || site.siteName}. All rights reserved.{site.gstin && <span className="ml-2">GSTIN {site.gstin}</span>}</p>
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
