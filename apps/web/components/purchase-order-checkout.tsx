'use client';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useQueryClient} from '@tanstack/react-query';
import {post} from '@/lib/api';
import {type Order,formatMoney} from '@/lib/types';
import {ActionForm,field} from './workspace';

export function PurchaseOrderCheckout({id,totalPaise,name}:{id:string;totalPaise:number;name:string}){
 const router=useRouter(),client=useQueryClient();
 return <details className="po-checkout"><summary>Place order at agreed price</summary><p>The seller has confirmed this purchase order. Enter your delivery address to reserve available stock at the agreed total of <strong>{formatMoney(totalPaise)}</strong>. Payment follows on the order page; no payment is taken by this form.</p>
 <ActionForm label="Create order & continue to payment" onSubmit={async form=>{
  const address=Object.fromEntries(['name','line1','city','state','pincode','phone'].map(key=>[key,field(form,key)]));
  const {order}=await post<{order:Order}>(`/business/purchase-orders/${id}/checkout`,{address});
  await Promise.all([client.invalidateQueries({queryKey:['business']}),client.invalidateQueries({queryKey:['orders']})]);
  router.push(`/account/orders/${order.id}`);
 }}><div className="form-grid">
  <label className="wide">Delivery contact name<input name="name" autoComplete="name" defaultValue={name} required minLength={2} maxLength={100}/></label>
  <label className="wide">Delivery street address<input name="line1" autoComplete="street-address" required minLength={5} maxLength={250}/></label>
  <label>Delivery city<input name="city" autoComplete="address-level2" required minLength={2} maxLength={100}/></label>
  <label>Delivery state<input name="state" autoComplete="address-level1" required minLength={2} maxLength={100}/></label>
  <label>Delivery PIN code<input name="pincode" autoComplete="postal-code" inputMode="numeric" pattern="[1-9][0-9]{5}" title="Six-digit Indian PIN code" required/></label>
  <label>Delivery mobile number<input name="phone" autoComplete="tel-national" inputMode="tel" pattern="[6-9][0-9]{9}" title="10-digit Indian mobile number" required/></label>
 </div><label className="check"><input type="checkbox" required/> I confirm the delivery details and agree to create this order at the approved quotation price.</label>
 <p className="muted">The existing test/demo payment configuration applies. See <Link className="text-button" href="/help/policies">preview payment and shipping terms</Link>.</p></ActionForm></details>;
}
