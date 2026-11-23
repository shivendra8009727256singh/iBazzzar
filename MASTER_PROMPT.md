# IBazzzar.com — ULTIMATE FULL-STACK E-COMMERCE MASTER PROMPT

## YOUR ROLE

Act as an elite multidisciplinary software engineering and product design team consisting of:

- Principal Software Architect
- Senior Next.js Engineer
- Senior Node.js Engineer
- PostgreSQL Database Architect
- E-Commerce Marketplace Domain Expert
- Enterprise B2B Commerce Specialist
- Luxury UI/UX Design Director
- Senior Motion Designer
- Security Engineer
- Quality Assurance Automation Engineer
- SEO and Performance Engineer
- DevOps and Deployment Engineer

You are responsible for designing, developing, integrating, testing, documenting, and preparing a complete production-grade full-stack e-commerce platform.

**Project Name: IBazzzar**

**Domain: https://ibazzzar.com**

**Official Tagline: Intelligent Digital Mall**

**Business Model: Multi-Vendor B2B + B2C Marketplace**

**Primary Market: India**

**Brand Positioning: Premium, Intelligent, Futuristic, Trustworthy, Accessible, Fast.**

The ambition is to deliver an e-commerce user experience that competes with and aims to exceed the design quality, usability, product discovery, and shopping convenience users expect from platforms like Flipkart, Meesho, and Amazon.

Do not copy their proprietary designs, assets, branding, or source code. Study their general commerce interaction patterns conceptually and design an original, superior IBazzzar experience.

THIS IS NOT A STATIC WEBSITE PROJECT.

This must become a real commerce platform with functional customer journeys, seller onboarding, inventory, authentication, B2B procurement, payments, order management, administration, testing, and deployment readiness.

---

# PART 1 — BRAND IDENTITY AND STRICT DESIGN RULES

## 1.1 THE OFFICIAL LOGO

The user provides the official IBazzzar logo.

Expected local path:

public/branding/ibazzzar-logo.png

The logo visually consists of:

- A premium shopping bag emblem
- Metallic gold handle and details
- A deep emerald-green shopping bag
- A gold "iB" monogram
- Dark green "iBazzzar" wordmark
- Gold tagline "INTELLIGENT DIGITAL MALL"
- Light original background

CRITICAL INSTRUCTIONS:

1. Preserve the supplied official logo.
2. Never redesign its text, emblem, proportions, or letter spacing.
3. Never recreate the logo with AI.
4. Do not use a generic shopping-bag replacement as the actual brand logo.
5. Maintain its original aspect ratio.
6. Use the original asset in the website header, footer, authentication pages, and appropriate brand sections.
7. Because the original logo has a light background, use it on an ivory/white brand surface where appropriate.
8. If a transparent or dark-background version is needed, use an approved asset or request an alternate logo file. Do not silently generate an inaccurate variant.
9. Ensure the logo remains readable on desktop, tablet, and mobile.
10. Create a reusable Logo component that references the original asset.

The logo is the visual source of truth.

## 1.2 OFFICIAL COLOR SYSTEM

Replace all previous blue/cyan Midnight Robotics styling.

Use this palette:

Primary Emerald: #092C20

Secondary Forest Green: #174B37

Deep Green: #061E16

Metallic Gold: #C99A3D

Light Gold: #E7BE67

Luxury Ivory: #F8F4E8

White: #FFFFFF

Dark Text: #14251B

Muted Text: #66766D

Soft Border: #DFE4DA

Error: Accessible dark red

Success: Accessible emerald/green

Warning: Accessible amber

These are starting design tokens based on the provided brand identity. Verify accessible contrast and adjust supporting shades where necessary without changing the brand character.

## 1.3 STYLE DIRECTION

Design style:

**Royal Emerald Commerce + Intelligent Robotic Luxury**

The website must feel:

- Luxurious but welcoming
- Futuristic but believable
- Premium but not visually excessive
- Fast and interactive
- Clean and easy to navigate
- Trustworthy for retail customers
- Professional for wholesale buyers
- Attractive for marketplace sellers

Use a balanced light/dark experience.

Recommended approach:

Public shopping pages:
- Luxury ivory and white for readable product areas
- Dark emerald for primary brand sections
- Gold for selected highlights and premium visual accents
- Green for primary brand actions, with accessible contrast

Hero and storytelling:
- Dark emerald environments
- Gold architectural illumination
- Photorealistic humanoid robots
- Premium mall interiors

Customer dashboards:
- Mostly light surfaces with elegant emerald navigation

Seller/Admin:
- Highly readable operational layouts
- Emerald sidebar accents
- Clean tables and charts
- No distracting animations

NEVER make every card black or every section green.

Maintain sophisticated visual rhythm and whitespace.

---

# PART 2 — ROBOTIC DIGITAL MALL EXPERIENCE

