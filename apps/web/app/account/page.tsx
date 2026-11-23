import {Suspense} from 'react';
import {WorkspaceShell} from '@/components/workspace';
import {Account} from '@/components/account';
export const metadata={title:'Account & orders'};
export default function Page(){return <WorkspaceShell title="Account"><Suspense fallback={<p>Loading your account…</p>}><Account/></Suspense></WorkspaceShell>;}
