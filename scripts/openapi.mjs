// Regenerates docs/api/openapi.yaml from the Express route table. Run after adding routes: node scripts/openapi.mjs
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const summaries={
 'get /api/health':'Service status, storage mode and which integrations are configured',
 'get /api/categories':'Department list','get /api/brands':'Brands with sellable products','get /api/sellers':'Approved sellers',
 'get /api/products':'Catalogue search (q, category, brand, seller, max, minRating, inStock, sort, page)','get /api/products/:slug':'Product, seller and verified reviews',
 'get /api/search/suggest':'Autocomplete: products, brands, sellers, departments','get /api/offers':'Live public coupon campaigns','get /api/reviews/recent':'Latest verified reviews','get /api/cms':'Published CMS sections',
 'post /api/products/:id/reviews':'Publish a verified review (requires a delivered order)',
 'post /api/auth/register':'Create a customer, business-buyer or seller account (accountType) with its pending organisation or store, and a session','post /api/auth/login':'Sign in (locks the account for 15 minutes after 5 wrong passwords)','post /api/auth/logout':'End the session','get /api/auth/me':'Current user','post /api/auth/password':'Change password and sign out other sessions',
 'get /api/account/addresses':'Saved addresses','post /api/account/addresses':'Save an address (max 10)','delete /api/account/addresses/:id':'Remove an address','get /api/account/returns':'My returns and refunds',
 'get /api/notifications':'In-app notifications','post /api/notifications/read':'Mark all notifications read',
 'post /api/cart/price':'Authoritative cart pricing with optional coupon','post /api/checkout':'Create an order (Idempotency-Key header required)',
 'get /api/orders':'My orders','get /api/orders/:id':'One of my orders','post /api/orders/:id/cancel':'Cancel an unpaid order and release stock',
 'post /api/orders/:id/payment':'Create a Razorpay test-mode order','post /api/orders/:id/payment/verify':'Verify Razorpay checkout signature and confirm',
 'post /api/orders/:id/demo-payment':'Simulate payment (demo mode only; no money moves)','post /api/orders/:id/returns':'Request a return for one seller’s delivered items',
 'post /api/payments/webhook':'Razorpay webhook (HMAC verified, deduplicated by event ID)',
 'get /api/support/tickets':'My support tickets','post /api/support/tickets':'Open a ticket','post /api/support/tickets/:id/messages':'Reply on my ticket',
 'get /api/support/queue':'All tickets (support staff)','post /api/support/queue/:id/messages':'Reply as support','patch /api/support/queue/:id':'Open or close a ticket',
 'post /api/business/register':'Apply for a business account (becomes OWNER)','get /api/business/overview':'Organisation, RFQs, quotes, POs and members',
 'post /api/business/rfqs':'Request a quotation','post /api/business/quotes/:id/accept':'Accept a quote and create a purchase order','post /api/business/quotes/:id/reject':'Decline a quote',
 'post /api/business/purchase-orders/:id/approve':'Approve a PO (OWNER/APPROVER; separation of duties)','post /api/business/purchase-orders/:id/reject':'Reject a PO with a reason',
 'post /api/business/purchase-orders/:id/checkout':'Convert a seller-confirmed PO to one awaiting-payment order at negotiated prices (requester or OWNER; validated address body; retries deduplicated per PO)',
 'post /api/business/members':'Add an existing account as BUYER or APPROVER','delete /api/business/members/:id':'Remove a member','patch /api/business/settings':'Set the PO auto-approval threshold',
 'post /api/seller/register':'Apply to sell','get /api/seller/overview':'Store, products, own order lines, RFQs, POs, returns and ledger',
 'post /api/seller/products':'Submit a product for moderation','patch /api/seller/products/:id':'Edit a product (content edits re-enter moderation)',
 'post /api/seller/orders/:id/fulfillment':'Advance my shipment (PACKED, SHIPPED with carrier, DELIVERED, CANCELLED)','post /api/seller/returns/:id/decision':'Approve or decline a return',
 'post /api/seller/rfqs/:id/quotes':'Submit or revise a quotation','post /api/seller/purchase-orders/:id/confirm':'Confirm an approved purchase order',
 'get /api/admin/overview':'Calculated marketplace metrics and queues','patch /api/admin/:kind/:id/status':'Approve, reject or suspend sellers, products, organisations',
 'post /api/admin/coupons':'Create a coupon campaign','patch /api/admin/coupons/:id':'Activate or pause a coupon','put /api/admin/settings/commission':'Set commission rate (basis points)',
 'post /api/admin/returns/:id/decision':'Decide any return','post /api/admin/refunds/:id/record':'Record a provider-issued refund (rfnd_ reference)',
 'get /api/admin/users':'All users','patch /api/admin/users/:id/role':'Grant CUSTOMER, SUPPORT or ADMIN','put /api/admin/cms/:id':'Save a versioned CMS section',
 'post /api/auth/password-reset/request':'Email a 30-minute reset link (same response whether or not the account exists)','post /api/auth/password-reset/confirm':'Set a new password with a reset token; signs out every session',
 'post /api/seller/media':'Upload a product photo (raw JPEG/PNG/WebP body, max 5 MB; re-encoded to WebP)','get /api/seller/media':'My store media library','get /api/media/:file':'Serve an uploaded product image',
 'post /api/seller/staff':'Add an existing account as store staff','delete /api/seller/staff/:id':'Remove a staff member',
 'post /api/auth/verify-email':'Confirm an email address with a single-use token','post /api/auth/verify-email/resend':'Send a new email confirmation link',
 'get /api/admin/me':'Current staff role and its label','get /api/admin/dashboard':'Calculated metrics, review queues, 30-day series and top sellers (money hidden without finance access)',
 'get /api/admin/users':'Search and filter accounts (q, role, status, type, staff, page)','get /api/admin/users/:id':'Account detail: orders, tickets, memberships and activity','patch /api/admin/users/:id/status':'Suspend or restore an account with a reason; suspension ends every session','post /api/admin/users/:id/unlock':'Clear a sign-in lockout',
 'get /api/admin/sellers':'Stores with owner, catalogue size and payable balance','get /api/admin/organizations':'Business buyers with members and purchase orders',
 'get /api/admin/categories':'Categories with product counts, including hidden ones','post /api/admin/categories':'Add a category','patch /api/admin/categories/:id':'Rename, describe, reorder or hide a category (renames carry products and stores)','get /api/admin/brands':'Brands derived from listings',
 'get /api/admin/products':'All listings with filters (q, status, category, stock=low, page)','patch /api/admin/products/:id':'Feature or unfeature a live listing on the homepage',
 'get /api/admin/orders':'All orders with filters (q, status, payment, page)','get /api/admin/orders/:id':'Order detail with customer, shipments, returns, refunds and tickets','post /api/admin/orders/:id/cancel':'Cancel an unpaid order with a reason and release stock',
 'get /api/admin/b2b':'RFQs, quotations and purchase orders across the marketplace','get /api/admin/shipping':'Shipment counts, carriers used and open shipments','get /api/admin/returns':'All return requests','get /api/admin/coupons':'All coupons',
 'get /api/admin/payments':'Payment totals by status, provider orders and webhook events','get /api/admin/finance':'Seller balances, ledger and refunds','post /api/admin/payouts':'Record a payout already made (Razorpay payout ID or bank UTR), never above the payable balance',
 'get /api/admin/cms':'Editable homepage sections and featured products','get /api/admin/media':'Every seller upload and where it is used','delete /api/admin/media/:id':'Remove an image from the library and its listings, with a reason',
 'post /api/admin/notifications':'Send an in-app notification to an audience','get /api/admin/reports/:kind':'CSV export: orders, ledger, users or products','get /api/admin/audit':'Searchable, paginated audit log',
 'get /api/admin/settings':'Platform settings','put /api/admin/settings':'Update commission, return window, payment window and low-stock threshold',
 'post /api/newsletter':'Subscribe with explicit consent','post /api/newsletter/unsubscribe':'Unsubscribe with token'};