## 2.1 CENTRAL CREATIVE CONCEPT

IBazzzar should feel like a premium digital shopping mall where the VISUAL WORLD is inspired by intelligent robotic commerce.

The site showcases robots involved in:

- Welcoming customers
- Guiding shopping experiences
- Demonstrating products
- Organizing retail shelves
- Supporting warehouse operations
- Sorting products
- Scanning inventory
- Packaging parcels
- Assisting fulfillment
- Supporting delivery logistics

IMPORTANT HONESTY RULE:

These scenes represent a futuristic brand concept unless IBazzzar actually operates the depicted robotic infrastructure.

Do not falsely claim that IBazzzar owns autonomous robot warehouses, robot delivery fleets, or other automation facilities.

Any claims about actual delivery speed, quality assurance, seller verification, automation, or fulfillment guarantees must be supported by real operational capabilities.

## 2.2 ROBOT CHARACTER DESIGN

Create a consistent brand-inspired robot character specification.

Character concept:

An elegant, approachable, premium humanoid commerce assistant.

Visual details:
- White/ivory ceramic-like exterior
- Forest-green metallic accents
- Small warm-gold highlights
- Modern soft LED eyes
- Refined proportions
- Professional friendly posture
- Realistic materials and lighting
- No childish cartoon styling
- No aggressive military appearance

The robot should look like it belongs to the IBazzzar luxury brand.

Maintain consistency across all robotic brand illustrations.

## 2.3 ROBOTIC SCENE LIBRARY

Create or source appropriately licensed assets for:

1. Mall entrance with robot concierge
2. Electronics showroom with robot assistant
3. Fashion store with robotic display assistance
4. Grocery department with robots organizing shelves
5. Home and furniture showroom
6. Beauty product section
7. Industrial/wholesale storage
8. Smart inventory scanning
9. Automated packing demonstration
10. Logistics sorting scene
11. Futuristic last-mile delivery illustration
12. Seller marketplace command center
13. Business procurement experience
14. Customer support robot
15. Order-success robot
16. Robot mascot for onboarding and empty states

Each visual should match the green/gold/ivory design language.

Do not use random unrelated futuristic images.

Use original or appropriately licensed images.

If image generation services are unavailable, define the precise production prompts and media manifest, provide tasteful placeholders, and continue building the functional website.

Do not fabricate media files or claim images have been generated.

## 2.4 PRODUCT IMAGE RULES

Actual product images are different from brand storytelling images.

Product cards and product detail pages must show:
- Real product photographs
- Accurate colors and variants
- High resolution
- Neutral readable backgrounds where useful
- Clear image zoom
- Multiple product angles
- Seller-provided product media where appropriate

Never replace a real product photograph with a misleading robot-themed composite.

---

# PART 3 — COMPLETE TECHNOLOGY ARCHITECTURE

## 3.1 FRONTEND

Use:
- Next.js App Router
- TypeScript
- React
- Tailwind CSS
- shadcn/ui
- Radix primitives
- Lucide icons
- Motion for UI interactions
- GSAP only for controlled cinematic sections
- React Three Fiber only when meaningful
- TanStack Query
- Zod
- React Hook Form
- Next.js optimized images

Use supported stable dependency versions verified during setup.

## 3.2 BACKEND

Use:
- Node.js
- Express.js
- Native ESM JavaScript
- Prisma ORM
- PostgreSQL
- Redis
- BullMQ
- Zod
- Structured logging
- Secure authentication
- OpenAPI documentation
- Modular service/repository patterns where useful

Backend must be JavaScript ESM.

Do not use TypeScript or CommonJS in the Node backend.

## 3.3 ARCHITECTURE PRINCIPLES

Use a modular monolith initially.

Project organization:

apps/web — Next.js application

apps/api — Node.js Express API

apps/worker — background processing

packages/shared — shared contracts and utilities

packages/ui — reusable design system, if justified

packages/validation — shared validation contracts

docs — architecture and process documentation

infra — deployment configuration

Never introduce microservices merely for complexity.

Separate:
- UI and application logic
- Authentication and authorization
- Database access
- Checkout orchestration
- Pricing calculations
- Payment provider integration
- Shipping provider integration
- Background events
- Notification processing

Never duplicate business rules in frontend and backend.

## 3.4 DATABASE SAFETY

Create a brand-new isolated PostgreSQL database for this project.

Do not connect to, modify, migrate, reset, or seed an existing database unless the user explicitly authorizes the connection and operation.

Use separate development, automated-test, staging, and production configurations.

No destructive migration without explicit approval.

Use environment variables and secret management.

Never commit credentials.

---

# PART 4 — COMPLETE USER ROLES

Implement a robust permissions system.

Core roles:

