// Brand settings shared by server and client code (the root layout merges them on the server).
export type Site = {
  siteName: string; tagline: string; about: string; logoUrl: string; logoMarkUrl: string;
  announcement: string; announcementLink: string;
  supportEmail: string; supportPhone: string; whatsapp: string; supportHours: string;
  legalName: string; gstin: string;
  address: { line1: string; line2: string; city: string; state: string; pincode: string };
  socials: { instagram: string; facebook: string; x: string; youtube: string; linkedin: string };
};
export type HeroSlide = {
  id: string; eyebrow: string | null; title: string; subtitle: string | null; imageUrl: string | null; alt: string; link: string | null;
  ctaLabel: string | null; secondaryLabel: string | null; secondaryLink: string | null; theme: 'dark' | 'light'; bgColor: string | null; layout: 'cover' | 'split'; endsAt: string | null;
};

/** Used until the API answers, and if it can't: the site still renders with the original brand. */
export const DEFAULT_SITE: Site = {
  siteName: 'IBazzzar', tagline: 'Intelligent Digital Mall', about: 'An intelligent digital mall for shoppers, businesses and independent sellers across India.',
  logoUrl: '/branding/ibazzzar-logo.png', logoMarkUrl: '/icon.png',
  announcement: 'Retail and wholesale from verified sellers — one intelligent digital mall', announcementLink: '',
  supportEmail: '', supportPhone: '', whatsapp: '', supportHours: '', legalName: '', gstin: '',
  address: { line1: '', line2: '', city: '', state: '', pincode: '' },
  socials: { instagram: '', facebook: '', x: '', youtube: '', linkedin: '' },
};

/** Merges saved settings over defaults so a partly filled form never leaves holes in the UI. */
export function withDefaults(site: Partial<Site> | null | undefined): Site {
  return { ...DEFAULT_SITE, ...(site ?? {}), address: { ...DEFAULT_SITE.address, ...(site?.address ?? {}) }, socials: { ...DEFAULT_SITE.socials, ...(site?.socials ?? {}) } };
}
