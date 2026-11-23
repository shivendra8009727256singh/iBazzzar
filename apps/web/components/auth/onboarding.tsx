'use client';
import {useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {businessProfileSchema,sellerProfileSchema} from '@ibazzzar/validation';
import {post,ApiError} from '@/lib/api';
import {formPayload,fieldErrors} from '@/lib/forms';
import {useUser} from '../providers';
import {FormErrors,BusinessFields,SellerFields} from './fields';

// For signed-in accounts adding a business or store later. Same fields and server schema as registration.
export function OnboardingForm({kind}:{kind:'business'|'seller'}){
 const client=useQueryClient(),{data:user}=useUser(),schema=kind==='business'?businessProfileSchema:sellerProfileSchema,[errors,setErrors]=useState<Record<string,string>>({}),[serverError,setServerError]=useState(''),[busy,setBusy]=useState(false);
 const build=(form:HTMLFormElement)=>{const p=formPayload(form);if(!p.contactPhone&&user?.phone)p.contactPhone=user.phone;return p;};
 return <FormErrors.Provider value={{errors,touch:()=>{}}}><form className="register-form onboarding" noValidate onSubmit={async e=>{e.preventDefault();setServerError('');const form=e.currentTarget,payload=build(form),{errors:found,data}=fieldErrors(schema,payload);setErrors(found);
   if(!data){(form.querySelector('[aria-invalid="true"]') as HTMLElement|null)?.focus();return;}
   setBusy(true);try{await post(kind==='business'?'/business/register':'/seller/register',payload);await client.invalidateQueries({queryKey:['user']});}catch(err){setServerError((err as Error).message);if(err instanceof ApiError&&Object.keys(err.fields).length)setErrors(err.fields);}finally{setBusy(false);}}}>
  {kind==='business'?<BusinessFields prefix=""/>:<SellerFields prefix=""/>}
  {Object.keys(errors).length>0&&<div className="error" role="alert">Please fix the highlighted fields.</div>}{serverError&&<div className="error" role="alert">{serverError}</div>}
  <p className="muted">{kind==='business'?'Your organisation is reviewed by our team. Registration does not grant credit or verified status.':'Your store goes live after review. Bank details for payouts are collected through the payment provider after approval.'}</p>
  <button className="button primary submit" disabled={busy}>{busy?'Submitting…':kind==='business'?'Create business account':'Submit store application'}</button>
 </form></FormErrors.Provider>;}
