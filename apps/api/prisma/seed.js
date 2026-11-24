// Reference data (tax classes, categories, settings, pages) and an optional, clearly-flagged demo catalogue.
// Idempotent: running it twice changes nothing. Usage: node prisma/seed.js [--demo]
import { pathToFileURL } from 'node:url';

export const TAX_CLASSES = [
  { code: 'GST_0', name: 'Exempt (0%)', gstRateBps: 0 },
  { code: 'GST_5', name: 'GST 5%', gstRateBps: 500 },
  { code: 'GST_18', name: 'GST 18%', gstRateBps: 1800 },
  { code: 'GST_40', name: 'GST 40% (demerit goods)', gstRateBps: 4000 },
];

// Default rates are a starting point per category. Each product's HSN code decides the real rate; finance must verify.
export const CATEGORIES = [
  ['Electronics', 'electronics', 'GST_18', 'Audio, computing and everyday tech'],
  ['Fashion', 'fashion', 'GST_5', 'Clothing, bags and accessories'],
  ['Grocery', 'grocery', 'GST_5', 'Pantry staples and packaged food'],
  ['Home & Living', 'home-and-living', 'GST_18', 'Kitchen, décor and home essentials'],
  ['Beauty & Personal Care', 'beauty-and-personal-care', 'GST_18', 'Skin, hair and personal care'],
  ['Furniture', 'furniture', 'GST_18', 'Seating, storage and workspace furniture'],
  ['Industrial Supplies', 'industrial-supplies', 'GST_18', 'Tools, safety and maintenance supplies'],
  ['Office Supplies', 'office-supplies', 'GST_18', 'Stationery and office essentials'],
  ['Automotive', 'automotive', 'GST_18', 'Car and bike care and accessories'],
  ['Sports', 'sports', 'GST_5', 'Fitness and outdoor gear'],
  ['Toys', 'toys', 'GST_5', 'Games, toys and learning kits'],
  ['Smart Gadgets', 'smart-gadgets', 'GST_18', 'Wearables and connected devices'],
];

const HOME = {
  announcement: { heading: 'Welcome to IBazzzar', body: 'Shop for yourself or your business — retail and wholesale in one place.', data: { ctaLabel: 'Explore wholesale', ctaLink: '/wholesale' } },
  hero: { heading: 'Welcome to the Future of Shopping', body: 'Discover everything you love, connect with sellers, and shop for yourself or your business — all in one intelligent digital mall.', data: { ctaLabel: 'Explore Products', ctaLink: '/products' } },
  wholesale: { heading: 'Smarter Sourcing for Every Business', body: 'Bulk catalogues, MOQ-based pricing, requests for quotation, purchase orders with approvals and GST-ready invoices.', data: { ctaLabel: 'Explore Wholesale', ctaLink: '/wholesale' } },
  sell: { heading: 'Your Store. A Bigger Marketplace.', body: 'Sell retail and wholesale, manage inventory and orders, respond to business quotations and track your settlements.', data: { ctaLabel: 'Become a Seller', ctaLink: '/sell' } },
};

const LEGAL_NOTE = '\n\n> Draft for review: this policy must be reviewed by a qualified lawyer before IBazzzar launches publicly.';
const PAGES = [
  ['terms', 'Terms of Use', 'These terms govern your use of IBazzzar, a marketplace where independent sellers offer products to retail and business buyers. Sellers are responsible for their listings, tax invoices and fulfilment; IBazzzar operates the platform, payments flow and dispute support.'],
  ['privacy', 'Privacy Policy', 'We collect the information needed to run your account and orders: name, contact details, addresses, order history and, for businesses and sellers, tax registration details. Sellers receive only what they need to fulfil your order. We never store card details — payments are handled by our payment partner. You can ask us to export or delete your data through Support.'],
  ['returns', 'Returns & Refunds', 'Most items can be returned within the return window shown on the product page, counted from delivery. Request a return from your order page. Once the seller receives the item, your refund is issued to the original payment method; cash-on-delivery refunds are paid by bank transfer.'],
  ['shipping', 'Shipping & Delivery', 'Each seller ships their own parcel. Delivery estimates are shown for your PIN code before you pay and are estimates, not guarantees. Orders above the free-delivery threshold for a seller ship free; otherwise a delivery charge is shown at checkout.'],
  ['seller-agreement', 'Seller Agreement', 'Sellers must list accurate products with genuine photos, honour displayed prices, ship within their stated handling time, issue valid tax invoices and accept returns per the marketplace policy. Commission is deducted from delivered sales; payouts are made to a verified bank account.'],
  ['payments', 'Payments', 'Online payments are processed by Razorpay. Cash on delivery is available for eligible orders and PIN codes. Business buyers can also pay by bank transfer; credit terms are offered only after a finance review.'],
];

