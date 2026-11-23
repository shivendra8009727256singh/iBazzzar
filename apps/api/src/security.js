import { randomBytes,scrypt as scryptCallback,timingSafeEqual,createHash,createHmac } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt=promisify(scryptCallback);
export const hash = value => createHash('sha256').update(value).digest('hex');
export async function hashPassword(password){const salt=randomBytes(16).toString('hex');const key=await scrypt(password,salt,64);return `${salt}:${key.toString('hex')}`;}
export async function verifyPassword(password,encoded){const [salt,key]=encoded.split(':');const actual=await scrypt(password,salt,64);const expected=Buffer.from(key,'hex');return actual.length===expected.length && timingSafeEqual(actual,expected);}
export const sessionToken=()=>randomBytes(32).toString('hex');
// Credentials and lockout counters never leave the server.
export const publicUser=({passwordHash:_passwordHash,failedLogins:_failed,lockedUntil:_locked,...user})=>user;
export function verifySignature(body,signature,secret){if(!secret||typeof signature!=='string'||!/^[a-f0-9]{64}$/i.test(signature))return false;const expected=createHmac('sha256',secret).update(body).digest();return timingSafeEqual(expected,Buffer.from(signature,'hex'));}
