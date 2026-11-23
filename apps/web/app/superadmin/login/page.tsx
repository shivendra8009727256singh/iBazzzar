import Image from 'next/image';
import {Logo} from '@/components/logo';
import {SuperAdminLoginForm} from '@/components/auth/superadmin-login-form';
export const metadata={title:'Super Admin sign in',robots:{index:false,follow:false}};
export default function Page(){
 return <div className="auth-layout superadmin-auth">
  <section className="auth-brand"><Image src="/images/mall-concept.webp" alt="" fill sizes="50vw"/><div>
   <div className="logo-plate"><Logo size="hero"/></div>
   <span className="eyebrow" style={{color:'#dcc58e'}}>SUPER ADMIN ACCESS</span>
   <h1>The control room.</h1>
   <p>Reserved for the platform owner. Every action inside the console is logged and auditable.</p>
   <ul className="auth-points"><li>Full control of people, catalogue, commerce and finance</li><li>Grant and revoke staff roles</li><li>Platform settings and the audit trail</li></ul>
  </div></section>
  <div className="auth-form"><SuperAdminLoginForm/></div>
 </div>;}
