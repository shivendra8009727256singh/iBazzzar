'use client';
import Link from 'next/link';
import {useState,type ReactNode,type FormEvent} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {usePathname,useRouter} from 'next/navigation';
import {ArrowUpRight,LogOut} from 'lucide-react';
import {post} from '@/lib/api';
import {useUser,useShop} from './providers';
import {isStaff} from '@ibazzzar/shared';

export const field=(form:FormData,name:string)=>String(form.get(name)||'').trim();
export const paise=(form:FormData,name:string)=>Math.round(Number(form.get(name))*100);
export function WorkspaceShell({children,title}:{children:ReactNode;title:string}){const {data:user,isPending}=useUser(),client=useQueryClient(),router=useRouter(),path=usePathname();if(isPending)return <div className="container section">Opening your workspace…</div>;if(!user)return <section className="container empty"><h1>A space that’s yours.</h1><p>Sign in to open your {title.toLowerCase()}.</p><Link href={`/login?portal=${path.startsWith("/seller")?"seller":path.startsWith("/business")?"business":path.startsWith("/admin")||path.startsWith("/support")?"staff":"shopper"}&next=${encodeURIComponent(path)}`} className="button primary">Sign in or create an account</Link></section>;
 const links=[['/account','Account & orders'],['/wishlist','Saved discoveries'],['/business','Business workspace'],['/seller','Seller workspace'],...(isStaff(user.role)?[['/admin','Admin console']]:[])];
 return <section className="container section workspace"><aside className="workspace-nav"><span className="eyebrow">HELLO, {user.name.split(' ')[0].toUpperCase()}</span>{links.map(([href,name])=><Link key={href} href={href} className={path.startsWith(href)?'active':''} aria-current={path.startsWith(href)?'page':undefined}>{name}</Link>)}<Link href="/products">Back to the mall <ArrowUpRight size={12}/></Link><button className="text-link" onClick={async()=>{await post('/auth/logout',{});client.setQueryData(['user'],null);client.clear();router.push('/login');}}><LogOut size={14}/> Sign out</button></aside><div className="workspace-body">{children}</div></section>;}
export function ActionForm({children,onSubmit,label='Save',className='',reset=false,variant='primary'}:{children:ReactNode;onSubmit:(form:FormData)=>Promise<unknown>;label?:string;className?:string;reset?:boolean;variant?:'primary'|'outline'}){const [busy,setBusy]=useState(false),[error,setError]=useState(''),shop=useShop();return <form className={`form-stack ${className}`} onSubmit={async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const form=e.currentTarget;setBusy(true);setError('');try{await onSubmit(new FormData(form));if(reset)form.reset();shop.notify('Saved successfully');}catch(err){setError((err as Error).message);}finally{setBusy(false);}}}>{children}{error&&<div className="error" role="alert">{error}</div>}<button className={`button ${variant}`} disabled={busy}>{busy?'Saving…':label}</button></form>;}
