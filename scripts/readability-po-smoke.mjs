// UI checks use an isolated in-memory API; never modify the running project's data.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createApp} from '../apps/api/src/app.js';
import {MemoryRepository} from '../apps/api/src/repository.js';
import {hashPassword} from '../apps/api/src/security.js';
const base=process.env.SMOKE_BASE_URL||'http://127.0.0.1:3000',store=new MemoryRepository(),stamp=new Date().toISOString();
const user={id:'ui-po-buyer',name:'Business Buyer',email:'po-ui@example.test',passwordHash:await hashPassword('UI-preview-password!'),role:'CUSTOMER',organizationId:'ui-org',organizationRole:'OWNER',createdAt:stamp};
await store.put('organizations',{id:'ui-org',name:'UI Test Business',ownerId:user.id,status:'PENDING',createdAt:stamp});await store.put('users',user);
await store.put('purchaseOrders',{id:'ui-purchase-order',organizationId:'ui-org',quoteId:'ui-quote',sellerId:'s1',requestedBy:user.id,approvedBy:user.id,status:'CONFIRMED_BY_SELLER',totalPaise:1500000,snapshot:{productId:'p1',quantity:10,pricePaise:150000,terms:'Agreed quotation'},history:[],createdAt:stamp});
const server=createApp({store,config:{origin:base,demo:true}}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const target=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({channel:'msedge',headless:true});
await mkdir('.local/screenshots',{recursive:true});const checks=[],errors=[];
const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/**',async route=>{const url=new URL(route.request().url());const response=await route.fetch({url:target+url.pathname+url.search});await route.fulfill({response});});
async function overflow(){return page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>innerWidth+1;}).slice(0,12).map(e=>({tag:e.tagName,class:e.className,right:Math.round(e.getBoundingClientRect().right)}))}));}
try{
 await page.goto(base,{waitUntil:'networkidle'});
 assert.equal(await page.evaluate(()=>getComputedStyle(document.body).fontSize),'16px');
 assert.ok(await page.locator('.hero p').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=16));
 await page.screenshot({path:'.local/screenshots/readability-desktop.png',fullPage:true});
 for(const width of [360,390,430,768,1024,1440,1920]){await page.setViewportSize({width,height:1000});const o=await overflow();assert.ok(o.scroll<=o.width,JSON.stringify(o));}
 checks.push('Larger homepage typography, seven viewport widths');
 for(const path of ['/products','/products/aura-wireless-headphones','/cart','/login','/wholesale','/deals','/brands','/help']){
  await page.goto(base+path,{waitUntil:'networkidle'});
  for(const width of [360,768,1440]){await page.setViewportSize({width,height:1000});const o=await overflow();assert.ok(o.scroll<=o.width,`${path}: ${JSON.stringify(o)}`);}
 }
 checks.push('Eight secondary pages without overflow at three widths');
 await page.goto(base+'/login');await page.getByLabel('Email address').fill(user.email);await page.getByLabel('Password',{exact:true}).fill('UI-preview-password!');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL('**/account');
 await page.goto(base+'/business');await page.getByRole('tab',{name:'Purchase orders',exact:true}).click();await page.getByText('Place order at agreed price',{exact:true}).click();
 await page.getByLabel('Delivery street address').fill('12 Test Business Road');await page.getByLabel('Delivery city').fill('Delhi');await page.getByLabel('Delivery state').fill('Delhi');await page.getByLabel('Delivery PIN code').fill('110001');await page.getByLabel('Delivery mobile number').fill('9876543210');await page.getByLabel('I confirm the delivery details and agree to create this order at the approved quotation price.').check();
 await page.setViewportSize({width:390,height:844});const poLayout=await overflow();assert.ok(poLayout.scroll<=poLayout.width,JSON.stringify(poLayout));await page.screenshot({path:'.local/screenshots/po-checkout-mobile.png',fullPage:true});
 assert.equal(await page.getByLabel('Delivery city').evaluate(e=>getComputedStyle(e).fontSize),'16px');
 await page.getByRole('button',{name:'Create order & continue to payment'}).click();await page.waitForURL('**/account/orders/*');await page.getByText('Awaiting payment',{exact:true}).first().waitFor();
 const [order]=await store.all('orders');assert.equal(order.totalPaise,1500000);assert.equal((await store.get('products','p1')).stock,22);
 await page.getByRole('button',{name:'Simulate test payment'}).click();await page.getByText('Confirmed',{exact:true}).first().waitFor();
 await page.goto(base+'/business');await page.getByRole('tab',{name:'Purchase orders',exact:true}).click();await page.getByRole('link',{name:'View order & payment'}).waitFor();
 checks.push('Mobile PO address form → negotiated order → demo payment → linked PO');
 await page.goto(base);await page.screenshot({path:'.local/screenshots/readability-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);checks.push('No browser runtime errors');console.log(JSON.stringify({passed:true,checks},null,2));await writeFile('.local/readability-po-result.json',JSON.stringify({passed:true,checks,at:new Date().toISOString()},null,2));
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
