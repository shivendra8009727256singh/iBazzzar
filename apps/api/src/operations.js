import { randomUUID, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { DomainError, searchScore, assignableRoles } from '../../../packages/shared/src/index.js';
import { activeCategories } from './admin.js';
import { addressSchema, passwordChangeSchema, couponSchema, reviewSchema, fulfillmentSchema, ticketSchema } from '../../../packages/validation/src/index.js';
import { hashPassword, verifyPassword, hash, publicUser } from './security.js';
import { processImage, MAX_UPLOAD_BYTES } from './media.js';
import { audit, now, notify, sellableProducts, findCoupon } from './service.js';

const decisionSchema=z.object({decision:z.enum(['APPROVED','REJECTED']),note:z.string().trim().max(1000).optional()});
const own=(record,user)=>record&&record.userId===user.id;
const publicCoupon=({id:_id,used:_used,usageLimit:_limit,active:_active,public:_public,...c})=>c;

// Routes added on top of the core catalogue/checkout API. Guards come from app.js so authorisation stays in one place.
export function operations(app,{store,config,market,mailer,storage,guards:{auth,staff,seller,business}}){
 const support=staff('support.manage');
 const resetLimit=rateLimit({windowMs:15*60_000,limit:10,standardHeaders:'draft-8',legacyHeaders:false});
 const sellerOwner=(req,_res,next)=>{if(req.user.sellerRole==='STAFF')throw new DomainError('Only the store owner can manage this',403);next();};
 const owner=(req,_res,next)=>{if(req.user.organizationRole!=='OWNER')throw new DomainError('Only the organisation owner can manage this',403);next();};

 // Discovery
 app.get('/api/brands',async(_req,res)=>res.json({brands:[...new Set((await sellableProducts(store)).map(p=>p.brand))].sort()}));
 app.get('/api/search/suggest',async(req,res)=>{
  const q=String(req.query.q||'').trim().slice(0,100);if(q.length<2)return res.json({products:[],brands:[],sellers:[],categories:[]});
  const products=await sellableProducts(store),sellers=(await store.all('sellers')).filter(s=>s.status==='APPROVED');
  const rank=(list,text)=>list.map(x=>[x,searchScore(text(x),q)]).filter(([,s])=>s>0).sort((a,b)=>b[1]-a[1]).map(([x])=>x);
  res.json({products:rank(products,p=>`${p.name} ${p.brand}`).slice(0,6).map(p=>({slug:p.slug,name:p.name,brand:p.brand,image:p.image})),brands:rank([...new Set(products.map(p=>p.brand))],b=>b).slice(0,4),sellers:rank(sellers,s=>s.name).slice(0,3).map(s=>({id:s.id,name:s.name})),categories:rank((await activeCategories(store)).map(c=>c.name),c=>c).slice(0,4)});
 });
 app.get('/api/offers',async(_req,res)=>{const t=Date.now();res.json({offers:(await store.all('coupons')).filter(c=>c.public&&c.active&&Date.parse(c.startsAt)<=t&&Date.parse(c.endsAt)>t&&(c.usageLimit==null||c.used<c.usageLimit)).map(publicCoupon).sort((a,b)=>a.endsAt.localeCompare(b.endsAt))});});
 app.get('/api/reviews/recent',async(_req,res)=>{const products=await store.all('products');res.json({reviews:(await store.all('reviews')).filter(r=>r.status==='PUBLISHED').sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,6).map(({userId:_u,...r})=>({...r,productName:products.find(p=>p.id===r.productId)?.name,productSlug:products.find(p=>p.id===r.productId)?.slug}))});});
 app.post('/api/products/:id/reviews',auth,async(req,res)=>res.status(201).json({review:await market.review(req.user,req.params.id,reviewSchema.parse(req.body))}));

 // Password reset. Responses never reveal whether an email is registered.
 app.post('/api/auth/password-reset/request',resetLimit,async(req,res)=>{
  const {email}=z.object({email:z.email().toLowerCase()}).parse(req.body);
  if(!mailer.configured)throw new DomainError('Password reset email is not available yet. Contact support.',503);
  const user=(await store.all('users')).find(u=>u.email===email);
  if(user){const token=randomBytes(32).toString('hex');
   await store.transaction(async tx=>{for(const t of (await tx.all('resetTokens')).filter(t=>t.userId===user.id))await tx.remove('resetTokens',t.id);await tx.put('resetTokens',{id:hash(token),userId:user.id,expiresAt:new Date(Date.now()+30*60_000).toISOString(),createdAt:now()});});
   await mailer.send({to:email,subject:'Reset your IBazzzar password',text:`Use this link within 30 minutes: ${config.origin}/reset-password?token=${token}`});}
  res.json({ok:true,message:'If an account exists for that email, a reset link is on its way.'});
 });
 app.post('/api/auth/password-reset/confirm',resetLimit,async(req,res)=>{
  const {token,newPassword}=z.object({token:z.string().regex(/^[a-f0-9]{64}$/,'This reset link is invalid'),newPassword:z.string().min(12).max(128)}).parse(req.body);
  const passwordHash=await hashPassword(newPassword);
  await store.transaction(async tx=>{
   const t=await tx.get('resetTokens',hash(token));if(!t||Date.parse(t.expiresAt)<=Date.now())throw new DomainError('This reset link has expired. Request a new one.',400);
   await tx.update('users',t.userId,{passwordHash});await tx.remove('resetTokens',t.id);
   for(const s of (await tx.all('sessions')).filter(s=>s.userId===t.userId))await tx.remove('sessions',s.id);
   await audit(tx,t.userId,'user.password-reset',t.userId);
  });
  res.json({ok:true,message:'Password updated. Sign in with your new password.'});
 });

 // Product media. Images are re-encoded server-side and stored under unguessable random names.
 app.post('/api/seller/media',auth,seller,express.raw({type:['image/jpeg','image/png','image/webp'],limit:MAX_UPLOAD_BYTES}),async(req,res)=>{
  const image=await processImage(req.body);
  if((await store.all('media')).filter(m=>m.sellerId===req.user.sellerId).length>=500)throw new DomainError('Media library is full (500 images)',409);
  const {file,url}=await storage.put(image.data);
  const asset=await store.put('media',{id:file,sellerId:req.user.sellerId,url,width:image.width,height:image.height,bytes:image.data.length,createdAt:now()});
  await audit(store,req.user.id,'media.uploaded',asset.id);res.status(201).json({media:asset});
 });
 app.get('/api/seller/media',auth,seller,async(req,res)=>res.json({media:(await store.all('media')).filter(m=>m.sellerId===req.user.sellerId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))}));
 app.get('/api/media/:file',async(req,res)=>{const data=await storage.get(req.params.file);if(!data)throw new DomainError('Image not found',404);res.set({'Content-Type':'image/webp','Cache-Control':'public, max-age=31536000, immutable','Content-Security-Policy':"default-src 'none'"}).send(data);});

 // Seller team
 app.post('/api/seller/staff',auth,seller,sellerOwner,async(req,res)=>{
  const {email}=z.object({email:z.email().toLowerCase()}).parse(req.body);
  const member=await store.transaction(async tx=>{const u=(await tx.all('users')).find(u=>u.email===email);if(!u)throw new DomainError('Ask your colleague to create an IBazzzar account first',404);if(u.sellerId)throw new DomainError('This person already belongs to a store',409);const updated=await tx.update('users',u.id,{sellerId:req.user.sellerId,sellerRole:'STAFF'});await audit(tx,req.user.id,'seller.staff-added',u.id);await notify(tx,u.id,'You joined a store team','You can now manage products, orders and quotations.','/seller');return updated;});
  res.status(201).json({member:{id:member.id,name:member.name,email:member.email,sellerRole:member.sellerRole}});
 });
 app.delete('/api/seller/staff/:id',auth,seller,sellerOwner,async(req,res)=>{await store.transaction(async tx=>{const u=await tx.get('users',req.params.id);if(!u||u.sellerId!==req.user.sellerId||u.sellerRole!=='STAFF')throw new DomainError('Staff member not found',404);await tx.update('users',u.id,{sellerId:null,sellerRole:null});await audit(tx,req.user.id,'seller.staff-removed',u.id);});res.json({ok:true});});

 // Account
 app.post('/api/auth/password',auth,async(req,res)=>{
  const input=passwordChangeSchema.parse(req.body);
  if(!await verifyPassword(input.currentPassword,req.user.passwordHash))throw new DomainError('Current password is incorrect',401);
  const passwordHash=await hashPassword(input.newPassword),current=hash(req.cookies.ib_session);
  await store.transaction(async tx=>{await tx.update('users',req.user.id,{passwordHash});for(const s of (await tx.all('sessions')).filter(s=>s.userId===req.user.id&&s.id!==current))await tx.remove('sessions',s.id);await audit(tx,req.user.id,'user.password-changed',req.user.id);});
  res.json({ok:true,message:'Password updated. Other devices were signed out.'});
 });
 app.get('/api/account/addresses',auth,async(req,res)=>res.json({addresses:(await store.all('addresses')).filter(a=>own(a,req.user))}));
 app.post('/api/account/addresses',auth,async(req,res)=>{
  const body=addressSchema.extend({label:z.string().trim().min(2).max(30).default('Home')}).parse(req.body);
  const address=await store.transaction(async tx=>{if((await tx.all('addresses')).filter(a=>own(a,req.user)).length>=10)throw new DomainError('You can save up to 10 addresses',409);return tx.put('addresses',{id:randomUUID(),userId:req.user.id,...body,createdAt:now()});});
  res.status(201).json({address});
 });
 app.delete('/api/account/addresses/:id',auth,async(req,res)=>{const a=await store.get('addresses',req.params.id);if(!own(a,req.user))throw new DomainError('Address not found',404);await store.remove('addresses',a.id);res.json({ok:true});});
 app.get('/api/account/returns',auth,async(req,res)=>{const returns=(await store.all('returns')).filter(r=>own(r,req.user)),orderIds=new Set((await store.all('orders')).filter(o=>own(o,req.user)).map(o=>o.id));res.json({returns,refunds:(await store.all('refunds')).filter(r=>orderIds.has(r.orderId))});});
 app.get('/api/notifications',auth,async(req,res)=>res.json({notifications:(await store.all('notifications')).filter(n=>own(n,req.user)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,50)}));
 app.post('/api/notifications/read',auth,async(req,res)=>{await store.transaction(async tx=>{for(const n of (await tx.all('notifications')).filter(n=>own(n,req.user)&&!n.read))await tx.update('notifications',n.id,{read:true});});res.json({ok:true});});

 // Payments
 app.post('/api/orders/:id/demo-payment',auth,async(req,res)=>{
  if(!config.demo||config.production)throw new DomainError('Payment simulation is only available in demo mode',403);
  res.json({order:await market.simulatePayment(req.user,req.params.id)});
 });
 app.post('/api/orders/:id/payment/verify',auth,async(req,res)=>{
  if(!config.paymentSecret)throw new DomainError('Razorpay test payments are not configured',503);
  const body=z.object({razorpay_order_id:z.string().min(5).max(64),razorpay_payment_id:z.string().min(5).max(64),razorpay_signature:z.string().regex(/^[a-f0-9]{64}$/i)}).parse(req.body);
  const expected=createHmac('sha256',config.paymentSecret).update(`${body.razorpay_order_id}|${body.razorpay_payment_id}`).digest();
  if(!timingSafeEqual(expected,Buffer.from(body.razorpay_signature,'hex')))throw new DomainError('Payment signature could not be verified');
  const order=await store.transaction(async tx=>{
   const o=await tx.get('orders',req.params.id),intent=await tx.get('paymentIntents',body.razorpay_order_id);
   if(!o||o.userId!==req.user.id||intent?.orderId!==o.id)throw new DomainError('Order not found',404);
   if(intent.amountPaise!==o.totalPaise)throw new DomainError('Payment does not match order');
   const updated=await market.applyPayment(tx,o,{paymentStatus:'PAID',reference:body.razorpay_payment_id,actorId:req.user.id});
   await tx.update('paymentIntents',intent.id,{status:'CAPTURED'});return updated;
  });
  res.json({order});
 });

 // Support
 app.get('/api/support/tickets',auth,async(req,res)=>res.json({tickets:(await store.all('tickets')).filter(t=>own(t,req.user)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))}));
 app.post('/api/support/tickets',auth,async(req,res)=>{
  const body=ticketSchema.parse(req.body);
  if(body.orderId){const o=await store.get('orders',body.orderId);if(!own(o,req.user))throw new DomainError('Order not found',404);}
  const ticket=await store.put('tickets',{id:randomUUID(),userId:req.user.id,subject:body.subject,orderId:body.orderId??null,status:'OPEN',messages:[{from:'CUSTOMER',authorName:req.user.name,body:body.message,at:now()}],createdAt:now(),updatedAt:now()});
  await audit(store,req.user.id,'ticket.created',ticket.id);res.status(201).json({ticket});
 });
 const reply=async(req,from)=>{
  const {message}=z.object({message:z.string().trim().min(2).max(5000)}).parse(req.body);
  return store.transaction(async tx=>{
   const t=await tx.get('tickets',req.params.id);if(!t||(from==='CUSTOMER'&&!own(t,req.user)))throw new DomainError('Ticket not found',404);
   if(t.status==='CLOSED')throw new DomainError('This ticket is closed. Open a new one if you still need help.',409);
   const updated=await tx.update('tickets',t.id,{messages:[...t.messages,{from,authorName:from==='SUPPORT'?'IBazzzar support':req.user.name,body:message,at:now()}],status:from==='SUPPORT'?'AWAITING_CUSTOMER':'OPEN',updatedAt:now()});
   if(from==='SUPPORT')await notify(tx,t.userId,'Support replied',t.subject,'/account');
   return updated;
  });
 };
 app.post('/api/support/tickets/:id/messages',auth,async(req,res)=>res.json({ticket:await reply(req,'CUSTOMER')}));
 app.get('/api/support/queue',auth,support,async(_req,res)=>res.json({tickets:(await store.all('tickets')).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))}));
 app.post('/api/support/queue/:id/messages',auth,support,async(req,res)=>res.json({ticket:await reply(req,'SUPPORT')}));
 app.patch('/api/support/queue/:id',auth,support,async(req,res)=>{const {status}=z.object({status:z.enum(['OPEN','CLOSED'])}).parse(req.body);const t=await store.get('tickets',req.params.id);if(!t)throw new DomainError('Ticket not found',404);const ticket=await store.update('tickets',t.id,{status,updatedAt:now()});await audit(store,req.user.id,`ticket.${status.toLowerCase()}`,t.id);res.json({ticket});});

 // Business organisation
 app.post('/api/business/members',auth,business,owner,async(req,res)=>{
  const body=z.object({email:z.email().toLowerCase(),role:z.enum(['BUYER','APPROVER'])}).parse(req.body);
  const member=await store.transaction(async tx=>{
   const u=(await tx.all('users')).find(u=>u.email===body.email);
   // Invitations only attach existing accounts so no unverified identities are created on someone's behalf.
   if(!u)throw new DomainError('Ask your colleague to create an IBazzzar account first',404);
   if(u.organizationId)throw new DomainError('This person already belongs to a business account',409);
   const updated=await tx.update('users',u.id,{organizationId:req.user.organizationId,organizationRole:body.role});
   await audit(tx,req.user.id,'organization.member-added',u.id);await notify(tx,u.id,'You joined a business account',`You were added as ${body.role.toLowerCase()}.`,'/business');return updated;
  });
  res.status(201).json({member:{id:member.id,name:member.name,email:member.email,organizationRole:member.organizationRole}});
 });
 app.delete('/api/business/members/:id',auth,business,owner,async(req,res)=>{
  await store.transaction(async tx=>{const u=await tx.get('users',req.params.id);if(!u||u.organizationId!==req.user.organizationId)throw new DomainError('Member not found',404);if(u.id===req.user.id)throw new DomainError('The owner cannot be removed',409);await tx.update('users',u.id,{organizationId:null,organizationRole:null});await audit(tx,req.user.id,'organization.member-removed',u.id);});
  res.json({ok:true});
 });
 app.patch('/api/business/settings',auth,business,owner,async(req,res)=>{const {approvalThresholdPaise}=z.object({approvalThresholdPaise:z.number().int().min(0).max(1000000000)}).parse(req.body);const organization=await store.update('organizations',req.user.organizationId,{approvalThresholdPaise});await audit(store,req.user.id,'organization.threshold-updated',organization.id);res.json({organization});});
 app.post('/api/business/quotes/:id/reject',auth,business,async(req,res)=>res.json({quote:await market.rejectQuote(req.user,req.params.id)}));
 app.post('/api/business/purchase-orders/:id/reject',auth,business,async(req,res)=>{const {reason}=z.object({reason:z.string().trim().min(3).max(500)}).parse(req.body);res.json({purchaseOrder:await market.decidePurchaseOrder(req.user,req.params.id,'REJECTED',reason)});});

 // Seller operations
 app.post('/api/seller/orders/:id/fulfillment',auth,seller,async(req,res)=>res.json({order:await market.advanceFulfillment(req.user,req.params.id,fulfillmentSchema.parse(req.body))}));
 app.post('/api/seller/returns/:id/decision',auth,seller,async(req,res)=>res.json({return:await market.decideReturn(req.user,req.params.id,decisionSchema.parse(req.body),{sellerId:req.user.sellerId})}));
 app.post('/api/seller/purchase-orders/:id/confirm',auth,seller,async(req,res)=>res.json({purchaseOrder:await market.confirmPurchaseOrder(req.user,req.params.id)}));

 // Administration
 app.post('/api/admin/coupons',auth,staff('promotions.manage'),async(req,res)=>{
  const body=couponSchema.parse(req.body);
  const coupon=await store.transaction(async tx=>{if(await findCoupon(tx,body.code))throw new DomainError('A coupon with this code exists',409);const c=await tx.put('coupons',{id:randomUUID(),...body,used:0,active:true,createdAt:now()});await audit(tx,req.user.id,'coupon.created',c.id);return c;});
  res.status(201).json({coupon});
 });
 app.patch('/api/admin/coupons/:id',auth,staff('promotions.manage'),async(req,res)=>{const {active}=z.object({active:z.boolean()}).parse(req.body);if(!await store.get('coupons',req.params.id))throw new DomainError('Coupon not found',404);const coupon=await store.update('coupons',req.params.id,{active});await audit(store,req.user.id,`coupon.${active?'activated':'deactivated'}`,coupon.id);res.json({coupon});});
 app.put('/api/admin/settings/commission',auth,staff('settings.manage'),async(req,res)=>{const {rateBps}=z.object({rateBps:z.number().int().min(0).max(5000)}).parse(req.body);const setting=await store.put('settings',{id:'commission',value:{rateBps}});await audit(store,req.user.id,'settings.commission-updated','commission');res.json({setting});});
 app.post('/api/admin/returns/:id/decision',auth,staff('returns.manage'),async(req,res)=>res.json({return:await market.decideReturn(req.user,req.params.id,decisionSchema.parse(req.body))}));
 // Records a refund the admin issued in the provider dashboard. It never moves money itself.
 app.post('/api/admin/refunds/:id/record',auth,staff('finance.manage'),async(req,res)=>{
  const {providerRef}=z.object({providerRef:z.string().regex(/^rfnd_[A-Za-z0-9]{6,40}$/,'Enter the Razorpay refund ID (rfnd_…)')}).parse(req.body);
  const refund=await store.transaction(async tx=>{const r=await tx.get('refunds',req.params.id);if(!r)throw new DomainError('Refund not found',404);if(r.status!=='PENDING_PROVIDER')throw new DomainError('Only refunds awaiting the provider can be recorded',409);const u=await tx.update('refunds',r.id,{status:'PROCESSED',providerRef,processedAt:now()});await audit(tx,req.user.id,'refund.recorded',r.id);return u;});
  res.json({refund});
 });
 app.patch('/api/admin/users/:id/role',auth,staff('staff.manage'),async(req,res)=>{
  const {role}=z.object({role:z.enum(assignableRoles,{message:'Please choose a valid role'})}).parse(req.body);
  if(req.params.id===req.user.id)throw new DomainError('You cannot change your own role',409);
  const user=await store.transaction(async tx=>{const u=await tx.get('users',req.params.id);if(!u)throw new DomainError('User not found',404);const updated=await tx.update('users',u.id,{role});await audit(tx,req.user.id,`user.role-${role.toLowerCase()}`,u.id);return updated;});
  res.json({user:publicUser(user)});
 });
}
