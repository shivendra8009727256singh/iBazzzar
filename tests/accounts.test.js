import {describe,it,expect,beforeEach} from 'vitest';
import request from 'supertest';
import {MemoryRepository} from '../apps/api/src/repository.js';
import {createApp} from '../apps/api/src/app.js';
import {isValidGstin} from '../packages/shared/src/index.js';
import {customer,businessProfile,sellerProfile} from './helpers.js';
const origin='http://localhost:3000';let store,app,sent;
const mailer={configured:true,send:async m=>{sent.push(m);}};
beforeEach(()=>{sent=[];store=new MemoryRepository();app=createApp({store,config:{origin,demo:true,mailer}});});
const password='Correct-horse-battery-9';
const register=(body,agent=request.agent(app))=>agent.post('/api/auth/register').set('Origin',origin).send({name:'Asha Verma',email:'asha@example.test',password,...body});
const login=(pw=password,agent=request.agent(app))=>agent.post('/api/auth/login').set('Origin',origin).send({email:'asha@example.test',password:pw});
const GSTIN='27AAPFU0939F1ZV';

describe('Role-based registration',()=>{
 it('creates a customer with consent and contact details and never returns secrets',async()=>{
  const r=await register(customer({marketingOptIn:true}));expect(r.status).toBe(201);
  expect(r.body.user).toMatchObject({role:'CUSTOMER',marketingOptIn:true,emailVerifiedAt:null});expect(r.body.user.termsAcceptedAt).toBeTruthy();
  for(const secret of ['passwordHash','failedLogins','lockedUntil'])expect(r.body.user).not.toHaveProperty(secret);
  expect(r.body.verificationSent).toBe(true);
 });
 it('requires a mobile number, terms consent and a strong password',async()=>{
  expect((await register({accountType:'customer',acceptTerms:true})).status).toBe(400);
  expect((await register(customer({acceptTerms:false}))).status).toBe(400);
  expect((await register(customer({phone:'5123456789'}))).status).toBe(400);
  expect((await register(customer({password:'aaaaaaaaaaaa'}))).status).toBe(400);
  expect((await register(customer({password:'asha-secret-2024!'}))).status).toBe(400);
 });
 it('rejects duplicate email and mobile numbers',async()=>{
  const first=customer();await register(first);
  expect((await register(customer())).status).toBe(409);
  expect((await register({...first,email:'other@example.test'},request.agent(app)).then(r=>r.status))).toBe(409);
 });
 it('ignores role and status fields sent by the browser',async()=>{
  const r=await register(customer({role:'ADMIN',sellerId:'s1',organizationId:'org'}));
  expect(r.body.user.role).toBe('CUSTOMER');expect(r.body.user.sellerId).toBeUndefined();expect(r.body.user.organizationId).toBeUndefined();
 });
 it('creates a business buyer as organisation owner with a pending, GST-checked profile',async()=>{
  const agent=request.agent(app);
  const r=await register({...customer({accountType:'business'}),business:businessProfile({gstRegistered:true,gstin:GSTIN,tradeName:'Asha Office Supplies'})},agent);
  expect(r.status).toBe(201);expect(r.body.user.organizationRole).toBe('OWNER');
  const org=await store.get('organizations',r.body.user.organizationId);
  expect(org).toMatchObject({status:'PENDING',gstin:GSTIN,pan:'AAPFU0939F',tradeName:'Asha Office Supplies',ownerId:r.body.user.id});
  expect((await agent.get('/api/business/overview')).status).toBe(200);
 });
 it('validates GSTIN checksum, PAN match and GST consistency',async()=>{
  const biz=extra=>register({...customer({accountType:'business'}),business:businessProfile(extra)});
  expect((await biz({gstRegistered:true,gstin:'27AAPFU0939F1ZW'})).status).toBe(400);
  expect((await biz({gstRegistered:true})).status).toBe(400);
  expect((await biz({gstRegistered:false,gstin:GSTIN})).status).toBe(400);
  expect((await biz({gstRegistered:true,gstin:GSTIN,pan:'AAPPU0939F'})).status).toBe(400);
  expect((await biz({gstRegistered:false,pan:'AAPPU0939F'})).status).toBe(201);
  expect(isValidGstin('27aapfu0939f1zv')).toBe(true);
 });
 it('creates a seller application that stays locked until approval',async()=>{
  const agent=request.agent(app);
  const r=await register({...customer({accountType:'seller'}),seller:sellerProfile({storeName:'Asha Crafts'})},agent);
  expect(r.status).toBe(201);expect(r.body.user.sellerRole).toBe('OWNER');
  expect((await store.get('sellers',r.body.user.sellerId))).toMatchObject({name:'Asha Crafts',status:'PENDING',primaryCategory:'Home & Living'});
  expect((await agent.get('/api/seller/overview')).status).toBe(403);
 });
 it('is atomic: a rejected store leaves no half-created account',async()=>{
  await store.update('sellers','s1',{gstin:GSTIN});
  const r=await register({...customer({accountType:'seller'}),seller:sellerProfile({gstRegistered:true,gstin:GSTIN})});
  expect(r.status).toBe(409);expect((await store.all('users')).length).toBe(0);
 });
 it('keeps seller tax IDs, phone and pickup address out of public endpoints',async()=>{
  await store.update('sellers','s1',{gstin:GSTIN,pan:'AAPFU0939F',contactPhone:'9876543210',pickupAddress:{line1:'Secret warehouse'},legalName:'Legal Name'});
  const body=JSON.stringify((await request(app).get('/api/sellers')).body)+JSON.stringify((await request(app).get('/api/products/aura-wireless-headphones')).body);
  for(const leak of [GSTIN,'AAPFU0939F','9876543210','Secret warehouse','Legal Name','seed'])expect(body).not.toContain(leak);
 });
});

