import { BrandLoader } from '@/components/brand-loader';

// Shown by Next.js while a page loads.
export default function Loading() {
  return <BrandLoader fullScreen size="lg" label="Loading" />;
}
