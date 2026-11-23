import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/format';

// The official artwork, used as supplied (margins trimmed only). Never redraw or recolour it.
// It has a light background, so on dark surfaces it always sits on an ivory plate.
const LOGO = { src: '/branding/ibazzzar-logo.png', width: 1621, height: 685 };

export function Logo({ size = 'header', plate = false, className }: { size?: 'header' | 'footer' | 'auth'; plate?: boolean; className?: string }) {
  const widths = { header: 'w-[138px] md:w-[176px]', footer: 'w-[190px]', auth: 'w-[220px]' };
  return (
    <Link href="/" aria-label="IBazzzar home" className={cn('inline-flex shrink-0 items-center', plate && 'bg-ivory rounded-xl px-3 py-2', className)}>
      <Image src={LOGO.src} alt="iBazzzar — Intelligent Digital Mall" width={LOGO.width} height={LOGO.height} sizes="240px" priority={size === 'header'} className={cn('h-auto', widths[size])} />
    </Link>
  );
}
