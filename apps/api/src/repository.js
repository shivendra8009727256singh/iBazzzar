import { demoProducts, demoSellers } from '../../../packages/shared/src/catalogue.js';
export const tables = {users:'user',sessions:'session',products:'product',sellers:'seller',organizations:'organization',orders:'order',keys:'idempotencyKey',rfqs:'rfq',quotes:'quotation',purchaseOrders:'purchaseOrder',returns:'returnRequest',audit:'auditLog',subscriptions:'subscription',cms:'cmsSection',paymentEvents:'paymentEvent',paymentIntents:'paymentIntent',coupons:'coupon',reviews:'review',refunds:'refund',ledger:'ledgerEntry',addresses:'address',tickets:'supportTicket',notifications:'notification',settings:'setting',media:'mediaAsset',resetTokens:'passwordResetToken',verifyTokens:'emailVerificationToken',categories:'category'};
export class MemoryRepository {
 constructor({seed=true}={}) { this.data=Object.fromEntries(Object.keys(tables).map(t=>[t,new Map()])); this.queue=Promise.resolve(); if(seed){for(const p of demoProducts)this.data.products.set(p.id,structuredClone(p));for(const s of demoSellers)this.data.sellers.set(s.id,structuredClone(s));} }
 async all(table) { return structuredClone([...this.data[table].values()]); }
 async get(table,id) { return structuredClone(this.data[table].get(id) ?? null); }
 async put(table,value) { this.data[table].set(value.id,structuredClone(value));return structuredClone(value); }
 async update(table,id,patch) { const old=await this.get(table,id);if(!old)throw new Error('Record not found');return this.put(table,{...old,...patch,id}); }
 async remove(table,id) { this.data[table].delete(id); }
 async transaction(fn) {
  const previous=this.queue; let release; this.queue=new Promise(resolve=>{release=resolve;}); await previous;
  const before=structuredClone(this.data);
  try { return await fn(this); } catch(error) { this.data=before; throw error; } finally {release();}
 }
}
const serializable = value => JSON.parse(JSON.stringify(value,(_key,v)=>v));
// Prisma returns NUMERIC money as Decimal; the domain works in integer paise.
function normalize(value) { if(!value)return value;const v=serializable(value);for(const key of Object.keys(v))if(key.endsWith('Paise')&&v[key]!=null)v[key]=Number(v[key]);return v; }
export class PrismaRepository {
 constructor(client,inside=false) {this.client=client;this.inside=inside;}
 async all(table){return (await this.client[tables[table]].findMany()).map(normalize);}
 async get(table,id){return normalize(await this.client[tables[table]].findUnique({where:{id}}));}
 async put(table,value){return normalize(await this.client[tables[table]].upsert({where:{id:value.id},create:value,update:value}));}
 async update(table,id,data){return normalize(await this.client[tables[table]].update({where:{id},data}));}
 async remove(table,id){await this.client[tables[table]].deleteMany({where:{id}});}
 async transaction(fn){
  if(this.inside)return fn(this);
  // One database-wide transaction lock keeps all domain read/check/write sequences atomic.
  // Replace with per-resource locks after profiling; never weaken correctness for throughput.
  return this.client.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(73482219)`;return fn(new PrismaRepository(tx,true));},{timeout:15000});
 }
}
