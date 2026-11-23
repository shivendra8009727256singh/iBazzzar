import type {Metadata} from 'next';
import './globals.css';
import {Providers} from '@/components/providers';
import {Header} from '@/components/header';
import {Footer} from '@/components/footer';
import {Assistant} from '@/components/assistant';
export const metadata:Metadata={metadataBase:new URL('https://ibazzzar.com'),title:{default:'IBazzzar — Intelligent Digital Mall',template:'%s | IBazzzar'},description:'Discover thoughtful everyday finds and smarter business sourcing in one digital mall.',robots:{index:false,follow:false}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><Providers><a className="skip-link" href="#main">Skip to content</a><Header/><main id="main">{children}</main><Footer/><Assistant/></Providers></body></html>;}
