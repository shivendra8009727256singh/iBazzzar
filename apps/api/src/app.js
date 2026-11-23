import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DomainError, searchScore, can } from '../../../packages/shared/src/index.js';
import { accountRegisterSchema, businessProfileSchema, sellerProfileSchema, loginSchema, checkoutSchema, cartSchema, productSchema, productUpdateSchema, addressSchema } from '../../../packages/validation/src/index.js';
import { hashPassword, verifyPassword, sessionToken, hash, publicUser, verifySignature } from './security.js';
import { Marketplace, audit, now, sellableProducts, commissionRate, purchaseOrderCheckoutKey } from './service.js';
import { operations } from './operations.js';
import { adminConsole, activeCategories, assertActiveCategory } from './admin.js';
import { createMailer } from './mailer.js';
import { localStorage } from './media.js';
import { createOrganization, createSeller, sendVerification, publicSeller, MAX_FAILED_LOGINS, LOCK_MINUTES } from './accounts.js';

// Verifying against a fixed hash for unknown emails keeps login timing uniform.
const DUMMY_HASH='00000000000000000000000000000000:'+'0'.repeat(128);
export function createApp({store,config}) {
 const app=express(),market=new Marketplace(store),mailer=config.mailer??createMailer(config),storage=config.storage??localStorage(config.mediaDir??'.local/uploads');
 app.disable('x-powered-by');app.use(helmet());
 const cookieOptions={httpOnly:true,sameSite:'lax',secure:!!config.production,path:'/api',maxAge:7*24*60*60*1000};
 app.post('/api/payments/webhook',express.raw({type:'application/json',limit:'256kb'}),async(req,res)=>{
  if(!config.paymentWebhookSecret)throw new DomainError('Payment webhook is not configured',503);
  if(!verifySignature(req.body,req.get('x-razorpay-signature'),config.paymentWebhookSecret))throw new DomainError('Invalid webhook signature');
  let event;try{event=JSON.parse(req.body.toString());}catch{throw new DomainError('Invalid JSON');}
  const eventId=req.get('x-razorpay-event-id');if(!eventId||eventId.length>200)throw new DomainError('Missing event ID');
  if(event.event!=='payment.captured')return res.json({received:true});
  const payment=event.payload?.payment?.entity;
  await store.transaction(async tx=>{
   if(await tx.get('paymentEvents',eventId))return;
   const intent=payment&&await tx.get('paymentIntents',payment.order_id);
   const order=intent&&await tx.get('orders',intent.orderId);
   if(!order||payment.currency!=='INR'||payment.amount!==order.totalPaise||payment.amount!==intent.amountPaise||payment.status!=='captured')throw new DomainError('Payment does not match order');
   await market.applyPayment(tx,order,{paymentStatus:'PAID',reference:payment.id,actorId:'payment-webhook'});
   await tx.update('paymentIntents',intent.id,{status:'CAPTURED'});await tx.put('paymentEvents',{id:eventId,orderId:order.id,createdAt:now()});
  });res.json({received:true});
 });
 app.use(express.json({limit:'128kb'}));app.use(cookieParser());
 app.use('/api',rateLimit({windowMs:60_000,limit:300,standardHeaders:'draft-8',legacyHeaders:false}));
 app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.get('origin')!==config.origin)return res.status(403).json({error:'Request origin is not allowed'});next();});
 app.use('/api',async(req,_res,next)=>{const token=req.cookies.ib_session;if(token){const session=await store.get('sessions',hash(token));if(session&&Date.parse(session.expiresAt)>Date.now()){const user=await store.get('users',session.userId);if(user&&user.status!=='SUSPENDED')req.user=user;}}next();});
 const auth=(req,_res,next)=>{if(!req.user)throw new DomainError('Please sign in to continue',401);next();};
 // Staff routes check a capability from the shared permission matrix rather than a single admin flag.
 const staff=capability=>(req,_res,next)=>{if(!req.user)throw new DomainError('Please sign in to continue',401);if(!can(req.user.role,capability))throw new DomainError('Your staff role does not include this action. Ask a Super Admin if you need access.',403);next();};
 const seller=async(req,_res,next)=>{if(!req.user?.sellerId)throw new DomainError('Seller account required',403);req.seller=await store.get('sellers',req.user.sellerId);if(req.seller?.status!=='APPROVED')throw new DomainError('Your seller application is awaiting approval',403);next();};
 const business=(req,_res,next)=>{if(!req.user?.organizationId)throw new DomainError('Business account required',403);next();};
 const session=async(res,user)=>{const token=sessionToken();await store.put('sessions',{id:hash(token),userId:user.id,expiresAt:new Date(Date.now()+cookieOptions.maxAge).toISOString()});res.cookie('ib_session',token,cookieOptions);};
 const ratingSummary=async()=>{const map=new Map();for(const r of (await store.all('reviews')).filter(r=>r.status==='PUBLISHED')){const m=map.get(r.productId)||{count:0,total:0};m.count++;m.total+=r.rating;map.set(r.productId,m);}return new Map([...map].map(([id,m])=>[id,{count:m.count,average:Math.round(m.total/m.count*10)/10}]));};
 const checkTiers=p=>{for(const t of p.tiers||[]){if(t.min<p.moq)throw new DomainError('Wholesale tiers must start at or above the MOQ');if(t.pricePaise>p.pricePaise)throw new DomainError('Wholesale tier prices cannot exceed the retail price');}};
 const checkImages=async(tx,sellerId,images=[])=>{if(!images.length)return;const owned=new Set((await tx.all('media')).filter(m=>m.sellerId===sellerId).map(m=>m.url));if(images.some(u=>!owned.has(u)))throw new DomainError('Use images uploaded by your store',403);};
 const authLimit=rateLimit({windowMs:15*60_000,limit:30,standardHeaders:'draft-8',legacyHeaders:false});
 app.get('/api/health',(_req,res)=>res.json({status:'ok',mode:config.demo?'demo':'database',payments:config.paymentKey?'test':'unconfigured',shipping:'not-configured'}));
 app.get('/api/categories',async(_req,res)=>res.json({categories:(await activeCategories(store)).map(c=>c.name)}));
 app.get('/api/products',async(req,res)=>{
  const sellers=await store.all('sellers'),ratings=await ratingSummary();let products=(await sellableProducts(store)).map(p=>({...p,sellerName:sellers.find(s=>s.id===p.sellerId)?.name,rating:ratings.get(p.id)??null}));
  const q=String(req.query.q||'').trim().toLowerCase().slice(0,200);
  if(q){const scored=products.map(p=>[p,searchScore(`${p.name} ${p.category} ${p.brand} ${p.sellerName}`,q)]).filter(([,s])=>s>0);scored.sort((a,b)=>b[1]-a[1]);products=scored.map(([p])=>p);}
  if(req.query.category)products=products.filter(p=>p.category===req.query.category);
  if(req.query.brand)products=products.filter(p=>p.brand===req.query.brand);
  if(req.query.seller)products=products.filter(p=>p.sellerId===req.query.seller);
  if(req.query.max)products=products.filter(p=>p.pricePaise<=Number(req.query.max)*100);
  if(req.query.inStock==='true')products=products.filter(p=>p.stock>0);
  if(req.query.sort==='price-asc')products.sort((a,b)=>a.pricePaise-b.pricePaise);
  if(req.query.sort==='price-desc')products.sort((a,b)=>b.pricePaise-a.pricePaise);
  if(req.query.sort==='rating')products.sort((a,b)=>(b.rating?.average||0)-(a.rating?.average||0));
  if(req.query.minRating)products=products.filter(p=>(p.rating?.average||0)>=Number(req.query.minRating));
  const total=products.length,page=Math.max(1,Math.min(10000,Number(req.query.page)||1)),limit=24;
  res.json({products:products.slice((page-1)*limit,page*limit),total,page,pages:Math.ceil(total/limit)});
 });
 app.get('/api/products/:slug',async(req,res)=>{const sellable=await sellableProducts(store),product=sellable.find(p=>p.slug===req.params.slug||p.id===req.params.slug);if(!product)throw new DomainError('Product not found',404);const seller=publicSeller(await store.get('sellers',product.sellerId));const reviews=(await store.all('reviews')).filter(r=>r.productId===product.id&&r.status==='PUBLISHED').map(({userId:_user,...r})=>r).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));res.json({product:{...product,sellerName:seller.name,rating:(await ratingSummary()).get(product.id)??null},seller,reviews,variants:product.variantGroup?sellable.filter(p=>p.variantGroup===product.variantGroup).map(p=>({id:p.id,slug:p.slug,variantLabel:p.variantLabel,stock:p.stock,pricePaise:p.pricePaise})):[]});});
 app.get('/api/sellers',async(_req,res)=>res.json({sellers:(await store.all('sellers')).filter(s=>s.status==='APPROVED').map(publicSeller)}));
 app.post('/api/auth/register',authLimit,async(req,res)=>{
  const input=accountRegisterSchema.parse(req.body);const passwordHash=await hashPassword(input.password);
  // One transaction creates the person and, for business buyers and sellers, their pending organisation or store.
  const user=await store.transaction(async tx=>{const users=await tx.all('users');
   if(users.some(u=>u.email===input.email))throw new DomainError('An account with this email already exists. Sign in instead.',409);
   if(users.some(u=>u.phone===input.phone))throw new DomainError('This mobile number is already linked to another account',409);
   // Local bootstrap only: the configured email becomes the first admin. Production uses scripts/grant-admin.mjs instead.
   const bootstrap=!config.production&&config.bootstrapAdminEmail===input.email&&!users.some(u=>u.role==='ADMIN');
   const created=await tx.put('users',{id:randomUUID(),name:input.name,email:input.email,phone:input.phone,passwordHash,role:bootstrap?'ADMIN':'CUSTOMER',marketingOptIn:input.marketingOptIn,termsAcceptedAt:now(),emailVerifiedAt:null,failedLogins:0,lockedUntil:null,createdAt:now()});
   if(bootstrap)await audit(tx,created.id,'user.bootstrap-admin',created.id);
   if(input.accountType==='business')await createOrganization(tx,created,input.business);
   if(input.accountType==='seller')await createSeller(tx,created,input.seller);
   await audit(tx,created.id,`user.registered.${input.accountType}`,created.id);
   return tx.get('users',created.id);});
  await session(res,user);
  let verificationSent=false;try{verificationSent=await sendVerification(store,mailer,config,user);}catch(error){config.logger?.warn({err:error},'Verification email failed');}
  res.status(201).json({user:publicUser(user),verificationSent});
 });
 app.post('/api/auth/login',authLimit,async(req,res)=>{
  const input=loginSchema.parse(req.body);const user=(await store.all('users')).find(u=>u.email===input.email);
  if(user?.lockedUntil&&Date.parse(user.lockedUntil)>Date.now())throw new DomainError(`Too many failed attempts. Try again after ${new Date(user.lockedUntil).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'})} IST or reset your password.`,429);
  if(!await verifyPassword(input.password,user?.passwordHash??DUMMY_HASH)||!user){
   // Per-account lockout complements the per-IP rate limit against distributed password guessing.
   if(user){const failed=(user.failedLogins||0)+1;await store.update('users',user.id,failed>=MAX_FAILED_LOGINS?{failedLogins:0,lockedUntil:new Date(Date.now()+LOCK_MINUTES*60_000).toISOString()}:{failedLogins:failed});if(failed>=MAX_FAILED_LOGINS)await audit(store,user.id,'user.locked',user.id);}
   throw new DomainError('Email or password is incorrect',401);}
  if(user.status==='SUSPENDED')throw new DomainError('This account has been suspended. Please contact IBazzzar support for help.',403);
  if(user.failedLogins||user.lockedUntil)await store.update('users',user.id,{failedLogins:0,lockedUntil:null});
  await session(res,user);res.json({user:publicUser({...user,failedLogins:0,lockedUntil:null})});
 });
 app.post('/api/auth/verify-email',authLimit,async(req,res)=>{
  const {token}=z.object({token:z.string().regex(/^[a-f0-9]{64}$/,'This verification link is invalid')}).parse(req.body);
  await store.transaction(async tx=>{const t=await tx.get('verifyTokens',hash(token));if(!t||Date.parse(t.expiresAt)<=Date.now())throw new DomainError('This verification link has expired. Request a new one from your account.',400);
   await tx.update('users',t.userId,{emailVerifiedAt:now()});for(const x of (await tx.all('verifyTokens')).filter(x=>x.userId===t.userId))await tx.remove('verifyTokens',x.id);await audit(tx,t.userId,'user.email-verified',t.userId);});
  res.json({ok:true,message:'Email confirmed. Thank you.'});
 });
 app.post('/api/auth/verify-email/resend',authLimit,auth,async(req,res)=>{
  if(req.user.emailVerifiedAt)throw new DomainError('Your email is already confirmed',409);
  if(!await sendVerification(store,mailer,config,req.user))throw new DomainError('Email delivery is not configured yet',503);
  res.json({ok:true,message:'A new confirmation link is on its way.'});
 });
 app.get('/api/auth/me',auth,(req,res)=>res.json({user:publicUser(req.user)}));
 app.post('/api/auth/logout',async(req,res)=>{if(req.cookies.ib_session)await store.remove('sessions',hash(req.cookies.ib_session));res.clearCookie('ib_session',{...cookieOptions,maxAge:undefined});res.json({ok:true});});
 app.post('/api/cart/price',async(req,res)=>{res.json(await market.priceCart(cartSchema.parse(req.body),req.user));});
 app.post('/api/checkout',auth,async(req,res)=>{const order=await market.checkout(req.user,checkoutSchema.parse(req.body),req.get('idempotency-key'));res.status(201).json({order,demo:config.demo,paymentConfigured:!!config.paymentKey});});
 app.get('/api/orders',auth,async(req,res)=>res.json({orders:(await store.all('orders')).filter(o=>o.userId===req.user.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))}));
 app.get('/api/orders/:id',auth,async(req,res)=>{const order=await store.get('orders',req.params.id);if(!order||order.userId!==req.user.id)throw new DomainError('Order not found',404);res.json({order});});
 app.post('/api/orders/:id/cancel',auth,async(req,res)=>res.json({order:await market.cancel(req.user,req.params.id)}));
 app.post('/api/orders/:id/returns',auth,async(req,res)=>{const body=z.object({reason:z.string().trim().min(10).max(1000),sellerId:z.string().max(64).optional()}).parse(req.body);res.status(201).json({return:await market.requestReturn(req.user,req.params.id,body)});});
 app.post('/api/orders/:id/payment',auth,async(req,res)=>{
  if(!config.paymentKey?.startsWith('rzp_test_')||!config.paymentSecret)throw new DomainError('Razorpay test payments are not configured',503);
  const order=await store.get('orders',req.params.id);if(!order||order.userId!==req.user.id)throw new DomainError('Order not found',404);if(order.status!=='AWAITING_PAYMENT')throw new DomainError('Order is not awaiting payment',409);
  const prior=(await store.all('paymentIntents')).find(p=>p.orderId===order.id);if(prior)return res.json({key:config.paymentKey,paymentOrderId:prior.id,amount:prior.amountPaise,currency:'INR'});
  const upstream=await fetch('https://api.razorpay.com/v1/orders',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Basic ${Buffer.from(`${config.paymentKey}:${config.paymentSecret}`).toString('base64')}`},body:JSON.stringify({amount:order.totalPaise,currency:'INR',receipt:order.id}),signal:AbortSignal.timeout(15000)});
  if(!upstream.ok)throw new DomainError('Payment provider could not create a test order',502);const payment=await upstream.json();await store.put('paymentIntents',{id:payment.id,orderId:order.id,amountPaise:order.totalPaise,status:'CREATED',createdAt:now()});res.json({key:config.paymentKey,paymentOrderId:payment.id,amount:order.totalPaise,currency:'INR'});
 });
 app.post('/api/business/register',auth,async(req,res)=>{
  const profile=businessProfileSchema.parse(req.body);
  const organization=await store.transaction(async tx=>createOrganization(tx,await tx.get('users',req.user.id),profile));res.status(201).json({organization});
 });
 app.get('/api/business/overview',auth,business,async(req,res)=>{
  const rfqs=(await store.all('rfqs')).filter(r=>r.organizationId===req.user.organizationId);
  const purchaseOrders=await Promise.all((await store.all('purchaseOrders')).filter(p=>p.organizationId===req.user.organizationId).map(async p=>{const key=await store.get('keys',purchaseOrderCheckoutKey(p.id)),order=key&&await store.get('orders',key.orderId);return {...p,orderId:order?.userId===req.user.id?order.id:null,orderedBy:order?.userId??null,orderStatus:order?.status??null};}));
  res.json({organization:await store.get('organizations',req.user.organizationId),rfqs,quotes:(await store.all('quotes')).filter(q=>rfqs.some(r=>r.id===q.rfqId)),purchaseOrders,members:(await store.all('users')).filter(u=>u.organizationId===req.user.organizationId).map(u=>({id:u.id,name:u.name,email:u.email,organizationRole:u.organizationRole}))});
 });
 app.post('/api/business/purchase-orders/:id/checkout',auth,business,async(req,res)=>{
  const input=z.object({address:addressSchema}).parse(req.body);
  const order=await market.checkoutPurchaseOrder(req.user,req.params.id,input);
  res.status(201).json({order,demo:config.demo,paymentConfigured:!!config.paymentKey});
 });
 app.post('/api/business/rfqs',auth,business,async(req,res)=>{
  const body=z.object({productId:z.string(),quantity:z.number().int().min(1).max(10000),notes:z.string().trim().min(5).max(2000)}).parse(req.body);const product=await store.get('products',body.productId);if(!product||product.status!=='APPROVED')throw new DomainError('Product is unavailable',404);if(body.quantity<product.moq)throw new DomainError(`Minimum order is ${product.moq} units`);
  const rfq=await store.put('rfqs',{id:randomUUID(),...body,organizationId:req.user.organizationId,userId:req.user.id,sellerId:product.sellerId,status:'OPEN',createdAt:now()});await audit(store,req.user.id,'rfq.created',rfq.id);res.status(201).json({rfq});
 });
 app.post('/api/business/quotes/:id/accept',auth,business,async(req,res)=>res.json({purchaseOrder:await market.acceptQuote(req.user,req.params.id)}));
 app.post('/api/business/purchase-orders/:id/approve',auth,business,async(req,res)=>res.json({purchaseOrder:await market.decidePurchaseOrder(req.user,req.params.id,'APPROVED')}));
 app.post('/api/seller/register',auth,async(req,res)=>{
  const profile=sellerProfileSchema.parse(req.body);
  const s=await store.transaction(async tx=>createSeller(tx,await tx.get('users',req.user.id),profile));res.status(201).json({seller:s});
 });
 app.get('/api/seller/overview',auth,seller,async(req,res)=>{const products=(await store.all('products')).filter(p=>p.sellerId===req.user.sellerId);const sid=req.user.sellerId,mine=x=>x.sellerId===sid;
  // Sellers see only their own lines; the delivery address is shared only once the order is paid.
  const orders=(await store.all('orders')).filter(o=>o.items.some(mine)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(o=>({id:o.id,status:o.status,paymentStatus:o.paymentStatus,createdAt:o.createdAt,items:o.items.filter(mine),fulfillment:o.fulfillments?.find(mine)??null,address:['AWAITING_PAYMENT','CANCELLED'].includes(o.status)?null:o.address}));
  // Staff run day-to-day operations; settlements and team management stay with the store owner.
  const isOwner=req.user.sellerRole!=='STAFF',ledger=isOwner?(await store.all('ledger')).filter(mine).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)):[];
  const staff=isOwner?(await store.all('users')).filter(u=>u.sellerId===sid).map(u=>({id:u.id,name:u.name,email:u.email,sellerRole:u.sellerRole||'OWNER'})):[];
  res.json({seller:req.seller,products,orders,rfqs:(await store.all('rfqs')).filter(mine),quotes:(await store.all('quotes')).filter(mine),purchaseOrders:(await store.all('purchaseOrders')).filter(mine),returns:(await store.all('returns')).filter(mine).map(({userId:_u,...r})=>r),ledger,staff,sellerRole:isOwner?'OWNER':'STAFF',commissionRateBps:await commissionRate(store)});});
 app.post('/api/seller/products',auth,seller,async(req,res)=>{
  const {variantOf,...body}=productSchema.parse(req.body);checkTiers(body);const id=randomUUID();
  const product=await store.transaction(async tx=>{
   await checkImages(tx,req.user.sellerId,body.images);await assertActiveCategory(tx,body.category);
   let variantGroup=null;
   if(variantOf){const parent=await tx.get('products',variantOf);if(!parent||parent.sellerId!==req.user.sellerId)throw new DomainError('Variant parent not found',404);if(!body.variantLabel)throw new DomainError('Give this variant a label, for example its colour or size');variantGroup=parent.variantGroup||parent.id;if(!parent.variantGroup)await tx.update('products',parent.id,{variantGroup,variantLabel:parent.variantLabel||'Standard'});}
   const p=await tx.put('products',{...body,id,slug:`${body.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${id.slice(0,8)}`,sellerId:req.user.sellerId,image:body.images[0]||'/products/box.svg',variantGroup,variantLabel:body.variantLabel??null,status:'PENDING',demo:config.demo});
   await audit(tx,req.user.id,'product.submitted',id);return p;
  });res.status(201).json({product});
 });
 app.patch('/api/seller/products/:id',auth,seller,async(req,res)=>{const body=productUpdateSchema.parse(req.body);const product=await store.transaction(async tx=>{const p=await tx.get('products',req.params.id);if(!p||p.sellerId!==req.user.sellerId)throw new DomainError('Product not found',404);checkTiers({...p,...body});if(body.category&&body.category!==p.category)await assertActiveCategory(tx,body.category);if(body.images)await checkImages(tx,req.user.sellerId,body.images);const contentChanged=Object.keys(body).some(k=>['name','brand','category','description','images','variantLabel'].includes(k));const updated=await tx.update('products',p.id,{...body,...(body.images?{image:body.images[0]||'/products/box.svg'}:{}),...(contentChanged?{status:'PENDING'}:{})});await audit(tx,req.user.id,'product.updated',p.id);return updated;});res.json({product});});
 app.post('/api/seller/rfqs/:id/quotes',auth,seller,async(req,res)=>{
  const body=z.object({pricePaise:z.number().int().positive().max(100000000),terms:z.string().min(5).max(2000),validUntil:z.iso.datetime()}).parse(req.body);if(Date.parse(body.validUntil)<=Date.now())throw new DomainError('Quote validity must be in the future');
  const quote=await store.transaction(async tx=>{const rfq=await tx.get('rfqs',req.params.id);if(!rfq||rfq.sellerId!==req.user.sellerId)throw new DomainError('RFQ not found',404);if(rfq.status==='ACCEPTED')throw new DomainError('RFQ was already accepted',409);const previous=(await tx.all('quotes')).filter(q=>q.rfqId===rfq.id);for(const q of previous.filter(q=>q.status==='OPEN'))await tx.update('quotes',q.id,{status:'SUPERSEDED'});const q=await tx.put('quotes',{id:randomUUID(),...body,rfqId:rfq.id,sellerId:req.user.sellerId,quantity:rfq.quantity,revision:previous.length+1,status:'OPEN',createdAt:now()});await tx.update('rfqs',rfq.id,{status:'QUOTED'});await audit(tx,req.user.id,'quote.submitted',q.id);return q;});res.status(201).json({quote});
 });
 app.get('/api/admin/overview',auth,staff('dashboard'),async(_req,res)=>{
  const orders=(await store.all('orders')).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),sellers=await store.all('sellers'),products=await store.all('products'),organizations=await store.all('organizations'),ledger=await store.all('ledger'),refunds=await store.all('refunds');
  const sum=(list,pick)=>list.reduce((s,x)=>s+pick(x),0),fees=list=>-sum(list.filter(e=>['COMMISSION','COMMISSION_REVERSAL'].includes(e.kind)),e=>e.amountPaise);
  // Every figure is calculated from stored records. Demo-simulated payments are reported separately, never as real GMV.
  const metrics={orders:orders.length,paidGmvPaise:sum(orders.filter(o=>o.paymentStatus==='PAID'),o=>o.totalPaise),demoGmvPaise:sum(orders.filter(o=>o.paymentStatus==='DEMO_SIMULATED'),o=>o.totalPaise),platformRevenuePaise:fees(ledger.filter(e=>!e.demo)),demoPlatformRevenuePaise:fees(ledger.filter(e=>e.demo)),customers:(await store.all('users')).length,activeSellers:sellers.filter(s=>s.status==='APPROVED').length,pendingApprovals:[...sellers,...products,...organizations].filter(x=>x.status==='PENDING').length,rfqs:(await store.all('rfqs')).length,refundsPaise:sum(refunds,r=>r.amountPaise)};
  res.json({metrics,sellers,products,organizations,orders,returns:await store.all('returns'),refunds,ledger,coupons:await store.all('coupons'),tickets:(await store.all('tickets')).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)),commissionRateBps:await commissionRate(store),audit:(await store.all('audit')).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100),cms:await store.all('cms')});
 });
 app.patch('/api/admin/:kind/:id/status',auth,async(req,res,next)=>{
  // Only approval resources are handled here; other kinds (for example users) fall through to their own routes.
  const table={sellers:'sellers',products:'products',organizations:'organizations'}[req.params.kind];if(!table)return next();
  if(!can(req.user.role,'approvals.manage'))throw new DomainError('Your staff role does not include this action. Ask a Super Admin if you need access.',403);const {status}=z.object({status:z.enum(['APPROVED','REJECTED','SUSPENDED'])}).parse(req.body);
  const resource=await store.transaction(async tx=>{if(!await tx.get(table,req.params.id))throw new DomainError('Resource not found',404);const r=await tx.update(table,req.params.id,{status});await audit(tx,req.user.id,`${table}.${status.toLowerCase()}`,r.id);return r;});res.json({resource});
 });
 app.put('/api/admin/cms/:id',auth,staff('cms.manage'),async(req,res)=>{const body=z.object({heading:z.string().min(3).max(150),body:z.string().min(3).max(2000),version:z.number().int().min(0)}).parse(req.body);const section=await store.transaction(async tx=>{const old=await tx.get('cms',req.params.id);if((old?.version||0)!==body.version)throw new DomainError('Content changed. Reload before saving.',409);const section=await tx.put('cms',{id:req.params.id,...body,version:body.version+1});await audit(tx,req.user.id,'cms.updated',section.id);return section;});res.json({section});});
 app.get('/api/cms',async(_req,res)=>res.json({sections:await store.all('cms')}));
 app.post('/api/newsletter',authLimit,async(req,res)=>{const body=z.object({email:z.email().toLowerCase(),consent:z.literal(true)}).parse(req.body);const token=sessionToken();await store.put('subscriptions',{id:hash(body.email),email:body.email,consent:true,unsubscribeHash:hash(token),createdAt:now()});res.status(201).json({message:'Subscription saved. Email delivery is not yet configured.',unsubscribeToken:token});});
 app.post('/api/newsletter/unsubscribe',async(req,res)=>{const {token}=z.object({token:z.string().min(32).max(128)}).parse(req.body);const record=(await store.all('subscriptions')).find(s=>s.unsubscribeHash===hash(token));if(record)await store.remove('subscriptions',record.id);res.json({ok:true});});
 operations(app,{store,config,market,mailer,storage,guards:{auth,staff,seller,business},ratingSummary});
 adminConsole(app,{store,config,market,storage,guards:{auth,staff}});
 app.use('/api',(_req,res)=>res.status(404).json({error:'Endpoint not found'}));
 app.use((error,_req,res,_next)=>{// Validation errors: one readable sentence for people, plus a per-field map that forms use to highlight inputs.
  if(error instanceof z.ZodError){const fields={};for(const i of error.issues)fields[i.path.join('.')]??=i.message;const count=Object.keys(fields).length;return res.status(400).json({error:count>1?`Please check the ${count} highlighted fields.`:error.issues[0]?.message??'Please check your details.',fields});}if(error.type==='entity.parse.failed')return res.status(400).json({error:'We couldn’t read that request. Please refresh the page and try again.'});if(error.type==='entity.too.large')return res.status(413).json({error:'That upload is too large. Please use a smaller file.'});const status=error.status||500;if(status===500)config.logger?.error({err:error},'Request failed');res.status(status).json({error:status===500?'Something went wrong. Please try again.':error.message});});
 return app;
}
