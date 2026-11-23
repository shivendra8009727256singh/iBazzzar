'use client';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { post } from '@/lib/api';
import type { Mode, Quote } from '@/lib/types';
import type { CartLine } from './providers';

export function useQuote({ lines, mode, couponCode, state, pincode, paymentMethod }: { lines: CartLine[]; mode: Mode; couponCode?: string; state?: string; pincode?: string; paymentMethod?: string }) {
  const items = lines.map(({ listingId, quantity }) => ({ listingId, quantity }));
  return useQuery({
    queryKey: ['cart-quote', items, mode, couponCode, state, pincode, paymentMethod],
    queryFn: () => post<{ quote: Quote }>('/cart/quote', { items, mode, ...(couponCode ? { couponCode } : {}), ...(state ? { state } : {}), ...(pincode ? { pincode } : {}), ...(paymentMethod ? { paymentMethod } : {}) }).then((r) => r.quote),
    enabled: items.length > 0,
    placeholderData: keepPreviousData,
    retry: false,
  });
}
