import { randomUUID, randomBytes } from 'node:crypto';
import { DomainError, panFromGstin } from '../../../packages/shared/src/index.js';
import { hash } from './security.js';
import { audit, now } from './service.js';
import { assertActiveCategory } from './admin.js';

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
const taxFields = profile => ({businessType:profile.businessType,gstRegistered:profile.gstRegistered,gstin:profile.gstin??null,pan:profile.pan??(profile.gstin?panFromGstin(profile.gstin):null)});
// Only marketing-safe store details leave the API. Tax IDs, legal name, phone and pickup address stay with the owner and admins.
export const publicSeller = s => ({id:s.id,name:s.name,description:s.description,status:s.status,primaryCategory:s.primaryCategory??null,createdAt:s.createdAt});

async function assertUniqueGstin(tx, table, gstin) {
  if (gstin && (await tx.all(table)).some(x => x.gstin === gstin)) throw new DomainError('This GSTIN is already registered. Ask the account owner to add you to their team.', 409);
}
// Registration records are applications: status stays PENDING until an admin reviews the documents.
export async function createOrganization(tx, user, profile) {
  if (user.organizationId) throw new DomainError('Business account already exists', 409);
  await assertUniqueGstin(tx, 'organizations', profile.gstin);
  const o = await tx.put('organizations', {id:randomUUID(),name:profile.legalName,tradeName:profile.tradeName||null,...taxFields(profile),contactPhone:profile.contactPhone,address:profile.address,ownerId:user.id,status:'PENDING',createdAt:now()});
  await tx.update('users', user.id, {organizationId:o.id,organizationRole:'OWNER'});
  await audit(tx, user.id, 'organization.created', o.id);
  return o;
}
export async function createSeller(tx, user, profile) {
  if (user.sellerId) throw new DomainError('Seller application already exists', 409);
  await assertUniqueGstin(tx, 'sellers', profile.gstin);
  await assertActiveCategory(tx, profile.primaryCategory);
  const s = await tx.put('sellers', {id:randomUUID(),name:profile.storeName,description:profile.description,legalName:profile.legalName,...taxFields(profile),contactPhone:profile.contactPhone,pickupAddress:profile.pickupAddress,primaryCategory:profile.primaryCategory,termsAcceptedAt:now(),ownerId:user.id,status:'PENDING',createdAt:now()});
  await tx.update('users', user.id, {sellerId:s.id,sellerRole:'OWNER'});
  await audit(tx, user.id, 'seller.applied', s.id);
  return s;
}
// Issues a 24-hour single-use link. Returns false when no email channel exists so callers never claim it was sent.
export async function sendVerification(store, mailer, config, user) {
  if (!mailer.configured || user.emailVerifiedAt) return false;
  const token = randomBytes(32).toString('hex');
  await store.transaction(async tx => {
    for (const t of (await tx.all('verifyTokens')).filter(t => t.userId === user.id)) await tx.remove('verifyTokens', t.id);
    await tx.put('verifyTokens', {id:hash(token),userId:user.id,expiresAt:new Date(Date.now()+24*60*60_000).toISOString(),createdAt:now()});
  });
  await mailer.send({to:user.email,subject:'Confirm your IBazzzar email',text:`Confirm your email within 24 hours: ${config.origin}/verify-email?token=${token}`});
  return true;
}
