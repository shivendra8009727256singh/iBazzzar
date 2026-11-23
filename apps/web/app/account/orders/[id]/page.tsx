import {Suspense} from 'react';
import {WorkspaceShell} from '@/components/workspace';
import {OrderDetail} from '@/components/account';
export const metadata={title:'Order details'};
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <WorkspaceShell title="Order"><Suspense fallback={<p>Loading order…</p>}><OrderDetail id={id}/></Suspense></WorkspaceShell>;}
