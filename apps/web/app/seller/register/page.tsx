'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { post } from '@/lib/api';
import { useSession } from '@/components/providers';
import { SellerProfileFields, sellerPayload, emptySeller } from '@/components/profile-forms';
import { Alert, Button, PageHeader, Spinner, useFormErrors } from '@/components/ui';

export default function SellerRegisterPage() {
  const { user, loading } = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const [value, setValue] = useState(emptySeller);
  const [busy, setBusy] = useState(false);
  const errors = useFormErrors();
  if (loading) return <Spinner />;
  if (!user) return <div className="container-page py-12"><Alert tone="info">Please <Link href="/login?next=/seller/register" className="underline">sign in</Link> or <Link href="/register?as=seller" className="underline">create a seller account</Link>.</Alert></div>;
  const submit = async () => {
    setBusy(true); errors.clear();
    try { await post('/seller/register', sellerPayload(value)); await qc.invalidateQueries(); router.push('/seller'); } catch (e) { errors.set(e); setBusy(false); }
  };
  return (
    <div className="container-page py-8 max-w-3xl">
      <PageHeader eyebrow="Sell on IBazzzar" title="Apply to open your store" description="We review every application. You’ll hear from us by notification and email." />
      <div className="card card-pad grid gap-5">
        {errors.message && <Alert>{errors.message}</Alert>}
        <SellerProfileFields value={value} onChange={setValue} err={errors.field} />
        <Button size="lg" loading={busy} onClick={submit}>Submit application</Button>
      </div>
    </div>
  );
}