1. Guest visitor
2. B2C customer
3. B2B organization owner
4. B2B buyer
5. B2B procurement approver
6. Seller owner
7. Seller staff
8. Marketplace support agent
9. Marketplace operations manager
10. Marketplace finance manager
11. Super Admin

One user may have multiple authorized roles.

A person can be a retail customer while also belonging to a business organization or seller store.

Role switching must not compromise authorization.

All sensitive authorization happens server-side.

Implement resource ownership and tenant isolation.

---

# PART 5 — COMPLETE PAGE-WISE WEBSITE DESIGN

## 5.1 PUBLIC HOMEPAGE

Create a stunning professional homepage following this hierarchy:

### SECTION 1 — UTILITY BAR

Content:
- Customer support
- Track order
- Sell on IBazzzar
- Business buying
- Location/delivery availability

Display only information supported by implemented features.

Use emerald background, ivory text and refined gold accents.

### SECTION 2 — PREMIUM STICKY HEADER

Logo:
Official IBazzzar logo.

Center:
Prominent fast global search bar.

Search placeholder:
"Search products, brands, sellers or bulk deals"

Navigation:
- Home
- All Categories
- Deals
- Brands
- Wholesale
- Become a Seller

Actions:
- Account
- Wishlist
- Cart
- Customer/business mode selection

Desktop:
Professional mega navigation.

Tablet:
Adaptive navigation.

Mobile:
Efficient search-first header, category access and accessible bottom navigation where appropriate.

### SECTION 3 — CINEMATIC HERO

Use a full-width luxurious robotic shopping mall scene.

Visual composition:
- Royal emerald and gold mall architecture
- A premium humanoid robot welcoming shoppers
- Human customers browsing
- Category display zones in background
- Realistic commercial interior

Headline:
"Welcome to the Future of Shopping"

Subheading:
"Discover everything you love, connect with sellers, and shop for yourself or your business — all in one intelligent digital mall."

Primary CTA:
"Explore Products"

Secondary CTA:
"Shop Wholesale"

Small tertiary CTA:
"Become a Seller"

Hero must load quickly.

No forced intro animation.

No heavy blocking video.

Ensure exceptional mobile cropping and text contrast.

### SECTION 4 — CUSTOMER VS BUSINESS CHOICE

Two sophisticated large cards.

Card A:
"Shop for Yourself"

Visual:
Robot assisting an individual shopper.

Features:
- Everyday essentials
- Multi-category shopping
- Retail offers
- Secure checkout

Card B:
"Buy for Your Business"

Visual:
Robot in premium wholesale warehouse.

Features:
- Wholesale catalogue
- Bulk prices
- MOQ
- Request Quotations
- Business procurement

Cards should navigate to distinct user experiences.

### SECTION 5 — DEPARTMENT EXPLORER

Build a visually stunning category grid.

Initial categories:
- Electronics
- Fashion
- Grocery
- Home and Living
- Beauty and Personal Care
- Furniture
- Industrial Supplies
- Office Supplies
- Automotive
- Sports
- Toys
- Smart Gadgets

Each category must feature relevant robotic store artwork and an obvious exploration action.

Create elegant hover animations.

On mobile, use appropriate responsive cards or scrollable rows.

### SECTION 6 — TRENDING PRODUCTS

Display real product cards with:
- Product image
- Name
- Brand
- Seller name
- Rating where verified reviews exist
- Retail price
- Discount if valid
- Stock status
- Wishlist
- Quick add
- Bulk availability if applicable

Tabs:
- Trending
- Best Sellers
- New Arrivals
- Deals

Do not fabricate ratings or sales counts in production.

### SECTION 7 — ROBOTIC COMMERCE STORY

Premium horizontal/scroll storytelling.

Stages:
1. Discover
2. Compare
3. Order
4. Fulfillment
5. Delivery

Use original futuristic robotics illustrations.

This is illustrative storytelling, not a claim of actual deployed robot operations.

Support reduced-motion mode.

### SECTION 8 — B2B WHOLESALE HUB

Large emerald/gold visual section.

Headline:
"Smarter Sourcing for Every Business"

Include:
- Bulk order catalogue
- MOQ-based pricing
- Request for Quotation
- Purchase Orders
- Business account management
- Tax-ready invoicing

CTA:
"Explore Wholesale"

Secondary:
"Request a Quote"

Visual:
Large-scale premium robotics-inspired warehouse.

### SECTION 9 — FLASH DEALS

Implement live promotional cards with:
- Valid sale periods
- Discount terms
- Eligible products
- Real countdown for scheduled campaigns
- Accurate pricing

Do not create fake urgency or fake timers.

### SECTION 10 — FEATURED SELLERS AND BRANDS

Display:
- Approved store profiles
- Brand logos
- Seller ratings if authentic
- Categories
- Seller storefront links

Strong trust-first design.

### SECTION 11 — SELL ON IBAZZZAR

Headline:
"Your Store. A Bigger Marketplace."

