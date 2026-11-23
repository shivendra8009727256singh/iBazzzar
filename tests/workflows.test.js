import {describe,it,expect,beforeEach} from 'vitest';
import request from 'supertest';
import {createHmac} from 'node:crypto';
import {MemoryRepository} from '../apps/api/src/repository.js';
import {createApp} from '../apps/api/src/app.js';
import {customer,businessProfile,sellerProfile} from './helpers.js';
const origin='http://localhost:3000';let store,app;
beforeEach(()=>{store=new MemoryRepository();app=createApp({store,config:{origin,demo:true,paymentWebhookSecret:'test-secret'}});});
async function member(name){const agent=request.agent(app);const r=await agent.post('/api/auth/register').set('Origin',origin).send({name,email:`${name}@example.test`,password:'Unique-password-123!',...customer()});expect(r.status).toBe(201);return {agent,user:r.body.user};}
const send=(agent,path,body)=>agent.post(path).set('Origin',origin).send(body);
describe('Business and seller workflows',()=>{
 it('takes RFQ through quotation, acceptance and approved purchase order',async()=>{
  const buyer=await member('buyer'),seller=await member('seller');await store.update('users',seller.user.id,{sellerId:'s1'});
  const org=await send(buyer.agent,'/api/business/register',businessProfile({legalName:'A new business'}));expect(org.status).toBe(201);expect(org.body.organization.status).toBe('PENDING');
  const rfq=await send(buyer.agent,'/api/business/rfqs',{productId:'p1',quantity:10,notes:'Please supply ten units to Delhi'});expect(rfq.status).toBe(201);
  const quote=await send(seller.agent,`/api/seller/rfqs/${rfq.body.rfq.id}/quotes`,{pricePaise:200000,terms:'Demonstration supply terms',validUntil:new Date(Date.now()+86400000).toISOString()});expect(quote.status).toBe(201);
  const accepted=await send(buyer.agent,`/api/business/quotes/${quote.body.quote.id}/accept`,{});expect(accepted.body.purchaseOrder.totalPaise).toBe(2000000);expect(accepted.body.purchaseOrder.status).toBe('PENDING_APPROVAL');
  const approved=await send(buyer.agent,`/api/business/purchase-orders/${accepted.body.purchaseOrder.id}/approve`,{});expect(approved.body.purchaseOrder.status).toBe('APPROVED');expect((await store.all('audit')).some(a=>a.action==='purchase-order.approved')).toBe(true);
 });
 it('rejects a buyer approving purchase orders and foreign organizations reading quotes',async()=>{
  const buyer=await member('buyer'),other=await member('other');await store.put('organizations',{id:'org',name:'Org',ownerId:buyer.user.id,status:'PENDING',createdAt:new Date().toISOString()});await store.update('users',buyer.user.id,{organizationId:'org',organizationRole:'BUYER'});await store.update('users',other.user.id,{organizationId:'foreign',organizationRole:'OWNER'});
  await store.put('rfqs',{id:'rfq',organizationId:'org',sellerId:'s1'});await store.put('quotes',{id:'quote',rfqId:'rfq',status:'OPEN',validUntil:new Date(Date.now()+86400000).toISOString(),quantity:5,pricePaise:100});await store.put('purchaseOrders',{id:'po',organizationId:'org',status:'PENDING_APPROVAL'});
  expect((await send(buyer.agent,'/api/business/purchase-orders/po/approve',{})).status).toBe(403);expect((await send(other.agent,'/api/business/quotes/quote/accept',{})).status).toBe(404);
 });
 it('requires moderation before seller products enter public catalogue',async()=>{
  const seller=await member('seller'),admin=await member('admin');await store.update('users',admin.user.id,{role:'ADMIN'});
  const application=await send(seller.agent,'/api/seller/register',sellerProfile({storeName:'New Store'}));expect(application.status).toBe(201);
  expect((await seller.agent.get('/api/seller/overview')).status).toBe(403);
  await admin.agent.patch(`/api/admin/sellers/${application.body.seller.id}/status`).set('Origin',origin).send({status:'APPROVED'});
  const p=await send(seller.agent,'/api/seller/products',{name:'Test product',brand:'TEST',description:'A product for demonstration',category:'Office',pricePaise:50000,stock:10,moq:2,tiers:[]});expect(p.status).toBe(201);
  expect((await request(app).get(`/api/products/${p.body.product.slug}`)).status).toBe(404);
  await admin.agent.patch(`/api/admin/products/${p.body.product.id}/status`).set('Origin',origin).send({status:'APPROVED'});
  expect((await request(app).get(`/api/products/${p.body.product.slug}`)).status).toBe(200);
 });
 it('preserves quote revisions and rejects superseded offers',async()=>{const buyer=await member('buyer'),seller=await member('seller');await store.update('users',seller.user.id,{sellerId:'s1'});await send(buyer.agent,'/api/business/register',businessProfile({legalName:'Buyer Ltd'}));const rfq=await send(buyer.agent,'/api/business/rfqs',{productId:'p1',quantity:10,notes:'Ten units please'});const input={pricePaise:120000,terms:'Test terms only',validUntil:new Date(Date.now()+86400000).toISOString()};const q1=await send(seller.agent,`/api/seller/rfqs/${rfq.body.rfq.id}/quotes`,input);const q2=await send(seller.agent,`/api/seller/rfqs/${rfq.body.rfq.id}/quotes`,{...input,pricePaise:110000});expect(q2.body.quote.revision).toBe(2);expect((await send(buyer.agent,`/api/business/quotes/${q1.body.quote.id}/accept`,{})).status).toBe(409);});
});
describe('Payment integrity and lifecycle',()=>{
 async function order(){const buyer=await member('buyer');const result=await send(buyer.agent,'/api/checkout',{items:[{productId:'p1',quantity:1}],mode:'retail',address:{name:'Test Buyer',line1:'12 Demo Road',city:'Delhi',state:'Delhi',pincode:'110001',phone:'9876543210'}}).set('Idempotency-Key','payment-test-001');return {...buyer,order:result.body.order};}
 const webhook=body=>request(app).post('/api/payments/webhook').set('Content-Type','application/json').set('x-razorpay-event-id','event-001').set('x-razorpay-signature',createHmac('sha256','test-secret').update(JSON.stringify(body)).digest('hex')).send(JSON.stringify(body));
 it('rejects mismatched captured amount and handles duplicate verified events once',async()=>{const x=await order();await store.put('paymentIntents',{id:'rz-order',orderId:x.order.id,amountPaise:x.order.totalPaise,status:'CREATED',createdAt:new Date().toISOString()});const payload=amount=>({event:'payment.captured',payload:{payment:{entity:{order_id:'rz-order',amount,currency:'INR',status:'captured'}}}});expect((await webhook(payload(1))).status).toBe(400);expect((await store.get('orders',x.order.id)).paymentStatus).toBe('UNPAID');expect((await webhook(payload(x.order.totalPaise))).status).toBe(200);expect((await webhook(payload(x.order.totalPaise))).status).toBe(200);expect((await store.get('orders',x.order.id)).history.length).toBe(2);expect((await store.all('paymentEvents')).length).toBe(1);});
 it('releases stock once when cancelling an unpaid order',async()=>{const x=await order();const after=(await store.get('products','p1')).stock;await send(x.agent,`/api/orders/${x.order.id}/cancel`,{});await send(x.agent,`/api/orders/${x.order.id}/cancel`,{});expect((await store.get('products','p1')).stock).toBe(after+1);});
 it('does not accept returns for undelivered orders',async()=>{const x=await order();expect((await send(x.agent,`/api/orders/${x.order.id}/returns`,{reason:'Item is not suitable'})).status).toBe(409);});
 it('requires newsletter consent and supports unsubscribe tokens',async()=>{expect((await send(request(app),'/api/newsletter',{email:'demo@example.test',consent:false})).status).toBe(400);const sub=await send(request(app),'/api/newsletter',{email:'demo@example.test',consent:true});expect(sub.status).toBe(201);await send(request(app),'/api/newsletter/unsubscribe',{token:sub.body.unsubscribeToken});expect((await store.all('subscriptions')).length).toBe(0);});
});
