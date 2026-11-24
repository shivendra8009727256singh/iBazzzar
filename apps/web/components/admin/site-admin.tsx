'use client';
/* eslint-disable @next/next/no-img-element -- admin-uploaded logos and artwork of unknown size are previewed as-is */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Eye, EyeOff, ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { del, post, put, upload, api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { Slide } from '../hero-slider';
import type { HeroSlide, Site } from '../site-context';
import { Badge, Button, ConfirmButton, Field, Input, Select, Textarea, Checkbox } from '../ui';
import { Drawer } from './kit';

async function uploadImage(file: File, purpose?: 'logo') {
  const r = await upload<{ media: { url: string } }>(`/admin/media${purpose ? `?purpose=${purpose}` : ''}`, file, { 'X-File-Name': file.name });
  return r.media.url;
}

function UploadButton({ label, onUploaded, purpose }: { label: string; onUploaded: (url: string) => void; purpose?: 'logo' }) {
  const [busy, setBusy] = useState(false);
  return (
    <label className="btn btn-outline btn-sm cursor-pointer">
      <ImagePlus size={15} />{busy ? 'Uploading…' : label}
      <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy}
        onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setBusy(true); try { onUploaded(await uploadImage(f, purpose)); } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); } }} />
    </label>
  );
}

