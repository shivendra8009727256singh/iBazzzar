'use client';
import {useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useQueryClient} from '@tanstack/react-query';
import {ShoppingBag,Building2,Store,Users,ShieldCheck,ArrowRight,ArrowLeft,Check as Tick} from 'lucide-react';
import {accountRegisterSchema} from '@ibazzzar/validation';
import {post,ApiError} from '@/lib/api';
import {formPayload,fieldErrors} from '@/lib/forms';
import type {User} from '@/lib/types';
import {useUser} from '../providers';
import {FormErrors,Field,PhoneField,PasswordField,Check,BusinessFields,SellerFields} from './fields';

export type AccountType='customer'|'business'|'seller';
export const accountTypes:{id:AccountType;icon:typeof ShoppingBag;title:string;for:string;perks:string[];next:string}[]=[
 {id:'customer',icon:ShoppingBag,title:'Shopper',for:'Buy for yourself and your family',perks:['Retail prices and offers','Order tracking and easy returns','Saved addresses and wishlist'],next:'/account'},
 {id:'business',icon:Building2,title:'Business buyer',for:'Source for your company or shop',perks:['Wholesale tiers and MOQ pricing','Quotations and purchase orders','Team roles and approval limits'],next:'/business'},
 {id:'seller',icon:Store,title:'Seller',for:'Sell retail and wholesale on IBazzzar',perks:['Store, catalogue and inventory tools','Order fulfilment and returns','Settlement ledger and team access'],next:'/seller'},
];
const safeNext=(next:string|null)=>next&&next.startsWith('/')&&!next.startsWith('//')?next:null;

