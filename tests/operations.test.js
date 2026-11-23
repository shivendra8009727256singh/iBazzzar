import {describe,it,expect,beforeEach} from 'vitest';
import request from 'supertest';
import {createHmac} from 'node:crypto';
import {MemoryRepository} from '../apps/api/src/repository.js';
import {createApp} from '../apps/api/src/app.js';
import {Marketplace} from '../apps/api/src/service.js';
import {searchScore,couponDiscount} from '../packages/shared/src/index.js';
import {customer,businessProfile} from './helpers.js';
const origin='http://localhost:3000';let store,app;
const config={origin,demo:true,paymentSecret:'key-secret',paymentWebhookSecret:'hook-secret'};
beforeEach(()=>{store=new MemoryRepository();app=createApp({store,config});});
async function member(name,patch={}){const agent=request.agent(app);const r=await agent.post('/api/auth/register').set('Origin',origin).send({name,email:`${name}@example.test`,password:'Unique-password-123!',...customer()});expect(r.status).toBe(201);if(Object.keys(patch).length)await store.update('users',r.body.user.id,patch);return {agent,user:{...r.body.user,...patch}};}
const send=(agent,path,body={},method='post')=>agent[method](path).set('Origin',origin).send(body);
const address={name:'Test Buyer',line1:'12 Demo Road',city:'Delhi',state:'Delhi',pincode:'110001',phone:'9876543210'};
let keyCounter=0;
const checkout=(agent,items,extra={})=>send(agent,'/api/checkout',{items,mode:'retail',address,...extra}).set('Idempotency-Key',`ops-test-${++keyCounter}`);
const fulfil=(agent,id,status,extra={})=>send(agent,`/api/seller/orders/${id}/fulfillment`,{status,...extra});
async function deliveredOrder(){
 const buyer=await member('buyer'),s1=await member('sellerone',{sellerId:'s1'});
 const order=(await checkout(buyer.agent,[{productId:'p1',quantity:2}])).body.order;
 expect((await send(buyer.agent,`/api/orders/${order.id}/demo-payment`)).status).toBe(200);
 for(const [status,extra] of [['PACKED'],['SHIPPED',{carrier:'Seller courier',trackingRef:'SELF-001'}],['DELIVERED']])expect((await fulfil(s1.agent,order.id,status,extra)).status).toBe(200);
 return {buyer,s1,order};
}

