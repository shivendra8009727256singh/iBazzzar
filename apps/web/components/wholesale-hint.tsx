'use client';
import { Building2 } from 'lucide-react';
import { useCart } from './providers';

export function WholesaleModeHint() {
  const { mode, setMode } = useCart();
  if (mode === 'BUSINESS') return <span className="badge badge-info py-1.5 px-3"><Building2 size={14} />Showing business prices</span>;
  return <button onClick={() => setMode('BUSINESS')} className="btn btn-outline btn-sm"><Building2 size={15} />Switch to business prices</button>;
}
