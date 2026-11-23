import type { Metadata, Viewport } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { Header, MobileTabBar } from '@/components/header';
import { Footer } from '@/components/footer';
import { Assistant } from '@/components/assistant';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair', display: 'swap', weight: ['500', '600', '700'] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://ibazzzar.com'),
  title: { default: 'IBazzzar — Intelligent Digital Mall', template: '%s | IBazzzar' },
  description: 'Shop for yourself or your business: retail and wholesale from verified Indian sellers, with clear prices, GST invoices and tracked delivery.',
  openGraph: { type: 'website', siteName: 'IBazzzar', locale: 'en_IN' },
  // Keep the site out of search engines until launch is approved.
  robots: process.env.NEXT_PUBLIC_ALLOW_INDEXING === 'true' ? { index: true, follow: true } : { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#092c20', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${inter.variable} ${playfair.variable}`}>
      <body>
        <Providers>
          <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:bg-white focus:p-3 focus:rounded-lg">Skip to content</a>
          <Header />
          <main id="main" className="min-h-[60vh] pb-16 md:pb-0">{children}</main>
          <Footer />
          <Assistant />
          <MobileTabBar />
        </Providers>
      </body>
    </html>
  );
}