describe('Order lifecycle and seller fulfilment',()=>{
 it('moves a paid order through fulfilment, ledger, review, return and refund',async()=>{
  const {buyer,s1,order}=await deliveredOrder();
  const delivered=await store.get('orders',order.id);expect(delivered.status).toBe('DELIVERED');expect(delivered.paymentStatus).toBe('DEMO_SIMULATED');
  const ledger=await store.all('ledger');expect(ledger.find(e=>e.kind==='SALE').amountPaise).toBe(499800);expect(ledger.find(e=>e.kind==='COMMISSION').amountPaise).toBe(-49980);expect(ledger.every(e=>e.demo)).toBe(true);
  expect((await send(buyer.agent,'/api/products/p1/reviews',{rating:5,title:'Lovely sound',body:'Comfortable for long listening sessions.'})).status).toBe(201);
  expect((await send(buyer.agent,'/api/products/p1/reviews',{rating:4,title:'Again',body:'Trying to review twice here.'})).status).toBe(409);
  expect((await request(app).get('/api/products/aura-wireless-headphones')).body.product.rating).toEqual({count:1,average:5});
  const ret=await send(buyer.agent,`/api/orders/${order.id}/returns`,{reason:'The colour is not what I expected'});expect(ret.status).toBe(201);
  expect((await send(s1.agent,`/api/seller/returns/${ret.body.return.id}/decision`,{decision:'APPROVED'})).status).toBe(200);
  const [refund]=await store.all('refunds');expect(refund.amountPaise).toBe(499800);expect(refund.status).toBe('DEMO_SIMULATED');
  const net=(await store.all('ledger')).reduce((s,e)=>s+e.amountPaise,0);expect(net).toBe(0);
  expect((await send(s1.agent,`/api/seller/returns/${ret.body.return.id}/decision`,{decision:'REJECTED'})).status).toBe(409);
 });
 it('blocks fulfilment before payment, by other sellers, out of order, and shipping without a carrier',async()=>{
  const buyer=await member('buyer'),s1=await member('sellerone',{sellerId:'s1'}),s2=await member('sellertwo',{sellerId:'s2'});
  const order=(await checkout(buyer.agent,[{productId:'p1',quantity:1}])).body.order;
  expect((await fulfil(s1.agent,order.id,'PACKED')).status).toBe(409);
  await send(buyer.agent,`/api/orders/${order.id}/demo-payment`);
  expect((await fulfil(s2.agent,order.id,'PACKED')).status).toBe(404);
  expect((await fulfil(s1.agent,order.id,'DELIVERED')).status).toBe(409);
  await fulfil(s1.agent,order.id,'PACKED');expect((await fulfil(s1.agent,order.id,'SHIPPED')).status).toBe(400);
  expect((await send(buyer.agent,'/api/products/p1/reviews',{rating:5,title:'Too early',body:'Not delivered yet so should fail.'})).status).toBe(403);
 });
 it('splits multi-seller orders and only shares each seller’s own lines and post-payment address',async()=>{
  const buyer=await member('buyer'),s1=await member('sellerone',{sellerId:'s1'}),s2=await member('sellertwo',{sellerId:'s2'});
  const order=(await checkout(buyer.agent,[{productId:'p1',quantity:1},{productId:'p3',quantity:1}])).body.order;
  expect(order.fulfillments.map(f=>f.sellerId).sort()).toEqual(['s1','s2']);
  let view=(await s1.agent.get('/api/seller/overview')).body.orders[0];expect(view.items.map(i=>i.productId)).toEqual(['p1']);expect(view.address).toBeNull();
  await send(buyer.agent,`/api/orders/${order.id}/demo-payment`);
  view=(await s1.agent.get('/api/seller/overview')).body.orders[0];expect(view.address.pincode).toBe('110001');
  await fulfil(s1.agent,order.id,'PACKED');await fulfil(s1.agent,order.id,'SHIPPED',{carrier:'Seller courier'});
  expect((await store.get('orders',order.id)).status).toBe('CONFIRMED');
  await fulfil(s2.agent,order.id,'PACKED');await fulfil(s2.agent,order.id,'SHIPPED',{carrier:'Seller courier'});
  expect((await store.get('orders',order.id)).status).toBe('SHIPPED');
 });
 it('seller cancellation of a paid order releases stock and records a refund',async()=>{
  const buyer=await member('buyer'),s1=await member('sellerone',{sellerId:'s1'});const before=(await store.get('products','p1')).stock;
  const order=(await checkout(buyer.agent,[{productId:'p1',quantity:3}])).body.order;await send(buyer.agent,`/api/orders/${order.id}/demo-payment`);
  expect((await fulfil(s1.agent,order.id,'CANCELLED')).status).toBe(200);
  expect((await store.get('products','p1')).stock).toBe(before);expect((await store.get('orders',order.id)).status).toBe('CANCELLED');expect((await store.all('refunds'))[0].amountPaise).toBe(749700);
 });
 it('refuses payment simulation outside demo mode',async()=>{
  app=createApp({store,config:{...config,demo:false}});const buyer=await member('buyer');const order=(await checkout(buyer.agent,[{productId:'p1',quantity:1}])).body.order;
  expect((await send(buyer.agent,`/api/orders/${order.id}/demo-payment`)).status).toBe(403);
 });
 it('verifies Razorpay checkout signatures before confirming payment',async()=>{
  const buyer=await member('buyer');const order=(await checkout(buyer.agent,[{productId:'p1',quantity:1}])).body.order;
  await store.put('paymentIntents',{id:'order_test1',orderId:order.id,amountPaise:order.totalPaise,status:'CREATED',createdAt:new Date().toISOString()});
  const body=sig=>({razorpay_order_id:'order_test1',razorpay_payment_id:'pay_test1',razorpay_signature:sig});
  expect((await send(buyer.agent,`/api/orders/${order.id}/payment/verify`,body('a'.repeat(64)))).status).toBe(400);
  expect((await store.get('orders',order.id)).paymentStatus).toBe('UNPAID');
  const good=createHmac('sha256','key-secret').update('order_test1|pay_test1').digest('hex');
  const r=await send(buyer.agent,`/api/orders/${order.id}/payment/verify`,body(good));expect(r.status).toBe(200);expect(r.body.order.paymentStatus).toBe('PAID');expect(r.body.order.paymentRef).toBe('pay_test1');
 });
 it('expires stale unpaid orders and releases their stock exactly once',async()=>{
  const buyer=await member('buyer');const before=(await store.get('products','p1')).stock;
  await checkout(buyer.agent,[{productId:'p1',quantity:2}]);const market=new Marketplace(store);
  expect(await market.expireUnpaid(60_000,Date.now())).toBe(0);
  expect(await market.expireUnpaid(60_000,Date.now()+120_000)).toBe(1);expect(await market.expireUnpaid(60_000,Date.now()+120_000)).toBe(0);
  expect((await store.get('products','p1')).stock).toBe(before);
 });
});