Explain:
- Retail + wholesale selling
- Seller catalogue tools
- Manage inventory
- Manage orders
- Track performance
- Marketplace growth opportunities

CTA:
"Become a Seller"

Use tasteful robotics-themed business imagery.

### SECTION 12 — CUSTOMER TRUST

Show operational trust elements supported by actual policies:
- Secure payments
- Clear returns
- Order tracking
- Seller information
- Customer support

Do not make unsupported delivery or verification guarantees.

### SECTION 13 — VERIFIED REVIEWS

Actual customer reviews, seller feedback, and business-buyer success stories where available.

No fabricated real-world testimonials.

### SECTION 14 — SHOPPING ASSISTANT

Create a premium robot assistant UI.

Initial functionality:
- Guided product discovery
- Category navigation
- FAQ responses
- Search assistance

If AI backend is not configured, use clearly defined basic guided assistance.

Do not impersonate a human support agent.

### SECTION 15 — NEWSLETTER

Email subscription with consent, unsubscribe capabilities and working backend storage.

### SECTION 16 — FOOTER

Include:
- Customer links
- Business links
- Seller links
- Help center
- Contact
- Legal policies
- Social links
- Brand logo
- Copyright

---

# PART 6 — B2C SHOPPING EXPERIENCE

Build a full retail shopping application.

## CATEGORY PAGES

- Relevant robotics-themed banner
- Category hierarchy
- Breadcrumbs
- Attribute filters
- Brand filters
- Price range
- Ratings filter where supported
- Seller filters
- Sort options
- Mobile filter drawer
- Product cards
- Pagination or accessible progressive loading

Filters must be functional, URL-driven where appropriate, and compatible with browser navigation.

## SEARCH EXPERIENCE

Build:
- Search autocomplete
- Search suggestions
- Recent search history with privacy controls
- Category-aware search
- Seller and brand matching
- Typo tolerance when feasible
- Fast query results
- No-result recommendations
- Search result filters

Use PostgreSQL-supported search initially.

Design a future search adapter for a dedicated engine if needed.

## PRODUCT DETAILS

Include:
- Image gallery
- Zoom
- Variants
- Seller information
- Price and offers
- Availability
- Delivery eligibility
- Quantity control
- Wishlist
- Add to Cart
- Buy Now
- B2B bulk pricing where allowed
- Product specifications
- Return policy
- Reviews
- Related products

If multiple sellers offer the same catalogue product, display offers clearly and never combine availability or pricing incorrectly.

## CART

Support:
- Guest cart
- Authenticated cart
- Cart merge after login where appropriate
- Multiple sellers
- Quantity validation
- Price recalculation
- Coupon validation
- Delivery estimates
- Order totals
- Saved for later

## CHECKOUT

Make checkout exceptionally simple.

Steps:
1. Address
2. Delivery method
3. Payment
4. Review and confirm

Use guest checkout where supported.

No surprise charges.

Show final amount and taxes transparently.

Support Razorpay test-mode integration initially.

Support Cash on Delivery only if enabled by seller, location and platform policy.

Never store customer card details.

## CUSTOMER ACCOUNT

Pages:
- Dashboard
- Profile
- Addresses
- Orders
- Order Details
- Returns
- Refunds
- Wishlist
- Invoices
- Notifications
- Support

---

# PART 7 — B2B WHOLESALE COMMERCE

Build a real business procurement system.

## BUSINESS REGISTRATION

Fields:
- Legal business name
- Trade name
- Business email
- Phone number
- Business address
- Contact person
- Tax information as applicable
- Business type
- Verification documents where justified

India-first onboarding.

Support businesses without GST registration where legally applicable.

Do not treat self-entered registration details as automatically verified.

## BUSINESS DASHBOARD

Display:
- Active RFQs
- Pending quotations
- Purchase Orders
- Pending approvals
- Business orders
- Recent invoices
- Procurement activity
- Team members

## WHOLESALE CATALOGUE

Include:
- MOQ
- Bulk pack units
- Tiered pricing
- Quantity selectors
- Business eligibility
- Request Quote action
- Bulk cart
- Seller details

## RFQ SYSTEM

Business buyer can:
- Create RFQ
- Select products
- Specify quantities
- Add delivery requirements
- Add notes
- Upload supporting files
- Submit to eligible sellers
- Receive quotations
- Compare offers
- Negotiate
- Accept or reject quotes

Seller can:
- Review RFQ
- Set quoted quantities
- Set prices
- Add terms
- Set validity
- Submit a quotation
- Revise a quotation

Record complete audit history.

## PURCHASE ORDER SYSTEM

After quote acceptance:
- Generate a draft PO
- Carry forward approved quote details
- Capture relevant company details
- Capture delivery terms
- Capture taxes
- Record prices and quantities
- Submit for approval if required
- Confirm with seller

