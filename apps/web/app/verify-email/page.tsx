'use client';
import {Suspense,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {useQueryClient} from '@tanstack/react-query';
import {MailCheck,MailWarning} from 'lucide-react';
import {post} from '@/lib/api';
function Verify(){const token=useSearchParams().get('token'),client=useQueryClient(),[state,setState]=useState<{ok:boolean;message:string}|null>(null),once=useRef(false);
 useEffect(()=>{if(once.current)return;once.current=true;if(!token){setState({ok:false,message:'This link is missing its token.'});return;}post<{message:string}>('/auth/verify-email',{token}).then(r=>{setState({ok:true,message:r.message});client.invalidateQueries({queryKey:['user']});}).catch(e=>setState({ok:false,message:(e as Error).message}));},[token,client]);
 return <section className="container section empty">{!state?<p>Confirming your email…</p>:<>{state.ok?<MailCheck size={42}/>:<MailWarning size={42}/>}<h1>{state.ok?'Email confirmed.':'We couldn’t confirm that link.'}</h1><p role="status">{state.message}</p><Link className="button primary" href="/account">Go to your account</Link></>}</section>;}
export default function Page(){return <Suspense fallback={<p className="container section">Loading…</p>}><Verify/></Suspense>;}
