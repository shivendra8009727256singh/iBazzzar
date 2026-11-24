'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { RotateCw } from 'lucide-react';
import type { Order } from '@/lib/types';
import { useCart } from './providers';
import { Button } from './ui';

/** Puts every item of a past order back in the cart (skipping anything no longer sold) and opens the cart. */
export function BuyAgainButton({ order, size = 'sm' }: { order: Order; size?: 'sm' | 'md' }) {
  const { add } = useCart();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const items = order.parcels.flatMap((p) => p.items);
  const run = async () => {
    setBusy(true);
    let added = 0;
    for (const i of items) {
      try { await add(i.listingId, i.quantity); added++; } catch { /* unavailable now; reported below */ }
    }
    setBusy(false);
    if (!added) { toast.error('These items aren’t available right now.'); return; }
    toast.success(added === items.length ? 'Added to your cart' : `${added} of ${items.length} items added; the rest aren’t available now`);
    router.push('/cart');
  };
  if (!items.length) return null;
  return <Button size={size} variant="outline" loading={busy} onClick={run}><RotateCw size={15} />Buy again</Button>;
}
