'use client';
import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {ArrowUpRight,CreditCard,IndianRupee,PackageCheck,ShoppingCart,Store,TrendingUp,Truck,Users} from 'lucide-react';
import {can} from '@ibazzzar/shared';
import {api,post} from '@/lib/api';
import {formatMoney,shortId,type Ticket} from '@/lib/types';
import {useUser} from '../providers';
import {ActionForm,field} from '../workspace';
import {Page,Loading,Empty,Toolbar,Search,Pager,Badge,ColumnChart,useAdmin,useAction,send} from './ui';
import {AreaChart,BarList,DonutChart,KpiCard,Sparkline} from './charts';

type Dashboard={metrics:{orders:number;awaitingPayment:number;toShip:number;customers:number;activeSellers:number;paidGmvPaise:number|null;averageOrderPaise:number|null;platformRevenuePaise:number|null;demoGmvPaise:number|null;refundsPendingPaise:number|null};queues:Record<'sellers'|'products'|'organizations'|'returns'|'tickets'|'lowStock',number>;series:{date:string;orders:number;paidGmvPaise:number|null;commissionPaise:number|null;newCustomers:number}[];statusMix:{value:string;count:number}[];paymentMix:{value:string;count:number}[];catalogue:{live:number;pending:number;rejected:number;lowStock:number;categories:{name:string;count:number}[]};people:{customers:number;businesses:number;sellers:number;staff:number};topSellers:{id:string;name:string|null;grossPaise:number|null}[];recentOrders:{id:string;createdAt:string;status:string;paymentStatus:string;totalPaise:number;customer:string|null}[]};

