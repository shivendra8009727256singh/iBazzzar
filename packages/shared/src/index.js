export class DomainError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export const money = (paise) => new Intl.NumberFormat('en-IN', {style:'currency',currency:'INR',maximumFractionDigits:2}).format(paise / 100);
export function priceLines(products, items, mode = 'retail', {coupon, at = Date.now()} = {}) {
  if (!['retail','business'].includes(mode) || !Array.isArray(items) || !items.length || items.length > 100) throw new DomainError('Invalid cart');
  const quantities = new Map();
  for (const item of items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 10000) throw new DomainError('Quantity must be a whole number between 1 and 10,000');
    quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.quantity);
  }
  const lines = [...quantities].map(([id,quantity]) => {
    const product = products.find(p => p.id === id);
    if (!product || (product.status && product.status !== 'APPROVED')) throw new DomainError('Product is unavailable',409);
    if (quantity > product.stock) throw new DomainError(`Insufficient stock for ${product.name || id}`,409);
    if (mode === 'business' && quantity < product.moq) throw new DomainError(`Minimum order is ${product.moq} units`,400);
    const eligible = mode === 'business' ? (product.tiers || []).filter(t => t.min <= quantity).sort((a,b) => b.min-a.min) : [];
    const unitPaise = eligible[0]?.pricePaise ?? product.pricePaise;
    return {productId:id,name:product.name,sellerId:product.sellerId,quantity,unitPaise,totalPaise:unitPaise*quantity};
  });
  const subtotalPaise = lines.reduce((sum,line) => sum+line.totalPaise,0);
  if (!Number.isSafeInteger(subtotalPaise) || subtotalPaise < 1) throw new DomainError('Invalid order total');
  const discountPaise = coupon ? couponDiscount(coupon, subtotalPaise, mode, at) : 0;
  return {lines,subtotalPaise,discountPaise,couponCode:coupon?.code ?? null,shippingPaise:0,totalPaise:subtotalPaise-discountPaise};
}
// Coupons are platform-funded: the discount never reduces a seller's gross sale.
export function couponDiscount(coupon, subtotalPaise, mode, at = Date.now()) {
  if (!coupon.active || Date.parse(coupon.startsAt) > at || Date.parse(coupon.endsAt) <= at) throw new DomainError('This coupon is not active',409);
  if (coupon.usageLimit != null && coupon.used >= coupon.usageLimit) throw new DomainError('This coupon has reached its usage limit',409);
  if (coupon.mode !== 'any' && coupon.mode !== mode) throw new DomainError(`This coupon applies to ${coupon.mode} orders only`,409);
  if (subtotalPaise < coupon.minOrderPaise) throw new DomainError(`Coupon needs a minimum order of ${money(coupon.minOrderPaise)}`,409);
  const raw = coupon.kind === 'PERCENT' ? Math.floor(subtotalPaise * coupon.value / 100) : coupon.value;
  const capped = coupon.maxDiscountPaise ? Math.min(raw, coupon.maxDiscountPaise) : raw;
  // An order always keeps at least ₹1 payable so payment providers can process it.
  return Math.max(0, Math.min(capped, subtotalPaise - 100));
}
export const commissionPaise = (grossPaise, rateBps) => Math.round(grossPaise * rateBps / 10000);
// Share of an order-level discount that belongs to one seller's lines; used when refunding a seller's items.
export const discountShare = (order, sellerGrossPaise) => order.subtotalPaise ? Math.floor((order.discountPaise || 0) * sellerGrossPaise / order.subtotalPaise) : 0;
export const fulfillmentFlow = {PENDING:['PACKED','CANCELLED'],PACKED:['SHIPPED','CANCELLED'],SHIPPED:['DELIVERED']};
export function orderStatusFrom(fulfillments) {
  const live = fulfillments.filter(f => f.status !== 'CANCELLED');
  if (!live.length) return 'CANCELLED';
  if (live.every(f => f.status === 'DELIVERED')) return 'DELIVERED';
  if (live.every(f => ['SHIPPED','DELIVERED'].includes(f.status))) return 'SHIPPED';
  return 'CONFIRMED';
}
export function assertTransition(from,to,graph) { if (!graph[from]?.includes(to)) throw new DomainError(`Cannot change ${from} to ${to}`,409); }
function editDistanceWithin1(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}
// Token search with one-character typo tolerance for words of four letters or more.
export function searchScore(text, query) {
  const haystack = text.toLowerCase(), terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return 1;
  const words = haystack.split(/[^a-z0-9&]+/).filter(Boolean);
  let score = 0;
  for (const term of terms) {
    if (haystack.includes(term)) score += words.some(w => w.startsWith(term)) ? 3 : 2;
    else if (term.length >= 4 && words.some(w => editDistanceWithin1(w, term) || (w.length > term.length && editDistanceWithin1(w.slice(0, term.length), term)))) score += 1;
    else return 0;
  }
  return score;
}
// GSTIN: 2-digit state code, 10-character PAN, entity number, 'Z', then a base-36 checksum character.
const GST_CHARS='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export function isValidGstin(value){
  const gstin=String(value||'').toUpperCase();
  if(!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin))return false;
  const state=Number(gstin.slice(0,2));if(state<1||(state>38&&state!==97&&state!==99))return false;
  let sum=0;
  for(let i=0;i<14;i++){const product=GST_CHARS.indexOf(gstin[i])*(i%2?2:1);sum+=Math.floor(product/36)+product%36;}
  return GST_CHARS[(36-sum%36)%36]===gstin[14];
}
export const isValidPan=value=>/^[A-Z]{3}[ABCFGHJLPT][A-Z][0-9]{4}[A-Z]$/.test(String(value||'').toUpperCase());
export const panFromGstin=gstin=>String(gstin).toUpperCase().slice(2,12);
export * from './permissions.js';
