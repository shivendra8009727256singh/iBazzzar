import {describe,it,expect,beforeEach} from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MemoryRepository} from '../apps/api/src/repository.js';
import {createApp} from '../apps/api/src/app.js';
import {customer,sellerProfile} from './helpers.js';
const origin='http://localhost:3000';let store,app;
beforeEach(()=>{store=new MemoryRepository();app=createApp({store,config:{origin,demo:true,mediaDir:join(tmpdir(),'ibazzzar-admin-media')}});});
const password='Unique-password-123!';
async function person(name,patch={},email=`${name}@example.test`){const agent=request.agent(app);const r=await agent.post('/api/auth/register').set('Origin',origin).send({name,email,password,...customer()});expect(r.status).toBe(201);if(Object.keys(patch).length)await store.update('users',r.body.user.id,patch);return {agent,user:{...r.body.user,...patch}};}
const send=(agent,path,body={},method='post')=>agent[method](path).set('Origin',origin).send(body);
const address={name:'Test Buyer',line1:'12 Demo Road',city:'Delhi',state:'Delhi',pincode:'110001',phone:'9876543210'};
let key=0;const checkout=agent=>send(agent,'/api/checkout',{items:[{productId:'p1',quantity:1}],mode:'retail',address}).set('Idempotency-Key',`admin-test-${++key}`);
async function deliver(existing){const buyer=existing??await person('buyer'),s1=await person('sellerone',{sellerId:'s1'});const order=(await checkout(buyer.agent)).body.order;await send(buyer.agent,`/api/orders/${order.id}/demo-payment`);for(const status of ['PACKED','SHIPPED','DELIVERED'])await send(s1.agent,`/api/seller/orders/${order.id}/fulfillment`,{status,carrier:'Seller courier'});return {buyer,s1,order};}

describe('Staff roles and permissions',()=>{
 it('gives each staff role only its own sections',async()=>{
  const ops=await person('ops',{role:'OPERATIONS'}),fin=await person('fin',{role:'FINANCE'}),sup=await person('sup',{role:'SUPPORT'}),shopper=await person('shopper');
  expect((await fin.agent.get('/api/admin/finance')).status).toBe(200);
  expect((await ops.agent.get('/api/admin/finance')).status).toBe(403);
  expect((await send(fin.agent,'/api/admin/sellers/s1/status',{status:'SUSPENDED'},'patch')).status).toBe(403);
  expect((await send(ops.agent,'/api/admin/sellers/s1/status',{status:'APPROVED'},'patch')).status).toBe(200);
  expect((await sup.agent.get('/api/admin/users')).status).toBe(200);
  expect((await send(sup.agent,`/api/admin/users/${shopper.user.id}/status`,{status:'SUSPENDED',reason:'Testing'},'patch')).status).toBe(403);
  expect((await sup.agent.get('/api/admin/settings')).status).toBe(403);
  for(const path of ['/api/admin/dashboard','/api/admin/users','/api/admin/orders','/api/admin/audit'])expect((await shopper.agent.get(path)).status).toBe(403);
  const denied=await ops.agent.get('/api/admin/finance');expect(denied.body.error).toMatch(/staff role does not include this action/);
 });
 it('hides money from roles without finance access on the dashboard',async()=>{
  await deliver();const ops=await person('ops',{role:'OPERATIONS'}),fin=await person('fin',{role:'FINANCE'});
  const o=(await ops.agent.get('/api/admin/dashboard')).body,f=(await fin.agent.get('/api/admin/dashboard')).body;
  expect(o.metrics.paidGmvPaise).toBeNull();expect(o.series[29].paidGmvPaise).toBeNull();expect(f.metrics.demoGmvPaise).toBe(249900);expect(f.metrics.orders).toBe(1);expect(o.series.at(-1).orders).toBe(1);
 });
 it('lets only a Super Admin grant staff roles, including the new manager roles',async()=>{
  const admin=await person('admin',{role:'ADMIN'}),ops=await person('ops',{role:'OPERATIONS'}),target=await person('target');
  expect((await send(ops.agent,`/api/admin/users/${target.user.id}/role`,{role:'FINANCE'},'patch')).status).toBe(403);
  expect((await send(admin.agent,`/api/admin/users/${target.user.id}/role`,{role:'FINANCE'},'patch')).body.user.role).toBe('FINANCE');
  expect((await send(admin.agent,`/api/admin/users/${target.user.id}/role`,{role:'OWNER'},'patch')).body.error).toBe('Please choose a valid role');
 });
});