export function Overview({go}:{go:(section:string)=>void}){
 const {data,error}=useAdmin<Dashboard>('/dashboard'),{data:user}=useUser();
 if(!data)return <Page eyebrow="OVERVIEW" title="Marketplace overview"><Loading error={error}/></Page>;
 const m=data.metrics,money=m.paidGmvPaise!==null,role=user?.role??'',series=data.series;
 const sum=(list:Dashboard['series'],fn:(d:Dashboard['series'][number])=>number)=>list.reduce((total,d)=>total+fn(d),0);
 const pct=(now:number,previous:number)=>previous?Math.round(((now-previous)/previous)*100):null;
 const last7=series.slice(-7),previous7=series.slice(-14,-7);
 const orderDelta=pct(sum(last7,d=>d.orders),sum(previous7,d=>d.orders));
 const gmvDelta=money?pct(sum(last7,d=>d.paidGmvPaise??0),sum(previous7,d=>d.paidGmvPaise??0)):null;
 const today=series[series.length-1],pendingApprovals=data.queues.sellers+data.queues.products+data.queues.organizations;
 const statusColors:Record<string,string>={AWAITING_PAYMENT:'#C99A3C',CONFIRMED:'#4F8F6B',SHIPPED:'#4C8CBF',DELIVERED:'#2F7A57',CANCELLED:'#B45A4A'};
 const paymentColors:Record<string,string>={PAID:'#2F7A57',DEMO_SIMULATED:'#C99A3C',UNPAID:'#9AA79A'};
 const label=(value:string)=>value.replaceAll('_',' ').toLowerCase().replace(/^./,c=>c.toUpperCase());
 const compactMoney=(paise:number)=>{const n=paise/100;return n>=1e7?`₹${(n/1e7).toFixed(1)}Cr`:n>=1e5?`₹${(n/1e5).toFixed(1)}L`:n>=1e3?`₹${(n/1e3).toFixed(0)}k`:`₹${Math.round(n)}`;};
 const ordersSpark=series.map(d=>d.orders),gmvSpark=series.map(d=>d.paidGmvPaise??0),customerSpark=series.map(d=>d.newCustomers);
 const queues:[keyof Dashboard['queues'],string,string][]=[['sellers','Seller applications','approvals'],['products','Listings to review','approvals'],['organizations','Businesses to verify','approvals'],['returns','Return requests','returns'],['tickets','Open support tickets','support'],['lowStock','Low-stock listings','inventory']];
 const quick:[string,string,string,string][]=[['orders','Orders','Track payments and fulfilment','orders.view'],['approvals','Approvals','Clear the seller, listing and business queue','approvals.manage'],['products','Products','Edit listings, pricing and stock','catalogue.manage'],['inventory','Inventory','Watch low stock across sellers','catalogue.manage'],['customers','Customers','Profiles, orders and account status','users.view'],['payments','Payments','Reconcile captured and simulated money','finance.view'],['returns','Returns','Resolve refunds and return requests','returns.manage'],['reports','Reports','Export orders, ledger and accounts','reports.view']];
 const countFor=(id:string)=>id==='approvals'?pendingApprovals:id==='inventory'?data.queues.lowStock:id==='returns'?data.queues.returns:id==='orders'?m.toShip:id==='products'?data.catalogue.pending:id==='customers'?data.people.customers:0;
 return <Page eyebrow="COMMAND CENTRE" title="Marketplace overview" intro="Calculated live from orders, ledger and accounts. Demo-simulated payments are never counted as revenue." actions={<span className="overview-live"><i className="live-dot"/>{today?.orders??0} orders today</span>}>
  {money&&!!m.demoGmvPaise&&<p className="notice">Demo simulations (not revenue): {formatMoney(m.demoGmvPaise)} order value. No money moved.</p>}
  <section className="overview-hero">
   <div>
    <span className="eyebrow">LIVE MARKETPLACE</span>
    <h2>Every order, seller and rupee in one clear view.</h2>
    <p>Approvals, fulfilment and finance signals surface here before they become problems. Every figure is calculated from stored records.</p>
    <div className="overview-actions"><button className="button gold" onClick={()=>go('orders')}>Open orders <ArrowUpRight size={15}/></button><button className="button light-outline" onClick={()=>go('approvals')}>Review approvals {pendingApprovals>0&&<span className="hero-count">{pendingApprovals}</span>}</button></div>
   </div>
   <div className="overview-hero-side">
    <small>{money?'Paid GMV · all time':'Orders · all time'}</small>
    <strong>{money?formatMoney(m.paidGmvPaise!):m.orders}</strong>
    <span>{money?`${m.orders} orders · ${formatMoney(m.averageOrderPaise??0)} average`:`${m.awaitingPayment} awaiting payment`}</span>
    <Sparkline values={money?gmvSpark:ordersSpark} color="#E7C67D"/>
   </div>
  </section>
  <div className="kpi-grid">
   {money&&<KpiCard label="Paid GMV" value={formatMoney(m.paidGmvPaise!)} hint="Captured payments, all time" icon={<IndianRupee size={16}/>} spark={gmvSpark} color="#B07A1F" trend={gmvDelta!==null?{delta:gmvDelta,label:'vs previous 7 days'}:undefined}/>}
   {money&&<KpiCard label="Platform revenue" value={formatMoney(m.platformRevenuePaise!)} hint="Commission after reversals" icon={<TrendingUp size={16}/>} color="#2F7A57"/>}
   <KpiCard label="Orders" value={m.orders} hint={`${m.awaitingPayment} awaiting payment`} icon={<ShoppingCart size={16}/>} spark={ordersSpark} color="#2E8B5E" trend={orderDelta!==null?{delta:orderDelta,label:'vs previous 7 days'}:undefined}/>
   {money&&<KpiCard label="Average paid order" value={m.averageOrderPaise?formatMoney(m.averageOrderPaise):'—'} hint="Across captured payments" icon={<CreditCard size={16}/>} color="#4C8CBF"/>}
   <KpiCard label="To ship" value={m.toShip} hint="Confirmed, ready to pack" icon={<Truck size={16}/>} color="#4F8F6B"/>
   <KpiCard label="Customers" value={data.people.customers} hint={`${data.people.businesses} business buyers`} icon={<Users size={16}/>} spark={customerSpark} color="#4C8CBF"/>
   <KpiCard label="Active sellers" value={m.activeSellers} hint={`${data.people.sellers} seller accounts`} icon={<Store size={16}/>} color="#8B784B"/>
   <KpiCard label="Low-stock listings" value={data.queues.lowStock} hint="At or below the stock threshold" icon={<PackageCheck size={16}/>} color="#C99A3C" tone={data.queues.lowStock?'attention':undefined}/>
  </div>
  <div className="overview-split">
   {money?<AreaChart title="Paid GMV momentum" subtitle="last 30 days" data={series.map(d=>({date:d.date,value:d.paidGmvPaise??0}))} format={formatMoney} axisFormat={compactMoney} color="#B07A1F" id="overview-gmv"/>:<AreaChart title="Order momentum" subtitle="last 30 days" data={series.map(d=>({date:d.date,value:d.orders}))} format={n=>`${n} order${n===1?'':'s'}`} axisFormat={n=>String(n)} color="#2E8B5E" id="overview-orders"/>}
   <DonutChart title="Order pipeline" subtitle={`${m.orders} orders`} slices={data.statusMix.map(s=>({label:label(s.value),value:s.count,color:statusColors[s.value]??'#9AA79A'}))} centerLabel="orders" format={n=>String(n)} empty="No orders recorded yet."/>
  </div>
  <div className="overview-split even">
   {money?<ColumnChart title="Orders per day" data={series} value={(d:Dashboard['series'][number])=>d.orders} format={n=>`${n} order${n===1?'':'s'}`} color="#2E8B5E" unit="#"/>:<ColumnChart title="New customers per day" data={series} value={(d:Dashboard['series'][number])=>d.newCustomers} format={n=>`${n} customer${n===1?'':'s'}`} color="#4C8CBF" unit="#"/>}
   <DonutChart title="Payment mix" subtitle={`${m.orders} orders`} slices={data.paymentMix.map(s=>({label:label(s.value),value:s.count,color:paymentColors[s.value]??'#9AA79A'}))} centerLabel="orders" format={n=>String(n)} empty="No payments recorded yet."/>
  </div>
  <div className="overview-split even">
   <BarList title="Top categories" subtitle="by listings" data={data.catalogue.categories.map(c=>({label:c.name,value:c.count}))} format={n=>`${n} listing${n===1?'':'s'}`} color="#2F7A57" empty="No categories yet."/>
   {money?<BarList title="Top sellers" subtitle="by delivered sales" data={data.topSellers.map(s=>({label:s.name??'Seller',value:s.grossPaise??0}))} format={formatMoney} color="#B07A1F" empty="No deliveries yet."/>:<div className="console-card"><h2>Top sellers</h2>{data.topSellers.length?<ol className="rank-list">{data.topSellers.map(s=><li key={s.id}><span>{s.name??'Seller'}</span></li>)}</ol>:<Empty>No sellers yet.</Empty>}</div>}
  </div>
  <div className="console-card">
   <div className="card-head"><h2>Recent orders</h2><button className="text-link" onClick={()=>go('orders')}>All orders <ArrowUpRight size={13}/></button></div>
   {data.recentOrders.length?<div className="table-scroll"><table className="data-table"><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th><th>Placed</th></tr></thead><tbody>{data.recentOrders.map(o=><tr key={o.id}><td className="mono">{shortId(o.id)}</td><td>{o.customer??'—'}</td><td>{formatMoney(o.totalPaise)}</td><td><Badge status={o.status}/></td><td>{new Date(o.createdAt).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</td></tr>)}</tbody></table></div>:<Empty>No orders yet.</Empty>}
  </div>
  <h2>Needs attention</h2>
  <p className="muted overview-note">Queues that block sellers, buyers or money movement.</p>
  <div className="queue-grid">{queues.map(([key,title,section])=><button key={key} className={`queue-card ${data.queues[key]?'has-items':''}`} onClick={()=>go(section)}><strong>{data.queues[key]}</strong><span>{title}</span></button>)}</div>
  <h2>Jump to a workspace</h2>
  <p className="muted overview-note">Open any section without hunting through the sidebar.</p>
  <div className="quick-nav">{quick.filter(([, , ,cap])=>can(role,cap)).map(([id,title,description])=>{const count=countFor(id);return <button key={id} className="quick-tile" onClick={()=>go(id)}><strong>{title}<ArrowUpRight size={15}/></strong><span>{description}</span>{count>0&&<b className="count-pill">{count}</b>}</button>;})}</div>
 </Page>;}

export function Content(){const {data,error}=useAdmin<{sections:{id:string;label:string;heading:string;body:string;version:number}[];featured:{id:string;name:string;status:string}[]}>('/cms'),act=useAction();
 return <Page eyebrow="CONTENT" title="Homepage CMS" intro="Plain-text content only (no HTML). Each save creates a new version; if someone else saved first, you’ll be asked to reload.">
  {act.error&&<div className="error" role="alert">{act.error}</div>}
  {!data?<Loading error={error}/>:<>{data.sections.map(s=><form key={`${s.id}-${s.version}`} className="console-card form-stack" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);act.run(()=>send(`/cms/${s.id}`,'PUT',{heading:String(f.get('heading')),body:String(f.get('body')),version:s.version}),`${s.label} published`);}}><div className="flex-between"><h2>{s.label}</h2><span className="muted">Version {s.version}{s.version===0?' · using the built-in copy':''}</span></div><label>{s.id==='hero'?'Headline':'Heading'}<input name="heading" defaultValue={s.heading} required minLength={3} maxLength={150} placeholder={s.id==='hero'?'Welcome to the future of shopping.':'Festive deliveries'}/></label><label>{s.id==='hero'?'Supporting line':'Message'}<textarea name="body" defaultValue={s.body} required minLength={3} maxLength={2000}/></label><button className="button primary">Publish</button></form>)}
  <div className="console-card"><h2>Featured on the homepage</h2>{data.featured.length?<ul className="chip-list">{data.featured.map(p=><li key={p.id}>{p.name}</li>)}</ul>:<Empty>No featured products. The homepage shows the newest listings instead.</Empty>}<p className="muted">Choose featured products from <strong>Products</strong> with the Featured switch.</p></div></>}
 </Page>;}

