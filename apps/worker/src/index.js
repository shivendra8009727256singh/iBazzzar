import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import pino from 'pino';
import { PrismaRepository } from '../../api/src/repository.js';
import { Marketplace, platformSettings } from '../../api/src/service.js';
loadEnv({path:fileURLToPath(new URL('../../../.env',import.meta.url)),quiet:true});
const logger=pino({name:'ibazzzar-worker'});
// Demo mode keeps data inside the API process, so a separate worker would see nothing. Refuse rather than pretend.
if((process.env.APP_MODE||'demo')==='demo'){logger.error('Worker requires APP_MODE=database with a dedicated PostgreSQL database');process.exit(1);}
if(!process.env.DATABASE_URL||!process.env.REDIS_URL){logger.error('DATABASE_URL and REDIS_URL are required');process.exit(1);}
const paymentWindowMs=(Number(process.env.PAYMENT_WINDOW_MINUTES)||30)*60_000;
const {PrismaClient}=await import('@prisma/client');const {PrismaPg}=await import('@prisma/adapter-pg');
const prisma=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
const repository=new PrismaRepository(prisma),market=new Marketplace(repository);
const connection=new IORedis(process.env.REDIS_URL,{maxRetriesPerRequest:null});
const queue=new Queue('maintenance',{connection});
await queue.upsertJobScheduler('expire-unpaid-orders',{every:5*60_000},{name:'expire-unpaid-orders'});
// The payment window is a platform setting admins can change; PAYMENT_WINDOW_MINUTES is only the fallback.
const jobs={'expire-unpaid-orders':async()=>{const minutes=(await platformSettings(repository)).paymentWindowMinutes||paymentWindowMs/60_000;return {expired:await market.expireUnpaid(minutes*60_000),minutes};}};
const worker=new Worker('maintenance',async job=>{const run=jobs[job.name];if(!run)throw new Error(`Unknown job ${job.name}`);return run();},{connection,concurrency:1});
worker.on('completed',(job,result)=>logger.info({job:job.name,result},'Job completed'));
worker.on('failed',(job,error)=>logger.error({job:job?.name,err:error},'Job failed'));
logger.info({paymentWindowMinutes:paymentWindowMs/60_000},'IBazzzar worker ready');
async function shutdown(){await worker.close();await queue.close();await connection.quit();await prisma.$disconnect();process.exit(0);}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