describe('Account management',()=>{
 it('suspends an account everywhere and restores it',async()=>{
  const admin=await person('admin',{role:'ADMIN'}),target=await person('target');
  expect((await send(admin.agent,`/api/admin/users/${target.user.id}/status`,{status:'SUSPENDED',reason:'Chargeback investigation'},'patch')).status).toBe(200);
  expect((await target.agent.get('/api/auth/me')).status).toBe(401);
  const login=await send(request(app),'/api/auth/login',{email:'target@example.test',password});expect(login.status).toBe(403);expect(login.body.error).toMatch(/suspended/);
  expect((await send(admin.agent,`/api/admin/users/${admin.user.id}/status`,{status:'SUSPENDED',reason:'Self test'},'patch')).status).toBe(409);
  await send(admin.agent,`/api/admin/users/${target.user.id}/status`,{status:'ACTIVE',reason:'Investigation closed'},'patch');
  expect((await send(request(app),'/api/auth/login',{email:'target@example.test',password})).status).toBe(200);
  expect((await store.all('audit')).some(a=>a.action.startsWith('user.suspended: Chargeback'))).toBe(true);
 });
 it('stops operations staff from suspending other staff',async()=>{
  await person('admin',{role:'ADMIN'});const ops=await person('ops',{role:'OPERATIONS'}),fin=await person('fin',{role:'FINANCE'});
  await store.update('users',ops.user.id,{role:'OPERATIONS'});const opsCaps=await ops.agent.get('/api/admin/me');expect(opsCaps.body.label).toBe('Operations manager');
  expect((await send(ops.agent,`/api/admin/users/${fin.user.id}/status`,{status:'SUSPENDED',reason:'No permission'},'patch')).status).toBe(403);
 });
 it('unlocks a locked account',async()=>{
  const admin=await person('admin',{role:'ADMIN'}),target=await person('target');await store.update('users',target.user.id,{lockedUntil:new Date(Date.now()+600000).toISOString(),failedLogins:0});
  expect((await admin.agent.get('/api/admin/users?q=target')).body.users[0].locked).toBe(true);
  await send(admin.agent,`/api/admin/users/${target.user.id}/unlock`);expect((await send(request(app),'/api/auth/login',{email:'target@example.test',password})).status).toBe(200);
 });
});

describe('Catalogue control',()=>{
 it('manages categories: add, rename everywhere and hide from new listings',async()=>{
  const ops=await person('ops',{role:'OPERATIONS'});
  const created=await send(ops.agent,'/api/admin/categories',{name:'Books',description:'Printed and digital books'});expect(created.status).toBe(201);
  expect((await request(app).get('/api/categories')).body.categories).toContain('Books');
  expect((await send(ops.agent,'/api/admin/categories',{name:'books'})).status).toBe(409);
  const office=(await ops.agent.get('/api/admin/categories')).body.categories.find(c=>c.name==='Office');expect(office.products).toBe(1);
  await send(ops.agent,`/api/admin/categories/${office.id}`,{name:'Office Supplies'},'patch');
  expect((await store.get('products','p10')).category).toBe('Office Supplies');
  await send(ops.agent,`/api/admin/categories/${created.body.category.id}`,{active:false},'patch');
  expect((await request(app).get('/api/categories')).body.categories).not.toContain('Books');
  const seller=await send(request.agent(app),'/api/auth/register',{name:'Book Seller',email:'books@example.test',password,...customer({accountType:'seller'}),seller:sellerProfile({primaryCategory:'Books'})});
  expect(seller.status).toBe(400);expect(seller.body.error).toBe('Please choose one of the current categories');
 });
 it('features only live products and lists low stock',async()=>{
  const ops=await person('ops',{role:'OPERATIONS'});await store.update('products','p2',{status:'PENDING'});await store.update('products','p1',{stock:3});
  expect((await send(ops.agent,'/api/admin/products/p2',{featured:true},'patch')).status).toBe(409);
  expect((await send(ops.agent,'/api/admin/products/p1',{featured:true},'patch')).body.product.featured).toBe(true);
  expect((await ops.agent.get('/api/admin/products?stock=low')).body.products.map(p=>p.id)).toContain('p1');
 });
 it('removes a seller photo from listings and sends them back for review',async()=>{
  const s1=await person('sellerone',{sellerId:'s1'}),ops=await person('ops',{role:'OPERATIONS'});
  const up=await s1.agent.post('/api/seller/media').set('Origin',origin).set('Content-Type','image/png').send(await sharp({create:{width:400,height:400,channels:3,background:'#092C20'}}).png().toBuffer());
  await send(s1.agent,'/api/seller/products/p1',{images:[up.body.media.url]},'patch');await store.update('products','p1',{status:'APPROVED'});
  expect((await ops.agent.get('/api/admin/media')).body.media[0].usedBy[0].id).toBe('p1');
  expect((await send(ops.agent,`/api/admin/media/${up.body.media.id}`,{reason:'Watermarked stock photo'},'delete')).status).toBe(200);
  const p1=await store.get('products','p1');expect(p1.images).toEqual([]);expect(p1.status).toBe('PENDING');expect((await request(app).get(up.body.media.url)).status).toBe(404);
 });
});

