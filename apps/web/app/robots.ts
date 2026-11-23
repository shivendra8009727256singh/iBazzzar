import type { MetadataRoute } from 'next';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://ibazzzar.com';

export default function robots(): MetadataRoute.Robots {
  // Until launch is approved, crawlers are asked to stay away entirely.
  if (process.env.NEXT_PUBLIC_ALLOW_INDEXING !== 'true') return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/account', '/admin', '/seller', '/business', '/checkout', '/cart', '/api/'] },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