const access=guards=>guards.find(g=>g.startsWith('staff:'))?.replace('staff:','staff with ')??(guards.includes('support')?'support':guards.includes('sellerOwner')?'store owner':guards.includes('owner')?'organisation owner':guards.includes('business')?'business member':guards.includes('seller')?'approved seller':guards.includes('auth')?'signed in':'public');
const routes=[];
// Guards are either plain names (auth, seller) or capability checks written as staff('capability').
for(const file of ['apps/api/src/app.js','apps/api/src/operations.js','apps/api/src/admin.js'])for(const m of (await readFile(file,'utf8')).matchAll(/app\.(get|post|put|patch|delete)\('([^']+)'((?:,(?:staff\('[a-z.]+'\)|[a-zA-Z]+))*)/g))routes.push({method:m[1],path:m[2],guards:m[3].replace(/staff\('([a-z.]+)'\)/g,'staff:$1').split(',').filter(Boolean)});
const missing=routes.filter(r=>!summaries[`${r.method} ${r.path}`]);if(missing.length)throw new Error(`Add summaries for: ${missing.map(r=>`${r.method} ${r.path}`).join(', ')}`);
const byPath=new Map();for(const r of routes){const p=r.path.replace(/:([a-zA-Z]+)/g,'{$1}');if(!byPath.has(p))byPath.set(p,[]);byPath.get(p).push(r);}
let y=`# Generated by scripts/openapi.mjs — do not edit by hand.\nopenapi: 3.1.0\ninfo:\n  title: IBazzzar API\n  version: 0.2.0\n  description: |\n    Same-origin JSON API behind the Next.js /api rewrite. Sessions use the HTTP-only ib_session cookie.\n    Every non-GET request must carry an Origin header equal to WEB_ORIGIN. Request bodies are validated with the Zod schemas in packages/validation.\n    Money is integer paise. Errors are {"error": "message"} with 400/401/403/404/409/503 status codes.\nservers:\n  - url: http://127.0.0.1:4000\ncomponents:\n  securitySchemes:\n    session:\n      type: apiKey\n      in: cookie\n      name: ib_session\npaths:\n`;
for(const [path,list] of [...byPath].sort()){y+=`  ${path}:\n`;for(const r of list){const who=access(r.guards);y+=`    ${r.method}:\n      summary: ${JSON.stringify(summaries[`${r.method} ${r.path}`])}\n      x-access: ${who}\n`;const params=[...path.matchAll(/\{(\w+)\}/g)].map(m=>m[1]);if(params.length)y+=`      parameters:\n${params.map(p=>`        - {name: ${p}, in: path, required: true, schema: {type: string}}`).join('\n')}\n`;if(who!=='public')y+=`      security: [{session: []}]\n`;y+=`      responses:\n        '200': {description: OK}\n`;}}
await mkdir('docs/api',{recursive:true});await writeFile('docs/api/openapi.yaml',y);console.log(`Wrote ${routes.length} operations to docs/api/openapi.yaml`);
