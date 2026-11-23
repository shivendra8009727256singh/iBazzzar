import { randomUUID } from 'node:crypto';
import { DomainError,priceLines,assertTransition,fulfillmentFlow,orderStatusFrom,commissionPaise,discountShare } from '../../../packages/shared/src/index.js';
import { hash } from './security.js';
export const now=()=>new Date().toISOString();
export const purchaseOrderCheckoutKey=id=>hash(`purchase-order-checkout:${id}`);
export const audit=(store,actorId,action,resourceId)=>store.put('audit',{id:randomUUID(),actorId,action,resourceId,createdAt:now()});
export const notify=(store,userId,title,body,link=null)=>userId&&store.put('notifications',{id:randomUUID(),userId,title,body,link,read:false,createdAt:now()});
export const DEFAULT_COMMISSION_BPS=1000;
export const DEFAULT_PLATFORM={returnWindowDays:7,lowStockThreshold:10,paymentWindowMinutes:30};
export async function platformSettings(store){return {...DEFAULT_PLATFORM,...((await store.get('settings','platform'))?.value||{})};}
export async function commissionRate(store){return (await store.get('settings','commission'))?.value?.rateBps??DEFAULT_COMMISSION_BPS;}
// Only approved products from approved sellers can be priced or bought.
export async function sellableProducts(store){const approved=new Set((await store.all('sellers')).filter(s=>s.status==='APPROVED').map(s=>s.id));return (await store.all('products')).filter(p=>p.status==='APPROVED'&&approved.has(p.sellerId));}
export async function findCoupon(store,code){return (await store.all('coupons')).find(c=>c.code===code)??null;}
const sellerGross=(order,sellerId)=>order.items.filter(i=>i.sellerId===sellerId).reduce((s,i)=>s+i.totalPaise,0);
const pushHistory=(order,status,note)=>[...order.history,{status,at:now(),...(note?{note}:{})}];
async function notifySellerOwner(tx,sellerId,title,body,link){const s=await tx.get('sellers',sellerId);if(s?.ownerId&&s.ownerId!=='seed')await notify(tx,s.ownerId,title,body,link);}
export class Marketplace {
 constructor(store){this.store=store;}
 async priceCart(input,user){
  const products=await sellableProducts(this.store);
  const coupon=input.couponCode?await this.#coupon(this.store,input.couponCode,user):null;
  return priceLines(products,input.items,input.mode,{coupon});
 }
 async #coupon(tx,code,user){
  const coupon=await findCoupon(tx,code);if(!coupon)throw new DomainError('Coupon not found',404);
  if(user&&(await tx.all('orders')).some(o=>o.userId===user.id&&o.couponCode===code&&o.status!=='CANCELLED'))throw new DomainError('You have already used this coupon',409);
  return coupon;
 }
 async checkout(user,input,key){
  if(typeof key!=='string'||key.length<8||key.length>128)throw new DomainError('A valid Idempotency-Key is required');
  const fingerprint=hash(JSON.stringify(input));const keyId=hash(`${user.id}:${key}`);
  return this.store.transaction(async tx=>{
   const existing=await tx.get('keys',keyId);
   if(existing){if(existing.fingerprint!==fingerprint)throw new DomainError('This checkout key was used with different details',409);return tx.get('orders',existing.orderId);}
   if(input.mode==='business'&&!user.organizationId)throw new DomainError('Create a business account before wholesale checkout',403);
   const products=await sellableProducts(tx);
   const coupon=input.couponCode?await this.#coupon(tx,input.couponCode,user):null;
   const totals=priceLines(products,input.items,input.mode,{coupon});
   const sellerIds=[...new Set(totals.lines.map(l=>l.sellerId))];
   const order={id:randomUUID(),userId:user.id,mode:input.mode,status:'AWAITING_PAYMENT',paymentStatus:'UNPAID',paymentRef:null,subtotalPaise:totals.subtotalPaise,discountPaise:totals.discountPaise,couponCode:totals.couponCode,totalPaise:totals.totalPaise,items:totals.lines,address:input.address,fulfillments:sellerIds.map(sellerId=>({sellerId,status:'PENDING',carrier:null,trackingRef:null,history:[]})),history:[{status:'AWAITING_PAYMENT',at:now()}],createdAt:now()};
   for(const line of totals.lines){const p=products.find(p=>p.id===line.productId);await tx.update('products',p.id,{stock:p.stock-line.quantity});}
   if(coupon)await tx.update('coupons',coupon.id,{used:coupon.used+1});
   await tx.put('orders',order);await tx.put('keys',{id:keyId,fingerprint,orderId:order.id});await audit(tx,user.id,'order.created',order.id);return order;
  });
 }
 async #release(tx,order,lines){
  for(const item of lines){const product=await tx.get('products',item.productId);if(product)await tx.update('products',product.id,{stock:product.stock+item.quantity});}
 }
 async #cancelUnpaid(tx,order,actorId,note){
  await this.#release(tx,order,order.items);
  if(order.couponCode){const c=await findCoupon(tx,order.couponCode);if(c)await tx.update('coupons',c.id,{used:Math.max(0,c.used-1)});}
  const updated=await tx.update('orders',order.id,{status:'CANCELLED',fulfillments:order.fulfillments.map(f=>({...f,status:'CANCELLED'})),history:pushHistory(order,'CANCELLED',note)});
  await audit(tx,actorId,'order.cancelled',order.id);return updated;
 }
 // Staff cancellation for unpaid orders, for example a customer request over support. Paid orders go through returns/refunds.
 async staffCancel(actor,id,reason){return this.store.transaction(async tx=>{const order=await tx.get('orders',id);if(!order)throw new DomainError('Order not found',404);if(order.status==='CANCELLED')return order;if(order.status!=='AWAITING_PAYMENT')throw new DomainError('Only unpaid orders can be cancelled here. Paid orders are handled through the seller or a return.',409);const updated=await this.#cancelUnpaid(tx,order,actor.id,`Cancelled by IBazzzar staff: ${reason}`);await notify(tx,order.userId,'Order cancelled',`Order ${order.id.slice(0,8).toUpperCase()} was cancelled by our team: ${reason}`,'/account');return updated;});}
 async cancel(user,id){return this.store.transaction(async tx=>{const order=await tx.get('orders',id);if(!order||order.userId!==user.id)throw new DomainError('Order not found',404);if(order.status==='CANCELLED')return order;if(order.status!=='AWAITING_PAYMENT')throw new DomainError('Only an unpaid order can be cancelled here',409);return this.#cancelUnpaid(tx,order,user.id);});}
 // Releases stock held by unpaid orders older than maxAgeMs. Run by the worker.
 async expireUnpaid(maxAgeMs,at=Date.now()){
  const stale=(await this.store.all('orders')).filter(o=>o.status==='AWAITING_PAYMENT'&&at-Date.parse(o.createdAt)>maxAgeMs);
  let expired=0;
  for(const candidate of stale)await this.store.transaction(async tx=>{const order=await tx.get('orders',candidate.id);if(order?.status!=='AWAITING_PAYMENT')return;await this.#cancelUnpaid(tx,order,'system','Payment window expired');await notify(tx,order.userId,'Order expired','Payment was not received in time, so the reserved stock was released.','/account');expired++;});
  return expired;
 }
 // Single path for every payment confirmation (webhook, checkout signature, demo simulation).
 async applyPayment(tx,order,{paymentStatus,reference,actorId}){
  if(['PAID','DEMO_SIMULATED'].includes(order.paymentStatus))return order;
  if(order.status!=='AWAITING_PAYMENT')throw new DomainError('Order cannot receive payment',409);
  const updated=await tx.update('orders',order.id,{status:'CONFIRMED',paymentStatus,paymentRef:reference??null,history:pushHistory(order,'CONFIRMED',paymentStatus==='DEMO_SIMULATED'?'Demo payment simulation — no money moved':null)});
  await audit(tx,actorId,paymentStatus==='PAID'?'payment.captured':'payment.demo-simulated',order.id);
  await notify(tx,order.userId,'Order confirmed',`Order ${order.id.slice(0,8).toUpperCase()} is confirmed and with the seller.`,'/account');
  for(const f of order.fulfillments)await notifySellerOwner(tx,f.sellerId,'New order to fulfil',`Order ${order.id.slice(0,8).toUpperCase()} is ready for packing.`,'/seller');
  return updated;
 }
 async simulatePayment(user,id){return this.store.transaction(async tx=>{const order=await tx.get('orders',id);if(!order||order.userId!==user.id)throw new DomainError('Order not found',404);return this.applyPayment(tx,order,{paymentStatus:'DEMO_SIMULATED',actorId:user.id});});}
 async advanceFulfillment(user,orderId,input){return this.store.transaction(async tx=>{
  const order=await tx.get('orders',orderId),f=order?.fulfillments?.find(f=>f.sellerId===user.sellerId);
  if(!order||!f)throw new DomainError('Order not found',404);
  if(['AWAITING_PAYMENT','CANCELLED'].includes(order.status))throw new DomainError('This order is not ready for fulfilment',409);
  assertTransition(f.status,input.status,fulfillmentFlow);
  if(input.status==='SHIPPED'&&!input.carrier)throw new DomainError('Carrier name is required when marking as shipped');
  const next={...f,status:input.status,carrier:input.carrier??f.carrier,trackingRef:input.trackingRef??f.trackingRef,history:[...f.history,{status:input.status,at:now(),by:user.id}]};
  const fulfillments=order.fulfillments.map(x=>x.sellerId===f.sellerId?next:x),status=orderStatusFrom(fulfillments);
  let updated=await tx.update('orders',order.id,{fulfillments,status,history:status!==order.status?pushHistory(order,status):order.history});
  if(input.status==='CANCELLED'){await this.#release(tx,order,order.items.filter(i=>i.sellerId===f.sellerId));await this.#refund(tx,updated,f.sellerId,null,'Seller cancelled before shipping');updated=await tx.get('orders',order.id);}
  if(input.status==='DELIVERED'){const gross=sellerGross(order,f.sellerId),fee=commissionPaise(gross,await commissionRate(tx));const demo=order.paymentStatus!=='PAID';
   await tx.put('ledger',{id:randomUUID(),sellerId:f.sellerId,orderId:order.id,kind:'SALE',amountPaise:gross,status:'PENDING_SETTLEMENT',demo,createdAt:now()});
   await tx.put('ledger',{id:randomUUID(),sellerId:f.sellerId,orderId:order.id,kind:'COMMISSION',amountPaise:-fee,status:'PENDING_SETTLEMENT',demo,createdAt:now()});}
  await audit(tx,user.id,`fulfillment.${input.status.toLowerCase()}`,order.id);
  await notify(tx,order.userId,`Order ${input.status.toLowerCase()}`,`Part of order ${order.id.slice(0,8).toUpperCase()} is now ${input.status.toLowerCase()}${input.carrier?` via ${input.carrier}`:''}.`,'/account');
  return updated;
 });}
 // Records what is owed back to the customer for one seller's items. Provider refunds are not automated.
 async #refund(tx,order,sellerId,returnId,reason){
  if(!['PAID','DEMO_SIMULATED'].includes(order.paymentStatus))return null;
  const gross=sellerGross(order,sellerId),amountPaise=gross-discountShare(order,gross);
  const refund=await tx.put('refunds',{id:randomUUID(),orderId:order.id,sellerId,returnId,amountPaise,reason,status:order.paymentStatus==='PAID'?'PENDING_PROVIDER':'DEMO_SIMULATED',providerRef:null,createdAt:now()});
  const ledger=(await tx.all('ledger')).filter(e=>e.orderId===order.id&&e.sellerId===sellerId);
  const sale=ledger.find(e=>e.kind==='SALE'),fee=ledger.find(e=>e.kind==='COMMISSION');
  if(sale){await tx.put('ledger',{id:randomUUID(),sellerId,orderId:order.id,kind:'REFUND_ADJUSTMENT',amountPaise:-sale.amountPaise,status:'PENDING_SETTLEMENT',demo:sale.demo,createdAt:now()});
   if(fee)await tx.put('ledger',{id:randomUUID(),sellerId,orderId:order.id,kind:'COMMISSION_REVERSAL',amountPaise:-fee.amountPaise,status:'PENDING_SETTLEMENT',demo:sale.demo,createdAt:now()});}
  await notify(tx,order.userId,'Refund recorded',`A refund of ₹${(amountPaise/100).toFixed(2)} has been recorded for order ${order.id.slice(0,8).toUpperCase()}.`,'/account');
  return refund;
 }
 async requestReturn(user,orderId,{reason,sellerId}){return this.store.transaction(async tx=>{
  const o=await tx.get('orders',orderId);if(!o||o.userId!==user.id)throw new DomainError('Order not found',404);
  const target=sellerId?o.fulfillments.find(f=>f.sellerId===sellerId):o.fulfillments.length===1?o.fulfillments[0]:null;
  if(!target)throw new DomainError('Choose which seller’s items you are returning');
  if(target.status!=='DELIVERED')throw new DomainError('Returns are available after delivery',409);
  const {returnWindowDays}=await platformSettings(tx),deliveredAt=Date.parse(target.history.findLast(h=>h.status==='DELIVERED')?.at??0);
  if(Date.now()-deliveredAt>returnWindowDays*864e5)throw new DomainError(`The ${returnWindowDays}-day return window for this order closed on ${new Date(deliveredAt+returnWindowDays*864e5).toLocaleDateString('en-IN')}. Please contact support if something is wrong.`,409);
  if((await tx.all('returns')).some(r=>r.orderId===o.id&&r.sellerId===target.sellerId))throw new DomainError('A return request already exists',409);
  const r=await tx.put('returns',{id:randomUUID(),orderId:o.id,userId:user.id,sellerId:target.sellerId,reason,status:'REQUESTED',decidedBy:null,note:null,createdAt:now()});
  await audit(tx,user.id,'return.requested',r.id);await notifySellerOwner(tx,target.sellerId,'Return requested',`A customer requested a return for order ${o.id.slice(0,8).toUpperCase()}.`,'/seller');return r;
 });}
 async decideReturn(actor,returnId,{decision,note},{sellerId}={}){return this.store.transaction(async tx=>{
  const r=await tx.get('returns',returnId);if(!r||(sellerId&&r.sellerId!==sellerId))throw new DomainError('Return not found',404);
  if(r.status!=='REQUESTED')throw new DomainError('This return has already been decided',409);
  const updated=await tx.update('returns',r.id,{status:decision,decidedBy:actor.id,note:note??null});
  if(decision==='APPROVED')await this.#refund(tx,await tx.get('orders',r.orderId),r.sellerId,r.id,`Return approved: ${r.reason}`);
  else await notify(tx,r.userId,'Return declined',note||'Your return request was declined.','/account');
  await audit(tx,actor.id,`return.${decision.toLowerCase()}`,r.id);return updated;
 });}
 async review(user,productId,input){return this.store.transaction(async tx=>{
  const product=await tx.get('products',productId);if(!product)throw new DomainError('Product not found',404);
  const delivered=(await tx.all('orders')).some(o=>o.userId===user.id&&o.items.some(i=>i.productId===productId)&&o.fulfillments?.some(f=>f.sellerId===product.sellerId&&f.status==='DELIVERED'));
  if(!delivered)throw new DomainError('Only customers who received this product can review it',403);
  if((await tx.all('reviews')).some(r=>r.productId===productId&&r.userId===user.id))throw new DomainError('You have already reviewed this product',409);
  const review=await tx.put('reviews',{id:randomUUID(),productId,userId:user.id,authorName:user.name.split(' ')[0],...input,verified:true,status:'PUBLISHED',createdAt:now()});
  await audit(tx,user.id,'review.created',review.id);return review;
 });}
 async acceptQuote(user,id){return this.store.transaction(async tx=>{
  const quote=await tx.get('quotes',id),rfq=quote&&await tx.get('rfqs',quote.rfqId);
  if(!rfq||rfq.organizationId!==user.organizationId)throw new DomainError('Quotation not found',404);
  const prior=(await tx.all('purchaseOrders')).find(po=>po.quoteId===id);if(prior)return prior;
  if(quote.status!=='OPEN'||Date.parse(quote.validUntil)<=Date.now())throw new DomainError('Quotation expired or no longer open',409);
  const org=await tx.get('organizations',user.organizationId),totalPaise=quote.pricePaise*quote.quantity;
  // Organisations may pre-authorise small purchases; anything above the threshold needs an approver.
  const auto=(org?.approvalThresholdPaise||0)>0&&totalPaise<=org.approvalThresholdPaise;
  const po={id:randomUUID(),organizationId:user.organizationId,quoteId:id,sellerId:quote.sellerId,requestedBy:user.id,approvedBy:null,status:auto?'APPROVED':'PENDING_APPROVAL',totalPaise,snapshot:{...quote,productId:rfq.productId},history:[{status:'PENDING_APPROVAL',at:now(),by:user.id},...(auto?[{status:'APPROVED',at:now(),note:'Within organisation auto-approval threshold'}]:[])],createdAt:now()};
  await tx.put('purchaseOrders',po);await tx.update('quotes',id,{status:'ACCEPTED'});await tx.update('rfqs',rfq.id,{status:'ACCEPTED'});await audit(tx,user.id,'quote.accepted',id);
  if(auto)await notifySellerOwner(tx,quote.sellerId,'Purchase order approved',`PO-${po.id.slice(0,8).toUpperCase()} awaits your confirmation.`,'/seller');
  return po;
 });}
 async rejectQuote(user,id){return this.store.transaction(async tx=>{
  const quote=await tx.get('quotes',id),rfq=quote&&await tx.get('rfqs',quote.rfqId);
  if(!rfq||rfq.organizationId!==user.organizationId)throw new DomainError('Quotation not found',404);
  if(quote.status!=='OPEN')throw new DomainError('Quotation is no longer open',409);
  const updated=await tx.update('quotes',id,{status:'REJECTED'});await audit(tx,user.id,'quote.rejected',id);
  await notifySellerOwner(tx,quote.sellerId,'Quotation declined','A buyer declined your quotation. You can submit a revision.','/seller');return updated;
 });}
 async decidePurchaseOrder(user,id,decision,reason){
  if(!['OWNER','APPROVER'].includes(user.organizationRole))throw new DomainError('Procurement approval permission required',403);
  return this.store.transaction(async tx=>{
   const p=await tx.get('purchaseOrders',id);if(!p||p.organizationId!==user.organizationId)throw new DomainError('Purchase order not found',404);
   if(p.status!=='PENDING_APPROVAL')throw new DomainError('Purchase order is not pending approval',409);
   // Separation of duties: an approver cannot approve their own request; only the owner may.
   if(decision==='APPROVED'&&p.requestedBy===user.id&&user.organizationRole!=='OWNER')throw new DomainError('Another approver must approve your own request',403);
   const updated=await tx.update('purchaseOrders',p.id,{status:decision,...(decision==='APPROVED'?{approvedBy:user.id}:{}),history:[...(p.history||[]),{status:decision,at:now(),by:user.id,...(reason?{note:reason}:{})}]});
   await audit(tx,user.id,`purchase-order.${decision.toLowerCase()}`,p.id);
   if(decision==='APPROVED'&&p.sellerId)await notifySellerOwner(tx,p.sellerId,'Purchase order approved',`PO-${p.id.slice(0,8).toUpperCase()} awaits your confirmation.`,'/seller');
   await notify(tx,p.requestedBy,`Purchase order ${decision.toLowerCase()}`,`PO-${p.id.slice(0,8).toUpperCase()} was ${decision.toLowerCase()}.`,'/business');
   return updated;
  });
 }
 async confirmPurchaseOrder(user,id){return this.store.transaction(async tx=>{
  const p=await tx.get('purchaseOrders',id);if(!p||p.sellerId!==user.sellerId)throw new DomainError('Purchase order not found',404);
  if(p.status!=='APPROVED')throw new DomainError('Only approved purchase orders can be confirmed',409);
  const updated=await tx.update('purchaseOrders',p.id,{status:'CONFIRMED_BY_SELLER',history:[...(p.history||[]),{status:'CONFIRMED_BY_SELLER',at:now(),by:user.id}]});
  await audit(tx,user.id,'purchase-order.seller-confirmed',p.id);await notify(tx,p.requestedBy,'Seller confirmed your purchase order',`PO-${p.id.slice(0,8).toUpperCase()} is confirmed by the seller.`,'/business');return updated;
 });}
 async checkoutPurchaseOrder(user,id,{address}){return this.store.transaction(async tx=>{
  const actor=await tx.get('users',user.id),po=await tx.get('purchaseOrders',id);
  if(!actor?.organizationId||!po||po.organizationId!==actor.organizationId)throw new DomainError('Purchase order not found',404);
  if(!['OWNER','BUYER','APPROVER'].includes(actor.organizationRole)||(po.requestedBy!==actor.id&&actor.organizationRole!=='OWNER'))throw new DomainError('Only the requester or organization owner can place this order',403);
  const keyId=purchaseOrderCheckoutKey(id),fingerprint=hash(JSON.stringify(address)),existing=await tx.get('keys',keyId);
  if(existing){
   if(existing.fingerprint!==fingerprint)throw new DomainError('This purchase order already has an order with different shipping details',409);
   const order=await tx.get('orders',existing.orderId);
   if(!order)throw new DomainError('The linked order is unavailable. Contact support.',409);
   if(order.userId!==actor.id)throw new DomainError('This purchase order has already been placed by another team member',409);
   return order;
  }
  if(po.status!=='CONFIRMED_BY_SELLER')throw new DomainError('Purchase order must be approved and confirmed by the seller before checkout',409);
  const {productId,quantity,pricePaise}=po.snapshot;
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>10000||!Number.isSafeInteger(pricePaise)||pricePaise<1||!Number.isSafeInteger(quantity*pricePaise)||po.totalPaise!==quantity*pricePaise)throw new DomainError('Purchase order pricing is inconsistent. Contact support.',409);
  const product=await tx.get('products',productId),seller=await tx.get('sellers',po.sellerId);
  if(!product||product.status!=='APPROVED'||product.sellerId!==po.sellerId||seller?.status!=='APPROVED')throw new DomainError('The quoted product or seller is no longer available',409);
  if(product.stock<quantity)throw new DomainError('Insufficient stock for this purchase order',409);
  // Negotiated snapshot replaces catalogue tiers; coupons cannot alter an approved PO.
  const order={id:randomUUID(),userId:actor.id,mode:'business',status:'AWAITING_PAYMENT',paymentStatus:'UNPAID',paymentRef:null,subtotalPaise:po.totalPaise,discountPaise:0,couponCode:null,totalPaise:po.totalPaise,items:[{productId,name:product.name,sellerId:po.sellerId,quantity,unitPaise:pricePaise,totalPaise:po.totalPaise}],address,fulfillments:[{sellerId:po.sellerId,status:'PENDING',carrier:null,trackingRef:null,history:[]}],history:[{status:'AWAITING_PAYMENT',at:now(),note:`From purchase order ${po.id}`}],createdAt:now()};
  await tx.update('products',product.id,{stock:product.stock-quantity});
  await tx.put('orders',order);await tx.put('keys',{id:keyId,fingerprint,orderId:order.id});
  await tx.update('purchaseOrders',po.id,{status:'ORDERED',history:[...(po.history||[]),{status:'ORDERED',at:now(),by:actor.id,note:`Order ${order.id}`} ]});
  await audit(tx,actor.id,'purchase-order.ordered',po.id);await audit(tx,actor.id,'order.created',order.id);
  return order;
 });}
}
