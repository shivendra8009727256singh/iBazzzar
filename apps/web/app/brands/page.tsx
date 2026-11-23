import Link from 'next/link';
import {ArrowUpRight,Store} from 'lucide-react';
import {serverApi} from '@/lib/api';
import type {Seller} from '@/lib/types';
export const dynamic='force-dynamic';
export const metadata={title:'Brands & sellers'};
export default async function Page(){let brands:string[]=[],sellers:Seller[]=[];try{[{brands},{sellers}]=await Promise.all([serverApi<{brands:string[]}>('/brands'),serverApi<{sellers:Seller[]}>('/sellers')]);}catch{}return <section className="container section"><span className="eyebrow">THE MAKERS & MERCHANTS</span><h1>Brands and sellers.</h1><p className="muted">Every store listed here was approved by the marketplace team.</p><h2>Brands</h2>{brands.length?<div className="brand-grid">{brands.map(b=><Link key={b} href={`/products?brand=${encodeURIComponent(b)}`} className="brand-tile">{b}<ArrowUpRight size={14}/></Link>)}</div>:<p className="muted">No brands available.</p>}<h2>Sellers</h2><div className="seller-grid">{sellers.map(s=><Link key={s.id} href={`/products?seller=${s.id}`} className="seller-tile"><Store size={26} strokeWidth={1.3}/><h3>{s.name}</h3><p>{s.description}</p><span className="text-link">Visit store <ArrowUpRight size={14}/></span></Link>)}</div></section>;}