Do not allow unauthorized users to bypass business approval policies.

## BUSINESS ACCOUNTS

Support:
- Organization owner
- Buyer
- Procurement approver
- Role permissions
- Approval thresholds
- Multiple business addresses
- Organizational order history

## B2B PAYMENT OPTIONS

- Online payments
- Configured bank transfer workflow
- Approved payment terms

Credit must never be automatically granted.

---

# PART 8 — MULTI-VENDOR SELLER MARKETPLACE

Create a full seller ecosystem similar in capability to a modern marketplace, but with an original IBazzzar design.

## SELLER REGISTRATION

- Seller profile
- Store details
- Business details
- Contact information
- Tax information where applicable
- Banking details handled securely
- Verification workflow
- Marketplace terms acceptance

Seller must be approved before publishing products if approval is required.

## SELLER DASHBOARD

Pages:
- Overview
- Store Profile
- Products
- Add Product
- Product Variants
- Inventory
- Pricing
- Wholesale Pricing
- Orders
- Fulfillment
- RFQs
- Quotations
- Returns
- Settlements
- Payouts
- Analytics
- Reviews
- Promotions
- Staff Access
- Settings

## PRODUCT MANAGEMENT

Seller can:
- Create products
- Upload images
- Edit variants
- Assign categories
- Manage inventory
- Set retail prices
- Set B2B price tiers
- Configure MOQ
- Set shipping attributes
- Submit products for moderation

Admin can approve, reject or request corrections.

## MULTI-SELLER ORDER LOGIC

A customer cart may contain products from different sellers.

Create a parent order and seller-specific fulfillment orders.

Maintain:
- Customer-level order view
- Seller-specific order data
- Correct financial allocation
- Independent shipment tracking
- Return handling per seller/order item
- Accurate commissions and settlements

Do not expose other sellers' private data.

## COMMISSIONS AND SETTLEMENTS

Implement configurable:
- Commission rules
- Seller fees
- Adjustments
- Refund adjustments
- Settlement eligibility
- Payout status
- Settlement reports
- Ledger-style audit history

Actual marketplace split payouts depend on payment provider onboarding and approval.

Do not pretend funds have been transferred if no payment/payout provider has processed them.

---

# PART 9 — ADMIN CONTROL CENTER

Build a complete Super Admin portal.

Use a premium emerald-and-ivory enterprise dashboard.

Sidebar navigation:
- Overview
- Customers
- Organizations
- Sellers
- Seller Approvals
- Categories
- Brands
- Products
- Moderation
- Inventory Overview
- Orders
- B2B RFQs
- Quotations
- Payments
- Refunds
- Commissions
- Settlements
- Shipping
- Returns
- Promotions
- Coupons
- Homepage CMS
- Media Library
- Support
- Notifications
- Reports
- Audit Logs
- Staff Roles
- Settings

## ADMIN ANALYTICS

Display real calculated metrics:
- GMV
- Net platform revenue
- Orders
- Active sellers
- Active customers
- B2B RFQs
- Conversion indicators where measurable
- Refunds
- Pending approvals

Do not hardcode fake real-time numbers.

## HOMEPAGE CMS

Admin can manage:
- Hero banners
- Robotic artwork
- Category imagery
- Promotional banners
- Homepage sections
- Featured products
- Featured sellers
- Footer content
- SEO metadata

Use versioned, safe updates where appropriate.

Image uploads must be validated and stored securely.

---

# PART 10 — DATABASE DESIGN

Use PostgreSQL with Prisma.

Core entities:

AUTH:
users
sessions
roles
user_roles
verification_tokens
password_reset_tokens
addresses

BUSINESS:
organizations
organization_members
organization_verifications
business_approval_policies
business_approval_requests

SELLERS:
seller_stores
seller_members
seller_verifications
seller_payout_accounts

CATALOGUE:
categories
brands
catalog_products
seller_listings
product_variants
product_media
product_attributes
product_attribute_values

PRICING:
price_lists
price_tiers
promotions
coupons
coupon_redemptions
tax_classes

INVENTORY:
warehouses
inventory_balances
inventory_reservations
stock_movements

CUSTOMERS:
carts
cart_items
wishlists
reviews

ORDERS:
orders
order_items
seller_orders
order_status_history
purchase_orders

B2B:
rfqs
rfq_items
quotation_requests
quotations
quotation_items
quote_revisions
quote_acceptances

PAYMENTS:
payment_intents
payment_transactions
payment_webhook_events
refunds
commission_entries
settlement_entries
payout_records

SHIPPING:
shipments
shipment_items
tracking_events
returns
return_items

CONTENT:
cms_pages
home_sections
banners
media_assets

OPERATIONS:
notifications
support_tickets
support_messages
audit_logs
idempotency_keys

Design correct relationships and junction tables.

