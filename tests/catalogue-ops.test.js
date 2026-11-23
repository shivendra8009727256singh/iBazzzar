import {describe,it,expect,beforeEach} from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MemoryRepository} from '../apps/api/src/repository.js';
import {createApp} from '../apps/api/src/app.js';
import {customer,sellerProfile} from './helpers.js';
const origin='http://localhost:3000';let store,app,sent;
const mailer={configured:true,send:async m=>{sent.push(m);}};
beforeEach(()=>{sent=[];store=new MemoryRepository();app=createApp({store,config:{origin,demo:true,mailer,mediaDir:join(tmpdir(),'ibazzzar-test-media')}});});
async function member(name,patch={}){const agent=request.agent(app);const r=await agent.post('/api/auth/register').set('Origin',origin).send({name,email:`${name}@example.test`,password:'Unique-password-123!',...customer()});expect(r.status).toBe(201);if(Object.keys(patch).length)await store.update('users',r.body.user.id,patch);return {agent,user:{...r.body.user,...patch}};}
const send=(agent,path,body={},method='post')=>agent[method](path).set('Origin',origin).send(body);
const png=(size=400)=>sharp({create:{width:size,height:size,channels:3,background:'#092C20'}}).png().toBuffer();
const upload=async(agent,buffer,type='image/png')=>agent.post('/api/seller/media').set('Origin',origin).set('Content-Type',type).send(buffer);
const product={name:'Emerald desk organiser',brand:'FORM & FIELD',category:'Office',description:'A tidy organiser for your desk.',pricePaise:99900,stock:20,moq:5,tiers:[{min:5,pricePaise:89900}]};

describe('Seller catalogue operations',()=>{
 it('keeps wholesale tiers when only stock or price changes',async()=>{
  const s1=await member('sellerone',{sellerId:'s1'});const before=(await store.get('products','p1')).tiers;
  await send(s1.agent,'/api/seller/products/p1',{stock:7},'patch');
  expect((await store.get('products','p1')).tiers).toEqual(before);
 });
 it('accepts only real images, re-encodes them and restricts their use to the uploading store',async()=>{
  const s1=await member('sellerone',{sellerId:'s1'}),s2=await member('sellertwo',{sellerId:'s2'}),buyer=await member('buyer');
  expect((await upload(buyer.agent,await png())).status).toBe(403);
  expect((await upload(s1.agent,Buffer.from('<svg onload=alert(1)>'.padEnd(500,' ')))).status).toBe(415);
  expect((await upload(s1.agent,await png(100))).status).toBe(400);
  const ok=await upload(s1.agent,await png());expect(ok.status).toBe(201);const url=ok.body.media.url;expect(url).toMatch(/^\/api\/media\/[0-9a-f-]{36}\.webp$/);
  const served=await request(app).get(url);expect(served.status).toBe(200);expect(served.headers['content-type']).toBe('image/webp');
  expect((await request(app).get('/api/media/..%2F..%2Fpackage.json')).status).toBe(404);
  expect((await send(s2.agent,'/api/seller/products',{...product,images:[url]})).status).toBe(403);
  const created=await send(s1.agent,'/api/seller/products',{...product,images:[url]});expect(created.status).toBe(201);expect(created.body.product.image).toBe(url);
 });
 it('groups variants as separate SKUs within one store',async()=>{
  const s1=await member('sellerone',{sellerId:'s1'}),admin=await member('admin',{role:'ADMIN'});
  expect((await send(s1.agent,'/api/seller/products',{...product,variantOf:'p3',variantLabel:'Sand'})).status).toBe(404);
  expect((await send(s1.agent,'/api/seller/products',{...product,variantOf:'p1'})).status).toBe(400);
  const v=await send(s1.agent,'/api/seller/products',{...product,name:'Aura wireless headphones — Sand',variantOf:'p1',variantLabel:'Sand'});expect(v.status).toBe(201);
  expect((await store.get('products','p1')).variantGroup).toBe('p1');
  let detail=await request(app).get('/api/products/aura-wireless-headphones');expect(detail.body.variants.map(x=>x.variantLabel)).toEqual(['Standard']);
  await send(admin.agent,`/api/admin/products/${v.body.product.id}/status`,{status:'APPROVED'},'patch');
  detail=await request(app).get('/api/products/aura-wireless-headphones');expect(detail.body.variants.map(x=>x.variantLabel).sort()).toEqual(['Sand','Standard']);
 });
 it('lets owners add staff who can operate but not see settlements or manage the team',async()=>{
  const owner=await member('owner'),staff=await member('staff');
  await send(owner.agent,'/api/seller/register',sellerProfile({storeName:'Owner Store'}));
  const sid=(await store.get('users',owner.user.id)).sellerId;await store.update('sellers',sid,{status:'APPROVED'});
  expect((await send(owner.agent,'/api/seller/staff',{email:'staff@example.test'})).status).toBe(201);
  const view=(await staff.agent.get('/api/seller/overview')).body;expect(view.sellerRole).toBe('STAFF');expect(view.ledger).toEqual([]);expect(view.staff).toEqual([]);
  expect((await send(staff.agent,'/api/seller/staff',{email:'owner@example.test'})).status).toBe(403);
  expect((await send(staff.agent,'/api/seller/products',product)).status).toBe(201);
  expect((await owner.agent.get('/api/seller/overview')).body.staff).toHaveLength(2);
 });
});

describe('Password reset',()=>{
 it('does not reveal accounts, expires single-use tokens and signs out every session',async()=>{
  const a=await member('alice');
  const unknown=await send(request(app),'/api/auth/password-reset/request',{email:'nobody@example.test'});
  const known=await send(request(app),'/api/auth/password-reset/request',{email:'alice@example.test'});
  const resets=sent.filter(m=>m.subject.includes('Reset'));expect(unknown.body).toEqual(known.body);expect(resets).toHaveLength(1);
  const token=resets[0].text.match(/token=([a-f0-9]{64})/)[1];
  expect((await send(request(app),'/api/auth/password-reset/confirm',{token,newPassword:'Brand-new-password-1'})).status).toBe(200);
  expect((await a.agent.get('/api/auth/me')).status).toBe(401);
  expect((await send(request(app),'/api/auth/password-reset/confirm',{token,newPassword:'Another-password-22'})).status).toBe(400);
  expect((await send(request(app),'/api/auth/login',{email:'alice@example.test',password:'Brand-new-password-1'})).status).toBe(200);
 });
 it('refuses in production when no email provider is configured',async()=>{
  app=createApp({store,config:{origin,production:true}});
  expect((await send(request(app),'/api/auth/password-reset/request',{email:'x@example.test'})).status).toBe(503);
 });
});
