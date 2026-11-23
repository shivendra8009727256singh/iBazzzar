import type {MetadataRoute} from 'next';
import {serverApi} from '@/lib/api';
import type {Product} from '@/lib/types';
export const dynamic='force-dynamic';
export default async function sitemap():Promise<MetadataRoute.Sitemap>{
 const pages=['','/products','/wholesale','/sell','/help','/help/policies'].map(path=>({url:`https://ibazzzar.com${path}`}));
 let products:Product[]=[];
 try{for(let page=1,pages=1;page<=pages&&page<=200;page++){const data=await serverApi<{products:Product[];pages:number}>(`/products?page=${page}`);products=products.concat(data.products);pages=data.pages;}}catch{}
 return [...pages,...products.map(p=>({url:`https://ibazzzar.com/products/${p.slug}`}))];
}