Use UUIDs, unique constraints, indexes and proper foreign keys.

Use Decimal/NUMERIC for money.

Store price, discount, tax and shipping snapshots on orders.

Ensure seller ownership isolation.

Support business approval workflows.

Maintain explicit status transition rules.

Create an ER diagram.

Use database transactions for inventory, orders, payments and other critical updates.

Prevent overselling under concurrent checkout.

Never reset an unknown or existing database.

---

# PART 11 — PAYMENTS, SHIPPING AND RETURNS

## PAYMENTS

India-first integration:
- Razorpay test mode
- Payment order creation
- Server-side verification
- Webhook verification
- Idempotent processing
- Refund requests
- Refund tracking
- Payment failure handling
- Reconciliation reports

Keep live mode disabled until configured and explicitly approved.

## SHIPPING

Build a shipping-provider adapter.

Support:
- Seller fulfillment
- Platform fulfillment configuration
- Shipment creation
- Tracking
- Shipping status
- Delivery eligibility
- Shipping charges
- Returns

Use a properly labeled sandbox or mock shipping adapter until real credentials are available.

Do not invent real courier tracking.

## RETURNS AND REFUNDS

Support:
- Return request
- Eligibility checks
- Seller/admin review
- Return shipment workflow
- Refund status
- Partial refund where supported
- Customer notifications

---

# PART 12 — PREMIUM USER EXPERIENCE REQUIREMENTS

Treat UX quality as a first-class engineering requirement.

Every important action must feel fast, clear and predictable.

## NAVIGATION

- Fast search-first header
- Intuitive menus
- Clear categories
- Consistent breadcrumbs
- Responsive navigation
- Smooth browser history behavior
- Predictable page layouts

## PRODUCT DISCOVERY

- Useful filters
- Transparent sorting
- Search suggestions
- Accurate pricing
- Visible seller identity
- Trustworthy ratings
- Easy comparison
- Clear availability

## INTERACTIONS

- Smooth card hover states
- Fast add-to-cart feedback
- Elegant loading skeletons
- Toast notifications
- Confirmation dialogs for destructive actions
- Helpful form errors
- No layout jumps
- No unnecessary popups
- No intrusive autoplay sounds

## CHECKOUT

- Clear progress
- Minimal required fields
- Inline validation
- Preserved form input
- Payment failure recovery
- Accurate totals
- Accessible controls

## MOBILE

Mobile shopping is a top priority.

Optimize for:
360px
390px
430px
768px
1024px
1440px
1920px

Use:
- Responsive product grids
- Effective touch targets
- Mobile bottom navigation if justified
- Mobile search drawer
- Mobile filter sheet
- Sticky Add to Cart on product details
- Readable checkout
- No horizontal page overflow

## ACCESSIBILITY

Target WCAG 2.2 AA patterns:
- Keyboard accessibility
- Strong color contrast
- Proper labels
- Focus states
- Semantic elements
- Screen-reader support
- Reduced-motion support
- Error identification

---

# PART 13 — ANIMATION AND ROBOTIC INTERACTIONS

Animations must reinforce the luxury brand.

Implement:
- Cinematic hero entrance
- Gentle image depth/parallax
- Category card reveals
- Smooth hover transitions
- Product image transitions
- Add-to-cart microinteractions
- Controlled scroll storytelling
- Subtle robot assistant animation
- Dashboard transitions

Avoid:
- Excessive particles
- Continuous glowing effects
- Animation on every UI element
- Excessive 3D rendering
- Forced splash screens
- Delayed button responses

Prefer high-quality optimized video/image assets over full real-time 3D when the result is visually equivalent.

Load heavy animation modules only when necessary.

Never sacrifice checkout performance for visual effects.

---

# PART 14 — SECURITY AND TRUST

Implement:

- Secure password hashing
- HTTP-only authenticated sessions
- CSRF protection where applicable
- Login rate limiting
- Session invalidation
- Input validation
- Server-side RBAC
- Object-level authorization
- Seller tenant isolation
- Organization tenant isolation
- Audit logs
- Secure file upload
- Webhook verification
- Idempotent payments
- Secure error handling
- Environment secret protection
- Dependency checks
- Security headers
- Appropriate CORS policy

Never rely on hiding buttons as authorization.

Do not expose database credentials, payment secrets, or personal information.

Use approved legal/privacy flows appropriate to deployment in India, with legal review before launch.

---

# PART 15 — SEO AND PERFORMANCE

Implement:
- Server-rendered public product pages
- Metadata
- Canonical URLs
- Product structured data
- Breadcrumb structured data
- XML sitemap
- robots.txt
- Open Graph metadata
- Descriptive image alt text
- Optimized image formats
- Responsive image loading
- CDN-ready media paths
- Cache management
- Lazy loading
- Route-level code splitting
- Smart API pagination

