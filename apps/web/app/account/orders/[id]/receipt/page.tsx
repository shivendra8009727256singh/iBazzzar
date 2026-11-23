'use client';
import {use} from 'react';
import Link from 'next/link';
import {useQuery} from '@tanstack/react-query';
import {Printer} from 'lucide-react';
import {api} from '@/lib/api';
import {Logo} from '@/components/logo';
import {useUser} from '@/components/providers';
import {formatMoney,label,shortId,type Order,type Seller} from '@/lib/types';
export default function Page({params}:{params:Promise<{id:string}>}){const {id}=use(params),{data:user}=useUser();
 const {data,error}=useQuery({queryKey:['order',id],queryFn:()=>api<{order:Order}>(`/orders/${id}`),enabled:!!user});
 const {data:sellers}=useQuery({queryKey:['sellers'],queryFn:()=>api<{sellers:Seller[]}>('/sellers'),staleTime:300_000});
 if(!user)return <section className="container section"><Link className="button primary" href={`/login?next=/account/orders/${id}/receipt`}>Sign in to view this receipt</Link></section>;
 if(error)return <section className="container section"><div className="error">{error.message}</div></section>;if(!data)return <p className="container section">Loading receipt…</p>;
 const o=data.order,sellerName=(sid:string)=>sellers?.sellers.find(s=>s.id===sid)?.name||'Seller';
 return <section className="container section receipt"><div className="flex-between no-print"><Link className="text-link" href={`/account/orders/${o.id}`}>← Back to order</Link><button className="button outline small" onClick={()=>window.print()}><Printer size={15}/> Print or save as PDF</button></div>
 <header className="receipt-head"><Logo size="hero" priority/><div><h1>Order receipt</h1><p>Order {shortId(o.id)}<br/>{new Date(o.createdAt).toLocaleString('en-IN')}<br/>Payment: {o.paymentStatus==='DEMO_SIMULATED'?'Demo simulation — no money moved':label(o.paymentStatus)}{o.paymentRef?` (${o.paymentRef})`:''}</p></div></header>
 <div className="receipt-parties"><div><h3>Billed & shipped to</h3><p>{o.address.name}<br/>{o.address.line1}<br/>{o.address.city}{o.address.state?`, ${o.address.state}`:''} {o.address.pincode}</p></div><div><h3>Sold by</h3><p>{[...new Set(o.items.map(i=>i.sellerId))].map(sellerName).join(', ')}<br/>via IBazzzar marketplace</p></div></div>
 <table className="data-table"><thead><tr><th>Item</th><th>Seller</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>{o.items.map(i=><tr key={i.productId}><td>{i.name}</td><td>{sellerName(i.sellerId)}</td><td>{i.quantity}</td><td>{formatMoney(i.unitPaise)}</td><td>{formatMoney(i.totalPaise)}</td></tr>)}</tbody><tfoot><tr><td colSpan={4}>Items</td><td>{formatMoney(o.subtotalPaise??o.totalPaise)}</td></tr>{!!o.discountPaise&&<tr><td colSpan={4}>Coupon {o.couponCode} (platform-funded)</td><td>−{formatMoney(o.discountPaise)}</td></tr>}<tr><td colSpan={4}>Delivery</td><td>₹0</td></tr><tr className="total"><td colSpan={4}>Total</td><td>{formatMoney(o.totalPaise)}</td></tr></tfoot></table>
 <p className="notice">This is an order receipt, not a GST tax invoice. Prices are shown as listed by sellers; GST breakdown and seller GSTIN will appear on tax invoices once tax configuration is completed.</p></section>;}