export function Notifications(){const act=useAction(),[sent,setSent]=useState<number|null>(null);
 return <Page eyebrow="COMMUNICATION" title="Notifications" intro="Send an in-app notice to a group. It appears in each person’s notification bell. Email and SMS are not connected yet.">
  {act.error&&<div className="error" role="alert">{act.error}</div>}{sent!==null&&<p className="success" role="status">Sent to {sent} account{sent===1?'':'s'}.</p>}
  <form className="console-card form-stack" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget),form=e.currentTarget;const body={audience:String(f.get('audience')),title:String(f.get('title')),body:String(f.get('body')),...(f.get('link')?{link:String(f.get('link'))}:{})};if(!window.confirm('Send this notification now? It cannot be recalled.'))return;let count=0;if(await act.run(async()=>{count=(await send('/notifications','POST',body) as {sent:number}).sent;},'Notification sent')){setSent(count);form.reset();}}}>
   <label>Send to<select name="audience" required defaultValue=""><option value="" disabled>Choose an audience</option><option value="ALL">Everyone</option><option value="CUSTOMERS">Customers</option><option value="BUSINESSES">Business buyers</option><option value="SELLERS">Sellers and their staff</option><option value="STAFF">IBazzzar staff</option></select></label>
   <label>Title<input name="title" required minLength={3} maxLength={100}/></label><label>Message<textarea name="body" required minLength={5} maxLength={500}/></label><label>Link (optional)<input name="link" placeholder="/deals" pattern="/[^/].*" title="A page on IBazzzar, starting with /"/></label><button className="button primary">Send notification</button></form>
 </Page>;}

