import { z } from 'zod';
import { isValidGstin, isValidPan, panFromGstin } from '../../shared/src/index.js';

// Plain-language fallbacks for every validation message. Schema-specific messages below still take priority.
// Shared by the API and the web forms, so customers never see Zod's developer wording.
z.config({customError:issue=>{
  const label=issue.origin==='number'||issue.origin==='int'?'number':'value';
  switch(issue.code){
    case 'invalid_type':return issue.input===undefined||issue.input===null||issue.input===''?'This field is required':'Please enter a valid value';
    case 'too_small':
      if(issue.origin==='string')return Number(issue.minimum)<=1?'This field is required':`Please enter at least ${issue.minimum} characters`;
      if(issue.origin==='array')return Number(issue.minimum)<=1?'Please add at least one item':`Please add at least ${issue.minimum} items`;
      return `Please enter a ${label} of at least ${issue.minimum}`;
    case 'too_big':
      if(issue.origin==='string')return `Please keep this under ${Number(issue.maximum)+1} characters`;
      if(issue.origin==='array')return `You can add up to ${issue.maximum} items`;
      return `Please enter a ${label} no more than ${issue.maximum}`;
    case 'invalid_format':return issue.format==='email'?'Please enter a valid email address, like name@example.com':issue.format==='datetime'?'Please choose a valid date and time':'Please check the format of this field';
    case 'invalid_value':return 'Please choose one of the options';
    case 'invalid_union':return 'Please check this field';
    default:return 'Please check this field';
  }
}});
export const addressSchema = z.object({name:z.string().trim().min(2).max(100),line1:z.string().trim().min(5).max(250),city:z.string().trim().min(2).max(100),state:z.string().trim().min(2).max(100),pincode:z.string().regex(/^[1-9]\d{5}$/,'Enter a six-digit Indian PIN code'),phone:z.string().regex(/^[6-9]\d{9}$/,'Enter a valid 10-digit mobile number')});
const couponCode = z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,30}$/,'Coupon codes use 3–30 letters, digits or hyphens');
export const cartSchema = z.object({items:z.array(z.object({productId:z.string().min(1),quantity:z.number().int().min(1).max(10000)})).min(1).max(100),mode:z.enum(['retail','business']).default('retail'),couponCode:couponCode.optional()});
export const checkoutSchema = cartSchema.extend({address:addressSchema});
export const registerSchema = z.object({name:z.string().trim().min(2).max(100),email:z.email().toLowerCase().max(254),password:z.string().min(12).max(128)});
// Login accepts any stored password length so accounts created under older rules can still sign in.
export const loginSchema = z.object({email:z.email().toLowerCase().max(254),password:z.string().min(1,'Enter your password').max(128)});
export const passwordChangeSchema = z.object({currentPassword:z.string().min(1).max(128),newPassword:z.string().min(12).max(128)});
const mediaUrl=z.string().regex(/^\/api\/media\/[0-9a-f-]{36}\.webp$/,'Use an image uploaded to IBazzzar');
const productFields={name:z.string().trim().min(3).max(150),brand:z.string().trim().min(2).max(80),category:z.string().min(2).max(80),description:z.string().min(10).max(3000),pricePaise:z.number().int().min(100).max(100000000),stock:z.number().int().min(0).max(100000),moq:z.number().int().min(1).max(10000),tiers:z.array(z.object({min:z.number().int().min(1).max(10000),pricePaise:z.number().int().min(1).max(100000000)})).max(10),images:z.array(mediaUrl).max(8),variantLabel:z.string().trim().min(1).max(40)};
export const productSchema = z.object({...productFields,tiers:productFields.tiers.default([]),images:productFields.images.default([]),variantLabel:productFields.variantLabel.optional(),variantOf:z.string().max(64).optional()});
// Updates have no defaults: an omitted field must stay unchanged, never reset.
export const productUpdateSchema = z.object(productFields).partial();
export const couponSchema = z.object({code:couponCode,description:z.string().trim().min(5).max(200),kind:z.enum(['PERCENT','FLAT']),value:z.number().int().min(1).max(100000000),maxDiscountPaise:z.number().int().min(100).max(100000000).nullable().default(null),minOrderPaise:z.number().int().min(0).max(100000000).default(0),mode:z.enum(['retail','business','any']).default('any'),startsAt:z.iso.datetime(),endsAt:z.iso.datetime(),usageLimit:z.number().int().min(1).max(1000000).nullable().default(null),public:z.boolean().default(false)}).refine(c=>c.kind!=='PERCENT'||c.value<=90,{message:'Percentage discounts are limited to 90%',path:['value']}).refine(c=>Date.parse(c.endsAt)>Date.parse(c.startsAt),{message:'End must be after start',path:['endsAt']});
export const reviewSchema = z.object({rating:z.number().int().min(1).max(5),title:z.string().trim().min(3).max(120),body:z.string().trim().min(10).max(3000)});
export const fulfillmentSchema = z.object({status:z.enum(['PACKED','SHIPPED','DELIVERED','CANCELLED']),carrier:z.string().trim().min(2).max(80).optional(),trackingRef:z.string().trim().min(3).max(80).optional()});
export const ticketSchema = z.object({subject:z.string().trim().min(5).max(150),message:z.string().trim().min(10).max(5000),orderId:z.string().max(64).optional()});

