'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { post } from '@/lib/api';
import { useSession } from '@/components/providers';
import { BusinessProfileFields, businessPayload, emptyBusiness } from '@/components/profile-forms';
import { Alert, Button, PageHeader, Spinner, useFormErrors } from '@/components/ui';
import Link from 'next/link';

export default function BusinessRegisterPage() {
  const { user, loading } = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const [value, setValue] = useState(emptyBusiness);
  const [busy, setBusy] = useState(false);
  const errors = useFormErrors();
  if (loading) return <Spinner />;
  if (!user) return <div className="container-page py-12"><Alert tone="info">Please <Link href="/login?next=/business/register" className="underline">sign in</Link> or <Link href="/register?as=business" className="underline">create a business account</Link>.</Alert></div>;
  const submit = async () => {
    setBusy(true); errors.clear();
    try { await post('/business/register', businessPayload(value)); await qc.invalidateQueries(); router.push('/business'); } catch (e) { errors.set(e); setBusy(false); }
  };
  return (
    <div className="container-page py-8 max-w-3xl">
      <PageHeader eyebrow="Business account" title="Tell us about your business" description="Used on purchase orders and GST invoices. Our team reviews it before enabling wholesale features." />
      <div className="card card-pad grid gap-5">
        {errors.message && <Alert>{errors.message}</Alert>}
        <BusinessProfileFields value={value} onChange={setValue} err={errors.field} />
        <Button size="lg" loading={busy} onClick={submit}>Submit for review</Button>
      </div>
    </div>
  );
}
