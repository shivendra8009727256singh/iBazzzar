import {notFound} from 'next/navigation';
import {serverApi} from '@/lib/api';
import type {Product,Review} from '@/lib/types';
import {ProductDetail} from '@/components/product-detail';
import type {Variant} from '@/components/product-detail';
export const dynamic='force-dynamic';
type Detail={product:Product;seller:{name:string};reviews:Review[];variants:Variant[]};
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const {slug}=await params;try{const {product}=await serverApi<Detail>(`/products/${encodeURIComponent(slug)}`);return {title:product.name,description:product.description.slice(0,160),alternates:{canonical:`/products/${product.slug}`},openGraph:{title:product.name,description:product.description.slice(0,160),images:[product.image],type:'website'}};}catch{return {title:'Product unavailable'};}}
export default async function Page({params}:{params:Promise<{slug:string}>}){
 const {slug}=await params;let data:Detail;try{data=await serverApi<Detail>(`/products/${encodeURIComponent(slug)}`);}catch{notFound();}
 const {product:p}=data;let related:Product[]=[];try{related=(await serverApi<{products:Product[]}>(`/products?category=${encodeURIComponent(p.category)}`)).products.filter(r=>r.id!==p.id).slice(0,4);}catch{}
 const url=`https://ibazzzar.com/products/${p.slug}`;
 // Structured data mirrors only what the page shows; ratings appear only when verified reviews exist.
 const jsonLd=[{'@context':'https://schema.org','@type':'Product',name:p.name,image:(p.images?.length?p.images:[p.image]).map(i=>`https://ibazzzar.com${i}`),description:p.description,brand:{'@type':'Brand',name:p.brand},sku:p.id,offers:{'@type':'Offer',url,priceCurrency:'INR',price:(p.pricePaise/100).toFixed(2),availability:p.stock>0?'https://schema.org/InStock':'https://schema.org/OutOfStock',seller:{'@type':'Organization',name:data.seller.name}},...(p.rating?{aggregateRating:{'@type':'AggregateRating',ratingValue:p.rating.average,reviewCount:p.rating.count}}:{})},{'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'All products',item:'https://ibazzzar.com/products'},{'@type':'ListItem',position:2,name:p.category,item:`https://ibazzzar.com/products?category=${encodeURIComponent(p.category)}`},{'@type':'ListItem',position:3,name:p.name,item:url}]}];
 return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(jsonLd).replace(/</g,'\\u003c')}}/><ProductDetail product={p} sellerName={data.seller.name} reviews={data.reviews} related={related} variants={data.variants}/></>;
}
