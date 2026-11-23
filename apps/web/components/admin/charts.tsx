'use client';
import {useState,type ReactNode} from 'react';

type Point=[number,number];

// Cardinal-style smoothing keeps the line organic without pulling it away from the data points.
function smooth(points:Point[]){
 if(points.length<2)return '';
 let d=`M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
 for(let i=0;i<points.length-1;i++){
  const p0=points[i-1]??points[i],p1=points[i],p2=points[i+1],p3=points[i+2]??p2;
  const c1x=p1[0]+(p2[0]-p0[0])/6,c1y=p1[1]+(p2[1]-p0[1])/6,c2x=p2[0]-(p3[0]-p1[0])/6,c2y=p2[1]-(p3[1]-p1[1])/6;
  d+=` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
 }
 return d;
}

export function Sparkline({values,color='#2E8B5E'}:{values:number[];color?:string}){
 const w=120,h=34;
 if(values.length<2||values.every(v=>v===0))return <span className="spark spark-empty" aria-hidden="true"/>;
 const max=Math.max(...values),min=Math.min(...values),range=max-min||1;
 const points=values.map((v,i)=>[i/(values.length-1)*w,h-3-((v-min)/range)*(h-8)] as Point);
 const line=smooth(points);
 return <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
  <path d={`${line} L${w},${h} L0,${h} Z`} fill={color} opacity=".13"/>
  <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
 </svg>;
}

export function KpiCard({label,value,hint,icon,spark,color,trend,tone}:{label:string;value:ReactNode;hint?:string;icon?:ReactNode;spark?:number[];color?:string;trend?:{delta:number;label:string};tone?:'attention'|'positive'}){
 return <article className={`kpi${tone?` kpi-${tone}`:''}`}>
  <header><span className="kpi-icon">{icon}</span>{trend&&<span className={`kpi-trend ${trend.delta>=0?'up':'down'}`} title={trend.label}>{trend.delta>=0?'▲':'▼'} {Math.abs(trend.delta)}%</span>}</header>
  <small>{label}</small>
  <strong>{value}</strong>
  {hint&&<span className="kpi-hint">{hint}</span>}
  {spark&&spark.length>1&&<Sparkline values={spark} color={color}/>}
 </article>;
}

