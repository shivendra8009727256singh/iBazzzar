'use client';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container-page py-24 text-center max-w-xl" role="alert">
      <span className="mx-auto size-16 rounded-2xl bg-danger-bg text-danger grid place-items-center"><AlertTriangle size={30} /></span>
      <h1 className="text-3xl mt-5">Something went wrong</h1>
      <p className="text-muted mt-3">This page couldn’t load. It’s usually temporary — please try again.</p>
      <div className="mt-7 flex justify-center gap-3"><button onClick={reset} className="btn btn-primary">Try again</button><Link href="/" className="btn btn-outline">Go home</Link></div>
    </div>
  );
}