describe('Coupons',()=>{
 const coupon=(extra={})=>({code:'WELCOME10',description:'Ten percent welcome offer',kind:'PERCENT',value:10,maxDiscountPaise:50000,minOrderPaise:100000,startsAt:new Date(Date.now()-1000).toISOString(),endsAt:new Date(Date.now()+86400000).toISOString(),public:true,...extra});
 it('is admin-only, applied server-side, single-use per customer and released on cancellation',async()=>{
  const admin=await member('admin',{role:'ADMIN'}),buyer=await member('buyer');
  expect((await send(buyer.agent,'/api/admin/coupons',coupon())).status).toBe(403);
  expect((await send(admin.agent,'/api/admin/coupons',coupon())).status).toBe(201);
  expect((await request(app).get('/api/offers')).body.offers[0].code).toBe('WELCOME10');
  const price=await send(request(app),'/api/cart/price',{items:[{productId:'p1',quantity:1}],couponCode:'welcome10'});expect(price.body.discountPaise).toBe(24990);expect(price.body.totalPaise).toBe(224910);
  const order=(await checkout(buyer.agent,[{productId:'p1',quantity:1}],{couponCode:'WELCOME10'})).body.order;expect(order.discountPaise).toBe(24990);
  expect((await checkout(buyer.agent,[{productId:'p1',quantity:1}],{couponCode:'WELCOME10'})).status).toBe(409);
  expect((await store.all('coupons'))[0].used).toBe(1);
  await send(buyer.agent,`/api/orders/${order.id}/cancel`);expect((await store.all('coupons'))[0].used).toBe(0);
  expect((await checkout(buyer.agent,[{productId:'p1',quantity:1}],{couponCode:'WELCOME10'})).status).toBe(201);
 });
 it('enforces validity, minimum order, mode, cap and usage limit',()=>{
  const base={...coupon(),mode:'any',active:true,used:0,usageLimit:null};
  expect(()=>couponDiscount({...base,endsAt:new Date(Date.now()-1).toISOString()},500000,'retail')).toThrow(/not active/);
  expect(()=>couponDiscount(base,50000,'retail')).toThrow(/minimum/);
  expect(()=>couponDiscount({...base,mode:'business'},500000,'retail')).toThrow(/business/);
  expect(()=>couponDiscount({...base,usageLimit:1,used:1},500000,'retail')).toThrow(/limit/);
  expect(couponDiscount(base,1000000,'retail')).toBe(50000);
  expect(couponDiscount({...base,kind:'FLAT',value:900000,maxDiscountPaise:null},500000,'retail')).toBe(499900);
 });
});

