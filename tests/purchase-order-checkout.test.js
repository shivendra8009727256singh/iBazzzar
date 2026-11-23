import {beforeEach,it,expect} from 'vitest';
import request from 'supertest';
import {MemoryRepository} from '../apps/api/src/repository.js';
import {createApp} from '../apps/api/src/app.js';
import {customer} from './helpers.js';
const origin='http://localhost:3000';let store,app,buyer,user;
const address={name:'Business Buyer',line1:'12 Office Road',city:'Delhi',state:'Delhi',pincode:'110001',phone:'9876543210'};
async function register(name){const agent=request.agent(app);const r=await agent.post('/api/auth/register').set('Origin',origin).send({name,email:`${name}@example.test`,password:'Test-password-123!',...customer()});return {agent,user:r.body.user};}
const convert=(agent=buyer,body={address})=>agent.post('/api/business/purchase-orders/po-test/checkout').set('Origin',origin).send(body);
beforeEach(async()=>{
 store=new MemoryRepository();app=createApp({store,config:{origin,demo:true}});const member=await register('buyer');buyer=member.agent;user=member.user;
 await store.put('organizations',{id:'org-test',name:'Test Business',ownerId:user.id,status:'PENDING',createdAt:new Date().toISOString()});
 await store.update('users',user.id,{organizationId:'org-test',organizationRole:'OWNER'});
 await store.put('purchaseOrders',{id:'po-test',organizationId:'org-test',quoteId:'quote-test',sellerId:'s1',requestedBy:user.id,approvedBy:user.id,status:'CONFIRMED_BY_SELLER',totalPaise:1500000,snapshot:{productId:'p1',sellerId:'s1',quantity:10,pricePaise:150000,terms:'Negotiated test price'},history:[],createdAt:new Date().toISOString()});
});
it('creates a payable order at the approved quotation price, never client or current catalogue price',async()=>{const r=await convert(buyer,{address,totalPaise:1,quantity:1});expect(r.status).toBe(201);expect(r.body.order.totalPaise).toBe(1500000);expect(r.body.order.items[0]).toMatchObject({quantity:10,unitPaise:150000,sellerId:'s1'});expect(r.body.order.status).toBe('AWAITING_PAYMENT');expect((await store.get('products','p1')).stock).toBe(22);expect((await store.get('purchaseOrders','po-test')).status).toBe('ORDERED');const overview=await buyer.get('/api/business/overview');expect(overview.body.purchaseOrders[0].orderId).toBe(r.body.order.id);});
it('concurrent conversion creates only one order and reserves stock once',async()=>{const results=await Promise.all([convert(),convert()]);expect(results.map(r=>r.status)).toEqual([201,201]);expect(results[0].body.order.id).toBe(results[1].body.order.id);expect((await store.all('orders')).length).toBe(1);expect((await store.get('products','p1')).stock).toBe(22);});
it('rejects changed shipping details on retry',async()=>{await convert();expect((await convert(buyer,{address:{...address,city:'Mumbai'}})).status).toBe(409);});
it.each(['PENDING_APPROVAL','APPROVED','REJECTED'])('rejects PO state %s before seller confirmation',async status=>{await store.update('purchaseOrders','po-test',{status});expect((await convert()).status).toBe(409);expect((await store.all('orders')).length).toBe(0);});
it('rolls back stock and PO state when stock is insufficient',async()=>{await store.update('products','p1',{stock:9});expect((await convert()).status).toBe(409);expect((await store.get('products','p1')).stock).toBe(9);expect((await store.get('purchaseOrders','po-test')).status).toBe('CONFIRMED_BY_SELLER');expect((await store.all('keys')).length).toBe(0);});
it('denies foreign organization members and non-requesting buyers',async()=>{const other=await register('other');await store.update('users',other.user.id,{organizationId:'foreign',organizationRole:'OWNER'});expect((await convert(other.agent)).status).toBe(404);await store.update('users',other.user.id,{organizationId:'org-test',organizationRole:'BUYER'});expect((await convert(other.agent)).status).toBe(403);});
it('rejects suspended sellers, malformed addresses and tampered totals',async()=>{expect((await convert(buyer,{address:{...address,pincode:'1'}})).status).toBe(400);await store.update('sellers','s1',{status:'SUSPENDED'});expect((await convert()).status).toBe(409);await store.update('sellers','s1',{status:'APPROVED'});await store.update('purchaseOrders','po-test',{totalPaise:1});expect((await convert()).status).toBe(409);});
it('does not create another order after cancellation',async()=>{const r=await convert();await buyer.post(`/api/orders/${r.body.order.id}/cancel`).set('Origin',origin).send({});const retry=await convert();expect(retry.body.order.id).toBe(r.body.order.id);expect(retry.body.order.status).toBe('CANCELLED');expect((await store.all('orders')).length).toBe(1);});
