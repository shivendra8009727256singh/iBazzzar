'use client';
import {useState,type ReactNode} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {api} from '@/lib/api';
import {useShop} from '../providers';

// Every console query is keyed under 'admin' so a single invalidation refreshes whatever is on screen.
export const useAdmin=<T,>(path:string,enabled=true)=>useQuery({queryKey:['admin',path],queryFn:()=>api<T>(`/admin${path}`),enabled,retry:false});
export function useAction(){const client=useQueryClient(),shop=useShop(),[error,setError]=useState('');
 const run=async(fn:()=>Promise<unknown>,message='Saved')=>{setError('');try{await fn();await client.invalidateQueries({queryKey:['admin']});shop.notify(message);return true;}catch(e){setError((e as Error).message);return false;}};
 return {run,error,setError};}
export const send=(path:string,method:string,body?:unknown)=>api(`/admin${path}`,{method,body:body===undefined?undefined:JSON.stringify(body)});
export function Page({eyebrow,title,intro,actions,children}:{eyebrow:string;title:string;intro?:ReactNode;actions?:ReactNode;children:ReactNode}){return <section className="console-page"><header className="console-head"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{intro&&<p className="muted">{intro}</p>}</div>{actions&&<div className="inline-actions">{actions}</div>}</header>{children}</section>;}
export function Loading({error}:{error?:Error|null}){return error?<div className="error" role="alert">{error.message}</div>:<div className="console-loading"><div className="skeleton skeleton-title"/><div className="skeleton" style={{height:220}}/></div>;}
export function Empty({children}:{children:ReactNode}){return <p className="console-empty">{children}</p>;}
export function Stat({label,value,hint,tone}:{label:string;value:ReactNode;hint?:string;tone?:'attention'}){return <div className={`stat ${tone==='attention'?'stat-attention':''}`}><small>{label}</small><strong>{value}</strong>{hint&&<span className="stat-hint">{hint}</span>}</div>;}
export function Toolbar({children}:{children:ReactNode}){return <div className="console-toolbar">{children}</div>;}
export function Search({value,onChange,placeholder}:{value:string;onChange:(v:string)=>void;placeholder:string}){return <input type="search" className="console-search" aria-label={placeholder} placeholder={placeholder} value={value} onChange={e=>onChange(e.target.value)}/>;}
export function Pager({page,pages,onPage}:{page:number;pages:number;onPage:(p:number)=>void}){if(pages<=1)return null;return <nav className="pagination" aria-label="Pages"><button disabled={page<=1} onClick={()=>onPage(page-1)}>Previous</button><span className="muted">Page {page} of {pages}</span><button disabled={page>=pages} onClick={()=>onPage(page+1)}>Next</button></nav>;}
export function Badge({status}:{status:string}){const tone=/APPROVED|ACTIVE|DELIVERED|PAID|PROCESSED|CONFIRMED|CLOSED|PAID_OUT/.test(status)?'good':/PENDING|AWAITING|REQUESTED|OPEN|PACKED|SHIPPED|QUOTED/.test(status)?'warn':/REJECTED|SUSPENDED|CANCELLED|FAILED/.test(status)?'bad':'';return <span className={`badge ${tone}`}>{status.replaceAll('_',' ').toLowerCase().replace(/^./,c=>c.toUpperCase())}</span>;}
// Prompts for a reason before an audited, consequential action.
export const askReason=(question:string)=>{const reason=window.prompt(question);return reason&&reason.trim().length>=5?reason.trim():reason===null?null:(window.alert('Please give a short reason (at least 5 characters).'),null);};

// Single-series column chart: thin columns from one baseline, hover tooltip, and a table view for screen readers.
export function ColumnChart({title,data,value,format,color,unit}:{title:string;data:{date:string}[];value:(d:never)=>number;format:(n:number)=>string;color:string;unit:string}){
 const [hover,setHover]=useState<number|null>(null),values=data.map(d=>value(d as never)),max=Math.max(1,...values),w=720,h=200,pad=28,slot=(w-pad)/data.length,bar=Math.min(14,slot-2);
 const ticks=[0,0.5,1].map(t=>Math.round(max*t));
 return <figure className="chart"><figcaption><strong>{title}</strong><span className="muted"> · last 30 days</span></figcaption>
  {values.every(v=>v===0)?<p className="console-empty chart-empty">Nothing recorded in the last 30 days yet.</p>:<>
  <div className="chart-plot"><svg viewBox={`0 0 ${w} ${h+24}`} role="img" aria-label={`${title}. Highest ${format(max)}.`} onMouseLeave={()=>setHover(null)}>
   {ticks.map(t=><g key={t}><line x1={pad} x2={w} y1={h-(t/max)*(h-10)} y2={h-(t/max)*(h-10)} className="chart-gridline"/><text x={pad-6} y={h-(t/max)*(h-10)+4} className="chart-axis" textAnchor="end">{unit==='₹'?`₹${t>=100000?`${Math.round(t/100000)}k`:Math.round(t/100)}`:t}</text></g>)}
   {values.map((v,i)=>{const bh=(v/max)*(h-10),x=pad+i*slot+(slot-bar)/2;return <g key={i} onMouseEnter={()=>setHover(i)} onFocus={()=>setHover(i)} tabIndex={0} aria-label={`${data[i].date}: ${format(v)}`}>
    <rect x={pad+i*slot} y={0} width={slot} height={h} fill="transparent"/>
    {v>0&&<path d={`M${x},${h} v${-Math.max(0,bh-4)} q0,-4 4,-4 h${bar-8} q4,0 4,4 v${Math.max(0,bh-4)} z`} fill={color} opacity={hover===null||hover===i?1:.45}/>}
   </g>;})}
   <line x1={pad} x2={w} y1={h} y2={h} className="chart-baseline"/>
   {[0,14,29].map(i=><text key={i} x={pad+i*slot+slot/2} y={h+18} className="chart-axis" textAnchor="middle">{new Date(data[i].date).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</text>)}
  </svg>{hover!==null&&<div className="chart-tip" style={{left:`${((pad+hover*slot+slot/2)/w)*100}%`}}><strong>{format(values[hover])}</strong><span>{new Date(data[hover].date).toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'})}</span></div>}</div>
  <details className="chart-table"><summary>View as table</summary><table className="data-table"><thead><tr><th>Date</th><th>{title}</th></tr></thead><tbody>{data.map((d,i)=><tr key={d.date}><td>{d.date}</td><td>{format(values[i])}</td></tr>)}</tbody></table></details>
  </>}
 </figure>;}