describe('Orders, finance and platform settings',()=>{
 it('lets operations cancel unpaid orders only, releasing stock',async()=>{
  const buyer=await person('buyer'),ops=await person('ops',{role:'OPERATIONS'});const before=(await store.get('products','p1')).stock;
  const order=(await checkout(buyer.agent)).body.order;
  expect((await send(ops.agent,`/api/admin/orders/${order.id}/cancel`,{reason:'Customer asked by phone'})).body.order.status).toBe('CANCELLED');
  expect((await store.get('products','p1')).stock).toBe(before);
  const {order:paid}=await deliver(buyer);expect((await send(ops.agent,`/api/admin/orders/${paid.id}/cancel`,{reason:'Too late now'})).status).toBe(409);
  expect((await ops.agent.get(`/api/admin/orders/${paid.id}`)).body.customer.email).toBe('buyer@example.test');
 });
 it('records payouts only with a provider reference and never above the payable balance',async()=>{
  const fin=await person('fin',{role:'FINANCE'});await store.put('ledger',{id:'sale',sellerId:'s1',orderId:'o1',kind:'SALE',amountPaise:100000,status:'PENDING_SETTLEMENT',demo:false,createdAt:new Date().toISOString()});
  expect((await send(fin.agent,'/api/admin/payouts',{sellerId:'s1',amountPaise:50000,providerRef:'paid-by-cash'})).body.error).toMatch(/payout ID|UTR/);
  expect((await send(fin.agent,'/api/admin/payouts',{sellerId:'s1',amountPaise:200000,providerRef:'pout_ABC123456'})).status).toBe(409);
  expect((await send(fin.agent,'/api/admin/payouts',{sellerId:'s1',amountPaise:60000,providerRef:'pout_ABC123456'})).status).toBe(201);
  expect((await send(fin.agent,'/api/admin/payouts',{sellerId:'s1',amountPaise:10000,providerRef:'pout_ABC123456'})).status).toBe(409);
  expect((await fin.agent.get('/api/admin/finance')).body.balances.find(b=>b.sellerId==='s1')).toMatchObject({payablePaise:40000,paidOutPaise:60000});
 });
 it('exports CSV reports safely and only to roles that may see them',async()=>{
  const admin=await person('admin',{role:'ADMIN'}),ops=await person('ops',{role:'OPERATIONS'});await person('=HYPERLINK("http://evil")',{},'formula@example.test');
  const users=await admin.agent.get('/api/admin/reports/users');expect(users.headers['content-type']).toMatch(/text\/csv/);expect(users.text).toContain(`"'=HYPERLINK(""http://evil"")"`);
  expect((await ops.agent.get('/api/admin/reports/ledger')).status).toBe(403);expect((await ops.agent.get('/api/admin/reports/orders')).status).toBe(200);
 });
 it('applies platform settings, including the return window',async()=>{
  const admin=await person('admin',{role:'ADMIN'});
  expect((await send(admin.agent,'/api/admin/settings',{commissionRateBps:6000},'put')).body.error).toBe('Commission cannot be more than 50%');
  expect((await send(admin.agent,'/api/admin/settings',{returnWindowDays:0,commissionRateBps:1200},'put')).body.settings).toMatchObject({returnWindowDays:0,commissionRateBps:1200});
  const {buyer,order}=await deliver();const r=await send(buyer.agent,`/api/orders/${order.id}/returns`,{reason:'Changed my mind about it'});
  expect(r.status).toBe(409);expect(r.body.error).toMatch(/0-day return window/);
 });
 it('broadcasts in-app notifications to an audience',async()=>{
  const ops=await person('ops',{role:'OPERATIONS'});await person('alpha');await person('bravo');await person('sellerx',{sellerId:'s1'});
  expect((await send(ops.agent,'/api/admin/notifications',{audience:'SELLERS',title:'Festive sale',body:'Update your stock before Diwali.',link:'/seller'})).body.sent).toBe(1);
  expect((await send(ops.agent,'/api/admin/notifications',{audience:'ALL',title:'Hi',body:'Hello everyone',link:'https://evil.test'})).status).toBe(400);
 });
});
