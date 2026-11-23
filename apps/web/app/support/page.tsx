'use client';
import {WorkspaceShell} from '@/components/workspace';
import {SupportQueue} from '@/components/admin/platform';
import {useUser} from '@/components/providers';
import {can} from '@ibazzzar/shared';
function Queue(){const {data:user}=useUser();return can(user?.role||'','support.manage')?<><span className="eyebrow">CUSTOMER CARE</span><h1>Support queue</h1><SupportQueue/></>:<div className="notice">Support staff access is required.</div>;}
export default function Page(){return <WorkspaceShell title="Support queue"><Queue/></WorkspaceShell>;}