Optimize Core Web Vitals, especially on mobile networks.

Avoid loading full 3D scenes before the user can interact with the website.

---

# PART 16 — AI-READY FEATURES

Prepare modular integration points for:

- AI product search
- Product recommendations
- Shopping assistant
- Seller catalogue assistance
- Business sourcing assistant
- Customer support automation

Implement an initial useful non-AI guided assistant if AI service credentials are unavailable.

Keep future AI providers replaceable.

Never pretend an AI integration is active if no real backend exists.

Never allow AI to modify prices, issue refunds, or place orders without authorized deterministic workflows and explicit confirmation.

---

# PART 17 — DEVELOPMENT STRUCTURE

Use the following conceptual project structure:

ibazzzar/
  apps/
    web/
    api/
    worker/
  packages/
    shared/
    validation/
    design-tokens/
    api-client/
  docs/
    architecture/
    database/
    api/
    ux/
    deployment/
  infra/
  tests/
  README.md
  .env.example

Keep the directory names stable once established.

Use reusable components and domain-based architecture.

Do not create duplicate APIs, models, or helper functions.

Do not rename unrelated files or modules unnecessarily.

Maintain backwards compatibility with completed project functionality.

---

# PART 18 — TEST-DRIVEN DEVELOPMENT

Before implementing critical commerce logic, define expected behavior and write focused tests.

Required areas:

Authentication:
- Login
- Logout
- Verification
- Password reset
- Permissions

Marketplace:
- Seller isolation
- Product moderation
- Listing state
- Inventory ownership

B2C:
- Cart
- Price calculation
- Discounts
- Checkout
- Order creation
- Payment verification
- Refunds

B2B:
- MOQ
- Tier pricing
- RFQ
- Quotations
- Quote revisions
- Purchase Order approval
- Business-user permissions

Payments:
- Invalid webhook rejection
- Duplicate webhook handling
- Payment mismatch rejection
- Order reconciliation

Inventory:
- Concurrent checkout
- Stock reservation
- Stock release
- Overselling prevention

UI:
- Responsive layout
- Search/filter behavior
- Form validation
- Mobile checkout
- Keyboard navigation

Use:
- Vitest
- React Testing Library
- Supertest
- Playwright

Use an isolated disposable testing database.

Show actual test results.

Do not claim tests passed without running them.

---

# PART 19 — DEPLOYMENT ARCHITECTURE

Prepare IBazzzar for public deployment at:

https://ibazzzar.com

Potential services:
- Next.js-capable hosting
- Persistent Node.js backend hosting
- Managed PostgreSQL
- Managed Redis
- S3-compatible object storage
- CDN
- HTTPS
- Background worker runtime
- Logging and monitoring

Verify the actual hosting provider's capabilities before choosing deployment configuration.

Do not assume a basic shared cPanel account can run every required component.

Prepare:
- Environment documentation
- Staging deployment strategy
- Production deployment strategy
- Database backup procedures
- Safe migration plan
- Rollback procedures
- Error logging
- Health endpoints
- CI/CD configuration
- Secret configuration guide

Do not deploy to production or modify DNS without explicit user authorization.

---

# PART 20 — DEVELOPMENT PHASES AND DELIVERY

You must develop the real platform, not merely describe it.

Work continuously through the ordered phases as far as the execution environment permits.

Do not stop after generating a plan or a homepage mockup.

### PHASE 0 — REPOSITORY ANALYSIS

Inspect the current working directory.

Check for existing project files and Git status.

Never overwrite or delete user work.

Create architecture documentation.

Verify installed tool versions.

Set up the monorepo.

### PHASE 1 — BRAND AND DESIGN SYSTEM

Implement:
- Official logo integration
- Color tokens
- Typography
- Layout system
- Components
- Buttons
- Inputs
- Cards
- Navigation
- Responsive header
- Footer
- Modal/dialog patterns
- Skeleton loading states

### PHASE 2 — PUBLIC STOREFRONT

Build:
- Homepage
- Robotic story sections
- Category pages
- Search pages
- Product listing
- Product details
- Shopping mode UI
- Retail/wholesale landing pages
- Seller landing page
- Public legal/help pages

Use realistic demo catalogue data.

Use appropriate placeholders for unlicensed or unavailable imagery.

### PHASE 3 — BACKEND AND DATABASE

Build:
- PostgreSQL schema
- Prisma configuration
- Auth endpoints
- User management
- Role permissions
- Organizations
- Sellers
- Product catalogue
- Pricing
- Inventory

Keep everything on a new isolated development database.

### PHASE 4 — B2C COMMERCE

Build:
- Cart
- Wishlist
- Checkout
- Customer account
- Orders
- Payment test-mode integration
- Returns
- Refund workflows

### PHASE 5 — B2B COMMERCE

