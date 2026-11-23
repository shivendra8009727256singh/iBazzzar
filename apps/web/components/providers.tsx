'use client';
import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {QueryClient,QueryClientProvider,useQuery} from '@tanstack/react-query';
import {api} from '@/lib/api';
import type {CartItem,Product,User} from '@/lib/types';
type Shop={cart:CartItem[];wishlist:string[];mode:'retail'|'business';ready:boolean;setMode:(mode:'retail'|'business')=>void;add:(p:Product,quantity?:number)=>void;quantity:(id:string,n:number)=>void;clear:()=>void;wish:(id:string)=>void;notify:(s:string)=>void;saved:CartItem[];saveForLater:(id:string)=>void;moveToBag:(id:string)=>void;removeSaved:(id:string)=>void};
const Context=createContext<Shop|null>(null);
export const useShop=()=>useContext(Context)!;
export const useUser=()=>useQuery({queryKey:['user'],queryFn:()=>api<{user:User}>('/auth/me').then(d=>d.user),retry:false,staleTime:30_000});
export function Providers({children}:{children:ReactNode}){
 const [client]=useState(()=>new QueryClient({defaultOptions:{queries:{retry:1,refetchOnWindowFocus:false}}}));
 const [cart,setCart]=useState<CartItem[]>([]),[wishlist,setWishlist]=useState<string[]>([]),[mode,setMode]=useState<'retail'|'business'>('retail'),[ready,setReady]=useState(false),[message,setMessage]=useState(''),[saved,setSaved]=useState<CartItem[]>([]);
 useEffect(()=>{try{const s=JSON.parse(localStorage.getItem('ibazzzar.shop')||'{}'),valid=(i:CartItem)=>typeof i?.productId==='string'&&Number.isInteger(i.quantity)&&i.quantity>0&&i.quantity<=10000;if(Array.isArray(s.cart))setCart(s.cart.filter(valid));if(Array.isArray(s.saved))setSaved(s.saved.filter(valid));if(Array.isArray(s.wishlist))setWishlist(s.wishlist.filter((x:unknown)=>typeof x==='string'));if(s.mode==='business')setMode('business');}catch{}setReady(true);},[]);
 useEffect(()=>{if(ready)try{localStorage.setItem('ibazzzar.shop',JSON.stringify({cart,wishlist,mode,saved}));}catch{}},[cart,wishlist,mode,saved,ready]);
 useEffect(()=>{if(message){const timer=setTimeout(()=>setMessage(''),4000);return()=>clearTimeout(timer);}},[message]);
 const add=(p:Product,quantity=1)=>{if(p.stock<quantity){setMessage('This quantity is unavailable');return;}setCart(items=>{const old=items.find(i=>i.productId===p.id);const n=Math.min((old?.quantity||0)+quantity,p.stock);return old?items.map(i=>i.productId===p.id?{...i,quantity:n}:i):[...items,{productId:p.id,quantity:n}];});setMessage(`${p.name} added to your bag`);};
 const saveForLater=(id:string)=>{const item=cart.find(i=>i.productId===id);if(!item)return;setCart(items=>items.filter(i=>i.productId!==id));setSaved(list=>[...list.filter(i=>i.productId!==id),item]);setMessage('Saved for later');};
 const moveToBag=(id:string)=>{const item=saved.find(i=>i.productId===id);if(!item)return;setSaved(list=>list.filter(i=>i.productId!==id));setCart(items=>items.some(i=>i.productId===id)?items:[...items,item]);setMessage('Moved to your bag');};
 return <QueryClientProvider client={client}><Context.Provider value={{cart,wishlist,mode,ready,setMode,add,quantity:(id,n)=>setCart(items=>n<1?items.filter(i=>i.productId!==id):items.map(i=>i.productId===id?{...i,quantity:Math.min(10000,Math.floor(n))}:i)),clear:()=>setCart([]),wish:id=>setWishlist(items=>items.includes(id)?items.filter(i=>i!==id):[...items,id]),notify:setMessage,saved,saveForLater,moveToBag,removeSaved:id=>setSaved(list=>list.filter(i=>i.productId!==id))}}>{children}{message&&<div className="toast" role="status">{message}</div>}</Context.Provider></QueryClientProvider>;
}
