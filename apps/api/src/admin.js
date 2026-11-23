import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DomainError, can, isStaff, staffRoles } from '../../../packages/shared/src/index.js';
import { categories as defaultCategories } from '../../../packages/shared/src/catalogue.js';
import { publicUser } from './security.js';
import { audit, now, notify, commissionRate, platformSettings } from './service.js';
const slugify=name=>name.toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
// Categories live in the database once an admin edits them; until then the launch list is used.
export async function activeCategories(store,{includeInactive=false}={}){
 const rows=await store.all('categories');
 const list=rows.length?rows:defaultCategories.map((name,i)=>({id:slugify(name),name,slug:slugify(name),description:null,active:true,sortOrder:i,createdAt:new Date(0).toISOString()}));
 return list.filter(c=>includeInactive||c.active).sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name));
}
export async function assertActiveCategory(store,name){if(!(await activeCategories(store)).some(c=>c.name===name))throw new DomainError('Please choose one of the current categories',400);}
const sum=(list,pick)=>list.reduce((s,x)=>s+pick(x),0);
const groupByDay=list=>{const map={};for(const x of list){const day=String(x.createdAt||'').slice(0,10);(map[day]??=[]).push(x);}return map;};
const byNewest=(a,b)=>String(b.createdAt).localeCompare(String(a.createdAt));
function paginate(list,req,size=50){const page=Math.max(1,Number(req.query.page)||1);return {items:list.slice((page-1)*size,page*size),total:list.length,page,pages:Math.max(1,Math.ceil(list.length/size))};}
const matches=(q,...fields)=>!q||fields.some(f=>String(f??'').toLowerCase().includes(q));
// CSV cells are quoted, and cells that spreadsheets would run as formulas are neutralised.
function csv(rows){if(!rows.length)return '';const head=Object.keys(rows[0]);const cell=v=>{let s=v==null?'':typeof v==='object'?JSON.stringify(v):String(v);if(/^[=+\-@\t\r]/.test(s))s=`'${s}`;return `"${s.replace(/"/g,'""')}"`;};return [head.map(cell).join(','),...rows.map(r=>head.map(h=>cell(r[h])).join(','))].join('\r\n');}
const rupees=p=>(p/100).toFixed(2);

