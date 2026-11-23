'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { Toaster, toast } from 'sonner';
import { api, post, put, del, patch, ApiError } from '@/lib/api';
import type { Mode, User } from '@/lib/types';

// ───────────── Session ─────────────
export function useSession() {
  const query = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try { return (await api<{ user: User }>('/auth/me')).user; } catch (e) { if (e instanceof ApiError && e.status === 401) return null; throw e; }
    },
    staleTime: 60_000,
  });
  return { user: query.data ?? null, loading: query.isLoading, refresh: query.refetch };
}

// ───────────── Cart & wishlist ─────────────
export type CartLine = { listingId: string; quantity: number; savedForLater?: boolean };
type CartState = {
  lines: CartLine[]; saved: CartLine[]; mode: Mode; count: number; ready: boolean;
  add: (listingId: string, quantity?: number) => Promise<void>;
  setQuantity: (listingId: string, quantity: number) => Promise<void>;
  remove: (listingId: string) => Promise<void>;
  saveForLater: (listingId: string, saved: boolean) => Promise<void>;
  setMode: (mode: Mode) => void;
  clearLocal: (listingIds: string[]) => void;
  wishlist: Set<string>;
  toggleWishlist: (catalogProductId: string) => Promise<void>;
};
const CartContext = createContext<CartState | null>(null);
const STORAGE = 'ibazzzar.cart.v2';

type ServerCart = { cart: { mode: Mode; items: { listingId: string; quantity: number }[]; savedForLater: { listingId: string; quantity: number }[] } };

function readLocal(): { lines: CartLine[]; mode: Mode; wishlist: string[] } {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE) || '{}');
    return { lines: Array.isArray(raw.lines) ? raw.lines.filter((l: CartLine) => typeof l.listingId === 'string' && Number.isInteger(l.quantity) && l.quantity > 0).slice(0, 100) : [], mode: raw.mode === 'BUSINESS' ? 'BUSINESS' : 'RETAIL', wishlist: Array.isArray(raw.wishlist) ? raw.wishlist.slice(0, 200) : [] };
  } catch { return { lines: [], mode: 'RETAIL', wishlist: [] }; }
}

function CartProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSession();
  const qc = useQueryClient();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [mode, setModeState] = useState<Mode>('RETAIL');
  const [wishlist, setWishlist] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const merged = useRef<string | null>(null);

  const applyServer = useCallback((data: ServerCart) => {
    setLines([...data.cart.items.map((i) => ({ ...i, savedForLater: false })), ...data.cart.savedForLater.map((i) => ({ ...i, savedForLater: true }))]);
    setModeState(data.cart.mode);
  }, []);

  // Guest: browser storage. Signed in: server cart, merging the guest cart once per sign-in.
  useEffect(() => {
    if (loading) return;
    const local = readLocal();
    if (!user) {
      setLines(local.lines); setModeState(local.mode); setWishlist(new Set(local.wishlist)); setReady(true); merged.current = null;
      return;
    }
    if (merged.current === user.id) return;
    merged.current = user.id;
    (async () => {
      try {
        const data = await post<ServerCart>('/cart/merge', { items: local.lines.filter((l) => !l.savedForLater).map(({ listingId, quantity }) => ({ listingId, quantity })), mode: local.mode });
        applyServer(data);
        if (local.wishlist.length) await post('/wishlist/merge', { ids: local.wishlist });
        const w = await api<{ ids: string[] }>('/wishlist');
        setWishlist(new Set(w.ids));
        localStorage.setItem(STORAGE, JSON.stringify({ lines: [], mode: data.cart.mode, wishlist: [] }));
      } catch { /* the cart still works from the server on the next action */ }
      setReady(true);
    })();
  }, [user, loading, applyServer]);

  useEffect(() => {
    if (ready && !user) {
      try { localStorage.setItem(STORAGE, JSON.stringify({ lines, mode, wishlist: [...wishlist] })); } catch { /* storage disabled */ }
    }
  }, [lines, mode, wishlist, user, ready]);

  const guarded = useCallback(async (fn: () => Promise<void>) => {
    try { await fn(); qc.invalidateQueries({ queryKey: ['cart-quote'] }); } catch (e) { toast.error(e instanceof Error ? e.message : 'Something went wrong'); throw e; }
  }, [qc]);

  const value = useMemo<CartState>(() => {
    const setServerItem = async (listingId: string, quantity: number, savedForLater?: boolean) => applyServer(await put<ServerCart>('/cart/items', { listingId, quantity, savedForLater }));
    return {
      lines: lines.filter((l) => !l.savedForLater),
      saved: lines.filter((l) => l.savedForLater),
      mode, ready, wishlist,
      count: lines.filter((l) => !l.savedForLater).reduce((s, l) => s + l.quantity, 0),
      add: (listingId, quantity = 1) => guarded(async () => {
        const current = lines.find((l) => l.listingId === listingId && !l.savedForLater)?.quantity ?? 0;
        if (user) await setServerItem(listingId, Math.min(current + quantity, 10000), false);
        else setLines((prev) => [...prev.filter((l) => l.listingId !== listingId), { listingId, quantity: Math.min(current + quantity, 10000) }]);
      }),
      setQuantity: (listingId, quantity) => guarded(async () => {
        if (user) await setServerItem(listingId, quantity);
        else setLines((prev) => (quantity <= 0 ? prev.filter((l) => l.listingId !== listingId) : prev.map((l) => (l.listingId === listingId ? { ...l, quantity } : l))));
      }),
      remove: (listingId) => guarded(async () => {
        if (user) await setServerItem(listingId, 0);
        else setLines((prev) => prev.filter((l) => l.listingId !== listingId));
      }),
      saveForLater: (listingId, saved) => guarded(async () => {
        const line = lines.find((l) => l.listingId === listingId);
        if (!line) return;
        if (user) await setServerItem(listingId, line.quantity, saved);
        else setLines((prev) => prev.map((l) => (l.listingId === listingId ? { ...l, savedForLater: saved } : l)));
      }),
      setMode: (next) => {
        setModeState(next);
        if (user) patch('/cart', { mode: next }).catch(() => {});
      },
      clearLocal: (ids) => setLines((prev) => prev.filter((l) => l.savedForLater || !ids.includes(l.listingId))),
      toggleWishlist: async (catalogProductId) => {
        const has = wishlist.has(catalogProductId);
        const next = new Set(wishlist);
        if (has) next.delete(catalogProductId); else next.add(catalogProductId);
        setWishlist(next);
        if (user) {
          try { if (has) await del(`/wishlist/${catalogProductId}`); else await put(`/wishlist/${catalogProductId}`); } catch (e) { setWishlist(wishlist); toast.error(e instanceof Error ? e.message : 'Could not update wishlist'); return; }
        }
        toast.success(has ? 'Removed from wishlist' : 'Saved to wishlist');
      },
    };
  }, [lines, mode, ready, wishlist, user, guarded, applyServer]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <Providers>');
  return ctx;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2, refetchOnWindowFocus: false } } }));
  return (
    <QueryClientProvider client={client}>
      <CartProvider>{children}</CartProvider>
      <Toaster position="top-center" richColors closeButton toastOptions={{ style: { fontFamily: 'var(--font-sans)' } }} />
    </QueryClientProvider>
  );
}
