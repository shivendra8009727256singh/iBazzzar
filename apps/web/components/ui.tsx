'use client';
import { forwardRef, useId, useState, cloneElement, isValidElement } from 'react';
import Link from 'next/link';
import * as Dialog from '@radix-ui/react-dialog';
import { Star, X, Loader2, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { cn, formatMoney, label as toLabel, percentOff, STATUS_TONE } from '@/lib/format';
import { ApiError } from '@/lib/api';
import { BrandLoader } from './brand-loader';

// ───────────── Form fields ─────────────
type FieldProps = { label: string; hint?: string; error?: string; required?: boolean; className?: string; children: React.ReactElement<Record<string, unknown>> };
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy, 'aria-required': required || undefined })
    : children;
  return (
    <div className={cn('field', className)}>
      <label htmlFor={id} className="label">{label}{required && <span className="text-danger" aria-hidden> *</span>}</label>
      {control}
      {hint && !error && <p id={`${id}-hint`} className="hint">{hint}</p>}
      {error && <p id={`${id}-error`} className="error-text" role="alert">{error}</p>}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn('input', className)} {...props} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn('input', className)} {...props} />;
});
export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...props }, ref) {
  return <select ref={ref} className={cn('input', className)} {...props} />;
});

export function Checkbox({ label, hint, error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode; hint?: string; error?: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="flex items-start gap-3 cursor-pointer text-[15px]">
        <input id={id} type="checkbox" className="checkbox" aria-invalid={error ? true : undefined} {...props} />
        <span>{label}{hint && <span className="hint block">{hint}</span>}</span>
      </label>
      {error && <p className="error-text mt-1 ml-7" role="alert">{error}</p>}
    </div>
  );
}

/** Form-level error state from an ApiError: a message for the banner plus per-field messages. */
export function useFormErrors() {
  const [errors, setErrors] = useState<{ message?: string; fields: Record<string, string> }>({ fields: {} });
  return {
    message: errors.message,
    field: (name: string) => errors.fields[name],
    clear: () => setErrors({ fields: {} }),
    set: (e: unknown) => {
      if (e instanceof ApiError) setErrors({ message: e.message, fields: Object.fromEntries(Object.entries(e.fields).filter(([, v]) => typeof v === 'string')) as Record<string, string> });
      else setErrors({ message: e instanceof Error ? e.message : 'Something went wrong', fields: {} });
    },
  };
}

export function Alert({ tone = 'danger', title, children }: { tone?: 'danger' | 'warning' | 'success' | 'info'; title?: string; children?: React.ReactNode }) {
  const tones = { danger: 'bg-danger-bg text-danger border-danger/25', warning: 'bg-warning-bg text-warning border-warning/25', success: 'bg-success-bg text-success border-success/25', info: 'bg-info-bg text-info border-info/25' };
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('rounded-xl border px-4 py-3 text-[14.5px]', tones[tone])}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
    </div>
  );
}