export function adminConsole(app,{store,config,market,storage,guards:{auth,staff}}){
 const users=async()=>(await store.all('users'));
 const nameOf=(list,id)=>list.find(x=>x.id===id)?.name??null;

 app.get('/api/admin/me',auth,(req,res)=>{if(!isStaff(req.user.role))throw new DomainError('Staff access required',403);res.json({role:req.user.role,label:staffRoles[req.user.role].label});});

 // Dashboard: every figure is calculated from stored records; demo-simulated money is reported separately.
 app.get('/api/admin/dashboard',auth,staff('dashboard'),async(req,res)=>{
  const [orders,sellers,products,organizations,ledger,refunds,returns,tickets,people,settings]=await Promise.all([store.all('orders'),store.all('sellers'),store.all('products'),store.all('organizations'),store.all('ledger'),store.all('refunds'),store.all('returns'),store.all('tickets'),users(),platformSettings(store)]);
  const paid=orders.filter(o=>o.paymentStatus==='PAID'),finance=can(req.user.role,'finance.view');
  const fees=list=>-sum(list.filter(e=>['COMMISSION','COMMISSION_REVERSAL'].includes(e.kind)),e=>e.amountPaise);
  const orderDays=groupByDay(orders),ledgerDays=groupByDay(ledger),peopleDays=groupByDay(people);
  const days=[...Array(30)].map((_,i)=>{const date=new Date(Date.now()-(29-i)*864e5).toISOString().slice(0,10);const day=orderDays[date]||[];
   return {date,orders:day.length,paidGmvPaise:finance?sum(day.filter(o=>o.paymentStatus==='PAID'),o=>o.totalPaise):null,commissionPaise:finance?fees((ledgerDays[date]||[]).filter(e=>!e.demo)):null,newCustomers:(peopleDays[date]||[]).length};});
  const delivered=new Map();for(const e of ledger.filter(e=>e.kind==='SALE'))delivered.set(e.sellerId,(delivered.get(e.sellerId)||0)+e.amountPaise);
  const mix=(key,values)=>values.map(value=>({value,count:orders.filter(o=>o[key]===value).length}));
  const categoryCounts=products.reduce((map,p)=>(map.set(p.category,(map.get(p.category)||0)+1),map),new Map());
  const lowStock=products.filter(p=>p.status==='APPROVED'&&p.stock<=settings.lowStockThreshold).length;
  res.json({
   metrics:{orders:orders.length,awaitingPayment:orders.filter(o=>o.status==='AWAITING_PAYMENT').length,toShip:orders.filter(o=>['CONFIRMED'].includes(o.status)).length,customers:people.filter(u=>u.role==='CUSTOMER').length,activeSellers:sellers.filter(s=>s.status==='APPROVED').length,
    paidGmvPaise:finance?sum(paid,o=>o.totalPaise):null,averageOrderPaise:finance&&paid.length?Math.round(sum(paid,o=>o.totalPaise)/paid.length):null,platformRevenuePaise:finance?fees(ledger.filter(e=>!e.demo)):null,demoGmvPaise:finance?sum(orders.filter(o=>o.paymentStatus==='DEMO_SIMULATED'),o=>o.totalPaise):null,refundsPendingPaise:finance?sum(refunds.filter(r=>r.status==='PENDING_PROVIDER'),r=>r.amountPaise):null},
   queues:{sellers:sellers.filter(s=>s.status==='PENDING').length,products:products.filter(p=>p.status==='PENDING').length,organizations:organizations.filter(o=>o.status==='PENDING').length,returns:returns.filter(r=>r.status==='REQUESTED').length,tickets:tickets.filter(t=>t.status==='OPEN').length,lowStock},
   series:days,
   statusMix:mix('status',['AWAITING_PAYMENT','CONFIRMED','SHIPPED','DELIVERED','CANCELLED']),
   paymentMix:mix('paymentStatus',['PAID','DEMO_SIMULATED','UNPAID']),
   catalogue:{live:products.filter(p=>p.status==='APPROVED').length,pending:products.filter(p=>p.status==='PENDING').length,rejected:products.filter(p=>p.status==='REJECTED').length,lowStock,categories:[...categoryCounts].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count).slice(0,6)},
   people:{customers:people.filter(u=>!isStaff(u.role)&&!u.sellerId&&!u.organizationId).length,businesses:people.filter(u=>u.organizationId).length,sellers:people.filter(u=>u.sellerId).length,staff:people.filter(u=>isStaff(u.role)).length},
   topSellers:[...delivered].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([id,gross])=>({id,name:nameOf(sellers,id),grossPaise:finance?gross:null})),
   recentOrders:orders.sort(byNewest).slice(0,8).map(o=>({id:o.id,createdAt:o.createdAt,status:o.status,paymentStatus:o.paymentStatus,totalPaise:o.totalPaise,customer:nameOf(people,o.userId)})),
  });
 });

 // People
 app.get('/api/admin/users',auth,staff('users.view'),async(req,res)=>{
  const q=String(req.query.q||'').toLowerCase().trim(),[people,orders,sellers,orgs]=await Promise.all([users(),store.all('orders'),store.all('sellers'),store.all('organizations')]);
  const list=people.filter(u=>matches(q,u.name,u.email,u.phone)&&(!req.query.role||u.role===req.query.role)&&(!req.query.staff||isStaff(u.role))&&(!req.query.status||(u.status||'ACTIVE')===req.query.status)&&(!req.query.type||(req.query.type==='seller'?u.sellerId:req.query.type==='business'?u.organizationId:true))).sort(byNewest)
   .map(u=>({...publicUser(u),status:u.status||'ACTIVE',locked:!!u.lockedUntil&&Date.parse(u.lockedUntil)>Date.now(),sellerName:nameOf(sellers,u.sellerId),organizationName:nameOf(orgs,u.organizationId),orders:orders.filter(o=>o.userId===u.id).length}));
  const page=paginate(list,req);res.json({...page,users:page.items});
 });
 app.get('/api/admin/users/:id',auth,staff('users.view'),async(req,res)=>{
  const u=await store.get('users',req.params.id);if(!u)throw new DomainError('User not found',404);
  const [orders,tickets,addresses,log]=await Promise.all([store.all('orders'),store.all('tickets'),store.all('addresses'),store.all('audit')]);
  res.json({user:{...publicUser(u),status:u.status||'ACTIVE',locked:!!u.lockedUntil&&Date.parse(u.lockedUntil)>Date.now()},seller:u.sellerId?await store.get('sellers',u.sellerId):null,organization:u.organizationId?await store.get('organizations',u.organizationId):null,
   orders:orders.filter(o=>o.userId===u.id).sort(byNewest).map(o=>({id:o.id,createdAt:o.createdAt,status:o.status,paymentStatus:o.paymentStatus,totalPaise:o.totalPaise})),tickets:tickets.filter(t=>t.userId===u.id).map(t=>({id:t.id,subject:t.subject,status:t.status,updatedAt:t.updatedAt})),addresses:addresses.filter(a=>a.userId===u.id).length,
   activity:log.filter(a=>a.actorId===u.id||a.resourceId===u.id).sort(byNewest).slice(0,30)});
 });
 app.patch('/api/admin/users/:id/status',auth,staff('users.manage'),async(req,res)=>{
  const {status,reason}=z.object({status:z.enum(['ACTIVE','SUSPENDED'],{message:'Please choose active or suspended'}),reason:z.string().trim().min(5,'Please give a short reason (at least 5 characters)').max(300)}).parse(req.body);
  if(req.params.id===req.user.id)throw new DomainError('You cannot change the status of your own account',409);
  const user=await store.transaction(async tx=>{const u=await tx.get('users',req.params.id);if(!u)throw new DomainError('User not found',404);
   if(isStaff(u.role)&&req.user.role!=='ADMIN')throw new DomainError('Only a Super Admin can suspend staff accounts',403);
   const updated=await tx.update('users',u.id,{status});
   // Suspension signs the person out everywhere immediately.
   if(status==='SUSPENDED')for(const s of (await tx.all('sessions')).filter(s=>s.userId===u.id))await tx.remove('sessions',s.id);
   await audit(tx,req.user.id,`user.${status.toLowerCase()}: ${reason}`,u.id);return updated;});
  res.json({user:{...publicUser(user),status:user.status}});
 });
 app.post('/api/admin/users/:id/unlock',auth,staff('users.manage'),async(req,res)=>{const u=await store.get('users',req.params.id);if(!u)throw new DomainError('User not found',404);await store.update('users',u.id,{failedLogins:0,lockedUntil:null});await audit(store,req.user.id,'user.unlocked',u.id);res.json({ok:true});});
 app.get('/api/admin/sellers',auth,staff('users.view'),async(req,res)=>{
  const q=String(req.query.q||'').toLowerCase(),[sellers,products,ledger,people]=await Promise.all([store.all('sellers'),store.all('products'),store.all('ledger'),users()]);
  res.json({sellers:sellers.filter(s=>matches(q,s.name,s.legalName,s.gstin)&&(!req.query.status||s.status===req.query.status)).sort(byNewest).map(s=>({...s,owner:people.find(u=>u.id===s.ownerId)?{name:people.find(u=>u.id===s.ownerId).name,email:people.find(u=>u.id===s.ownerId).email}:null,products:products.filter(p=>p.sellerId===s.id).length,liveProducts:products.filter(p=>p.sellerId===s.id&&p.status==='APPROVED').length,pendingSettlementPaise:can(req.user.role,'finance.view')?sum(ledger.filter(e=>e.sellerId===s.id&&!e.demo),e=>e.amountPaise):null,staff:people.filter(u=>u.sellerId===s.id).length}))});
 });
 app.get('/api/admin/organizations',auth,staff('users.view'),async(req,res)=>{
  const q=String(req.query.q||'').toLowerCase(),[orgs,people,pos]=await Promise.all([store.all('organizations'),users(),store.all('purchaseOrders')]);
  res.json({organizations:orgs.filter(o=>matches(q,o.name,o.tradeName,o.gstin)&&(!req.query.status||o.status===req.query.status)).sort(byNewest).map(o=>({...o,owner:people.find(u=>u.id===o.ownerId)?.name??null,members:people.filter(u=>u.organizationId===o.id).length,purchaseOrders:pos.filter(p=>p.organizationId===o.id).length}))});
 });

 // Catalogue
 const categoryInput=z.object({name:z.string({message:'Please enter a category name'}).trim().min(2,'Category names need at least 2 characters').max(60),description:z.string().trim().max(300).optional(),active:z.boolean().optional(),sortOrder:z.number().int().min(0).max(1000).optional()});
 // The first edit copies the launch list into the database so later changes have something to update.
 const materialise=async tx=>{if(!(await tx.all('categories')).length)for(const c of await activeCategories(tx))await tx.put('categories',c);};
 app.get('/api/admin/categories',auth,staff('catalogue.manage'),async(_req,res)=>{const [list,products]=await Promise.all([activeCategories(store,{includeInactive:true}),store.all('products')]);res.json({categories:list.map(c=>({...c,products:products.filter(p=>p.category===c.name).length}))});});
 app.post('/api/admin/categories',auth,staff('catalogue.manage'),async(req,res)=>{const body=categoryInput.parse(req.body);const category=await store.transaction(async tx=>{await materialise(tx);const list=await tx.all('categories');if(list.some(c=>c.name.toLowerCase()===body.name.toLowerCase()||c.slug===slugify(body.name)))throw new DomainError('A category with this name already exists',409);const c=await tx.put('categories',{id:randomUUID(),name:body.name,slug:slugify(body.name),description:body.description??null,active:body.active??true,sortOrder:body.sortOrder??list.length,createdAt:now()});await audit(tx,req.user.id,'category.created',c.id);return c;});res.status(201).json({category});});
 app.patch('/api/admin/categories/:id',auth,staff('catalogue.manage'),async(req,res)=>{const body=categoryInput.partial().parse(req.body);const category=await store.transaction(async tx=>{await materialise(tx);const c=await tx.get('categories',req.params.id);if(!c)throw new DomainError('Category not found',404);
   if(body.name&&body.name!==c.name){if((await tx.all('categories')).some(x=>x.id!==c.id&&x.name.toLowerCase()===body.name.toLowerCase()))throw new DomainError('A category with this name already exists',409);
    // Renaming carries every listing and store profile with it, so nothing is orphaned.
    for(const p of (await tx.all('products')).filter(p=>p.category===c.name))await tx.update('products',p.id,{category:body.name});
    for(const s of (await tx.all('sellers')).filter(s=>s.primaryCategory===c.name))await tx.update('sellers',s.id,{primaryCategory:body.name});}
   const updated=await tx.update('categories',c.id,{...body,...(body.name?{slug:slugify(body.name)}:{})});await audit(tx,req.user.id,`category.updated${body.active===false?' (hidden)':''}`,c.id);return updated;});res.json({category});});
 app.get('/api/admin/brands',auth,staff('catalogue.manage'),async(_req,res)=>{const [products,sellers]=await Promise.all([store.all('products'),store.all('sellers')]);const map=new Map();for(const p of products){const b=map.get(p.brand)||{name:p.brand,products:0,live:0,sellers:new Set()};b.products++;if(p.status==='APPROVED')b.live++;b.sellers.add(nameOf(sellers,p.sellerId));map.set(p.brand,b);}res.json({brands:[...map.values()].map(b=>({...b,sellers:[...b.sellers]})).sort((a,b)=>a.name.localeCompare(b.name))});});
 app.get('/api/admin/products',auth,staff('catalogue.manage'),async(req,res)=>{
  const q=String(req.query.q||'').toLowerCase(),[products,sellers,settings]=await Promise.all([store.all('products'),store.all('sellers'),platformSettings(store)]);
  const list=products.filter(p=>matches(q,p.name,p.brand,p.id)&&(!req.query.status||p.status===req.query.status)&&(!req.query.category||p.category===req.query.category)&&(req.query.stock!=='low'||p.stock<=settings.lowStockThreshold)).sort((a,b)=>Number(b.status==='PENDING')-Number(a.status==='PENDING')||a.name.localeCompare(b.name)).map(p=>({...p,sellerName:nameOf(sellers,p.sellerId)}));
  const page=paginate(list,req);res.json({...page,products:page.items,lowStockThreshold:settings.lowStockThreshold});
 });
 app.patch('/api/admin/products/:id',auth,staff('catalogue.manage'),async(req,res)=>{const body=z.object({featured:z.boolean()}).parse(req.body);const p=await store.get('products',req.params.id);if(!p)throw new DomainError('Product not found',404);if(body.featured&&p.status!=='APPROVED')throw new DomainError('Only live products can be featured',409);const product=await store.update('products',p.id,body);await audit(store,req.user.id,`product.${body.featured?'featured':'unfeatured'}`,p.id);res.json({product});});

 // Orders, B2B, shipping
 app.get('/api/admin/orders',auth,staff('orders.view'),async(req,res)=>{
  const q=String(req.query.q||'').toLowerCase(),[orders,people]=await Promise.all([store.all('orders'),users()]);
  const list=orders.filter(o=>(!req.query.status||o.status===req.query.status)&&(!req.query.payment||o.paymentStatus===req.query.payment)&&matches(q,o.id,nameOf(people,o.userId),people.find(u=>u.id===o.userId)?.email,o.address?.pincode)).sort(byNewest).map(o=>({id:o.id,createdAt:o.createdAt,status:o.status,paymentStatus:o.paymentStatus,mode:o.mode,totalPaise:o.totalPaise,items:o.items.length,couponCode:o.couponCode,customer:nameOf(people,o.userId),fulfillments:(o.fulfillments||[]).map(f=>({sellerId:f.sellerId,status:f.status}))}));
  const page=paginate(list,req);res.json({...page,orders:page.items});
 });
 app.get('/api/admin/orders/:id',auth,staff('orders.view'),async(req,res)=>{
  const o=await store.get('orders',req.params.id);if(!o)throw new DomainError('Order not found',404);
  const [customer,sellers,refunds,returns,tickets]=await Promise.all([store.get('users',o.userId),store.all('sellers'),store.all('refunds'),store.all('returns'),store.all('tickets')]);
  res.json({order:{...o,fulfillments:(o.fulfillments||[]).map(f=>({...f,sellerName:nameOf(sellers,f.sellerId)})),items:o.items.map(i=>({...i,sellerName:nameOf(sellers,i.sellerId)}))},customer:customer&&{id:customer.id,name:customer.name,email:customer.email,phone:customer.phone},refunds:refunds.filter(r=>r.orderId===o.id),returns:returns.filter(r=>r.orderId===o.id),tickets:tickets.filter(t=>t.orderId===o.id).map(t=>({id:t.id,subject:t.subject,status:t.status}))});
 });
 app.post('/api/admin/orders/:id/cancel',auth,staff('orders.manage'),async(req,res)=>{const {reason}=z.object({reason:z.string().trim().min(5,'Please give a short reason (at least 5 characters)').max(300)}).parse(req.body);res.json({order:await market.staffCancel(req.user,req.params.id,reason)});});
 app.get('/api/admin/b2b',auth,staff('b2b.view'),async(_req,res)=>{
  const [rfqs,quotes,pos,orgs,sellers,products]=await Promise.all([store.all('rfqs'),store.all('quotes'),store.all('purchaseOrders'),store.all('organizations'),store.all('sellers'),store.all('products')]);
  res.json({rfqs:rfqs.sort(byNewest).map(r=>({...r,organization:nameOf(orgs,r.organizationId),seller:nameOf(sellers,r.sellerId),product:nameOf(products,r.productId),quotes:quotes.filter(q=>q.rfqId===r.id).length})),quotes:quotes.sort(byNewest).map(q=>({...q,seller:nameOf(sellers,q.sellerId)})),purchaseOrders:pos.sort(byNewest).map(p=>({...p,organization:nameOf(orgs,p.organizationId),seller:nameOf(sellers,p.sellerId)}))});
 });
 app.get('/api/admin/shipping',auth,staff('orders.view'),async(_req,res)=>{
  const [orders,sellers]=await Promise.all([store.all('orders'),store.all('sellers')]);const shipments=orders.flatMap(o=>(o.fulfillments||[]).map(f=>({...f,orderId:o.id,orderStatus:o.status,createdAt:o.createdAt,sellerName:nameOf(sellers,f.sellerId),shippedAt:f.history.find(h=>h.status==='SHIPPED')?.at??null,deliveredAt:f.history.find(h=>h.status==='DELIVERED')?.at??null}))).filter(s=>s.orderStatus!=='AWAITING_PAYMENT');
  const counts={};for(const s of shipments)counts[s.status]=(counts[s.status]||0)+1;const carriers={};for(const s of shipments.filter(s=>s.carrier))carriers[s.carrier]=(carriers[s.carrier]||0)+1;
  const transit=shipments.filter(s=>s.deliveredAt&&s.shippedAt).map(s=>(Date.parse(s.deliveredAt)-Date.parse(s.shippedAt))/864e5);
  res.json({provider:'Not connected — sellers enter carrier and tracking details manually',counts,carriers,averageTransitDays:transit.length?Math.round(sum(transit,x=>x)/transit.length*10)/10:null,open:shipments.filter(s=>['PENDING','PACKED','SHIPPED'].includes(s.status)).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).slice(0,100)});
 });

 app.get('/api/admin/returns',auth,staff('returns.manage'),async(_req,res)=>{const [returns,sellers,people]=await Promise.all([store.all('returns'),store.all('sellers'),users()]);res.json({returns:returns.sort((a,b)=>Number(b.status==='REQUESTED')-Number(a.status==='REQUESTED')||byNewest(a,b)).map(r=>({...r,seller:nameOf(sellers,r.sellerId),customer:nameOf(people,r.userId)}))});});
 app.get('/api/admin/coupons',auth,staff('promotions.manage'),async(_req,res)=>{const t=Date.now();res.json({coupons:(await store.all('coupons')).sort(byNewest).map(c=>({...c,state:!c.active?'PAUSED':Date.parse(c.endsAt)<=t?'ENDED':Date.parse(c.startsAt)>t?'SCHEDULED':c.usageLimit!=null&&c.used>=c.usageLimit?'USED_UP':'ACTIVE'}))});});

 // Finance
 app.get('/api/admin/payments',auth,staff('finance.view'),async(_req,res)=>{
  const [intents,events,orders]=await Promise.all([store.all('paymentIntents'),store.all('paymentEvents'),store.all('orders')]);
  const totals={};for(const o of orders){const t=totals[o.paymentStatus]||{count:0,amountPaise:0};t.count++;t.amountPaise+=o.totalPaise;totals[o.paymentStatus]=t;}
  res.json({provider:config.paymentKey?'Razorpay test mode':'Not configured',totals,intents:intents.sort(byNewest),events:events.sort(byNewest).slice(0,100)});
 });
 app.get('/api/admin/finance',auth,staff('finance.view'),async(_req,res)=>{
  const [ledger,sellers,refunds]=await Promise.all([store.all('ledger'),store.all('sellers'),store.all('refunds')]);
  const balances=sellers.map(s=>{const mine=ledger.filter(e=>e.sellerId===s.id);const real=mine.filter(e=>!e.demo);return {sellerId:s.id,seller:s.name,salesPaise:sum(real.filter(e=>e.kind==='SALE'),e=>e.amountPaise),commissionPaise:-sum(real.filter(e=>['COMMISSION','COMMISSION_REVERSAL'].includes(e.kind)),e=>e.amountPaise),refundsPaise:-sum(real.filter(e=>e.kind==='REFUND_ADJUSTMENT'),e=>e.amountPaise),paidOutPaise:-sum(real.filter(e=>e.kind==='PAYOUT'),e=>e.amountPaise),payablePaise:sum(real,e=>e.amountPaise),demoPaise:sum(mine.filter(e=>e.demo),e=>e.amountPaise)};}).filter(b=>b.salesPaise||b.demoPaise||b.paidOutPaise);
  res.json({commissionRateBps:await commissionRate(store),balances,ledger:ledger.sort(byNewest).slice(0,300).map(e=>({...e,seller:nameOf(sellers,e.sellerId)})),refunds:refunds.sort(byNewest)});
 });
 // Records a payout already made through the provider or bank. IBazzzar never moves money from here.
 app.post('/api/admin/payouts',auth,staff('finance.manage'),async(req,res)=>{
  const body=z.object({sellerId:z.string().min(1,'Please choose a seller'),amountPaise:z.number().int().min(100,'Payouts must be at least ₹1'),providerRef:z.string().trim().regex(/^(pout_[A-Za-z0-9]{6,40}|[A-Z0-9]{12,22})$/,'Enter the Razorpay payout ID (pout_…) or the bank UTR number')}).parse(req.body);
  const entry=await store.transaction(async tx=>{if(!await tx.get('sellers',body.sellerId))throw new DomainError('Seller not found',404);const ledger=await tx.all('ledger');
   if(ledger.some(e=>e.kind==='PAYOUT'&&e.providerRef===body.providerRef))throw new DomainError('This payout reference has already been recorded',409);
   const payable=sum(ledger.filter(e=>e.sellerId===body.sellerId&&!e.demo),e=>e.amountPaise);
   if(body.amountPaise>payable)throw new DomainError(`This is more than the seller’s payable balance of ₹${rupees(payable)}`,409);
   const e=await tx.put('ledger',{id:randomUUID(),sellerId:body.sellerId,orderId:'payout',kind:'PAYOUT',amountPaise:-body.amountPaise,status:'PAID_OUT',providerRef:body.providerRef,demo:false,createdAt:now()});
   await audit(tx,req.user.id,`payout.recorded ₹${rupees(body.amountPaise)}`,body.sellerId);const s=await tx.get('sellers',body.sellerId);if(s.ownerId!=='seed')await notify(tx,s.ownerId,'Payout recorded',`₹${rupees(body.amountPaise)} was paid out (ref ${body.providerRef}).`,'/seller');return e;});
  res.status(201).json({entry});
 });

 // Content, media and communication
 const cmsIds={announcement:'Announcement bar',hero:'Homepage hero'};
 app.get('/api/admin/cms',auth,staff('cms.manage'),async(_req,res)=>{const [sections,products]=await Promise.all([store.all('cms'),store.all('products')]);res.json({sections:Object.entries(cmsIds).map(([id,label])=>({id,label,...(sections.find(s=>s.id===id)||{heading:'',body:'',version:0})})),featured:products.filter(p=>p.featured).map(p=>({id:p.id,name:p.name,status:p.status}))});});
 app.get('/api/admin/media',auth,staff('media.manage'),async(_req,res)=>{const [media,sellers,products]=await Promise.all([store.all('media'),store.all('sellers'),store.all('products')]);res.json({media:media.sort(byNewest).map(m=>({...m,seller:nameOf(sellers,m.sellerId),usedBy:products.filter(p=>(p.images||[]).includes(m.url)).map(p=>({id:p.id,name:p.name}))}))});});
 app.delete('/api/admin/media/:id',auth,staff('media.manage'),async(req,res)=>{const {reason}=z.object({reason:z.string().trim().min(5,'Please give a short reason (at least 5 characters)').max(300)}).parse(req.body??{});
  const removed=await store.transaction(async tx=>{const m=await tx.get('media',req.params.id);if(!m)throw new DomainError('Image not found',404);
   // Listings that used the image lose it and return to review so a seller can't keep a removed photo live.
   for(const p of (await tx.all('products')).filter(p=>(p.images||[]).includes(m.url))){const images=p.images.filter(u=>u!==m.url);await tx.update('products',p.id,{images,image:images[0]||'/products/box.svg',status:'PENDING'});}
   await tx.remove('media',m.id);await audit(tx,req.user.id,`media.removed: ${reason}`,m.id);const s=await tx.get('sellers',m.sellerId);if(s&&s.ownerId!=='seed')await notify(tx,s.ownerId,'A product photo was removed',reason,'/seller');return m;});
  await storage.remove?.(removed.id);res.json({ok:true});
 });
 const audienceOf={ALL:()=>true,CUSTOMERS:u=>u.role==='CUSTOMER',SELLERS:u=>!!u.sellerId,BUSINESSES:u=>!!u.organizationId,STAFF:u=>isStaff(u.role)};
 app.post('/api/admin/notifications',auth,staff('notifications.send'),async(req,res)=>{
  const body=z.object({audience:z.enum(Object.keys(audienceOf),{message:'Please choose who should receive this'}),title:z.string().trim().min(3,'Please add a title').max(100),body:z.string().trim().min(5,'Please write a message').max(500),link:z.string().trim().regex(/^\/[^/]/,'Links must be a page on IBazzzar, like /deals').optional()}).parse(req.body);
  const recipients=(await users()).filter(u=>(u.status||'ACTIVE')==='ACTIVE'&&audienceOf[body.audience](u)).slice(0,5000);
  await store.transaction(async tx=>{for(const u of recipients)await notify(tx,u.id,body.title,body.body,body.link??null);await audit(tx,req.user.id,`notification.broadcast ${body.audience} (${recipients.length})`,'notifications');});
  res.status(201).json({sent:recipients.length});
 });

 // Reports and audit
 const reports={
  orders:{cap:'orders.view',rows:async()=>{const [orders,people]=await Promise.all([store.all('orders'),users()]);return orders.sort(byNewest).map(o=>({order:o.id,date:o.createdAt,customer:nameOf(people,o.userId),status:o.status,payment:o.paymentStatus,mode:o.mode,items:o.items.length,subtotal_inr:rupees(o.subtotalPaise??o.totalPaise),discount_inr:rupees(o.discountPaise||0),total_inr:rupees(o.totalPaise),coupon:o.couponCode||'',pincode:o.address?.pincode}));}},
  ledger:{cap:'finance.view',rows:async()=>{const [ledger,sellers]=await Promise.all([store.all('ledger'),store.all('sellers')]);return ledger.sort(byNewest).map(e=>({date:e.createdAt,seller:nameOf(sellers,e.sellerId),order:e.orderId,entry:e.kind,amount_inr:rupees(e.amountPaise),status:e.status,reference:e.providerRef||'',demo:e.demo?'yes':'no'}));}},
  users:{cap:'users.view',rows:async()=>(await users()).sort(byNewest).map(u=>({id:u.id,name:u.name,email:u.email,phone:u.phone||'',role:u.role,status:u.status||'ACTIVE',email_verified:u.emailVerifiedAt?'yes':'no',marketing_opt_in:u.marketingOptIn?'yes':'no',joined:u.createdAt}))},
  products:{cap:'catalogue.manage',rows:async()=>{const [products,sellers]=await Promise.all([store.all('products'),store.all('sellers')]);return products.map(p=>({id:p.id,name:p.name,brand:p.brand,category:p.category,seller:nameOf(sellers,p.sellerId),status:p.status,price_inr:rupees(p.pricePaise),stock:p.stock,moq:p.moq,featured:p.featured?'yes':'no'}));}},
 };
 app.get('/api/admin/reports/:kind',auth,staff('reports.view'),async(req,res)=>{const report=reports[req.params.kind];if(!report)throw new DomainError('Report not found',404);if(!can(req.user.role,report.cap))throw new DomainError('Your staff role does not include this report',403);
  await audit(store,req.user.id,`report.exported ${req.params.kind}`,req.params.kind);
  res.set({'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="ibazzzar-${req.params.kind}-${new Date().toISOString().slice(0,10)}.csv"`}).send('﻿'+csv(await report.rows()));
 });
 app.get('/api/admin/audit',auth,staff('audit.view'),async(req,res)=>{
  const q=String(req.query.q||'').toLowerCase(),[log,people]=await Promise.all([store.all('audit'),users()]);
  const list=log.filter(a=>matches(q,a.action,a.resourceId,nameOf(people,a.actorId))).sort(byNewest).map(a=>({...a,actor:nameOf(people,a.actorId)??a.actorId}));
  const page=paginate(list,req);res.json({...page,entries:page.items});
 });

 // Platform settings
 const settingsInput=z.object({commissionRateBps:z.number().int().min(0).max(5000,'Commission cannot be more than 50%'),returnWindowDays:z.number().int().min(0).max(90,'Return windows can be at most 90 days'),lowStockThreshold:z.number().int().min(0).max(10000),paymentWindowMinutes:z.number().int().min(5,'Allow at least 5 minutes to pay').max(1440,'Payment windows can be at most 24 hours')}).partial();
 app.get('/api/admin/settings',auth,staff('settings.manage'),async(_req,res)=>res.json({settings:{...(await platformSettings(store)),commissionRateBps:await commissionRate(store)}}));
 app.put('/api/admin/settings',auth,staff('settings.manage'),async(req,res)=>{const {commissionRateBps,...platform}=settingsInput.parse(req.body);
  await store.transaction(async tx=>{if(commissionRateBps!==undefined)await tx.put('settings',{id:'commission',value:{rateBps:commissionRateBps}});if(Object.keys(platform).length)await tx.put('settings',{id:'platform',value:{...(await platformSettings(tx)),...platform}});await audit(tx,req.user.id,`settings.updated ${Object.keys(req.body).join(', ')}`,'settings');});
  res.json({settings:{...(await platformSettings(store)),commissionRateBps:await commissionRate(store)}});
 });
}