const DEMO_STORES = [
  { slug: 'the-everyday-collective', name: 'The Everyday Collective', description: 'Considered essentials for modern living. Demonstration store.', legalName: 'Everyday Collective (Demo)', state: 'Maharashtra', city: 'Pune', pincode: '411001', category: 'Home & Living', gstin: '27AAACE1234F1Z6' },
  { slug: 'objects-and-spaces', name: 'Objects & Spaces', description: 'Thoughtful finds for your home and work. Demonstration store.', legalName: 'Objects and Spaces (Demo)', state: 'Karnataka', city: 'Bengaluru', pincode: '560001', category: 'Furniture', gstin: null },
];

// [slug, name, brand, category, price ₹, mrp ₹, stock, moq, store index, art, hsn, variants?]
const DEMO_PRODUCTS = [
  ['aura-wireless-headphones', 'Aura wireless headphones', 'SONORA', 'Electronics', 2499, 3299, 32, 5, 0, 'headphones', '85183000'],
  ['everyday-canvas-tote', 'The everyday canvas tote', 'EARTHEN', 'Fashion', 899, 1199, 54, 10, 0, 'bag', '42022220'],
  ['ceramic-pour-over-set', 'Ceramic pour-over set', 'FORM & FIELD', 'Home & Living', 1899, 2399, 20, 6, 1, 'coffee', '69120010'],
  ['pulse-smart-watch', 'Pulse everyday smart watch', 'NOVA', 'Smart Gadgets', 3499, 4999, 26, 5, 0, 'watch', '85176290', ['Midnight', 'Sand']],
  ['botanical-care-duo', 'Botanical care duo', 'VERDANT', 'Beauty & Personal Care', 1299, 1599, 40, 12, 1, 'bottles', '33049990'],
  ['arc-desk-lamp', 'Arc reading lamp', 'FORM & FIELD', 'Home & Living', 2199, 2799, 18, 4, 1, 'lamp', '94052090'],
  ['pantry-essentials-box', 'The pantry essentials box', 'EARTHEN', 'Grocery', 1499, 1699, 36, 10, 0, 'box', '21069099'],
  ['studio-task-chair', 'Studio task chair', 'FORM & FIELD', 'Furniture', 8999, 11999, 12, 4, 1, 'chair', '94013000'],
  ['precision-tool-kit', 'Precision tool kit', 'WORKLINE', 'Industrial Supplies', 2999, 3499, 28, 5, 1, 'box', '82060000'],
  ['notebook-work-set', 'Notebook work set', 'EARTHEN', 'Office Supplies', 699, 799, 80, 20, 0, 'box', '48202000'],
  ['weekend-training-mat', 'Weekend training mat', 'NOVA', 'Sports', 1199, 1499, 35, 10, 0, 'box', '95069190'],
  ['woodland-play-kit', 'Woodland play kit', 'EARTHEN', 'Toys', 1599, 1899, 22, 6, 1, 'box', '95030090'],
];

export async function seedReference(prisma) {
  for (const t of TAX_CLASSES) await prisma.taxClass.upsert({ where: { code: t.code }, create: t, update: {} });
  const classes = new Map((await prisma.taxClass.findMany()).map((t) => [t.code, t.id]));
  for (const [i, [name, slug, tax, description]] of CATEGORIES.entries()) {
    await prisma.category.upsert({ where: { slug }, create: { name, slug, description, taxClassId: classes.get(tax), sortOrder: i }, update: {} });
  }
  for (const [id, s] of Object.entries(HOME)) await prisma.homeSection.upsert({ where: { id }, create: { id, ...s }, update: {} });
  for (const [slug, title, body] of PAGES) await prisma.cmsPage.upsert({ where: { slug }, create: { slug, title, body: body + LEGAL_NOTE }, update: {} });
  // Starter hero slides, only when none exist; the Admin edits, reorders, schedules or replaces them in the CMS.
  if (!await prisma.banner.count({ where: { placement: 'hero' } })) {
    await prisma.banner.createMany({ data: HERO_SLIDES.map((s, i) => ({ placement: 'hero', sortOrder: i, active: true, ...s })) });
  }
}

