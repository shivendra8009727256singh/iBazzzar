import EmbeddedPostgres from 'embedded-postgres';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {createServer} from 'node:net';
import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {PrismaRepository} from '../apps/api/src/repository.js';
import {Marketplace} from '../apps/api/src/service.js';
import {demoProducts,demoSellers} from '../packages/shared/src/catalogue.js';
const require=createRequire(import.meta.url);
// Ask the OS for a free port so a leftover cluster from an interrupted run cannot block this one.
const port=await new Promise((done,fail)=>{const probe=createServer().once('error',fail).listen(0,'127.0.0.1',()=>{const {port}=probe.address();probe.close(()=>done(port));});});
const password=randomBytes(24).toString('hex'),folder=resolve('.local',`postgres-test-${randomUUID()}`);
await mkdir(folder,{recursive:true});
const pg=new EmbeddedPostgres({databaseDir:folder,user:'ibazzzar_test',password,port,persistent:true,authMethod:'scram-sha-256',initdbFlags:['--encoding=UTF8','--locale=C'],postgresFlags:['-h','127.0.0.1'],onLog:process.env.DB_TEST_VERBOSE?m=>console.log(String(m).trim()):()=>{},onError:m=>{if(String(m).includes('FATAL'))console.error(String(m));}});
let prisma;
try{
 console.log('Initializing isolated PostgreSQL cluster');await pg.initialise();await pg.start();await pg.createDatabase('ibazzzar_isolated_test');console.log('Isolated database ready');
 const url=`postgresql://ibazzzar_test:${password}@127.0.0.1:${port}/ibazzzar_isolated_test`;
 // Apply the checked-in migration history exactly as production would, then prove it matches schema.prisma.
 const prismaCli=(...args)=>spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),...args,'--config','apps/api/prisma.config.js'],{cwd:process.cwd(),encoding:'utf8',timeout:60000,windowsHide:true,env:{...process.env,DATABASE_URL:url}});
 const deploy=prismaCli('migrate','deploy');if(deploy.status!==0)throw new Error(deploy.stderr||deploy.stdout||'migrate deploy failed');
 const drift=prismaCli('migrate','diff','--from-config-datasource','--to-schema','apps/api/prisma/schema.prisma','--script','--exit-code');
 if(drift.status===2){await writeFile(resolve(folder,'missing-migration.sql'),drift.stdout);throw new Error(`schema.prisma has changes with no migration. Needed SQL:\n${drift.stdout}`);}
 if(drift.status!==0)throw new Error(drift.stderr||'Drift check failed');
 console.log('Checked-in migrations applied; no schema drift');
 prisma=new PrismaClient({adapter:new PrismaPg({connectionString:url})});const repo=new PrismaRepository(prisma),market=new Marketplace(repo);
 for(const s of demoSellers)await repo.put('sellers',s);for(const p of demoProducts)await repo.put('products',p);console.log('Demo fixtures seeded');
 const user={id:randomUUID(),email:'db-test@example.test',name:'Database Test',passwordHash:'unused-in-domain-test',role:'CUSTOMER',createdAt:new Date().toISOString()};await repo.put('users',user);await repo.update('products','p1',{stock:1});
 const input={mode:'retail',items:[{productId:'p1',quantity:1}],address:{name:'Test',line1:'12 Test Road',city:'Delhi',state:'Delhi',pincode:'110001',phone:'9876543210'}};
 const results=await Promise.allSettled([market.checkout(user,input,'db-race-001'),market.checkout(user,input,'db-race-002')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await repo.get('products','p1')).stock,0);assert.equal((await repo.all('orders')).length,1);
 const order=(await repo.all('orders'))[0];await market.cancel(user,order.id);await market.cancel(user,order.id);assert.equal((await repo.get('products','p1')).stock,1);
 await prisma.$disconnect();prisma=new PrismaClient({adapter:new PrismaPg({connectionString:url})});assert.equal((await prisma.order.findMany()).length,1);
 // Full lifecycle on PostgreSQL: coupon, payment, fulfilment, ledger, return and refund with NUMERIC money.
 const lifecycle=new Marketplace(new PrismaRepository(prisma)),repo2=new PrismaRepository(prisma);await repo2.update('products','p1',{stock:5});
 await repo2.put('coupons',{id:randomUUID(),code:'DBTEST',description:'Database test coupon',kind:'FLAT',value:10000,maxDiscountPaise:null,minOrderPaise:0,mode:'any',startsAt:new Date(Date.now()-1000).toISOString(),endsAt:new Date(Date.now()+86400000).toISOString(),usageLimit:5,used:0,active:true,public:false,createdAt:new Date().toISOString()});
 const paidOrder=await lifecycle.checkout(user,{...input,couponCode:'DBTEST'},'db-lifecycle-001');assert.equal(paidOrder.discountPaise,10000);assert.equal(typeof paidOrder.totalPaise,'number');
 await lifecycle.simulatePayment(user,paidOrder.id);const sellerUser={id:user.id,sellerId:'s1'};
 for(const status of ['PACKED','SHIPPED','DELIVERED'])await lifecycle.advanceFulfillment(sellerUser,paidOrder.id,{status,carrier:'Seller courier'});
 assert.equal((await repo2.get('orders',paidOrder.id)).status,'DELIVERED');
 const ret=await lifecycle.requestReturn(user,paidOrder.id,{reason:'Database lifecycle return'});await lifecycle.decideReturn(sellerUser,ret.id,{decision:'APPROVED'},{sellerId:'s1'});
 const [refund]=await repo2.all('refunds');assert.equal(refund.amountPaise,paidOrder.subtotalPaise-10000);
 assert.equal((await repo2.all('ledger')).reduce((s,e)=>s+e.amountPaise,0),0);
 // Media, variants, staff role and reset tokens persist with the expected shapes.
 const mediaId=`${randomUUID()}.webp`;await repo2.put('media',{id:mediaId,sellerId:'s1',url:`/api/media/${mediaId}`,width:800,height:800,bytes:1234,createdAt:new Date().toISOString()});
 await repo2.update('products','p1',{images:[`/api/media/${mediaId}`],variantGroup:'p1',variantLabel:'Standard'});const p1=await repo2.get('products','p1');assert.deepEqual(p1.images,[`/api/media/${mediaId}`]);assert.equal(p1.variantGroup,'p1');
 await repo2.update('users',user.id,{sellerId:'s1',sellerRole:'STAFF'});assert.equal((await repo2.get('users',user.id)).sellerRole,'STAFF');
 await repo2.put('resetTokens',{id:'a'.repeat(64),userId:user.id,expiresAt:new Date(Date.now()+60000).toISOString(),createdAt:new Date().toISOString()});await repo2.remove('resetTokens','a'.repeat(64));assert.equal(await repo2.get('resetTokens','a'.repeat(64)),null);
 const orgId=randomUUID(),rfqId=randomUUID(),quoteId=randomUUID(),at=new Date().toISOString();
 await repo2.put('organizations',{id:orgId,name:'Database Procurement',ownerId:user.id,status:'PENDING',createdAt:at});
 const businessUser=await repo2.update('users',user.id,{organizationId:orgId,organizationRole:'OWNER'});
 await repo2.put('rfqs',{id:rfqId,organizationId:orgId,userId:user.id,productId:'p1',sellerId:'s1',quantity:10,notes:'DB quote checkout',status:'QUOTED',createdAt:at});
 await repo2.put('quotes',{id:quoteId,rfqId,sellerId:'s1',pricePaise:150000,quantity:10,terms:'DB negotiated price',validUntil:new Date(Date.now()+86400000).toISOString(),revision:1,status:'OPEN',createdAt:at});
 const po=await lifecycle.acceptQuote(businessUser,quoteId);await lifecycle.decidePurchaseOrder(businessUser,po.id,'APPROVED');await lifecycle.confirmPurchaseOrder(sellerUser,po.id);await repo2.update('products','p1',{stock:20});
 const conversions=await Promise.all([lifecycle.checkoutPurchaseOrder(businessUser,po.id,{address:input.address}),lifecycle.checkoutPurchaseOrder(businessUser,po.id,{address:input.address})]);
 assert.equal(conversions[0].id,conversions[1].id);assert.equal(conversions[0].totalPaise,1500000);assert.equal((await repo2.get('products','p1')).stock,10);assert.equal((await repo2.get('purchaseOrders',po.id)).status,'ORDERED');
 // Registration fields: unique mobile, lockout counters, organisation and seller tax/address details.
 await repo2.update('users',user.id,{phone:'9123456780',failedLogins:3,lockedUntil:null,marketingOptIn:true,termsAcceptedAt:new Date().toISOString()});
 await assert.rejects(repo2.put('users',{id:randomUUID(),email:'dup-phone@example.test',name:'Dup',passwordHash:'x',role:'CUSTOMER',phone:'9123456780',createdAt:new Date().toISOString()}),'phone must be unique');
 await repo2.update('sellers','s2',{legalName:'Objects & Spaces LLP',businessType:'LLP',gstRegistered:true,gstin:'27AAPFU0939F1ZV',pan:'AAPFU0939F',pickupAddress:{line1:'12 MG Road',city:'Pune',state:'Maharashtra',pincode:'411001'},primaryCategory:'Home & Living'});
 assert.equal((await repo2.get('sellers','s2')).pickupAddress.city,'Pune');
 await repo2.put('verifyTokens',{id:'b'.repeat(64),userId:user.id,expiresAt:new Date(Date.now()+60000).toISOString(),createdAt:new Date().toISOString()});assert.ok(await repo2.get('verifyTokens','b'.repeat(64)));
 // Admin console fields: suspension, featured listings, managed categories and payout references.
 await repo2.update('users',user.id,{status:'SUSPENDED'});assert.equal((await repo2.get('users',user.id)).status,'SUSPENDED');
 await repo2.update('products','p1',{featured:true});assert.equal((await repo2.get('products','p1')).featured,true);
 await repo2.put('categories',{id:'books',name:'Books',slug:'books',description:null,active:true,sortOrder:12,createdAt:new Date().toISOString()});
 await assert.rejects(repo2.put('categories',{id:'books-2',name:'Books',slug:'books-2',description:null,active:true,sortOrder:13,createdAt:new Date().toISOString()}),'category names must be unique');
 await repo2.put('ledger',{id:randomUUID(),sellerId:'s1',orderId:'payout',kind:'PAYOUT',amountPaise:-100,status:'PAID_OUT',providerRef:'pout_DBTEST1234',demo:false,createdAt:new Date().toISOString()});
 assert.equal((await repo2.all('ledger')).find(e=>e.kind==='PAYOUT').providerRef,'pout_DBTEST1234');
 console.log('PASS: isolated PostgreSQL persistence, commerce lifecycle, media, staff, reset tokens and concurrent negotiated PO checkout, migration history with no drift, registration fields, admin console fields.');
 await writeFile('.local/database-test-result.json',JSON.stringify({passed:true,checks:14,at:new Date().toISOString(),database:'isolated disposable test cluster'},null,2));
} finally {await prisma?.$disconnect();await pg.stop().catch(()=>{});}
