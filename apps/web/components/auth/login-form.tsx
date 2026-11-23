'use client';
import {useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useQueryClient} from '@tanstack/react-query';
import {ShoppingBag,Building2,Store,ShieldCheck} from 'lucide-react';
import {loginSchema} from '@ibazzzar/validation';
import {isStaff} from '@ibazzzar/shared';
import {post} from '@/lib/api';
import {formPayload,fieldErrors} from '@/lib/forms';
import type {User} from '@/lib/types';
import {FormErrors,Field,PasswordField} from './fields';

export type Portal='shopper'|'business'|'seller'|'staff';
export const portals:{id:Portal;icon:typeof ShoppingBag;label:string;title:string;copy:string}[]=[
 {id:'shopper',icon:ShoppingBag,label:'Shopper',title:'Welcome back.',copy:'Sign in to pick up where you left off.'},
 {id:'business',icon:Building2,label:'Business',title:'Business buying.',copy:'Quotations, purchase orders and approvals for your team.'},
 {id:'seller',icon:Store,label:'Seller',title:'Seller Hub.',copy:'Orders, catalogue, returns and settlements for your store.'},
 {id:'staff',icon:ShieldCheck,label:'Staff',title:'Marketplace staff.',copy:'Support and administration. Access is granted by an administrator.'},
];
const safeNext=(next:string|null)=>next&&next.startsWith('/')&&!next.startsWith('//')?next:null;
// The portal only decides where to land. Every page and API still checks the account's real permissions.
export function destination(user:User,portal:Portal,next:string|null){
 if(portal==='staff')return isStaff(user.role)&&user.role!=='ADMIN'?'/admin':null;
 if(portal==='seller')return '/seller';
 if(portal==='business')return '/business';
 return safeNext(next)??'/account';
}
export function LoginForm({initialPortal,next}:{initialPortal:Portal;next:string|null}){
 const router=useRouter(),client=useQueryClient(),[portal,setPortal]=useState<Portal>(initialPortal),[errors,setErrors]=useState<Record<string,string>>({}),[serverError,setServerError]=useState(''),[busy,setBusy]=useState(false);
 const meta=portals.find(p=>p.id===portal)!;
 const pick=(p:Portal)=>{setPortal(p);setServerError('');window.history.replaceState(null,'',`/login?portal=${p}${next?`&next=${encodeURIComponent(next)}`:''}`);};
 return <div className="login-panel">
  <div className="portal-tabs" role="tablist" aria-label="Sign in as">{portals.map(p=><button key={p.id} role="tab" type="button" aria-selected={portal===p.id} className={portal===p.id?'active':''} onClick={()=>pick(p.id)}><p.icon size={17}/><span>{p.label}</span></button>)}</div>
  <span className="eyebrow">{portal==='staff'?'RESTRICTED ACCESS':'YOUR WORLD, A LITTLE CLOSER'}</span><h1>{meta.title}</h1><p className="muted">{meta.copy}</p>
  <FormErrors.Provider value={{errors,touch:()=>{}}}><form className="form-stack" noValidate onSubmit={async e=>{e.preventDefault();setServerError('');const payload=formPayload(e.currentTarget),{errors:found,data}=fieldErrors(loginSchema,payload);setErrors(found);if(!data)return;
    setBusy(true);try{const {user}=await post<{user:User}>('/auth/login',data);const target=destination(user,portal,next);
     if(!target){await post('/auth/logout',{});client.setQueryData(['user'],null);setServerError(user.role==='ADMIN'?'Super Admin accounts sign in from the dedicated Super Admin portal.':'This account does not have marketplace staff access. Use the Shopper, Business or Seller tab instead.');return;}
     client.setQueryData(['user'],user);router.push(target);router.refresh();}catch(err){setServerError((err as Error).message);}finally{setBusy(false);}}}>
   <Field name="email" label="Email address" type="email" autoComplete="username" required/>
   <PasswordField name="password" autoComplete="current-password" showStrength={false}/>
   <Link className="text-button forgot" href="/reset-password">Forgot your password?</Link>
   {serverError&&<div className="error" role="alert">{serverError}</div>}
   <button className="button primary" disabled={busy}>{busy?'Signing in…':portal==='staff'?'Sign in to staff console':'Sign in'}</button>
  </form></FormErrors.Provider>
  {portal==='staff'?<p className="notice">Staff accounts cannot be created here. An administrator grants staff roles to an existing account. Super Admins use the <Link className="text-button" href="/superadmin/login">Super Admin sign-in</Link>.</p>:<p className="switch-auth">New to IBazzzar? <Link className="text-button" href={`/register?type=${portal==='shopper'?'customer':portal}${next?`&next=${encodeURIComponent(next)}`:''}`}>{portal==='seller'?'Open a store':portal==='business'?'Create a business account':'Create an account'}</Link></p>}
  <p className="security-note">Five wrong passwords lock the account for 15 minutes. We never ask for your password by phone or email.</p>
 </div>;}