// ───────────── Brand & site ─────────────
/** One place for the logo, name, contact details and address used by the header, footer, loader, emails and admin. */
export function SiteBrandForm({ site }: { site: Site }) {
  const router = useRouter();
  const [f, setF] = useState<Site>(site);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<Site>) => setF((x) => ({ ...x, ...patch }));
  const dirty = JSON.stringify(f) !== JSON.stringify(site);
  const save = async () => {
    setSaving(true);
    try { await put('/admin/settings/site', f); toast.success('Brand & site saved. The storefront updates within 30 seconds.'); router.refresh(); }
    catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  return (
    <section className="card card-pad grid gap-5">
      <div><h2 className="text-lg">Brand & site</h2><p className="text-sm text-muted">Used everywhere: header, footer, loading screen, sign-in pages, admin console, emails and the browser tab.</p></div>

      <div className="grid gap-4 md:grid-cols-[1fr_auto]">
        <div className="rounded-2xl border border-line p-4 grid gap-3">
          <p className="text-sm font-semibold">Main logo</p>
          <div className="flex flex-wrap items-center gap-4">
            <span className="rounded-xl bg-white border border-line px-4 py-3"><img src={f.logoUrl} alt="Logo preview" className="h-14 w-auto max-w-[220px] object-contain" /></span>
            <span className="rounded-xl surface-emerald px-4 py-3"><span className="bg-ivory rounded-lg px-2 py-1 inline-flex"><img src={f.logoUrl} alt="" className="h-10 w-auto max-w-[180px] object-contain" /></span></span>
            <UploadButton label="Upload logo" purpose="logo" onUploaded={(url) => set({ logoUrl: url })} />
          </div>
          <p className="text-xs text-muted">PNG or WebP with a transparent or light background works best. Wide logos around 600×200 px look sharpest.</p>
        </div>
        <div className="rounded-2xl border border-line p-4 grid gap-3 content-start">
          <p className="text-sm font-semibold">Logo mark</p>
          <div className="flex items-center gap-4">
            
            <img src={f.logoMarkUrl} alt="Logo mark preview" className="size-14 rounded-xl object-cover border border-line" />
            <UploadButton label="Upload mark" purpose="logo" onUploaded={(url) => set({ logoMarkUrl: url })} />
          </div>
          <p className="text-xs text-muted max-w-[220px]">Square icon for the loading screen and collapsed sidebar.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Site name"><Input value={f.siteName} onChange={(e) => set({ siteName: e.target.value })} /></Field>
        <Field label="Tagline"><Input value={f.tagline} onChange={(e) => set({ tagline: e.target.value })} /></Field>
        <Field label="About (footer)" className="sm:col-span-2"><Textarea rows={2} value={f.about} onChange={(e) => set({ about: e.target.value })} /></Field>
        <Field label="Announcement bar" hint="Shown above the header. Leave empty to hide it."><Input value={f.announcement} onChange={(e) => set({ announcement: e.target.value })} /></Field>
        <Field label="Announcement link" hint="A page on the site, e.g. /deals"><Input value={f.announcementLink} onChange={(e) => set({ announcementLink: e.target.value })} /></Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <p className="sm:col-span-2 text-sm font-semibold">Contact</p>
        <Field label="Support email"><Input type="email" value={f.supportEmail} onChange={(e) => set({ supportEmail: e.target.value })} /></Field>
        <Field label="Support phone"><Input value={f.supportPhone} onChange={(e) => set({ supportPhone: e.target.value })} /></Field>
        <Field label="WhatsApp number" hint="10-digit mobile number"><Input inputMode="numeric" value={f.whatsapp} onChange={(e) => set({ whatsapp: e.target.value.replace(/\D/g, '').slice(0, 10) })} /></Field>
        <Field label="Support hours"><Input value={f.supportHours} onChange={(e) => set({ supportHours: e.target.value })} placeholder="Mon–Sat, 9 am – 7 pm" /></Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <p className="sm:col-span-2 text-sm font-semibold">Business address and registration</p>
        <Field label="Legal name"><Input value={f.legalName} onChange={(e) => set({ legalName: e.target.value })} /></Field>
        <Field label="GSTIN"><Input className="uppercase" value={f.gstin} onChange={(e) => set({ gstin: e.target.value.toUpperCase() })} /></Field>
        <Field label="Address line 1"><Input value={f.address.line1} onChange={(e) => set({ address: { ...f.address, line1: e.target.value } })} /></Field>
        <Field label="Address line 2"><Input value={f.address.line2} onChange={(e) => set({ address: { ...f.address, line2: e.target.value } })} /></Field>
        <Field label="City"><Input value={f.address.city} onChange={(e) => set({ address: { ...f.address, city: e.target.value } })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="State"><Input value={f.address.state} onChange={(e) => set({ address: { ...f.address, state: e.target.value } })} /></Field>
          <Field label="PIN code"><Input inputMode="numeric" value={f.address.pincode} onChange={(e) => set({ address: { ...f.address, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) } })} /></Field>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <p className="sm:col-span-2 text-sm font-semibold">Social links <span className="font-normal text-muted">(https:// links; empty ones are hidden)</span></p>
        {(['instagram', 'facebook', 'x', 'youtube', 'linkedin'] as const).map((k) => (
          <Field key={k} label={k === 'x' ? 'X (Twitter)' : k.charAt(0).toUpperCase() + k.slice(1)}><Input value={f.socials[k]} onChange={(e) => set({ socials: { ...f.socials, [k]: e.target.value.trim() } })} placeholder="https://" /></Field>
        ))}
      </div>

      <div className="flex gap-2">
        <Button onClick={save} disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save brand & site'}</Button>
        {dirty && <Button variant="ghost" onClick={() => setF(site)}>Discard changes</Button>}
      </div>
    </section>
  );
}

// ───────────── Hero slides ─────────────
export type BannerRow = HeroSlide & { placement: string; active: boolean; sortOrder: number; startsAt: string | null };
type Draft = { eyebrow: string; title: string; subtitle: string; imageUrl: string; alt: string; layout: 'cover' | 'split'; theme: 'dark' | 'light'; bgColor: string; ctaLabel: string; link: string; secondaryLabel: string; secondaryLink: string; startsAt: string; endsAt: string; active: boolean };
const EMPTY: Draft = { eyebrow: '', title: '', subtitle: '', imageUrl: '', alt: '', layout: 'split', theme: 'dark', bgColor: '#174b37', ctaLabel: 'Shop now', link: '/products', secondaryLabel: '', secondaryLink: '', startsAt: '', endsAt: '', active: true };
const toLocal = (iso: string | null | undefined) => { if (!iso) return ''; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);
const status = (b: BannerRow) => { const now = Date.now(); if (!b.active) return ['Hidden', 'neutral'] as const; if (b.startsAt && new Date(b.startsAt).getTime() > now) return ['Scheduled', 'info'] as const; if (b.endsAt && new Date(b.endsAt).getTime() < now) return ['Ended', 'neutral'] as const; return ['Live', 'success'] as const; };

function Preview({ s }: { s: HeroSlide }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useEffect(() => { const el = box.current; if (!el) return; const ro = new ResizeObserver(() => setScale(el.clientWidth / 1280)); ro.observe(el); return () => ro.disconnect(); }, []);
  return (
    <div ref={box} className="relative w-full rounded-2xl overflow-hidden border border-line" style={{ height: 460 * scale }}>
      <div className="absolute left-0 top-0 origin-top-left pointer-events-none" style={{ width: 1280, height: 460, transform: `scale(${scale})` }}><Slide s={s} index={0} total={1} active /></div>
    </div>
  );
}

/** The homepage hero carousel: add, edit, schedule, hide and reorder slides. */
export function HeroSlides({ banners, refetch }: { banners: BannerRow[]; refetch: () => void }) {
  const slides = banners.filter((b) => b.placement === 'hero').sort((a, b) => a.sortOrder - b.sortOrder);
  const [editing, setEditing] = useState<{ id: string | null; d: Draft } | null>(null);
  const [saving, setSaving] = useState(false);
  const d = editing?.d;
  const set = (patch: Partial<Draft>) => setEditing((e) => e && { ...e, d: { ...e.d, ...patch } });
  const open = (b?: BannerRow) => setEditing(b ? { id: b.id, d: { eyebrow: b.eyebrow ?? '', title: b.title, subtitle: b.subtitle ?? '', imageUrl: b.imageUrl ?? '', alt: b.alt, layout: b.layout === 'cover' ? 'cover' : 'split', theme: b.theme === 'light' ? 'light' : 'dark', bgColor: b.bgColor ?? '', ctaLabel: b.ctaLabel ?? '', link: b.link ?? '', secondaryLabel: b.secondaryLabel ?? '', secondaryLink: b.secondaryLink ?? '', startsAt: toLocal(b.startsAt), endsAt: toLocal(b.endsAt), active: b.active } } : { id: null, d: { ...EMPTY } });
  const move = async (i: number, dir: number) => {
    const ids = slides.map((s) => s.id); const j = i + dir; if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { await put('/admin/banners/order', { ids }); refetch(); } catch (e) { toast.error((e as Error).message); }
  };
  const toggle = async (b: BannerRow) => { try { await api(`/admin/banners/${b.id}`, { method: 'PATCH', body: { active: !b.active } }); refetch(); } catch (e) { toast.error((e as Error).message); } };
  const save = async () => {
    if (!editing || !d) return;
    const body = {
      placement: 'hero', title: d.title, alt: d.alt || d.title, layout: d.layout, theme: d.theme, active: d.active,
      eyebrow: d.eyebrow || null, subtitle: d.subtitle || null, imageUrl: d.imageUrl || null, bgColor: d.bgColor || null,
      ctaLabel: d.ctaLabel || null, link: d.link || null, secondaryLabel: d.secondaryLabel || null, secondaryLink: d.secondaryLink || null,
      startsAt: fromLocal(d.startsAt), endsAt: fromLocal(d.endsAt), ...(editing.id ? {} : { sortOrder: Math.min(slides.length, 100) }),
    };
    setSaving(true);
    try {
      if (editing.id) await api(`/admin/banners/${editing.id}`, { method: 'PATCH', body }); else await post('/admin/banners', body);
      toast.success(editing.id ? 'Slide updated' : 'Slide added'); setEditing(null); refetch();
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  const live = slides.filter((s) => status(s)[0] === 'Live').length;
  const previewSlide: HeroSlide | null = d ? { id: 'preview', eyebrow: d.eyebrow || null, title: d.title || 'Your headline', subtitle: d.subtitle || null, imageUrl: d.imageUrl || null, alt: d.alt, link: d.link || null, ctaLabel: d.ctaLabel || null, secondaryLabel: d.secondaryLabel || null, secondaryLink: d.secondaryLink || null, theme: d.theme, bgColor: d.bgColor || null, layout: d.layout, endsAt: fromLocal(d.endsAt) } : null;

  return (
    <section className="card card-pad">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div><h2 className="text-lg">Homepage hero slides</h2><p className="text-sm text-muted">{live} live · slides rotate every 5.5 seconds in this order. Keep 4–6 live for the best effect.</p></div>
        <Button size="sm" onClick={() => open()}><Plus size={15} />Add slide</Button>
      </div>
      {slides.length ? (
        <ul className="grid gap-3">
          {slides.map((b, i) => {
            const [label, tone] = status(b);
            return (
              <li key={b.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-2.5">
                <span className="relative w-40 aspect-[16/6] rounded-lg overflow-hidden shrink-0 grid place-items-center" style={{ background: b.bgColor ?? (b.theme === 'dark' ? '#092c20' : '#f8f4e8') }}>
                  
                  {b.imageUrl && <img src={b.imageUrl} alt="" className={b.layout === 'cover' ? 'absolute inset-0 size-full object-cover' : 'h-full object-contain p-1'} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{b.title}</p>
                  <p className="text-xs text-muted truncate">{b.eyebrow ?? 'No label'} · {b.layout} · {b.theme}{b.endsAt ? ` · ends ${formatDateTime(b.endsAt)}` : ''}</p>
                </div>
                <Badge tone={tone}>{label}</Badge>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={15} /></Button>
                  <Button size="sm" variant="ghost" aria-label="Move down" disabled={i === slides.length - 1} onClick={() => move(i, 1)}><ArrowDown size={15} /></Button>
                  <Button size="sm" variant="ghost" aria-label={b.active ? 'Hide slide' : 'Show slide'} onClick={() => toggle(b)}>{b.active ? <EyeOff size={15} /> : <Eye size={15} />}</Button>
                  <Button size="sm" variant="outline" onClick={() => open(b)}><Pencil size={14} />Edit</Button>
                  <ConfirmButton variant="ghost" danger title="Delete this slide?" confirmLabel="Delete" onConfirm={async () => { await del(`/admin/banners/${b.id}`); refetch(); }}><Trash2 size={15} /></ConfirmButton>
                </div>
              </li>
            );
          })}
        </ul>
      ) : <p className="text-sm text-muted">No slides yet. The homepage hero stays hidden until you add one.</p>}

      <Drawer open={!!editing} onClose={() => setEditing(null)} wide title={editing?.id ? 'Edit slide' : 'New slide'} subtitle="The preview shows exactly how it will look on a wide screen."
        actions={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={save} disabled={saving || !d?.title || d.title.length < 3}>{saving ? 'Saving…' : 'Save slide'}</Button></>}>
        {d && previewSlide && (
          <div className="grid gap-5">
            <Preview s={previewSlide} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Small label" hint="e.g. Limited time"><Input value={d.eyebrow} maxLength={60} onChange={(e) => set({ eyebrow: e.target.value })} /></Field>
              <Field label="Headline" required><Input value={d.title} maxLength={100} onChange={(e) => set({ title: e.target.value })} /></Field>
              <Field label="Supporting text" className="sm:col-span-2"><Textarea rows={2} maxLength={200} value={d.subtitle} onChange={(e) => set({ subtitle: e.target.value })} /></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
                <UploadButton label={d.imageUrl ? 'Replace image' : 'Upload image'} onUploaded={(url) => set({ imageUrl: url })} />
                {d.imageUrl && <Button size="sm" variant="ghost" onClick={() => set({ imageUrl: '' })}>Remove image</Button>}
                <span className="text-xs text-muted">Full-width: a wide photo (2400×900). Side image: a product cut-out on a transparent background.</span>
              </div>
              <Field label="Layout"><Select value={d.layout} onChange={(e) => set({ layout: e.target.value as Draft['layout'] })}><option value="split">Colour background with side image</option><option value="cover">Full-width photo</option></Select></Field>
              <Field label="Image description" hint="Read aloud by screen readers"><Input value={d.alt} maxLength={150} onChange={(e) => set({ alt: e.target.value })} /></Field>
              <Field label="Text colour"><Select value={d.theme} onChange={(e) => set({ theme: e.target.value as Draft['theme'] })}><option value="dark">Light text (for dark backgrounds)</option><option value="light">Dark text (for light backgrounds)</option></Select></Field>
              <Field label="Background colour">
                <div className="flex items-center gap-2">
                  <input type="color" aria-label="Pick background colour" value={/^#[0-9a-f]{6}$/i.test(d.bgColor) ? d.bgColor : '#174b37'} onChange={(e) => set({ bgColor: e.target.value })} className="h-11 w-14 rounded-lg border border-line cursor-pointer bg-white p-1" />
                  <Input value={d.bgColor} onChange={(e) => set({ bgColor: e.target.value })} placeholder="#174b37" />
                </div>
              </Field>
              <div className="sm:col-span-2 flex flex-wrap gap-2">{['#174b37', '#0f3d2e', '#1d4f7a', '#7a2e2e', '#3b2a63', '#f7ecd2', '#e6efe9', '#fde8e2'].map((c) => <button key={c} type="button" aria-label={`Use ${c}`} onClick={() => set({ bgColor: c, theme: ['#f7ecd2', '#e6efe9', '#fde8e2'].includes(c) ? 'light' : 'dark' })} className="size-8 rounded-full border-2 border-white ring-1 ring-line hover:scale-110 transition" style={{ background: c }} />)}</div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Main button"><Input value={d.ctaLabel} maxLength={40} onChange={(e) => set({ ctaLabel: e.target.value })} /></Field>
              <Field label="Main button link" hint="A page on the site, e.g. /deals"><Input value={d.link} onChange={(e) => set({ link: e.target.value })} /></Field>
              <Field label="Second button (optional)"><Input value={d.secondaryLabel} maxLength={40} onChange={(e) => set({ secondaryLabel: e.target.value })} /></Field>
              <Field label="Second button link"><Input value={d.secondaryLink} onChange={(e) => set({ secondaryLink: e.target.value })} /></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Show from" hint="Leave empty to show now"><Input type="datetime-local" value={d.startsAt} onChange={(e) => set({ startsAt: e.target.value })} /></Field>
              <Field label="Show until" hint="A countdown appears on the slide"><Input type="datetime-local" value={d.endsAt} onChange={(e) => set({ endsAt: e.target.value })} /></Field>
              <Checkbox checked={d.active} onChange={(e) => set({ active: e.target.checked })} label="Visible on the homepage" />
            </div>
          </div>
        )}
      </Drawer>
    </section>
  );
}

// ───────────── Deals page banner ─────────────
export type DealsHeroSettings = { eyebrow: string; title: string; subtitle: string; ctaLabel: string; bgFrom: string; bgVia: string; bgTo: string; showTimer: boolean; showProducts: boolean; fillWithDiscounted: boolean };
const DEAL_PRESETS: [string, string, string, string][] = [
  ['Sale red', '#3d0808', '#c8331f', '#e8902d'], ['Festive purple', '#2a0a3d', '#8e2463', '#e0602b'], ['Emerald gold', '#062a1e', '#17603f', '#c99a3d'],
  ['Midnight blue', '#0b1a33', '#1d4f7a', '#3b7cb5'], ['Diwali gold', '#4a2306', '#b8620f', '#f0b43c'], ['Rose', '#3d0a1f', '#b4234a', '#f06a8a'],
];
const hexOk = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

/** Text, colours and product options for the /deals banner; the products themselves come from live deals. */
export function DealsHeroForm({ value, refetch }: { value: DealsHeroSettings; refetch: () => void }) {
  const [f, setF] = useState<DealsHeroSettings>(value);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<DealsHeroSettings>) => setF((x) => ({ ...x, ...patch }));
  const dirty = JSON.stringify(f) !== JSON.stringify(value);
  const save = async () => {
    setSaving(true);
    try { await put('/admin/deals-hero', f); toast.success('Deals banner saved. It shows on /deals within a minute.'); refetch(); }
    catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  const bg = `linear-gradient(115deg, ${hexOk(f.bgFrom) ? f.bgFrom : '#000'} 0%, ${hexOk(f.bgVia) ? f.bgVia : '#333'} 55%, ${hexOk(f.bgTo) ? f.bgTo : '#666'} 100%)`;
  return (
    <section className="card card-pad grid gap-5">
      <div><h2 className="text-lg">Deals page banner</h2><p className="text-sm text-muted">The big banner at the top of <a href="/deals" target="_blank" rel="noreferrer" className="link">/deals</a>. Products, prices, discounts and the timer always come from the live deals.</p></div>

      <div className="rounded-2xl overflow-hidden text-white p-6 md:p-8 relative" style={{ background: bg }}>
        <span className="inline-flex rounded-full bg-white/15 border border-white/20 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em]">{f.eyebrow || '—'}</span>
        <p className="mt-3 font-display text-[34px] md:text-[46px] leading-none bg-gradient-to-b from-white to-[#ffd98a] bg-clip-text text-transparent">{f.title || 'Up to NN% OFF'}</p>
        {f.subtitle && <p className="text-white/80 mt-2 max-w-lg text-sm">{f.subtitle}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          {f.showTimer && <span className="rounded-lg bg-white text-ink px-2.5 py-1 font-semibold">01 : 18 : 45</span>}
          <span className="rounded-full bg-white text-ink px-4 py-1.5 font-semibold">{f.ctaLabel || 'Shop (current deal)'} →</span>
          {f.showProducts && <span className="text-white/75">+ top 3 deal products on the right</span>}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Small label"><Input value={f.eyebrow} maxLength={40} onChange={(e) => set({ eyebrow: e.target.value })} /></Field>
        <Field label="Headline" hint="Leave empty to show “Up to N% OFF” from the real discounts"><Input value={f.title} maxLength={60} onChange={(e) => set({ title: e.target.value })} placeholder="Up to N% OFF (automatic)" /></Field>
        <Field label="Supporting text" className="sm:col-span-2"><Textarea rows={2} maxLength={220} value={f.subtitle} onChange={(e) => set({ subtitle: e.target.value })} /></Field>
        <Field label="Button text" hint="Leave empty for “Shop” plus the current deal’s name"><Input value={f.ctaLabel} maxLength={40} onChange={(e) => set({ ctaLabel: e.target.value })} placeholder="Shop (current deal) — automatic" /></Field>
      </div>

      <div className="grid gap-3">
        <p className="text-sm font-semibold">Background</p>
        <div className="flex flex-wrap gap-2">
          {DEAL_PRESETS.map(([name, a, b, c]) => {
            const on = f.bgFrom === a && f.bgVia === b && f.bgTo === c;
            return (
              <button key={name} type="button" onClick={() => set({ bgFrom: a, bgVia: b, bgTo: c })} aria-pressed={on}
                className={`flex items-center gap-2 rounded-full border pl-1 pr-3 py-1 text-[13px] font-semibold hover:border-forest ${on ? 'border-forest bg-mint' : 'border-line'}`}>
                <span className="size-6 rounded-full" style={{ background: `linear-gradient(115deg, ${a}, ${b}, ${c})` }} />{name}
              </button>
            );
          })}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {([['bgFrom', 'Left colour'], ['bgVia', 'Middle colour'], ['bgTo', 'Right colour']] as const).map(([k, label]) => (
            <Field key={k} label={label} error={hexOk(f[k]) ? undefined : 'Use a colour like #b42318'}>
              <div className="flex items-center gap-2">
                <input type="color" aria-label={`Pick ${label.toLowerCase()}`} value={hexOk(f[k]) ? f[k] : '#000000'} onChange={(e) => set({ [k]: e.target.value })} className="h-11 w-14 rounded-lg border border-line cursor-pointer bg-white p-1" />
                <Input value={f[k]} onChange={(e) => set({ [k]: e.target.value })} />
              </div>
            </Field>
          ))}
        </div>
        <p className="text-xs text-muted">Text on the banner is white, so pick darker colours on the left.</p>
      </div>

      <div className="grid gap-2">
        <Checkbox checked={f.showTimer} onChange={(e) => set({ showTimer: e.target.checked })} label="Show the countdown of the current deal" />
        <Checkbox checked={f.showProducts} onChange={(e) => set({ showProducts: e.target.checked })} label="Show the top 3 deal products (biggest discount first)" />
        <Checkbox checked={f.fillWithDiscounted} disabled={!f.showProducts} onChange={(e) => set({ fillWithDiscounted: e.target.checked })} label="If fewer than 3 products are on deal, fill up with other discounted products" />
      </div>

      <div className="flex gap-2">
        <Button onClick={save} disabled={!dirty || saving || ![f.bgFrom, f.bgVia, f.bgTo].every(hexOk)}>{saving ? 'Saving…' : 'Save deals banner'}</Button>
        {dirty && <Button variant="ghost" onClick={() => setF(value)}>Discard changes</Button>}
      </div>
    </section>
  );
}

// ───────────── Homepage deal block ─────────────
export type HomeDealSettings = { enabled: boolean; promotionId: string; label: string; ctaLabel: string; bgFrom: string; bgVia: string; bgTo: string; showTimer: boolean; showOtherDeals: boolean };
export type PromotionOption = { id: string; name: string; discountBps: number; startsAt: string; endsAt: string; active: boolean };

/** Which deal the homepage features, and how the block looks. Products, prices and the timer come from the deal. */
export function HomeDealForm({ value, promotions, refetch }: { value: HomeDealSettings; promotions: PromotionOption[]; refetch: () => void }) {
  const [f, setF] = useState<HomeDealSettings>(value);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<HomeDealSettings>) => setF((x) => ({ ...x, ...patch }));
  const dirty = JSON.stringify(f) !== JSON.stringify(value);
  const [now] = useState(() => Date.now()); // fixed when the form opens; only used to label deals live or scheduled
  const stateOf = (p: PromotionOption) => (!p.active ? 'paused' : Date.parse(p.startsAt) > now ? 'scheduled' : 'live');
  const chosen = promotions.find((p) => p.id === f.promotionId);
  const missing = !!f.promotionId && !chosen;
  const save = async () => {
    setSaving(true);
    try { await put('/admin/home-deal', f); toast.success('Homepage deal block saved. It shows on the homepage within a minute.'); refetch(); }
    catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  const bg = `linear-gradient(150deg, ${hexOk(f.bgFrom) ? f.bgFrom : '#000'} 0%, ${hexOk(f.bgVia) ? f.bgVia : '#333'} 55%, ${hexOk(f.bgTo) ? f.bgTo : '#666'} 100%)`;
  return (
    <section className="card card-pad grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg">Homepage deal block</h2><p className="text-sm text-muted">The “Deal of the day” panel on the homepage. Its products, prices, discount and timer come from the deal you pick.</p></div>
        <Checkbox checked={f.enabled} onChange={(e) => set({ enabled: e.target.checked })} label="Show on the homepage" />
      </div>

      <div className={`grid gap-4 md:grid-cols-[260px_1fr] items-stretch ${f.enabled ? '' : 'opacity-50'}`}>
        <div className="rounded-2xl p-5 text-white grid gap-3 content-between min-h-[200px]" style={{ background: bg }}>
          <div>
            <span className="inline-flex rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em]">{f.label || '—'}</span>
            <p className="font-display text-2xl mt-2">{chosen?.name ?? 'Live deal ending soonest'}</p>
            <p className="font-display text-3xl">{chosen ? `${Math.round(chosen.discountBps / 100)}% OFF` : 'NN% OFF'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {f.showTimer && <span className="rounded-lg bg-white text-ink px-2 py-0.5 font-semibold">01 : 18 : 10</span>}
            <span className="rounded-full bg-white text-ink px-3 py-1 font-semibold">{f.ctaLabel || '—'} →</span>
          </div>
        </div>
        <div className="grid gap-3 content-start">
          <Field label="Which deal to feature" error={missing ? 'The chosen deal has ended or was removed; the homepage is using the automatic choice.' : undefined}>
            <Select value={f.promotionId} onChange={(e) => set({ promotionId: e.target.value })}>
              <option value="">Automatic — the live deal ending soonest</option>
              {promotions.map((p) => <option key={p.id} value={p.id}>{p.name} · {Math.round(p.discountBps / 100)}% · {stateOf(p)} · ends {formatDateTime(p.endsAt)}</option>)}
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Label"><Input value={f.label} maxLength={40} onChange={(e) => set({ label: e.target.value })} /></Field>
            <Field label="Button text"><Input value={f.ctaLabel} maxLength={30} onChange={(e) => set({ ctaLabel: e.target.value })} /></Field>
          </div>
          <Checkbox checked={f.showTimer} onChange={(e) => set({ showTimer: e.target.checked })} label="Show the countdown" />
          <Checkbox checked={f.showOtherDeals} onChange={(e) => set({ showOtherDeals: e.target.checked })} label="List other live deals as quick links" />
        </div>
      </div>

      <div className="grid gap-3">
        <p className="text-sm font-semibold">Background</p>
        <div className="flex flex-wrap gap-2">
          {DEAL_PRESETS.map(([name, a, b, c]) => {
            const on = f.bgFrom === a && f.bgVia === b && f.bgTo === c;
            return (
              <button key={name} type="button" onClick={() => set({ bgFrom: a, bgVia: b, bgTo: c })} aria-pressed={on}
                className={`flex items-center gap-2 rounded-full border pl-1 pr-3 py-1 text-[13px] font-semibold hover:border-forest ${on ? 'border-forest bg-mint' : 'border-line'}`}>
                <span className="size-6 rounded-full" style={{ background: `linear-gradient(115deg, ${a}, ${b}, ${c})` }} />{name}
              </button>
            );
          })}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {([['bgFrom', 'Top colour'], ['bgVia', 'Middle colour'], ['bgTo', 'Bottom colour']] as const).map(([k, label]) => (
            <Field key={k} label={label} error={hexOk(f[k]) ? undefined : 'Use a colour like #b42318'}>
              <div className="flex items-center gap-2">
                <input type="color" aria-label={`Pick ${label.toLowerCase()}`} value={hexOk(f[k]) ? f[k] : '#000000'} onChange={(e) => set({ [k]: e.target.value })} className="h-11 w-14 rounded-lg border border-line cursor-pointer bg-white p-1" />
                <Input value={f[k]} onChange={(e) => set({ [k]: e.target.value })} />
              </div>
            </Field>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={save} disabled={!dirty || saving || ![f.bgFrom, f.bgVia, f.bgTo].every(hexOk) || f.label.trim().length < 2 || f.ctaLabel.trim().length < 2}>{saving ? 'Saving…' : 'Save deal block'}</Button>
        {dirty && <Button variant="ghost" onClick={() => setF(value)}>Discard changes</Button>}
      </div>
    </section>
  );
}
