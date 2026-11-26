'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Monitor, Smartphone } from 'lucide-react';
import { api, patch, post } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useSession } from '@/components/providers';
import { Alert, Badge, Button, Checkbox, Field, Input, PageHeader, Spinner, useFormErrors } from '@/components/ui';
import { PrivacySection } from '@/components/privacy-section';

/** "Chrome on Windows" from a browser's user-agent string; the full string stays available as a tooltip. */
function deviceName(ua: string | null) {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null;
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? ua;
}

export default function ProfilePage() {
  const { user } = useSession();
  const qc = useQueryClient();
  const [name, setName] = useState<string | null>(null);
  const [marketing, setMarketing] = useState<boolean | null>(null);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const errors = useFormErrors();
  const { data: sessions } = useQuery({ queryKey: ['sessions'], queryFn: () => api<{ sessions: { id: string; current: boolean; userAgent: string | null; createdAt: string }[] }>('/auth/sessions') });
  if (!user) return <Spinner />;
  const saveProfile = async () => {
    setBusy('profile');
    try { await patch('/auth/profile', { name: name ?? user.name, marketingOptIn: marketing ?? user.marketingOptIn }); await qc.invalidateQueries({ queryKey: ['me'] }); toast.success('Profile updated'); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const changePassword = async () => {
    setBusy('password'); errors.clear();
    try { const r = await post<{ message: string }>('/auth/password', pw); toast.success(r.message); setPw({ currentPassword: '', newPassword: '' }); qc.invalidateQueries({ queryKey: ['sessions'] }); } catch (e) { errors.set(e); } finally { setBusy(null); }
  };
  return (
    <>
      <PageHeader title="Profile & security" />
      <div className="grid gap-5">
        <section className="card card-pad grid gap-4 max-w-2xl">
          <h2 className="text-lg">Your details</h2>
          <Field label="Full name"><Input value={name ?? user.name} onChange={(e) => setName(e.target.value)} /></Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Email" hint={user.emailVerifiedAt ? 'Confirmed' : 'Not yet confirmed'}><Input value={user.email} disabled /></Field>
            <Field label="Mobile"><Input value={user.phone ?? ''} disabled /></Field>
          </div>
          <Checkbox checked={marketing ?? user.marketingOptIn} onChange={(e) => setMarketing(e.target.checked)} label="Email me offers and new arrivals" />
          <Button className="justify-self-start" loading={busy === 'profile'} onClick={saveProfile}>Save changes</Button>
        </section>
        <section className="card card-pad grid gap-4 max-w-2xl">
          <h2 className="text-lg">Change password</h2>
          {errors.message && <Alert>{errors.message}</Alert>}
          <Field label="Current password" error={errors.field('currentPassword')}><Input type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
          <Field label="New password" error={errors.field('newPassword')} hint="At least 12 characters. Other devices will be signed out."><Input type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
          <Button className="justify-self-start" loading={busy === 'password'} onClick={changePassword}>Update password</Button>
        </section>
        <section className="card card-pad max-w-2xl">
          <h2 className="text-lg mb-3">Signed-in devices</h2>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-3">
            {sessions?.sessions.map((s) => {
              const Icon = /Mobile|Android|iPhone|iPad/i.test(s.userAgent ?? '') ? Smartphone : Monitor;
              return (
                <li key={s.id} className="flex min-w-0 items-center gap-3 text-sm">
                  <Icon size={17} className="shrink-0 text-forest" />
                  <span className="flex-1 min-w-0" title={s.userAgent ?? undefined}>
                    <span className="block truncate font-medium">{deviceName(s.userAgent)}</span>
                    <span className="block text-xs text-muted">Signed in {formatDateTime(s.createdAt)}</span>
                  </span>
                  {s.current && <Badge tone="success" className="shrink-0">This device</Badge>}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted mt-3">Changing your password signs out every other device.</p>
        </section>
        <PrivacySection />
      </div>
    </>
  );
}
