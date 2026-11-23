import Link from 'next/link';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="container-page py-24 text-center max-w-xl">
      <span className="mx-auto size-16 rounded-2xl bg-mint text-forest grid place-items-center"><Compass size={30} /></span>
      <h1 className="text-4xl mt-5">This aisle doesn’t exist</h1>
      <p className="text-muted mt-3">The page may have moved, or the product is no longer available.</p>
      <div className="mt-7 flex justify-center gap-3"><Link href="/" className="btn btn-primary">Go home</Link><Link href="/products" className="btn btn-outline">Browse products</Link></div>
    </div>
  );
}
