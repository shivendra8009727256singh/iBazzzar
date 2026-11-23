'use client';
import { Input } from './ui';

export function TierEditor({ tiers, onChange }: { tiers: { min: string; price: string }[]; onChange: (t: { min: string; price: string }[]) => void }) {
  return (
    <fieldset>
      <legend className="label mb-2">Wholesale price tiers</legend>
      <div className="grid gap-2">
        {tiers.map((t, i) => (
          <div key={i} className="flex gap-2 items-center">
            <label className="sr-only" htmlFor={`tmin${i}`}>Minimum quantity</label><Input id={`tmin${i}`} inputMode="numeric" placeholder="From qty" value={t.min} onChange={(e) => onChange(tiers.map((x, j) => (j === i ? { ...x, min: e.target.value } : x)))} />
            <label className="sr-only" htmlFor={`tpr${i}`}>Price per unit</label><Input id={`tpr${i}`} inputMode="decimal" placeholder="₹ per unit" value={t.price} onChange={(e) => onChange(tiers.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(tiers.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
        {tiers.length < 10 && <button type="button" className="link text-sm justify-self-start" onClick={() => onChange([...tiers, { min: '', price: '' }])}>+ Add tier</button>}
      </div>
      <p className="hint mt-1">Tiers start at or above the MOQ and can’t exceed the selling price.</p>
    </fieldset>
  );
}