// ---- Account registration (customer, business buyer, seller) ----
export const businessTypes = ['PROPRIETORSHIP','PARTNERSHIP','LLP','PRIVATE_LIMITED','PUBLIC_LIMITED','ONE_PERSON_COMPANY','TRUST_SOCIETY','OTHER'];
export const mobileSchema = z.string({message:'Please enter your mobile number'}).trim().regex(/^[6-9]\d{9}$/,'Please enter a valid 10-digit mobile number starting with 6, 7, 8 or 9');
export const passwordSchema = z.string({message:'Please create a password'}).min(12,'Your password needs at least 12 characters').max(128).refine(p=>new Set(p).size>=6,'This password is too easy to guess. Try a short phrase with a few different characters');
const gstinSchema = z.string().trim().toUpperCase().refine(isValidGstin,'This GSTIN doesn’t look right. Please check all 15 characters');
const panSchema = z.string().trim().toUpperCase().refine(isValidPan,'This PAN doesn’t look right. It should look like ABCDE1234F');
const postalAddress = z.object({line1:z.string({message:'Please enter the building and street'}).trim().min(5,'Please enter the full building and street address').max(250),line2:z.string().trim().max(250).optional(),city:z.string({message:'Please enter your city'}).trim().min(2,'Please enter your city').max(100),state:z.string({message:'Please select your state or union territory'}).trim().min(2,'Please select your state or union territory').max(100),pincode:z.string({message:'Please enter your 6-digit PIN code'}).regex(/^[1-9]\d{5}$/,'Please enter a valid 6-digit PIN code')});
const taxIdentity = {businessType:z.enum(businessTypes,{message:'Please choose your business type'}),gstRegistered:z.boolean(),gstin:gstinSchema.optional(),pan:panSchema.optional()};
// GST registration is optional for small businesses in India, but a registered business must give a valid GSTIN whose PAN matches.
const taxRules = (value, ctx) => {
  if (value.gstRegistered && !value.gstin) ctx.addIssue({code:'custom',path:['gstin'],message:'Please enter your GSTIN, or untick “registered under GST”'});
  if (!value.gstRegistered && value.gstin) ctx.addIssue({code:'custom',path:['gstRegistered'],message:'Please tick “registered under GST” to add a GSTIN'});
  if (value.gstin && value.pan && panFromGstin(value.gstin) !== value.pan) ctx.addIssue({code:'custom',path:['pan'],message:'This PAN doesn’t match the PAN inside your GSTIN (characters 3–12)'});
};
export const businessProfileSchema = z.object({legalName:z.string({message:'Please enter your legal business name'}).trim().min(3,'Please enter your full legal business name').max(150),tradeName:z.string().trim().max(150).optional(),...taxIdentity,contactPhone:mobileSchema,address:postalAddress}).superRefine(taxRules);
export const sellerProfileSchema = z.object({storeName:z.string({message:'Please enter a store name'}).trim().min(3,'Store name needs at least 3 characters').max(80),description:z.string({message:'Please tell customers about your store'}).trim().min(20,'Please describe your store in at least 20 characters').max(1000),legalName:z.string({message:'Please enter your legal business name'}).trim().min(3,'Please enter your full legal business name').max(150),...taxIdentity,primaryCategory:z.string({message:'Please choose the main category you sell in'}).trim().min(2,'Please choose the main category you sell in').max(60),contactPhone:mobileSchema,pickupAddress:postalAddress,acceptSellerTerms:z.literal(true,{message:'Please accept the seller agreement to continue'})}).superRefine(taxRules);
const accountBase = {name:z.string({message:'Please enter your full name'}).trim().min(2,'Please enter your full name').max(100),email:z.email({message:'Please enter a valid email address, like name@example.com'}).toLowerCase().max(254),phone:mobileSchema,password:passwordSchema,acceptTerms:z.literal(true,{message:'Please accept the Terms of Use and Privacy Policy to continue'}),marketingOptIn:z.boolean().default(false)};
export const accountRegisterSchema = z.discriminatedUnion('accountType',[
  z.object({accountType:z.literal('customer'),...accountBase}),
  z.object({accountType:z.literal('business'),...accountBase,business:businessProfileSchema}),
  z.object({accountType:z.literal('seller'),...accountBase,seller:sellerProfileSchema}),
]).superRefine((v,ctx)=>{if(v.password.toLowerCase().includes(v.email.split('@')[0])&&v.email.split('@')[0].length>=4)ctx.addIssue({code:'custom',path:['password'],message:'For your safety, don’t use your email name in your password'});});
