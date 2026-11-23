'use client';
import Image from 'next/image';
import Link from 'next/link';
import {useState} from 'react';
// Official artwork, margins trimmed only. Never redraw or recolour it; dark surfaces must sit it on an ivory plate.
const LOGO={src:'/branding/ibazzzar-logo.png',width:1621,height:685};
export function Logo({size='header',priority=size==='header'}:{size?:'header'|'footer'|'hero';priority?:boolean}){const [missing,setMissing]=useState(false);return <Link href="/" aria-label="IBazzzar home" className={`logo logo-${size}`}>{missing?<span className="logo-fallback"><strong>iBazzzar</strong><small>INTELLIGENT DIGITAL MALL</small></span>:<Image src={LOGO.src} alt="iBazzzar — Intelligent Digital Mall" width={LOGO.width} height={LOGO.height} sizes={size==='hero'?'320px':'220px'} onError={()=>setMissing(true)} priority={priority}/>}</Link>;}