const HERO_SLIDES = [
  { eyebrow: 'Intelligent Digital Mall', title: 'Welcome to the Future of Shopping', subtitle: 'Retail and wholesale from verified Indian sellers, with clear prices, GST invoices and tracked delivery.', imageUrl: '/images/mall-concept.webp', alt: 'Concept art of the IBazzzar digital mall', link: '/products', ctaLabel: 'Explore products', secondaryLabel: 'Shop wholesale', secondaryLink: '/wholesale', theme: 'dark', layout: 'cover' },
  { eyebrow: 'Gadget Days', title: 'Up to 20% off audio & wearables', subtitle: 'Earbuds, headphones and smartwatches from authorised sellers. Limited-time deal prices.', imageUrl: '/products/headphones.svg', alt: 'Wireless headphones', link: '/deals', ctaLabel: 'Shop the deal', theme: 'dark', bgColor: '#0f3d2e', layout: 'split' },
  { eyebrow: 'Festive offer', title: 'Extra 15% off with code FESTIVE15', subtitle: 'On orders above ₹1,499, up to ₹300 off. Apply the code in your cart.', imageUrl: '/products/bag.svg', alt: 'Canvas tote bag', link: '/products?sort=discount', ctaLabel: 'Shop offers', theme: 'light', bgColor: '#f7ecd2', layout: 'split' },
  { eyebrow: 'For businesses', title: 'Buy in bulk. Pay less per unit.', subtitle: 'Tiered wholesale prices, quotations from several sellers and GST invoices for your business.', imageUrl: '/products/box.svg', alt: 'Stack of wholesale cartons', link: '/wholesale', ctaLabel: 'Explore wholesale', secondaryLabel: 'Request a quote', secondaryLink: '/business/rfqs/new', theme: 'dark', bgColor: '#1d4f7a', layout: 'split' },
  { eyebrow: 'Home refresh', title: 'Copperware, lamps & cotton linen', subtitle: 'Handpicked home essentials from small workshops across India.', imageUrl: '/products/lamp.svg', alt: 'Ceramic table lamp', link: '/products?category=home-and-living', ctaLabel: 'Shop home', theme: 'light', bgColor: '#e6efe9', layout: 'split' },
];

