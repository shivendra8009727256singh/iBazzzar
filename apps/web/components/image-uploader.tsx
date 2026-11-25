'use client';
/* eslint-disable @next/next/no-img-element -- previews of freshly uploaded images, shown as-is */
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X, ArrowLeft, ArrowRight, Star, Loader2, ZoomIn, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import * as Dialog from '@radix-ui/react-dialog';
import { upload } from '@/lib/api';
import { cn } from '@/lib/format';

type Pending = { id: string; name: string; preview: string };

/**
 * Multi-image uploader: drag & drop or pick several files, per-photo progress, cover photo, reorder, remove, preview.
 * Images are uploaded to `uploadPath` as they are added; `value` holds the uploaded URLs in display order.
 */
export function ImageUploader({ value, onChange, max, uploadPath, slots, label = 'Photos', hint, required, coverLabel = 'Cover', compact }: {
  value: string[]; onChange: (urls: string[]) => void; max: number; uploadPath: string;
  /** Names for empty slots, e.g. ["Front", "Back", "Side", "Detail"] — guides sellers like marketplace apps do. */
  slots?: string[]; label?: string; hint?: React.ReactNode; required?: boolean; coverLabel?: string; compact?: boolean;
}) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [drag, setDrag] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  // Latest URLs, so photos finishing in parallel append to each other instead of overwriting.
  const urls = useRef(value);
  useEffect(() => { urls.current = value; }, [value]);
  const room = max - value.length - pending.length;

  const add = async (files: FileList | File[] | null) => {
    if (!files) return;
    const list = [...files].filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
    if (list.length < [...files].length) toast.error('Only JPEG, PNG or WebP images can be added');
    if (list.length > room) toast.error(room > 0 ? `You can add ${room} more photo${room === 1 ? '' : 's'}` : `Up to ${max} photos`);
    const batch = list.slice(0, Math.max(0, room)).map((f) => ({ file: f, item: { id: `${f.name}-${f.size}-${Math.random()}`, name: f.name, preview: URL.createObjectURL(f) } }));
    if (!batch.length) return;
    setPending((p) => [...p, ...batch.map((b) => b.item)]);
    // Upload in parallel; each photo lands in the order it finishes, appended after the existing ones.
    await Promise.all(batch.map(async ({ file, item }) => {
      try {
        const r = await upload<{ media: { url: string } }>(uploadPath, file, { 'X-File-Name': file.name });
        onChange([...urls.current, r.media.url]);
        urls.current = [...urls.current, r.media.url];
      } catch (e) {
        toast.error(`${file.name}: ${(e as Error).message}`);
      } finally {
        setPending((p) => p.filter((x) => x.id !== item.id));
        URL.revokeObjectURL(item.preview);
      }
    }));
  };
  const move = (i: number, dir: number) => { const j = i + dir; if (j < 0 || j >= value.length) return; const next = [...value]; [next[i], next[j]] = [next[j], next[i]]; onChange(next); };
  const cover = (i: number) => { const next = [...value]; const [u] = next.splice(i, 1); onChange([u, ...next]); };
  const remove = (i: number) => onChange(value.filter((_, k) => k !== i));
  const size = compact ? 'size-20 sm:size-24' : 'size-28 sm:size-32';
  const empty = Math.max(0, max - value.length - pending.length);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <p className="label">{label}{required && <span className="text-danger"> *</span>}</p>
        <span className="text-xs text-muted tabular-nums">{value.length}/{max} added</span>
      </div>
      <div
        onDragOver={(e) => { e.preventDefault(); if (room > 0) setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
        className={cn('rounded-2xl border-2 border-dashed p-3 transition', drag ? 'border-forest bg-mint/50' : 'border-line')}>
        <ul className="flex flex-wrap gap-3" aria-label={`${label}: ${value.length} of ${max}`}>
          {value.map((url, i) => (
            <li key={url} className={cn('group relative rounded-xl border bg-cream overflow-hidden', size, i === 0 ? 'border-gold ring-2 ring-gold/30' : 'border-line')}>
              <img src={url} alt={`${label} ${i + 1}`} className="absolute inset-0 size-full object-contain p-1.5" />
              {i === 0 && <span className="absolute bottom-1 left-1 rounded-md bg-gold text-deep text-[10px] font-bold px-1.5 py-0.5 flex items-center gap-0.5"><Star size={9} fill="currentColor" />{coverLabel}</span>}
              <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => remove(i)} className="absolute top-1 right-1 size-6 rounded-full bg-white/95 shadow grid place-items-center hover:text-danger"><X size={13} /></button>
              <div className="absolute inset-x-1 bottom-1 hidden group-hover:flex group-focus-within:flex justify-end gap-1">
                <button type="button" aria-label={`View photo ${i + 1}`} onClick={() => setPreview(url)} className="size-6 rounded-full bg-white/95 shadow grid place-items-center"><ZoomIn size={12} /></button>
                {i > 0 && <button type="button" aria-label={`Move photo ${i + 1} earlier`} onClick={() => move(i, -1)} className="size-6 rounded-full bg-white/95 shadow grid place-items-center"><ArrowLeft size={12} /></button>}
                {i < value.length - 1 && <button type="button" aria-label={`Move photo ${i + 1} later`} onClick={() => move(i, 1)} className="size-6 rounded-full bg-white/95 shadow grid place-items-center"><ArrowRight size={12} /></button>}
              </div>
              {i > 0 && <button type="button" onClick={() => cover(i)} className="absolute top-1 left-1 hidden group-hover:block group-focus-within:block rounded-md bg-white/95 shadow px-1.5 py-0.5 text-[10px] font-bold">Make {coverLabel.toLowerCase()}</button>}
            </li>
          ))}
          {pending.map((p) => (
            <li key={p.id} className={cn('relative rounded-xl border border-line overflow-hidden', size)}>
              <img src={p.preview} alt="" className="absolute inset-0 size-full object-cover opacity-40" />
              <span className="absolute inset-0 grid place-items-center"><Loader2 className="animate-spin text-forest" /></span>
              <span className="sr-only">Uploading {p.name}</span>
            </li>
          ))}
          {room > 0 && Array.from({ length: Math.min(empty, slots ? empty : 1) }, (_, k) => {
            const slot = slots?.[value.length + pending.length + k];
            return (
              <li key={`slot-${k}`}>
                <button type="button" onClick={() => input.current?.click()} className={cn('rounded-xl border-2 border-dashed border-line-strong bg-white grid place-items-center text-center text-xs text-muted hover:border-forest hover:text-forest hover:bg-mint/30 transition', size)}>
                  <span>{k === 0 ? <ImagePlus className="mx-auto mb-1" size={22} /> : <ImagePlus className="mx-auto mb-1 opacity-50" size={18} />}{k === 0 ? (slot ?? 'Add photos') : slot}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {!compact && room > 0 && <p className="hidden sm:flex items-center gap-1.5 text-xs text-muted mt-3"><UploadCloud size={14} />Drag photos here, or click a box to choose several at once.</p>}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" tabIndex={-1} onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      </div>
      {hint && <p className="hint mt-2">{hint}</p>}

      <Dialog.Root open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/80" />
          <Dialog.Content className="fixed z-[60] inset-4 md:inset-12 grid place-items-center focus:outline-none">
            <Dialog.Title className="sr-only">Photo preview</Dialog.Title>
            {preview && <img src={preview} alt="Preview" className="max-h-full max-w-full object-contain rounded-xl bg-white" />}
            <Dialog.Close className="absolute top-0 right-0 size-10 rounded-full bg-white grid place-items-center" aria-label="Close preview"><X size={18} /></Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
