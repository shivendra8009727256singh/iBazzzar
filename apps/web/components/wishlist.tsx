'use client';
import {useQuery} from '@tanstack/react-query';
import Link from 'next/link';
import {Heart} from 'lucide-react';
import {useShop} from './providers';
import {api} from '@/lib/api';
import type {Product} from '@/lib/types';
import {ProductCard} from './product-card';
export function Wishlist(){const shop=useShop(),{data,error}=useQuery({queryKey:['products','all'],queryFn:()=>api<{products:Product[]}>('/products')});const products=data?.products.filter(p=>shop.wishlist.includes(p.id));return <section className="container section"><span className="eyebrow">KEEP YOUR FAVOURITES CLOSE</span><h1>Your little collection.</h1><p className="muted">Saved on this device, ready whenever you are.</p>{error?<div className="error">{error.message}</div>:products?.length?<div className="product-grid">{products.map(p=><ProductCard key={p.id} product={p}/>)}</div>:<div className="empty"><Heart size={40}/><h2>Found something you love?</h2><p>Tap the heart on a product to save it here.</p><Link className="button primary" href="/products">Explore the collection</Link></div>}</section>;}
