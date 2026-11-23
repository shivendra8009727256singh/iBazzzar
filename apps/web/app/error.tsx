'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <section className="container section empty"><h1>Let’s try that again.</h1><p>The service is temporarily unavailable. Your saved bag stays on this device.</p><button className="button primary" onClick={reset}>Try again</button></section>;}
