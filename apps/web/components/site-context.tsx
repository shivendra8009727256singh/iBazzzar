'use client';
import { createContext, useContext } from 'react';
import { DEFAULT_SITE, type HeroSlide, type Site } from '@/lib/site';

export { DEFAULT_SITE, withDefaults, type HeroSlide, type Site } from '@/lib/site';

const SiteContext = createContext<{ site: Site; slides: HeroSlide[] }>({ site: DEFAULT_SITE, slides: [] });

/** Brand, contact details and hero slides from Admin → Settings / Homepage, available to every component. */
export function SiteProvider({ site, slides, children }: { site: Site; slides: HeroSlide[]; children: React.ReactNode }) {
  return <SiteContext.Provider value={{ site, slides }}>{children}</SiteContext.Provider>;
}
export const useSite = () => useContext(SiteContext).site;
export const useHeroSlides = () => useContext(SiteContext).slides;