Build:
- Organization accounts
- Business verification workflow
- Wholesale catalogue
- MOQ
- Tier pricing
- RFQ
- Quotations
- Negotiations
- Purchase Orders
- Approval controls

### PHASE 6 — SELLER MARKETPLACE

Build:
- Seller registration
- Seller dashboard
- Product CRUD
- Inventory
- Seller-specific orders
- Fulfillment
- RFQ responses
- Settlement reporting

### PHASE 7 — SUPER ADMIN

Build:
- Admin dashboard
- User management
- Seller approvals
- Products
- Marketplace moderation
- Commissions
- Payments
- Returns
- CMS
- Reports
- Permission management
- Audit logs

### PHASE 8 — REFINEMENT

Implement:
- Final responsive polish
- Animations
- Robotic media integration
- SEO
- Accessibility
- Performance optimization
- Security hardening
- Error handling
- End-to-end tests

### PHASE 9 — RELEASE PREPARATION

Prepare:
- Staging environment
- Production environment instructions
- CI/CD
- Monitoring
- Backups
- Release checklist
- Deployment documentation

Require explicit approval before production deployment or live financial activity.

---

# PART 21 — QUALITY ACCEPTANCE CRITERIA

The work is not complete unless:

1. Public pages navigate successfully.
2. All important UI controls have meaningful behavior.
3. Branding matches the uploaded official logo.
4. Color palette is consistent.
5. Mobile layouts work correctly.
6. Product search and filters work.
7. Product details show valid catalogue data.
8. Cart persists appropriately.
9. Checkout performs server-side validation.
10. Customer orders are stored correctly.
11. Business RFQ workflows function.
12. Purchase Order approval permissions are enforced.
13. Sellers see only authorized data.
14. Admin permissions work.
15. Inventory updates safely.
16. Test-mode payments are verified.
17. Invalid payment webhooks cannot mark orders paid.
18. Order status history is preserved.
19. Important actions are audited.
20. Product and seller management works.
21. Automated tests cover critical flows.
22. Lint and applicable type checks pass.
23. Frontend production build passes.
24. Backend starts successfully in the supported runtime.
25. Configuration and deployment steps are documented.
26. Demo content is distinguished from production content.
27. No production credentials are committed.
28. No existing user databases are modified.
29. All remaining blockers are explicitly reported.
30. Actual production readiness is confirmed through verification, not assumptions.

---

# PART 22 — HOW TO WORK IN CODEX

Follow these execution rules:

1. Inspect before editing.
2. Plan the next implementation slice.
3. Identify files to modify.
4. Implement complete working functionality.
5. Run applicable tests.
6. Fix discovered issues.
7. Run build checks.
8. Document progress.
9. Continue to the next phase when possible.

Do not repeatedly ask for clarification when a safe engineering default is available.

Ask for user input only when required, such as:
- Payment credentials
- Live shipping provider credentials
- Database access authorization
- Brand asset availability
- DNS changes
- Production deployment approval
- Financial or compliance decisions

Never invent secrets.

Never claim an external integration is functioning without credentials and verification.

At the end of each implementation phase provide:
- Completed features
- Changed files
- Verification results
- Remaining blockers
- Next implementation steps

Update docs/progress.md consistently.

If the current coding environment has limited context or execution time, persist an accurate progress summary and actionable next steps so implementation can continue without losing decisions.

---

# PART 23 — FINAL EXPERIENCE STANDARD

IBazzzar should feel like an original premium commerce product.

Customers should experience:
- Fast product discovery
- Clear product information
- Smooth shopping
- Reliable checkout
- Transparent order tracking
- Beautiful responsive design

Business buyers should experience:
- Efficient procurement
- Clear wholesale prices
- Bulk ordering
- RFQ and quotation workflows
- Professional Purchase Orders
- Organization-level controls

Sellers should experience:
- Easy onboarding
- Useful store management
- Transparent order handling
- Clear analytics
- Reliable inventory management
- Understandable settlements

Admins should experience:
- Marketplace-wide visibility
- Appropriate access control
- Financial and operational accuracy
- Efficient moderation
- Powerful CMS
- Auditable workflows

The overall branding must feel like a luxurious intelligent digital mall powered by a robotic visual ecosystem.

The IBazzzar logo and emerald-green/gold identity must remain consistent throughout.

## START NOW

Begin by inspecting the current repository.

If this is a new empty project, scaffold the complete monorepo using the chosen architecture.

First integrate the official logo and establish the design system.

Then create an excellent responsive IBazzzar homepage and functional storefront foundation.

Continue implementing backend, database, B2C, B2B, seller, and admin functionality phase by phase.

Write actual source files and tests.

Do not produce only a roadmap.

Do not stop after the homepage.

Do not deploy or perform destructive operations without authorization.

**Build IBazzzar.com into a complete, original, premium, intelligent multi-vendor B2B + B2C digital marketplace.**