// ───────────── Buttons ─────────────
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'gold' | 'outline' | 'ghost' | 'danger' | 'on-dark'; size?: 'sm' | 'md' | 'lg'; loading?: boolean };
export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button className={cn('btn', `btn-${variant}`, size !== 'md' && `btn-${size}`, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

// ───────────── Display ─────────────
export function Badge({ tone = 'default', children, className }: { tone?: 'default' | 'gold' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'; children: React.ReactNode; className?: string }) {
  return <span className={cn('badge', tone !== 'default' && `badge-${tone}`, className)}>{children}</span>;
}
export function StatusBadge({ status, text }: { status: string; text?: string }) {
  return <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{text ?? toLabel(status)}</Badge>;
}

export function Price({ paise, mrp, size = 'md', className }: { paise: number; mrp?: number; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const off = mrp ? percentOff(paise, mrp) : 0;
  const sizes = { sm: 'text-[15px]', md: 'text-lg', lg: 'text-3xl' };
  return (
    <span className={cn('inline-flex flex-wrap items-baseline gap-x-2', className)}>
      <span className={cn('price', sizes[size])}>{formatMoney(paise)}</span>
      {off > 0 && mrp && <><span className="mrp text-sm"><span className="sr-only">MRP </span>{formatMoney(mrp)}</span><span className="off text-sm">{off}% off</span></>}
    </span>
  );
}

export function Stars({ value, count, size = 14 }: { value: number; count?: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5" aria-label={`Rated ${value} out of 5${count != null ? ` from ${count} verified reviews` : ''}`}>
      <span className="inline-flex" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={size} className={i <= Math.round(value) ? 'fill-gold text-gold' : 'text-line-strong'} />)}
      </span>
      <span className="text-sm font-semibold">{value.toFixed(1)}</span>
      {count != null && <span className="text-sm text-muted">({count})</span>}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />;
}

export function Empty({ icon, title, body, action }: { icon?: React.ReactNode; title: string; body?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center py-14 px-6">
      <div className="size-14 rounded-2xl bg-mint text-forest grid place-items-center mb-4">{icon ?? <Inbox size={26} />}</div>
      <h3 className="text-xl">{title}</h3>
      {body && <p className="text-muted mt-2 max-w-md">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Section and page loading: the IBazzzar loader. */
export function Spinner({ label = 'Loading', size = 'md' }: { label?: string; size?: 'sm' | 'md' | 'lg' }) {
  return <BrandLoader label={label} size={size} />;
}

/** Client-side paging via onChange, or link-based paging via hrefBase (a URL without the page param) for server pages. */
export function Pagination({ page, pages, onChange, hrefBase }: { page: number; pages: number; onChange?: (p: number) => void; hrefBase?: string }) {
  if (pages <= 1) return null;
  const hrefFor = hrefBase ? (p: number) => `${hrefBase}${hrefBase.includes('?') ? '&' : '?'}page=${p}` : null;
  const item = (p: number, children: React.ReactNode, aria: string, disabled = false) => hrefFor && !disabled
    ? <Link href={hrefFor(p)} aria-label={aria} className="btn btn-outline btn-sm">{children}</Link>
    : <button type="button" aria-label={aria} disabled={disabled} onClick={() => onChange?.(p)} className="btn btn-outline btn-sm">{children}</button>;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-3 mt-8">
      {item(page - 1, <ChevronLeft size={16} />, 'Previous page', page <= 1)}
      <span className="text-sm text-muted">Page <strong className="text-ink">{page}</strong> of {pages}</span>
      {item(page + 1, <ChevronRight size={16} />, 'Next page', page >= pages)}
    </nav>
  );
}

export function Modal({ open, onOpenChange, title, description, children, wide }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-deep/55 backdrop-blur-[2px] animate-fade-up" />
        <Dialog.Content className={cn('fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-24px)] max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-lift p-6', wide ? 'max-w-3xl' : 'max-w-lg')}>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <Dialog.Title className="text-xl font-display font-semibold">{title}</Dialog.Title>
              {description ? <Dialog.Description className="text-muted text-sm mt-1">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
            </div>
            <Dialog.Close className="btn btn-ghost btn-icon -mr-2 -mt-2" aria-label="Close"><X size={18} /></Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Asks before doing something that can't be undone. Optionally collects a reason. */
export function ConfirmButton({ children, title, body, confirmLabel = 'Confirm', variant = 'outline', size = 'sm', danger, reason, onConfirm }: {
  children: React.ReactNode; title: string; body?: string; confirmLabel?: string; variant?: ButtonProps['variant']; size?: ButtonProps['size']; danger?: boolean;
  reason?: { label: string; min?: number }; onConfirm: (reason?: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const run = async () => {
    if (reason && text.trim().length < (reason.min ?? 5)) { setError(`Please write at least ${reason.min ?? 5} characters`); return; }
    setBusy(true); setError(undefined);
    try { await onConfirm(reason ? text.trim() : undefined); setOpen(false); setText(''); } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong'); } finally { setBusy(false); }
  };
  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={() => setOpen(true)}>{children}</Button>
      <Modal open={open} onOpenChange={setOpen} title={title} description={body}>
        <div className="grid gap-4">
          {reason && <Field label={reason.label} error={error}><Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} /></Field>}
          {!reason && error && <Alert>{error}</Alert>}
          <div className="flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant={danger ? 'danger' : 'primary'} type="button" loading={busy} onClick={run}>{confirmLabel}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function Stat({ label, value, hint, icon, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode; tone?: 'gold' | 'emerald' }) {
  return (
    <div className="card card-pad">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted font-medium">{label}</p>
        {icon && <span className={cn('size-9 rounded-xl grid place-items-center', tone === 'gold' ? 'bg-[#f7ead0] text-gold-ink' : 'bg-mint text-forest')}>{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-[13px] text-muted mt-1">{hint}</p>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1 className="text-[28px] md:text-[34px] mt-1">{title}</h1>
        {description && <p className="text-muted mt-1.5 max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[] }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line mb-5">
      {items.map((i) => (
        <button key={i.value} role="tab" aria-selected={value === i.value} onClick={() => onChange(i.value)}
          className={cn('px-4 py-2.5 text-[15px] font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors', value === i.value ? 'border-emerald text-emerald' : 'border-transparent text-muted hover:text-ink')}>
          {i.label}{i.count != null && <span className="ml-1.5 text-xs rounded-full bg-mint px-1.5 py-0.5 text-forest">{i.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center gap-2 text-sm" aria-label="Progress">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2" aria-current={i === current ? 'step' : undefined}>
          <span className={cn('size-7 rounded-full grid place-items-center font-bold text-[13px]', i < current ? 'bg-forest text-white' : i === current ? 'bg-emerald text-gold-light' : 'bg-mint text-muted')}>{i + 1}</span>
          <span className={cn('hidden sm:inline font-medium', i === current ? 'text-ink' : 'text-muted')}>{s}</span>
          {i < steps.length - 1 && <span className="w-6 md:w-10 h-px bg-line-strong" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

export function DemoNotice({ children }: { children?: React.ReactNode }) {
  return <Badge tone="gold">{children ?? 'Demo item'}</Badge>;
}
