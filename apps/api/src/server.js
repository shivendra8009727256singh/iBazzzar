import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import { createApp } from './app.js';
import { MemoryRepository, PrismaRepository } from './repository.js';
loadEnv({path:fileURLToPath(new URL('../../../.env',import.meta.url)),quiet:true});
const logger=pino(),demo=(process.env.APP_MODE||'demo')==='demo',production=process.env.NODE_ENV==='production';
if(production&&demo)throw new Error('Production cannot use demo storage');
if(process.env.RAZORPAY_KEY_ID&&!process.env.RAZORPAY_KEY_ID.startsWith('rzp_test_'))throw new Error('Only Razorpay test mode is permitted');
let store,client;
if(demo){store=new MemoryRepository();logger.warn('DEMO MODE: ephemeral data; no real payments or fulfillment');}
else {if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');const {PrismaClient}=await import('@prisma/client');const {PrismaPg}=await import('@prisma/adapter-pg');client=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});await client.$connect();store=new PrismaRepository(client);}
const config={demo,production,logger,origin:process.env.WEB_ORIGIN||'http://127.0.0.1:3000',paymentKey:process.env.RAZORPAY_KEY_ID,paymentSecret:process.env.RAZORPAY_KEY_SECRET,paymentWebhookSecret:process.env.RAZORPAY_WEBHOOK_SECRET,bootstrapAdminEmail:process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase()};
const server=createApp({store,config}).listen(Number(process.env.PORT)||4000,'127.0.0.1',()=>logger.info({port:Number(process.env.PORT)||4000},'IBazzzar API ready'));
async function shutdown(){server.close(async()=>{await client?.$disconnect();process.exit(0);});}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