describe('Sign-in protection and email verification',()=>{
 it('locks an account for 15 minutes after five wrong passwords, then recovers',async()=>{
  await register(customer());
  for(let i=0;i<5;i++)expect((await login('Wrong-password-000')).status).toBe(401);
  const locked=await login();expect(locked.status).toBe(429);expect(locked.body.error).toMatch(/Too many failed attempts/);
  const user=(await store.all('users'))[0];await store.update('users',user.id,{lockedUntil:new Date(Date.now()-1000).toISOString()});
  expect((await login()).status).toBe(200);expect((await store.get('users',user.id)).lockedUntil).toBeNull();
  expect((await login('Wrong-password-000')).body.error).toBe('Email or password is incorrect');
 });
 it('gives unknown emails the same answer as wrong passwords',async()=>{
  await register(customer());
  const unknown=await request(app).post('/api/auth/login').set('Origin',origin).send({email:'nobody@example.test',password});
  expect(unknown.status).toBe(401);expect(unknown.body).toEqual((await login('Wrong-password-000')).body);
 });
 it('confirms email with a single-use token',async()=>{
  const agent=request.agent(app);await register(customer(),agent);
  const token=sent.find(m=>m.subject.includes('Confirm')).text.match(/token=([a-f0-9]{64})/)[1];
  expect((await request(app).post('/api/auth/verify-email').set('Origin',origin).send({token})).status).toBe(200);
  expect((await agent.get('/api/auth/me')).body.user.emailVerifiedAt).toBeTruthy();
  expect((await request(app).post('/api/auth/verify-email').set('Origin',origin).send({token})).status).toBe(400);
  expect((await agent.post('/api/auth/verify-email/resend').set('Origin',origin)).status).toBe(409);
 });
});

describe('Customer-facing error messages',()=>{
 // Zod's built-in wording ("Invalid option: expected one of …", "Too small: expected string …") must never reach a person.
 const developerWording=/Invalid option|Invalid input|expected (one of|string|number|boolean|object|array)|received undefined|Too (small|big)|>=|<=/;
 it('replaces default validation wording in every shared schema',async()=>{
  const schemas=await import('../packages/validation/src/index.js');
  const samples=[{},{name:1,email:'x',phone:'1',password:'a',items:'x',quantity:-1,status:'NOPE',code:'!',kind:'X',rating:9,pricePaise:-5,business:{},seller:{},address:{}},{accountType:'seller',seller:{businessType:'X',primaryCategory:'X',pickupAddress:{}}},{accountType:'business',business:{businessType:'',address:{state:''}}}];
  let checked=0;
  for(const [name,schema] of Object.entries(schemas)){if(typeof schema?.safeParse!=='function')continue;
   for(const sample of samples){const r=schema.safeParse(sample);if(r.success)continue;for(const issue of r.error.issues){checked++;expect(issue.message,`${name} ${issue.path.join('.')}`).not.toMatch(developerWording);}}}
  expect(checked).toBeGreaterThan(50);
 });
 it('returns one readable sentence and a field map, never field paths in the message',async()=>{
  const one=await register({...customer({accountType:'seller'}),seller:sellerProfile({businessType:'SOMETHING'})});
  expect(one.status).toBe(400);expect(one.body.error).toBe('Please choose your business type');expect(one.body.fields['seller.businessType']).toBe('Please choose your business type');
  const many=await register({accountType:'business',business:{}});
  expect(many.body.error).toMatch(/^Please check the \d+ highlighted fields\.$/);
  for(const text of [one.body.error,many.body.error,...Object.values(many.body.fields)])expect(text).not.toMatch(developerWording);
  expect(many.body.fields['business.address.pincode']??many.body.fields['business.address']).toBeTruthy();
 });
 it('explains unreadable request bodies in plain language',async()=>{
  const r=await request(app).post('/api/auth/login').set('Origin',origin).set('Content-Type','application/json').send('{"email":');
  expect(r.status).toBe(400);expect(r.body.error).toMatch(/couldn’t read that request/);
 });
});
