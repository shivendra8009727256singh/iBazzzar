'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LogOut, Monitor, Smartphone } from 'lucide-react';
import { deviceName, isMobileDevice } from '@ibazzzar/shared';
import { api, del, patch, post } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useSession } from '@/components/providers';
import { Alert, Badge, Button, Checkbox, ConfirmButton, Field, Input, PageHeader, Spinner, useFormErrors } from '@/components/ui';
import { PrivacySection } from '@/components/privacy-section';

type Device = { id: string; current: boolean; userAgent: string | null; createdAt: string; lastSeenAt: string };

/** "Active now", "Active 12 min ago", "Active 3 hours ago", then a date. The server refreshes it every 5 minutes. */
function lastActive(value: string) {
  const min = Math.floor((Date.now() - new Date(value).getTime()) / 60_000);
  if (min < 5) return 'Active now';
  if (min < 60) return `Active ${min} min ago`;
  if (min < 24 * 60) {
    const hours = Math.floor(min / 60);
    return `Active ${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  return `Last active ${formatDateTime(value)}`;
}

export default function ProfilePage() {
  const { user } = useSession();
  const qc = useQueryClient();
  const [name, setName] = useState<string | null>(null);
  const [marketing, setMarketing] = useState<boolean | null>(null);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const errors = useFormErrors();
  const { data: sessions } = useQuery({ queryKey: ['sessions'], queryFn: () => api<{ sessions: Device[] }>('/auth/sessions'), refetchInterval: 60_000 });
  const others = sessions?.sessions.filter((s) => !s.current).length ?? 0;
  if (!user) return <Spinner />;
  const saveProfile = async () => {
    setBusy('profile');
    try { await patch('/auth/profile', { name: name ?? user.name, marketingOptIn: marketing ?? user.marketingOptIn }); await qc.invalidateQueries({ queryKey: ['me'] }); toast.success('Profile updated'); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const changePassword = async () => {
    setBusy('password'); errors.clear();
    try { const r = await post<{ message: string }>('/auth/password', pw); toast.success(r.message); setPw({ currentPassword: '', newPassword: '' }); qc.invalidateQueries({ queryKey: ['sessions'] }); } catch (e) { errors.set(e); } finally { setBusy(null); }
  };
  const signOutDevice = async (device: Device) => {
    const r = await del<{ message: string }>(`/auth/sessions/${device.id}`);
    toast.success(r.message);
    await qc.invalidateQueries({ queryKey: ['sessions'] });
  };
  const signOutOthers = async () => {
    const r = await post<{ message: string }>('/auth/sessions/revoke-others');
    toast.success(r.message);
    await qc.invalidateQueries({ queryKey: ['sessions'] });
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
        <section id="devices" className="card card-pad max-w-2xl scroll-mt-32">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg">Signed-in devices</h2>
            {others > 0 && (
              <ConfirmButton variant="ghost" danger title="Sign out of all other devices?" confirmLabel="Sign out all" onConfirm={signOutOthers}
                body={`${others} other device${others === 1 ? '' : 's'} will be signed out and will need the password to sign in again. You stay signed in here.`}>
                <LogOut size={15} />Sign out all other devices
              </ConfirmButton>
            )}
          </div>
          <ul className="grid grid-cols-[minmax(0,1fr)] divide-y divide-line">
            {sessions?.sessions.map((s) => {
              const Icon = isMobileDevice(s.userAgent) ? Smartphone : Monitor;
              const name = deviceName(s.userAgent);
              const activity = s.current ? 'Active now' : lastActive(s.lastSeenAt);
              return (
                <li key={s.id} className="flex min-w-0 items-center gap-3 py-3 text-sm first:pt-0 last:pb-0">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-mint text-forest"><Icon size={17} /></span>
                  <span className="flex-1 min-w-0" title={s.userAgent ?? undefined}>
                    <span className="block truncate font-medium">{name}</span>
                    <span className="block text-xs text-muted">
                      <span className={activity === 'Active now' ? 'font-semibold text-forest' : undefined}>{activity}</span>
                      {' · '}Signed in {formatDateTime(s.createdAt)}
                    </span>
                  </span>
                  {s.current ? <Badge tone="success" className="shrink-0">This device</Badge> : (
                    <ConfirmButton variant="outline" danger title={`Sign out ${name}?`} confirmLabel="Sign out" onConfirm={() => signOutDevice(s)}
                      body="That device will need the password to sign in again. If it wasn’t you, change your password as well.">
                      Sign out
                    </ConfirmButton>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted mt-3">Don’t recognise a device? Sign it out and change your password. We also email you whenever your account is signed in from a new device.</p>
        </section>
        <PrivacySection />
      </div>
    </>
  );
}
