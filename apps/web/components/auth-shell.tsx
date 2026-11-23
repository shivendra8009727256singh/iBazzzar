import Image from 'next/image';
import { Logo } from './logo';

/** Split layout for sign-in and registration: form on the left, brand panel on the right. */
export function AuthShell({ title, subtitle, children, wide }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="grid lg:grid-cols-[1fr_0.85fr] min-h-[calc(100vh-140px)]">
      <div className="flex items-start justify-center px-4 py-10 md:py-14">
        <div className={wide ? 'w-full max-w-2xl' : 'w-full max-w-md'}>
          <h1 className="text-3xl md:text-[34px]">{title}</h1>
          {subtitle && <p className="text-muted mt-2">{subtitle}</p>}
          <div className="mt-7">{children}</div>
        </div>
      </div>
      <div className="hidden lg:flex relative surface-emerald overflow-hidden">
        <Image src="/images/mall-concept.webp" alt="" fill sizes="45vw" className="object-cover object-[72%_center] opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-t from-deep via-deep/50 to-transparent" />
        <div className="relative mt-auto p-10 text-white">
          <Logo size="auth" plate />
          <p className="font-display text-3xl mt-6 max-w-md">Shop for yourself or your business — all in one intelligent digital mall.</p>
          <p className="text-white/65 mt-3 text-sm">Secure sign-in · HTTP-only sessions · Your card details never reach IBazzzar</p>
        </div>
      </div>
    </div>
  );
}
