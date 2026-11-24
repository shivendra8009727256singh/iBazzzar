'use client';
import Image from 'next/image';
import { BadgeCheck, Lock, Truck, Building2 } from 'lucide-react';
import { Logo } from './logo';
import { useSite } from './site-context';

/** Split layout for sign-in and registration: form card on the left, brand panel on the right. */
export function AuthShell({ title, subtitle, children, wide }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  const site = useSite();
  return (
    <div className="relative bg-[#f3f5f0] -mb-16 pb-16 min-h-[calc(100vh-140px)] overflow-hidden">
      <span className="absolute -left-24 -top-24 size-80 rounded-full bg-mint blur-2xl" aria-hidden />
      <span className="absolute -left-10 bottom-0 size-64 rounded-full bg-gold/10 blur-2xl" aria-hidden />
      <div className="relative container-page py-6 md:py-10 grid gap-6 lg:grid-cols-[1fr_0.9fr] items-stretch">
        <div className="flex justify-center items-start min-w-0">
          <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-3xl bg-white border border-line shadow-lift p-5 sm:p-8`}>
            <h1 className="text-3xl md:text-[34px]">{title}</h1>
            {subtitle && <p className="text-muted mt-2">{subtitle}</p>}
            <div className="mt-7">{children}</div>
          </div>
        </div>
        <div className="hidden lg:flex relative rounded-3xl overflow-hidden surface-emerald shadow-lift min-h-[560px]">
          <Image src="/images/mall-concept.webp" alt="" fill sizes="45vw" className="object-cover object-[72%_center] opacity-55" />
          <div className="absolute inset-0 bg-gradient-to-t from-deep via-deep/60 to-deep/10" />
          <div className="relative mt-auto p-10 text-white">
            <Logo size="auth" plate href={null} />
            <p className="font-display text-3xl mt-6 max-w-md leading-tight">Shop for yourself or your business — all in one {site.tagline ? site.tagline.toLowerCase() : 'digital mall'}.</p>
            <ul className="mt-6 grid gap-2.5 text-[14.5px] text-white/85">
              {[[BadgeCheck, 'Verified sellers and genuine brands'], [Building2, 'Retail and wholesale prices in one account'], [Truck, 'Tracked delivery with clear return windows'], [Lock, `Secure sign-in — card details never reach ${site.siteName}`]].map(([Icon, t]) => {
                const I = Icon as typeof Lock;
                return <li key={t as string} className="flex items-center gap-3"><span className="size-8 rounded-lg bg-white/10 grid place-items-center shrink-0"><I size={16} className="text-gold-light" /></span>{t as string}</li>;
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
