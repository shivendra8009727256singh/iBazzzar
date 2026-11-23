import {Suspense} from 'react';
import {WorkspaceShell} from '@/components/workspace';
import {Business} from '@/components/business';
export const metadata={title:'Business workspace'};
export default function Page(){return <WorkspaceShell title="Business workspace"><Suspense fallback={<p>Loading your workspace…</p>}><Business/></Suspense></WorkspaceShell>;}