export function AreaChart({title,subtitle,data,format,axisFormat,color,id,height=238,empty='Nothing recorded in the last 30 days yet.'}:{title:string;subtitle?:string;data:{date:string;value:number}[];format:(n:number)=>string;axisFormat?:(n:number)=>string;color:string;id:string;height?:number;empty?:string}){
 const [hover,setHover]=useState<number|null>(null);
 const w=760,h=height,padL=54,padR=16,padT=16,padB=28;
 const values=data.map(d=>d.value),max=Math.max(1,...values);
 const step=data.length>1?(w-padL-padR)/(data.length-1):0;
 const x=(i:number)=>padL+i*step;
 const y=(v:number)=>padT+(1-v/max)*(h-padT-padB);
 const points=data.map((d,i)=>[x(i),y(d.value)] as Point);
 const line=smooth(points);
 const ticks=[0,.5,1].map(t=>Math.round(max*t));
 const labels=[0,Math.floor((data.length-1)/3),Math.floor((data.length-1)*2/3),data.length-1].filter((v,i,a)=>a.indexOf(v)===i);
 const axis=axisFormat??format;
 return <figure className="chart area-chart">
  <figcaption><div><strong>{title}</strong>{subtitle&&<span className="muted"> · {subtitle}</span>}</div></figcaption>
  {values.every(v=>v===0)?<p className="console-empty chart-empty">{empty}</p>:<>
   <div className="chart-plot">
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${title}. Highest ${format(max)}.`} onMouseLeave={()=>setHover(null)}>
     <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".3"/><stop offset="100%" stopColor={color} stopOpacity=".02"/></linearGradient></defs>
     {ticks.map(t=><g key={t}><line x1={padL} x2={w-padR} y1={y(t)} y2={y(t)} className="chart-gridline"/><text x={padL-8} y={y(t)+4} className="chart-axis" textAnchor="end">{axis(t)}</text></g>)}
     <path d={`${line} L${x(data.length-1)},${h-padB} L${x(0)},${h-padB} Z`} fill={`url(#${id})`}/>
     <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
     {hover!==null&&<><line x1={x(hover)} x2={x(hover)} y1={padT} y2={h-padB} className="chart-cursor"/><circle cx={x(hover)} cy={y(values[hover])} r="4.5" fill="white" stroke={color} strokeWidth="2.5"/></>}
     <line x1={padL} x2={w-padR} y1={h-padB} y2={h-padB} className="chart-baseline"/>
     {labels.map(i=><text key={i} x={x(i)} y={h-8} className="chart-axis" textAnchor={i===0?'start':i===data.length-1?'end':'middle'}>{new Date(data[i].date).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</text>)}
     {data.map((d,i)=><rect key={d.date} x={x(i)-step/2} y={0} width={step||1} height={h} fill="transparent" tabIndex={0} onMouseEnter={()=>setHover(i)} onFocus={()=>setHover(i)} aria-label={`${d.date}: ${format(d.value)}`}/>)}
    </svg>
    {hover!==null&&<div className="chart-tip" style={{left:`${(x(hover)/w)*100}%`}}><strong>{format(values[hover])}</strong><span>{new Date(data[hover].date).toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'})}</span></div>}
   </div>
   <details className="chart-table"><summary>View as table</summary><table className="data-table"><thead><tr><th>Date</th><th>{title}</th></tr></thead><tbody>{data.map((d,i)=><tr key={d.date}><td>{d.date}</td><td>{format(values[i])}</td></tr>)}</tbody></table></details>
  </>}
 </figure>;
}

export function DonutChart({title,subtitle,slices,centerLabel,format,empty='Nothing recorded yet.'}:{title:string;subtitle?:string;slices:{label:string;value:number;color:string}[];centerLabel:string;format:(n:number)=>string;empty?:string}){
 const total=slices.reduce((s,x)=>s+x.value,0),r=54,circumference=2*Math.PI*r;
 const parts=slices.filter(s=>s.value>0);
 const segments=parts.reduce<{label:string;value:number;color:string;len:number;gap:number}[]>((list,s)=>{const previous=list[list.length-1];return [...list,{...s,len:(s.value/total)*circumference,gap:previous?previous.gap+previous.len:0}];},[]);
 return <figure className="chart donut-chart">
  <figcaption><div><strong>{title}</strong>{subtitle&&<span className="muted"> · {subtitle}</span>}</div></figcaption>
  {total===0?<p className="console-empty chart-empty">{empty}</p>:<div className="donut-wrap">
   <svg className="donut" viewBox="0 0 140 140" role="img" aria-label={`${title}. Total ${format(total)}.`}>
    <circle cx="70" cy="70" r={r} fill="none" stroke="#eef1ea" strokeWidth="18"/>
    {segments.map(s=><circle key={s.label} cx="70" cy="70" r={r} fill="none" stroke={s.color} strokeWidth="18" strokeDasharray={`${Math.max(0,s.len-2)} ${circumference}`} strokeDashoffset={-s.gap} transform="rotate(-90 70 70)"/>)}
    <text x="70" y="66" textAnchor="middle" className="donut-total">{format(total)}</text>
    <text x="70" y="84" textAnchor="middle" className="donut-caption">{centerLabel}</text>
   </svg>
   <ul className="donut-legend">{segments.map(s=><li key={s.label}><i style={{background:s.color}}/><span>{s.label}</span><b>{s.value}</b><small>{Math.round(s.value/total*100)}%</small></li>)}</ul>
  </div>}
 </figure>;
}

export function BarList({title,subtitle,data,format,color='#2E8B5E',empty='Nothing recorded yet.'}:{title:string;subtitle?:string;data:{label:string;value:number}[];format:(n:number)=>string;color?:string;empty?:string}){
 const max=Math.max(1,...data.map(d=>d.value));
 return <figure className="chart bar-chart">
  <figcaption><div><strong>{title}</strong>{subtitle&&<span className="muted"> · {subtitle}</span>}</div></figcaption>
  {data.length?<ul className="bar-list">{data.map(d=><li key={d.label}><div className="bar-row"><span>{d.label}</span><strong>{format(d.value)}</strong></div><div className="bar-track"><span className="bar-fill" style={{width:`${Math.max(3,(d.value/max)*100)}%`,background:color}}/></div></li>)}</ul>:<p className="console-empty chart-empty">{empty}</p>}
 </figure>;
}
