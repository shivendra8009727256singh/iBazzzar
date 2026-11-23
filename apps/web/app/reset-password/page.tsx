'use client';
import {Suspense,useState} from 'react';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {post} from '@/lib/api';
function Reset(){const token=useSearchParams().get('token'),[message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(false);
 const submit=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);setBusy(true);setError('');try{if(token){if(f.get('newPassword')!==f.get('confirm'))throw new Error('Passwords do not match');const r=await post<{message:string}>('/auth/password-reset/confirm',{token,newPassword:f.get('newPassword')});setMessage(r.message);setDone(true);}else{const r=await post<{message:string}>('/auth/password-reset/request',{email:f.get('email')});setMessage(r.message);}}catch(err){setError((err as Error).message);}finally{setBusy(false);}};
 return <section className="container section auth-single"><span className="eyebrow">ACCOUNT RECOVERY</span><h1>{token?'Choose a new password.':'Reset your password.'}</h1><p className="muted">{token?'Use 12 or more characters. You will be signed out everywhere.':'Enter your account email and we’ll send a link that works for 30 minutes.'}</p>
 {message&&<p className="success" role="status">{message}</p>}{error&&<div className="error" role="alert">{error}</div>}
 {!done&&<form className="form-stack" onSubmit={submit}>{token?<><label>New password<input type="password" name="newPassword" autoComplete="new-password" required minLength={12} maxLength={128}/></label><label>Confirm new password<input type="password" name="confirm" autoComplete="new-password" required minLength={12}/></label></>:<label>Email address<input type="email" name="email" autoComplete="email" required/></label>}<button className="button primary" disabled={busy}>{busy?'Please wait…':token?'Update password':'Send reset link'}</button></form>}
 <Link className="text-link" href="/login" style={{marginTop:24}}>Back to sign in</Link></section>;}
export default function Page(){return <Suspense fallback={<p className="container section">Loading…</p>}><Reset/></Suspense>;}
