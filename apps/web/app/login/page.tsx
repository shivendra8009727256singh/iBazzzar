import Image from 'next/image';
import {Logo} from '@/components/logo';
import {LoginForm,type Portal} from '@/components/auth/login-form';
export const metadata={title:'Sign in'};
const panels:Record<Portal,[string,string,string]>={shopper:['A WORLD WAITING TO BE DISCOVERED','Your everyday. Reimagined.','From thoughtful little finds to your next big business idea.'],business:['IBAZZZAR FOR BUSINESS','Smarter sourcing.','Quotations, approvals and purchase orders in one place.'],seller:['SELLER HUB','Your store. A bigger marketplace.','Reach shoppers and business buyers across India.'],staff:['MARKETPLACE OPERATIONS','Run the mall.','Moderation, support and finance for the IBazzzar team.']};
export default async function Page({searchParams}:{searchParams:Promise<{portal?:string;next?:string}>}){const {portal,next}=await searchParams;const p=(portal&&portal in panels?portal:'shopper') as Portal;const [eyebrow,title,copy]=panels[p];
 return <div className="auth-layout"><section className="auth-brand"><Image src="/images/mall-concept.webp" alt="" fill sizes="50vw"/><div><div className="logo-plate"><Logo size="hero"/></div><span className="eyebrow" style={{color:'#dcc58e'}}>{eyebrow}</span><h1>{title}</h1><p>{copy}</p></div></section><div className="auth-form"><LoginForm initialPortal={p} next={next??null}/></div></div>;}