export function SupportQueue(){const client=useQueryClient(),{data,error}=useQuery({queryKey:['support-queue'],queryFn:()=>api<{tickets:Ticket[]}>('/support/queue')}),[open,setOpen]=useState<string|null>(null),[filter,setFilter]=useState('active');
 const reload=()=>client.invalidateQueries({queryKey:['support-queue']}),list=data?.tickets.filter(t=>filter==='all'||(filter==='active'?t.status!=='CLOSED':t.status==='CLOSED'))||[];
 if(error)return <div className="error">{error.message}</div>;
 return <><div className="flex-between"><h2>Support tickets</h2><select aria-label="Filter tickets" value={filter} onChange={e=>setFilter(e.target.value)}><option value="active">Open & awaiting</option><option value="CLOSED">Closed</option><option value="all">All</option></select></div>{!list.length&&<Empty>No tickets here.</Empty>}{list.map(t=><div className="workspace-card" key={t.id}><button className="flex-between ticket-head" onClick={()=>setOpen(open===t.id?null:t.id)} aria-expanded={open===t.id}><span>{t.subject}{t.orderId?` · Order ${shortId(t.orderId)}`:''}</span><Badge status={t.status}/></button>{open===t.id&&<><div className="thread">{t.messages.map((m,i)=><div key={i} className={`message ${m.from==='SUPPORT'?'from-support':''}`}><small>{m.authorName} · {new Date(m.at).toLocaleString('en-IN')}</small><p>{m.body}</p></div>)}</div>{t.status!=='CLOSED'&&<ActionForm label="Send reply as support" reset onSubmit={async f=>{await post(`/support/queue/${t.id}/messages`,{message:field(f,'message')});await reload();}}><label>Reply<textarea name="message" required minLength={2}/></label></ActionForm>}<button className="button outline small" style={{marginTop:12}} onClick={async()=>{await api(`/support/queue/${t.id}`,{method:'PATCH',body:JSON.stringify({status:t.status==='CLOSED'?'OPEN':'CLOSED'})});await reload();}}>{t.status==='CLOSED'?'Reopen ticket':'Close ticket'}</button></>}</div>)}</>;}
