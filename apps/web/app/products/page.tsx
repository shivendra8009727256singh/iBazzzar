import {Suspense} from 'react';
import {Catalogue} from '@/components/catalogue';
export const metadata={title:'Explore products'};
export default function Page(){return <Suspense fallback={<p className="container section">Loading your discoveries…</p>}><Catalogue/></Suspense>;}
