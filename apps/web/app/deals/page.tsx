import Link from 'next/link';
import {ArrowUpRight,Tag} from 'lucide-react';
import {serverApi} from '@/lib/api';
import type {Offer} from '@/lib/types';
import {OfferCards} from '@/components/offers';
export const dynamic='force-dynamic';
export const metadata={title:'Deals & offers'};
export default async function Page(){let offers:Offer[]=[],failed=false;try{offers=(await serverApi<{offers:Offer[]}>('/offers')).offers;}catch{failed=true;}return <section className="container section"><span className="eyebrow">LIVE OFFERS</span><h1>Good deals, clearly explained.</h1><p className="muted">Every offer shows its real terms and end time. Apply the code in your bag — the server checks eligibility.</p>{failed?<div className="notice">Offers are temporarily unavailable.</div>:offers.length?<OfferCards offers={offers}/>:<div className="empty"><Tag size={40}/><h2>No live campaigns right now.</h2><p>We only show offers that are actually running. Check back soon.</p><Link className="button primary" href="/products">Explore products <ArrowUpRight size={16}/></Link></div>}</section>;}