describe('Business procurement controls',()=>{
 async function setup(threshold=0){
  const owner=await member('owner'),approver=await member('approver'),buyer=await member('buyerx'),s1=await member('sellerone',{sellerId:'s1'});
  await send(owner.agent,'/api/business/register',businessProfile({legalName:'Owner Traders'}));
  expect((await send(buyer.agent,'/api/business/members',{email:'approver@example.test',role:'APPROVER'})).status).toBe(403);
  expect((await send(owner.agent,'/api/business/members',{email:'approver@example.test',role:'APPROVER'})).status).toBe(201);
  expect((await send(owner.agent,'/api/business/members',{email:'buyerx@example.test',role:'BUYER'})).status).toBe(201);
  expect((await send(owner.agent,'/api/business/members',{email:'buyerx@example.test',role:'BUYER'})).status).toBe(409);
  if(threshold)await send(owner.agent,'/api/business/settings',{approvalThresholdPaise:threshold},'patch');
  const quoteFor=async(agent,price=200000)=>{const rfq=await send(agent,'/api/business/rfqs',{productId:'p1',quantity:10,notes:'Ten units for the office'});return (await send(s1.agent,`/api/seller/rfqs/${rfq.body.rfq.id}/quotes`,{pricePaise:price,terms:'Delivery in two weeks',validUntil:new Date(Date.now()+86400000).toISOString()})).body.quote;};
  return {owner,approver,buyer,s1,quoteFor};
 }
 it('enforces separation of duties and seller confirmation of approved POs only',async()=>{
  const {approver,buyer,s1,quoteFor}=await setup();
  const own=(await send(approver.agent,`/api/business/quotes/${(await quoteFor(approver.agent)).id}/accept`)).body.purchaseOrder;
  expect((await send(approver.agent,`/api/business/purchase-orders/${own.id}/approve`)).status).toBe(403);
  const po=(await send(buyer.agent,`/api/business/quotes/${(await quoteFor(buyer.agent)).id}/accept`)).body.purchaseOrder;
  expect((await send(buyer.agent,`/api/business/purchase-orders/${po.id}/approve`)).status).toBe(403);
  expect((await send(s1.agent,`/api/seller/purchase-orders/${po.id}/confirm`)).status).toBe(409);
  expect((await send(approver.agent,`/api/business/purchase-orders/${po.id}/approve`)).status).toBe(200);
  const confirmed=await send(s1.agent,`/api/seller/purchase-orders/${po.id}/confirm`);expect(confirmed.body.purchaseOrder.status).toBe('CONFIRMED_BY_SELLER');
  expect(confirmed.body.purchaseOrder.history.map(h=>h.status)).toEqual(['PENDING_APPROVAL','APPROVED','CONFIRMED_BY_SELLER']);
  expect((await send(approver.agent,`/api/business/purchase-orders/${own.id}/reject`,{reason:'Budget exhausted'})).body.purchaseOrder.status).toBe('REJECTED');
 });
 it('auto-approves within the organisation threshold and lets buyers decline quotes',async()=>{
  const {buyer,quoteFor}=await setup(2500000);
  expect((await send(buyer.agent,`/api/business/quotes/${(await quoteFor(buyer.agent,200000)).id}/accept`)).body.purchaseOrder.status).toBe('APPROVED');
  expect((await send(buyer.agent,`/api/business/quotes/${(await quoteFor(buyer.agent,300000)).id}/accept`)).body.purchaseOrder.status).toBe('PENDING_APPROVAL');
  const q=await quoteFor(buyer.agent);expect((await send(buyer.agent,`/api/business/quotes/${q.id}/reject`)).body.quote.status).toBe('REJECTED');
  expect((await send(buyer.agent,`/api/business/quotes/${q.id}/accept`)).status).toBe(409);
 });
});

