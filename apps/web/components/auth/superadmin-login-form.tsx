'use client';
import {useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useQueryClient} from '@tanstack/react-query';
import {ShieldCheck} from 'lucide-react';
import {loginSchema} from '@ibazzzar/validation';
import {post} from '@/lib/api';
import {formPayload,fieldErrors} from '@/lib/forms';
import type {User} from '@/lib/types';
import {FormErrors,Field,PasswordField} from './fields';

// Only the Super Admin (role ADMIN) may enter here. The API still enforces every capability.
export function SuperAdminLoginForm(){
 const router=useRouter(),client=useQueryClient(),[errors,setErrors]=useState<Record<string,string>>({}),[serverError,setServerError]=useState(''),[busy,setBusy]=useState(false);
 return <div className="login-panel">
  <div className="superadmin-seal"><ShieldCheck size={17}/><span>Super Admin only</span></div>
  <span className="eyebrow">SECURE SIGN-IN</span><h1>Super Admin sign in</h1>
  <p className="muted">This entrance is reserved for the platform owner. Staff accounts use the staff portal.</p>
  <FormErrors.Provider value={{errors,touch:()=>{}}}><form className="form-stack" noValidate onSubmit={async e=>{
   e.preventDefault();setServerError('');const payload=formPayload(e.currentTarget),{errors:found,data}=fieldErrors(loginSchema,payload);setErrors(found);if(!data)return;
   setBusy(true);try{const {user}=await post<{user:User}>('/auth/login',data);
    if(user.role!=='ADMIN'){await post('/auth/logout',{});client.setQueryData(['user'],null);setServerError('This portal is for the Super Admin only. Staff accounts sign in at the staff portal.');return;}
    client.setQueryData(['user'],user);router.push('/admin');router.refresh();}catch(err){setServerError((err as Error).message);}finally{setBusy(false);}}}>
   <Field name="email" label="Super Admin email" type="email" autoComplete="username" required/>
   <PasswordField name="password" autoComplete="current-password" showStrength={false}/>
   <Link className="text-button forgot" href="/reset-password">Forgot your password?</Link>
   {serverError&&<div className="error" role="alert">{serverError}</div>}
   <button className="button primary" disabled={busy}>{busy?'Signing in…':'Enter the console'}</button>
  </form></FormErrors.Provider>
  <p className="security-note">Five wrong passwords lock the account for 15 minutes. Every console sign-in is recorded in the audit log.</p>
  <p className="switch-auth"><Link className="text-button" href="/login?portal=staff">Staff sign-in</Link> · <Link className="text-button" href="/">Back to storefront</Link></p>
 </div>;}
