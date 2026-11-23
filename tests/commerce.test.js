import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { priceLines } from '../packages/shared/src/index.js';
import { MemoryRepository } from '../apps/api/src/repository.js';
import { createApp } from '../apps/api/src/app.js';
import {customer} from './helpers.js';

const origin = 'http://localhost:3000';
let app, store;
beforeEach(() => { store = new MemoryRepository(); app = createApp({store, config:{origin, demo:true}}); });
async function member(email = 'buyer@example.test') {
 const agent = request.agent(app);
 const response = await agent.post('/api/auth/register').set('Origin',origin).send({name:'Test Buyer',email,password:'StrongPass123!',...customer()});
 expect(response.status).toBe(201);
 return {agent,user:response.body.user};
}
const checkout = {items:[{productId:'p1',quantity:1}],mode:'retail',address:{name:'Test Buyer',line1:'12 Sample Road',city:'Delhi',state:'Delhi',pincode:'110001',phone:'9876543210'}};
describe('Authoritative pricing',()=>{
 const products=[{id:'a',pricePaise:10000,stock:100,moq:5,tiers:[{min:10,pricePaise:8000}]}];
 it('calculates exact integer totals and applies wholesale tiers',()=>{expect(priceLines(products,[{productId:'a',quantity:10}],'business').totalPaise).toBe(80000);});
 it.each([0,-1,1.2,Infinity])('rejects invalid quantity %s',(quantity)=>{expect(()=>priceLines(products,[{productId:'a',quantity}],'retail')).toThrow();});
 it('enforces MOQ and stock',()=>{expect(()=>priceLines(products,[{productId:'a',quantity:2}],'business')).toThrow(/minimum/i);expect(()=>priceLines(products,[{productId:'a',quantity:101}],'retail')).toThrow(/stock/i);});
 it('aggregates duplicate product lines before validating stock',()=>{expect(()=>priceLines(products,[{productId:'a',quantity:60},{productId:'a',quantity:60}],'retail')).toThrow(/stock/i);});
 it('ignores supplied prices',()=>{expect(priceLines(products,[{productId:'a',quantity:1,pricePaise:1}],'retail').totalPaise).toBe(10000);});
});
describe('API trust boundaries',()=>{
 it('requires authentication and rejects cross-origin mutations',async()=>{expect((await request(app).post('/api/checkout').set('Origin',origin).send(checkout)).status).toBe(401);expect((await request(app).post('/api/auth/register').set('Origin','https://attacker.test').send({})).status).toBe(403);});
 it('does not allow self-assignment of admin roles',async()=>{const {agent}=await member();expect((await agent.get('/api/admin/overview')).status).toBe(403);});
 it('creates one order for repeated checkout requests',async()=>{const {agent}=await member();const a=await agent.post('/api/checkout').set('Origin',origin).set('Idempotency-Key','test-order-001').send(checkout);const b=await agent.post('/api/checkout').set('Origin',origin).set('Idempotency-Key','test-order-001').send(checkout);expect(a.status).toBe(201);expect(b.body.order.id).toBe(a.body.order.id);expect((await store.all('orders')).length).toBe(1);});
 it('rejects reuse of checkout key with changed payload',async()=>{const {agent}=await member();await agent.post('/api/checkout').set('Origin',origin).set('Idempotency-Key','test-order-001').send(checkout);const b=await agent.post('/api/checkout').set('Origin',origin).set('Idempotency-Key','test-order-001').send({...checkout,items:[{productId:'p1',quantity:2}]});expect(b.status).toBe(409);});
 it('prevents concurrent overselling',async()=>{await store.update('products','p1',{stock:1});const a=await member('a@example.test'),b=await member('b@example.test');const responses=await Promise.all([a,b].map(({agent},i)=>agent.post('/api/checkout').set('Origin',origin).set('Idempotency-Key',`concurrent-${i}`).send(checkout)));expect(responses.map(r=>r.status).sort()).toEqual([201,409]);expect((await store.get('products','p1')).stock).toBe(0);});
 it('isolates customer orders',async()=>{const a=await member('a@example.test'),b=await member('b@example.test');const order=await a.agent.post('/api/checkout').set('Origin',origin).set('Idempotency-Key','private-order').send(checkout);expect((await b.agent.get(`/api/orders/${order.body.order.id}`)).status).toBe(404);});
 it('invalid payment webhook cannot mark an order paid',async()=>{const r=await request(app).post('/api/payments/webhook').set('x-razorpay-signature','invalid').send({event:'payment.captured'});expect([400,503]).toContain(r.status);});
 it('invalidates session on logout',async()=>{const {agent}=await member();await agent.post('/api/auth/logout').set('Origin',origin);expect((await agent.get('/api/auth/me')).status).toBe(401);});
 it('requires approved sellers and rejects foreign inventory',async()=>{const {agent,user}=await member();await store.update('users',user.id,{role:'SELLER',sellerId:'s1'});expect((await agent.patch('/api/seller/products/p3').set('Origin',origin).send({stock:20})).status).toBe(404);});
 it('requires organization membership for RFQ',async()=>{const {agent}=await member();expect((await agent.post('/api/business/rfqs').set('Origin',origin).send({productId:'p1',quantity:10,notes:'Bulk headphones'})).status).toBe(403);});
});