export function RegisterForm({initialType,next}:{initialType:AccountType|null;next:string|null}){
 const router=useRouter(),client=useQueryClient(),{data:signedIn}=useUser();
 const [type,setType]=useState<AccountType|null>(initialType),[errors,setErrors]=useState<Record<string,string>>({}),[touched,setTouched]=useState<Set<string>>(new Set()),[submitted,setSubmitted]=useState(false),[serverError,setServerError]=useState(''),[busy,setBusy]=useState(false);
 const choose=(t:AccountType|null)=>{setType(t);setErrors({});setTouched(new Set());setSubmitted(false);setServerError('');window.history.replaceState(null,'',t?`/register?type=${t}${next?`&next=${encodeURIComponent(next)}`:''}`:'/register');};
 // Build the exact API payload; business/store contact numbers default to the account mobile.
 const build=(form:HTMLFormElement)=>{const p=formPayload(form) as Record<string,unknown>&{phone?:string;business?:Record<string,unknown>;seller?:Record<string,unknown>};p.accountType=type;const derived:string[]=[];for(const k of ['business','seller'] as const)if(p[k]&&!p[k]!.contactPhone){derived.push(`${k}.contactPhone`);if(p.phone)p[k]!.contactPhone=p.phone;}
  const confirm=p.confirmPassword;delete p.confirmPassword;return {payload:p,confirm,derived};};
 const validate=(form:HTMLFormElement)=>{const {payload,confirm,derived}=build(form);const result=fieldErrors(accountRegisterSchema,payload);
  // A blank contact number copies the account mobile, so any problem is reported once, on the mobile field.
  for(const path of derived)delete result.errors[path];if(payload.password&&confirm!==payload.password)result.errors.confirmPassword='Passwords do not match';return {...result,payload};};
 const touch=(name:string)=>setTouched(t=>t.has(name)?t:new Set(t).add(name));
 const visible=submitted?errors:Object.fromEntries(Object.entries(errors).filter(([k])=>touched.has(k)));
 // One login can hold every role, so a signed-in person adds a business or store instead of creating a second account.
 if(signedIn&&!submitted)return <div className="register-choose"><span className="eyebrow">YOU’RE SIGNED IN</span><h1>Hello, {signedIn.name.split(' ')[0]}.</h1><p className="muted">Add more to this same account instead of creating a new one.</p><div className="account-type-grid">{[[Building2,'Buy for your business',signedIn.organizationId?'Open business workspace':'Add a business account','/business'],[Store,'Sell on IBazzzar',signedIn.sellerId?'Open Seller Hub':'Open a store','/seller'],[ShoppingBag,'Shop',"Go to your account",'/account']].map(([Icon,title,cta,href])=>{const I=Icon as typeof Store;return <Link key={String(href)} href={String(href)} className="account-type"><I size={26} strokeWidth={1.5}/><h2>{String(title)}</h2><span className="text-link">{String(cta)} <ArrowRight size={15}/></span></Link>;})}</div></div>;
 if(!type)return <div className="register-choose"><span className="eyebrow">CREATE YOUR ACCOUNT</span><h1>How will you use IBazzzar?</h1><p className="muted">Choose the account that fits. You can add a business or a store to the same login later.</p>
  <div className="account-type-grid" role="list">{accountTypes.map(a=><button type="button" role="listitem" key={a.id} className="account-type" onClick={()=>choose(a.id)}><a.icon size={26} strokeWidth={1.5}/><h2>{a.title}</h2><p>{a.for}</p><ul>{a.perks.map(p=><li key={p}><Tick size={14}/>{p}</li>)}</ul><span className="text-link">Continue as {a.title.toLowerCase()} <ArrowRight size={15}/></span></button>)}</div>
  <div className="role-notes"><div><Users size={20}/><p><strong>Joining a team?</strong> Buyers, approvers and store staff don’t register a business. Create a <button type="button" className="text-button" onClick={()=>choose('customer')}>shopper account</button>, then ask your owner to add you from their Team page.</p></div><div><ShieldCheck size={20}/><p><strong>Marketplace staff?</strong> Support and admin access is granted by an administrator. <Link className="text-button" href="/login?portal=staff">Staff sign-in</Link></p></div></div>
  <p className="switch-auth">Already have an account? <Link className="text-button" href={`/login${next?`?next=${encodeURIComponent(next)}`:''}`}>Sign in</Link></p></div>;
 const meta=accountTypes.find(a=>a.id===type)!;
 return <FormErrors.Provider value={{errors:visible,touch}}><form className="register-form" noValidate onChange={e=>{if(submitted||touched.size)setErrors(validate(e.currentTarget).errors);}} onBlur={e=>setErrors(validate(e.currentTarget).errors)} onSubmit={async e=>{e.preventDefault();setSubmitted(true);setServerError('');const form=e.currentTarget,{errors:found,data,payload}=validate(form);setErrors(found);
   if(!data||Object.keys(found).length){(form.querySelector('[aria-invalid="true"]') as HTMLElement|null)?.focus();return;}
   setBusy(true);try{const r=await post<{user:User;verificationSent:boolean}>('/auth/register',payload);client.setQueryData(['user'],r.user);router.push(type==='customer'?safeNext(next)??meta.next:`${meta.next}?welcome=1`);router.refresh();}catch(err){setServerError((err as Error).message);if(err instanceof ApiError&&Object.keys(err.fields).length)setErrors(err.fields);}finally{setBusy(false);}}}>
  <button type="button" className="text-link back-link" onClick={()=>choose(null)}><ArrowLeft size={15}/> Change account type</button>
  <span className="eyebrow">{meta.title.toUpperCase()} ACCOUNT</span><h1>{type==='customer'?'Make yourself at home.':type==='business'?'Set up business buying.':'Open your store.'}</h1>
  <p className="muted">{type==='customer'?'A few details and you’re ready to shop.':type==='business'?'Your organisation is reviewed by our team before it is marked verified. You can start sourcing right away.':'Your store goes live after our team reviews your details. You can prepare listings meanwhile.'}</p>
  <fieldset className="form-section"><legend>{type==='customer'?'Your details':'Account owner'}</legend><div className="form-grid">
   <Field name="name" label="Full name" autoComplete="name" required className="wide"/>
   <Field name="email" label="Email address" type="email" autoComplete="email" required hint="We’ll send a confirmation link"/>
   <PhoneField name="phone" hint="For order and account updates"/>
   <PasswordField name="password" hint="12+ characters. A short phrase works well."/>
   <PasswordField name="confirmPassword" label="Confirm password" showStrength={false}/>
  </div></fieldset>
  {type==='business'&&<BusinessFields prefix="business."/>}
  {type==='seller'&&<SellerFields prefix="seller."/>}
  <fieldset className="form-section consent"><legend className="sr-only">Consent</legend>
   <Check name="acceptTerms" required>I agree to the <a href="/help/policies" target="_blank" className="text-button">Terms of Use</a> and <a href="/help/policies" target="_blank" className="text-button">Privacy Policy</a>.</Check>
   <Check name="marketingOptIn">Send me offers and updates by email. You can unsubscribe anytime.</Check>
  </fieldset>
  {serverError&&<div className="error" role="alert">{serverError}{serverError.includes('already exists')&&<> <Link className="text-button" href="/login">Sign in</Link> or <Link className="text-button" href="/reset-password">reset your password</Link>.</>}</div>}
  {submitted&&Object.keys(errors).length>0&&<div className="error" role="alert">Please fix the {Object.keys(errors).length} highlighted field{Object.keys(errors).length>1?'s':''}.</div>}
  <button className="button primary submit" disabled={busy}>{busy?'Creating your account…':type==='customer'?'Create account':type==='business'?'Create business account':'Submit store application'}</button>
  <p className="switch-auth">Already have an account? <Link className="text-button" href="/login">Sign in</Link></p>
 </form></FormErrors.Provider>;}
