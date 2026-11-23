'use client';
import {useState,type ComponentType} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useQueryClient} from '@tanstack/react-query';
import {LayoutDashboard,Users,Building2,Store,BadgeCheck,FolderTree,Tags,Package,Boxes,Images,ShoppingCart,Handshake,Truck,Undo2,TicketPercent,CreditCard,ReceiptIndianRupee,Landmark,Newspaper,Bell,LifeBuoy,FileSpreadsheet,ScrollText,ShieldCheck,Settings as Cog,Menu,X,LogOut,ArrowUpRight} from 'lucide-react';
import {can,isStaff,staffRoles} from '@ibazzzar/shared';
import {post} from '@/lib/api';
import {Logo} from '../logo';
import {useUser} from '../providers';
import {Customers,Sellers,Organizations,Approvals,Staff} from './people';
import {Categories,Brands,Products,Inventory,Media} from './catalogue';
import {Orders,B2B,Shipping,Returns,Coupons} from './commerce';
import {Payments,Refunds,Settlements} from './finance';
import {Overview,Content,Notifications,Support,Reports,Audit,Settings} from './platform';

type Section={id:string;label:string;icon:typeof Users;cap:string;view:ComponentType<{go:(s:string)=>void}>};
const groups:[string,Section[]][]=[
 ['',[{id:'overview',label:'Overview',icon:LayoutDashboard,cap:'dashboard',view:Overview}]],
 ['People',[{id:'customers',label:'Customers',icon:Users,cap:'users.view',view:Customers},{id:'organizations',label:'Business buyers',icon:Building2,cap:'users.view',view:Organizations},{id:'sellers',label:'Sellers',icon:Store,cap:'users.view',view:Sellers},{id:'approvals',label:'Approvals',icon:BadgeCheck,cap:'approvals.manage',view:Approvals}]],
 ['Catalogue',[{id:'categories',label:'Categories',icon:FolderTree,cap:'catalogue.manage',view:Categories},{id:'brands',label:'Brands',icon:Tags,cap:'catalogue.manage',view:Brands},{id:'products',label:'Products',icon:Package,cap:'catalogue.manage',view:Products},{id:'inventory',label:'Inventory',icon:Boxes,cap:'catalogue.manage',view:Inventory},{id:'media',label:'Media library',icon:Images,cap:'media.manage',view:Media}]],
 ['Commerce',[{id:'orders',label:'Orders',icon:ShoppingCart,cap:'orders.view',view:Orders},{id:'b2b',label:'RFQs & quotations',icon:Handshake,cap:'b2b.view',view:B2B},{id:'shipping',label:'Shipping',icon:Truck,cap:'orders.view',view:Shipping},{id:'returns',label:'Returns',icon:Undo2,cap:'returns.manage',view:Returns},{id:'coupons',label:'Promotions & coupons',icon:TicketPercent,cap:'promotions.manage',view:Coupons}]],
 ['Finance',[{id:'payments',label:'Payments',icon:CreditCard,cap:'finance.view',view:Payments},{id:'refunds',label:'Refunds',icon:ReceiptIndianRupee,cap:'finance.view',view:Refunds},{id:'settlements',label:'Commissions & settlements',icon:Landmark,cap:'finance.view',view:Settlements}]],
 ['Platform',[{id:'content',label:'Homepage CMS',icon:Newspaper,cap:'cms.manage',view:Content},{id:'notifications',label:'Notifications',icon:Bell,cap:'notifications.send',view:Notifications},{id:'support',label:'Support',icon:LifeBuoy,cap:'support.manage',view:Support},{id:'reports',label:'Reports',icon:FileSpreadsheet,cap:'reports.view',view:Reports},{id:'audit',label:'Audit log',icon:ScrollText,cap:'audit.view',view:Audit},{id:'staff',label:'Staff roles',icon:ShieldCheck,cap:'staff.manage',view:Staff},{id:'settings',label:'Settings',icon:Cog,cap:'settings.manage',view:Settings}]],
];

export function AdminConsole({section}:{section:string|null}){
 const {data:user,isPending}=useUser(),router=useRouter(),client=useQueryClient(),[menu,setMenu]=useState(false);
 if(isPending)return <div className="container section">Opening the console…</div>;
 if(!user||!isStaff(user.role))return <section className="container section empty"><ShieldCheck size={42}/><h1>Marketplace staff only.</h1><p>The admin console is for IBazzzar staff. Access is granted by a Super Admin.</p><Link className="button primary" href="/login?portal=staff&next=/admin">Staff sign-in</Link><p className="muted" style={{marginTop:14}}>Super Admin? <Link className="text-button" href="/superadmin/login">Use the Super Admin portal</Link></p></section>;
 const allowed=groups.map(([g,items])=>[g,items.filter(i=>can(user.role,i.cap))] as [string,Section[]]).filter(([,items])=>items.length);
 const flat=allowed.flatMap(([,items])=>items),current=flat.find(s=>s.id===section)??flat[0],View=current.view;
 const go=(id:string)=>{setMenu(false);router.push(`/admin/${id}`);};
 const blocked=section&&!flat.some(s=>s.id===section);
 return <div className="console">
  <aside className={`console-nav ${menu?'open':''}`} aria-label="Admin sections"><div className="console-brand"><Logo size="footer" priority={false}/><span className="console-role">{staffRoles[user.role as keyof typeof staffRoles].label}</span></div>
   <nav>{allowed.map(([group,items])=><div key={group||'main'} className="console-group">{group&&<span className="console-group-label">{group}</span>}{items.map(s=><Link key={s.id} href={`/admin/${s.id}`} onClick={()=>setMenu(false)} className={s.id===current.id?'active':''} aria-current={s.id===current.id?'page':undefined}><s.icon size={17}/>{s.label}</Link>)}</div>)}</nav>
   <div className="console-foot"><span>{user.name}</span><Link href="/" className="text-link">Storefront <ArrowUpRight size={13}/></Link><button className="text-link" onClick={async()=>{await post('/auth/logout',{});client.setQueryData(['user'],null);client.clear();router.push(user.role==='ADMIN'?'/superadmin/login':'/login?portal=staff');}}><LogOut size={14}/> Sign out</button></div></aside>
  <div className="console-main"><button className="console-menu button outline small" onClick={()=>setMenu(!menu)} aria-expanded={menu}>{menu?<X size={16}/>:<Menu size={16}/>} {current.label}</button>
   {blocked&&<p className="notice">Your role ({staffRoles[user.role as keyof typeof staffRoles].label}) doesn’t include that section, so you’re seeing {current.label} instead.</p>}
   <View go={go}/></div>
 </div>;}