export function Support(){return <Page eyebrow="CUSTOMER CARE" title="Support" intro="Reply to customers, sellers and buyers. Replies notify the person in their account."><SupportQueue/></Page>;}

export function Reports(){const {data:me}=useUser(),role=me?.role??'';const reports:[string,string,string,string][]=[['orders','Orders','Every order with totals, coupon, payment and status','orders.view'],['ledger','Seller ledger','Sales, commission, refunds and payouts per seller','finance.view'],['users','Accounts','All accounts with role, status and consent','users.view'],['products','Products','Every listing with price, stock and status','catalogue.manage']];
 return <Page eyebrow="INSIGHT" title="Reports" intro="CSV exports open in Excel or Google Sheets. Exports are audited; handle personal data according to your privacy policy.">
  <div className="report-grid">{reports.filter(r=>can(role,r[3])).map(([kind,title,copy])=><div key={kind} className="console-card"><h2>{title}</h2><p className="muted">{copy}</p><a className="button outline" href={`/api/admin/reports/${kind}`} download>Download CSV</a></div>)}</div>
 </Page>;}

export function Audit(){const [q,setQ]=useState(''),[page,setPage]=useState(1),{data,error}=useAdmin<{entries:{id:string;actor:string;action:string;resourceId:string;createdAt:string}[];total:number;page:number;pages:number}>(`/audit?${new URLSearchParams({...(q&&{q}),page:String(page)})}`);
 return <Page eyebrow="ACCOUNTABILITY" title="Audit log" intro="Every sensitive action, who did it and when. Entries cannot be edited or deleted from the console.">
  <Toolbar><Search value={q} onChange={v=>{setQ(v);setPage(1);}} placeholder="Search action, person or record ID"/></Toolbar>
  {!data?<Loading error={error}/>:<><div className="table-scroll"><table className="data-table"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th></tr></thead><tbody>{data.entries.map(a=><tr key={a.id}><td>{new Date(a.createdAt).toLocaleString('en-IN')}</td><td>{a.actor}</td><td>{a.action}</td><td className="mono">{a.resourceId.slice(0,12)}</td></tr>)}</tbody></table></div>{!data.entries.length&&<Empty>No entries match.</Empty>}<Pager page={data.page} pages={data.pages} onPage={setPage}/></>}
 </Page>;}

export function Settings(){const {data,error}=useAdmin<{settings:{commissionRateBps:number;returnWindowDays:number;lowStockThreshold:number;paymentWindowMinutes:number}}>('/settings'),act=useAction();
 return <Page eyebrow="PLATFORM" title="Settings" intro="Marketplace-wide rules. Changes apply to new activity from the moment you save and are recorded in the audit log.">
  {act.error&&<div className="error" role="alert">{act.error}</div>}
  {!data?<Loading error={error}/>:<form className="console-card form-grid" key={JSON.stringify(data.settings)} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);act.run(()=>send('/settings','PUT',{commissionRateBps:Math.round(Number(f.get('commission'))*100),returnWindowDays:Number(f.get('returns')),lowStockThreshold:Number(f.get('lowStock')),paymentWindowMinutes:Number(f.get('payment'))}),'Settings saved');}}>
   <label>Commission (% of delivered item value)<input name="commission" type="number" min={0} max={50} step="0.01" defaultValue={data.settings.commissionRateBps/100} required/><small className="muted">Applies to future deliveries only.</small></label>
   <label>Return window (days after delivery)<input name="returns" type="number" min={0} max={90} defaultValue={data.settings.returnWindowDays} required/><small className="muted">Check this against your published returns policy.</small></label>
   <label>Payment window (minutes)<input name="payment" type="number" min={5} max={1440} defaultValue={data.settings.paymentWindowMinutes} required/><small className="muted">Unpaid orders release their stock after this time (worker required).</small></label>
   <label>Low-stock alert (units)<input name="lowStock" type="number" min={0} max={10000} defaultValue={data.settings.lowStockThreshold} required/><small className="muted">Used by Inventory and the overview.</small></label>
   <button className="button primary wide">Save settings</button></form>}
  <div className="console-card"><h2>Integrations</h2><ul className="panel-list"><li><span>Payments</span><span>Razorpay test mode when keys are set · live mode disabled</span></li><li><span>Email & SMS</span><span>Not connected</span></li><li><span>Shipping</span><span>Manual (sellers enter carrier)</span></li><li><span>Image storage</span><span>Local disk · S3 adapter pending</span></li></ul><p className="muted">These are configured in server environment variables (see docs/deployment), not from the console.</p></div>
 </Page>;}