export async function seedDemo(prisma) {
  const categories = new Map((await prisma.category.findMany()).map((c) => [c.name, c]));
  const stores = [];
  for (const [i, s] of DEMO_STORES.entries()) {
    const ownerEmail = `demo-seller-${i + 1}@demo.ibazzzar.invalid`;
    const owner = await prisma.user.upsert({ where: { email: ownerEmail }, create: { email: ownerEmail, name: `${s.name} (demo owner)`, passwordHash: 'demo$locked', demo: true }, update: {} });
    const address = { line1: `${10 + i} Demo Market Road`, city: s.city, state: s.state, pincode: s.pincode };
    const store = await prisma.sellerStore.upsert({
      where: { slug: s.slug }, update: {},
      create: {
        slug: s.slug, name: s.name, description: s.description, legalName: s.legalName, businessType: 'PROPRIETORSHIP', gstRegistered: !!s.gstin, gstin: s.gstin,
        contactPhone: `98765${String(43210 + i)}`, pickupAddress: address, stateCode: s.state === 'Maharashtra' ? '27' : '29', status: 'APPROVED',
        primaryCategoryId: categories.get(s.category).id, termsAcceptedAt: new Date(), demo: true,
        members: { create: { userId: owner.id, role: 'OWNER' } },
        warehouses: { create: { name: 'Pickup address', address, pincode: s.pincode } },
      },
    });
    stores.push(store);
  }
  const warehouses = new Map((await prisma.warehouse.findMany({ where: { storeId: { in: stores.map((s) => s.id) } } })).map((w) => [w.storeId, w.id]));

  for (const [slug, name, brandName, categoryName, price, mrp, stock, moq, storeIndex, art, hsn, variantLabels] of DEMO_PRODUCTS) {
    if (await prisma.catalogProduct.findUnique({ where: { slug } })) continue;
    const brand = await prisma.brand.upsert({ where: { name: brandName }, create: { name: brandName, slug: brandName.toLowerCase().replace(/[^a-z0-9]+/g, '-') }, update: {} });
    const category = categories.get(categoryName);
    const store = stores[storeIndex];
    const labels = variantLabels ?? ['Standard'];
    const product = await prisma.catalogProduct.create({
      data: {
        slug, name, brandId: brand.id, categoryId: category.id, hsnCode: hsn, status: 'APPROVED', demo: true, featured: ['aura-wireless-headphones', 'pulse-smart-watch', 'studio-task-chair', 'ceramic-pour-over-set'].includes(slug),
        description: `${name} from ${brandName}. Demonstration catalogue item: photography, specifications and certifications must be supplied by a verified seller before real sale.`,
        highlights: ['Demonstration listing', `Ships from ${store.name}`, 'GST invoice from the seller'],
        searchText: [name, brandName, categoryName, ...labels].join(' ').toLowerCase(),
        media: { create: { url: `/products/${art}.svg`, alt: `${name} — illustrative placeholder`, sortOrder: 0 } },
      },
    });
    for (const [v, label] of labels.entries()) {
      const variant = await prisma.productVariant.create({ data: { catalogProductId: product.id, slug: v === 0 ? `${slug}-${label.toLowerCase()}` : `${slug}-${label.toLowerCase()}`, label, sortOrder: v, weightGrams: art === 'chair' ? 12000 : 700 } });
      const pricePaise = price * 100;
      await prisma.sellerListing.create({
        data: {
          storeId: store.id, variantId: variant.id, sku: `DEMO-${slug.slice(0, 12).toUpperCase()}-${v + 1}`, pricePaise, mrpPaise: mrp * 100, moq, status: 'APPROVED', demo: true,
          // Wholesale tiers are whole rupees.
          tiers: { create: [{ minQty: moq, pricePaise: Math.round(pricePaise * 0.92 / 100) * 100 }, { minQty: moq * 4, pricePaise: Math.round(pricePaise * 0.84 / 100) * 100 }] },
          inventory: { create: { warehouseId: warehouses.get(store.id), onHand: stock } },
        },
      });
      // A second seller also offers the headphones, so the product page shows multiple offers.
      if (slug === 'aura-wireless-headphones') {
        await prisma.sellerListing.create({
          data: {
            storeId: stores[1].id, variantId: variant.id, sku: 'DEMO-AURA-OS', pricePaise: pricePaise + 10000, mrpPaise: mrp * 100, moq: 3, status: 'APPROVED', demo: true,
            inventory: { create: { warehouseId: warehouses.get(stores[1].id), onHand: 15 } },
          },
        });
      }
    }
  }
  const now = new Date();
  await prisma.coupon.upsert({
    where: { code: 'WELCOME10' }, update: {},
    create: { code: 'WELCOME10', description: '10% off your first order (demo offer)', kind: 'PERCENT', value: 10, maxDiscountPaise: 50000, minOrderPaise: 99900, startsAt: now, endsAt: new Date(now.getTime() + 90 * 86_400_000), public: true, perUserLimit: 1 },
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { config: loadEnv } = await import('dotenv');
  const { fileURLToPath } = await import('node:url');
  loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
  const { loadConfig } = await import('../src/config.js');
  const { createPrisma } = await import('../src/lib/db.js');
  const prisma = createPrisma(loadConfig());
  try {
    await seedReference(prisma);
    console.log('Reference data ready (tax classes, categories, homepage sections, policy pages).');
    if (process.argv.includes('--demo')) {
      await seedDemo(prisma);
      console.log('Demo catalogue ready. Every demo record has demo = true.');
    }
  } finally {
    await prisma.$disconnect();
  }
}
