// Grants ADMIN to an existing account in the configured IBazzzar database.
// Usage: node scripts/grant-admin.mjs person@example.com
import {config as loadEnv} from 'dotenv';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
loadEnv({quiet:true});
const email=process.argv[2]?.trim().toLowerCase();
if(!email){console.error('Usage: node scripts/grant-admin.mjs <email>');process.exit(1);}
if(!process.env.DATABASE_URL){console.error('DATABASE_URL is not set. Demo mode uses BOOTSTRAP_ADMIN_EMAIL instead.');process.exit(1);}
const prisma=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
try{
 const user=await prisma.user.findUnique({where:{email}});
 if(!user){console.error(`No account found for ${email}. Register first, then rerun.`);process.exitCode=1;}
 else{await prisma.$transaction([prisma.user.update({where:{id:user.id},data:{role:'ADMIN'}}),prisma.auditLog.create({data:{id:randomUUID(),actorId:'cli',action:'user.role-admin',resourceId:user.id,createdAt:new Date().toISOString()}})]);console.log(`${email} is now an administrator.`);}
}finally{await prisma.$disconnect();}