describe('Accounts, support and search',()=>{
 it('changes passwords and signs out other sessions',async()=>{
  const a=await member('changer');const other=request.agent(app);await send(other,'/api/auth/login',{email:'changer@example.test',password:'Unique-password-123!',...customer()});
  expect((await send(a.agent,'/api/auth/password',{currentPassword:'wrong',newPassword:'Another-password-456!'})).status).toBe(401);
  expect((await send(a.agent,'/api/auth/password',{currentPassword:'Unique-password-123!',newPassword:'Another-password-456!'})).status).toBe(200);
  expect((await a.agent.get('/api/auth/me')).status).toBe(200);expect((await other.get('/api/auth/me')).status).toBe(401);
  expect((await send(request(app),'/api/auth/login',{email:'changer@example.test',password:'Another-password-456!'})).status).toBe(200);
 });
 it('keeps addresses and tickets private and limits the support queue to support staff',async()=>{
  const a=await member('alice'),b=await member('bob'),agent=await member('agent',{role:'SUPPORT'});
  const addr=(await send(a.agent,'/api/account/addresses',{...address,label:'Home'})).body.address;
  expect((await b.agent.get('/api/account/addresses')).body.addresses).toEqual([]);expect((await send(b.agent,`/api/account/addresses/${addr.id}`,{},'delete')).status).toBe(404);
  const t=(await send(a.agent,'/api/support/tickets',{subject:'Where is my order?',message:'I would like an update on my order.'})).body.ticket;
  expect((await send(b.agent,`/api/support/tickets/${t.id}/messages`,{message:'Not my ticket'})).status).toBe(404);
  expect((await b.agent.get('/api/support/queue')).status).toBe(403);
  expect((await send(agent.agent,`/api/support/queue/${t.id}/messages`,{message:'We are checking with the seller.'})).body.ticket.status).toBe('AWAITING_CUSTOMER');
  expect((await a.agent.get('/api/notifications')).body.notifications[0].title).toBe('Support replied');
 });
 it('tolerates single-character typos and suggests matches',async()=>{
  expect(searchScore('Aura wireless headphones','hedphones')).toBeGreaterThan(0);expect(searchScore('Aura wireless headphones','laptop')).toBe(0);
  expect((await request(app).get('/api/products?q=hedphones')).body.products[0].slug).toBe('aura-wireless-headphones');
  const s=(await request(app).get('/api/search/suggest?q=form')).body;expect(s.brands).toContain('FORM & FIELD');
 });
 it('validates seller wholesale tiers and keeps price-only edits live',async()=>{
  const s1=await member('sellerone',{sellerId:'s1'});
  expect((await send(s1.agent,'/api/seller/products/p1',{tiers:[{min:1,pricePaise:1000}]},'patch')).status).toBe(400);
  expect((await send(s1.agent,'/api/seller/products/p1',{tiers:[{min:5,pricePaise:999999}]},'patch')).status).toBe(400);
  const r=await send(s1.agent,'/api/seller/products/p1',{pricePaise:239900,tiers:[{min:5,pricePaise:220000}]},'patch');expect(r.body.product.status).toBe('APPROVED');
  expect((await send(s1.agent,'/api/seller/products/p1',{name:'Renamed headphones'},'patch')).body.product.status).toBe('PENDING');
 });
 it('bootstraps only the first configured admin and never in production',async()=>{
  app=createApp({store,config:{...config,bootstrapAdminEmail:'owner@example.test'}});
  expect((await member('owner')).user.role).toBe('ADMIN');
  app=createApp({store:new MemoryRepository(),config:{...config,production:true,bootstrapAdminEmail:'owner@example.test'}});
  const prod=request.agent(app);expect((await send(prod,'/api/auth/register',{name:'owner',email:'owner@example.test',password:'Unique-password-123!',...customer()})).body.user.role).toBe('CUSTOMER');
 });
 it('only records provider refunds with a refund reference and lets admins manage roles but not their own',async()=>{
  const admin=await member('admin',{role:'ADMIN'}),user=await member('person');
  await store.put('refunds',{id:'r1',orderId:'o',sellerId:'s1',amountPaise:100,status:'PENDING_PROVIDER',createdAt:new Date().toISOString()});
  expect((await send(admin.agent,'/api/admin/refunds/r1/record',{providerRef:'made-up'})).status).toBe(400);
  expect((await send(admin.agent,'/api/admin/refunds/r1/record',{providerRef:'rfnd_ABC12345'})).body.refund.status).toBe('PROCESSED');
  expect((await send(admin.agent,`/api/admin/users/${admin.user.id}/role`,{role:'CUSTOMER'},'patch')).status).toBe(409);
  expect((await send(admin.agent,`/api/admin/users/${user.user.id}/role`,{role:'SUPPORT'},'patch')).body.user.role).toBe('SUPPORT');
  expect((await send(user.agent,`/api/admin/users/${admin.user.id}/role`,{role:'CUSTOMER'},'patch')).status).toBe(403);
 });
});
