// Realistic sample marketplace for local development: sellers, catalogue, customers, business buyers and ~90 days of
// orders driven through the real order services (pricing, GST, invoices, shipments, ledger, returns, reviews), then
// spread over time so dashboards and analytics look like a running shop.
//
// Safety: refuses to run unless DATABASE_URL points at this machine (localhost / 127.0.0.1) and NODE_ENV isn't
// production. Every e-mail address uses example.com (reserved, never delivered), and every record it creates is listed
// in the `sampleData` setting so `--remove` can take it out again cleanly.
//
// Usage (from the repo root):
//   npm run db:seed:sample              add the sample data (skips if already present)
//   npm run db:seed:sample -- --reset   remove the old sample + old demo catalogue, then add fresh sample data
//   npm run db:seed:sample -- --remove  remove the sample data only
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const DAY = 86_400_000;
const HOUR = 3_600_000;
export const SAMPLE_PASSWORD = 'Local-Sample-2026';
const MARKER = 'sampleData';

// ───────────── Deterministic randomness (same data on every run) ─────────────
function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
let rand = rng(20261123);
const int = (min, max) => min + Math.floor(rand() * (max - min + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;
const weighted = (pairs) => { const total = pairs.reduce((s, [, w]) => s + w, 0); let r = rand() * total; for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; } return pairs[0][0]; };

// ───────────── Tax ids that pass the GSTIN checksum ─────────────
const GST_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function gstin(stateCode, pan) {
  const base = `${stateCode}${pan}1Z`;
  let sum = 0;
  for (let i = 0; i < 14; i++) { const p = GST_CHARS.indexOf(base[i]) * (i % 2 ? 2 : 1); sum += Math.floor(p / 36) + (p % 36); }
  return base + GST_CHARS[(36 - (sum % 36)) % 36];
}
const letters = (n) => Array.from({ length: n }, () => String.fromCharCode(65 + int(0, 25))).join('');
const pan = (kind) => `${letters(3)}${kind}${letters(1)}${int(1000, 9999)}${letters(1)}`;

// ───────────── Sellers ─────────────
const SELLERS = [
  { slug: 'shree-balaji-electronics', name: 'Shree Balaji Electronics', legal: 'Shree Balaji Electronics', type: 'PROPRIETORSHIP', pan: 'P', category: 'Electronics', city: 'New Delhi', state: 'Delhi', code: '07', pincode: '110006', street: 'Shop 14, Lajpat Rai Market, Chandni Chowk', about: 'Authorised dealer of audio, mobile accessories and chargers since 2009. Every product ships with a GST invoice and manufacturer warranty.', bank: ['HDFC Bank', 'HDFC0000146'] },
  { slug: 'technest-hyderabad', name: 'TechNest', legal: 'TechNest Retail Private Limited', type: 'PRIVATE_LIMITED', pan: 'C', category: 'Smart Gadgets', city: 'Hyderabad', state: 'Telangana', code: '36', pincode: '500003', street: '2-4-81, Rashtrapati Road, Secunderabad', about: 'Smart home and wearables specialists. We test every device before it leaves our warehouse.', bank: ['ICICI Bank', 'ICIC0000025'] },
  { slug: 'kaveri-home-store', name: 'Kaveri Home Store', legal: 'Kaveri Home Store', type: 'PARTNERSHIP', pan: 'F', category: 'Home & Living', city: 'Bengaluru', state: 'Karnataka', code: '29', pincode: '560034', street: '#112, 80 Feet Road, Koramangala 4th Block', about: 'Copperware, cotton linen and kitchen essentials made by small workshops across South India.', bank: ['Canara Bank', 'CNRB0000412'] },
  { slug: 'rangrez-textiles', name: 'Rangrez Textiles', legal: 'Rangrez Textiles', type: 'PROPRIETORSHIP', pan: 'P', category: 'Fashion', city: 'Ahmedabad', state: 'Gujarat', code: '24', pincode: '380001', street: '33, Ratanpole Cloth Market', about: 'Block-printed cotton kurtas, kurtis and everyday bags from Ahmedabad. Retail and wholesale.', bank: ['Bank of Baroda', 'BARB0RATANP'] },
  { slug: 'patel-provisions', name: 'Patel Provisions', legal: 'Patel Provisions', type: 'PROPRIETORSHIP', pan: 'P', category: 'Grocery', city: 'Surat', state: 'Gujarat', code: '24', pincode: '395003', street: 'Ground Floor, Ved Road, Katargam', about: 'Pantry staples, cold-pressed oils and teas packed fresh every week.', bank: ['State Bank of India', 'SBIN0002694'] },
  { slug: 'mumbai-office-mart', name: 'Mumbai Office Mart', legal: 'Mumbai Office Mart Private Limited', type: 'PRIVATE_LIMITED', pan: 'C', category: 'Office Supplies', city: 'Mumbai', state: 'Maharashtra', code: '27', pincode: '400001', street: '18, Kalbadevi Road, Princess Street', about: 'Stationery and office supplies for homes, schools and offices. Bulk pricing for businesses.', bank: ['Kotak Mahindra Bank', 'KKBK0000631'] },
  { slug: 'khiladi-sports', name: 'Khiladi Sports', legal: 'Khiladi Sports & Toys', type: 'PARTNERSHIP', pan: 'F', category: 'Sports', city: 'Jalandhar', state: 'Punjab', code: '03', pincode: '144001', street: 'Basti Nau Sports Market', about: 'Cricket, fitness and badminton gear from Jalandhar, plus wooden toys and learning kits.', bank: ['Punjab National Bank', 'PUNB0011800'] },
  { slug: 'lohar-tools-hardware', name: 'Lohar Tools & Hardware', legal: 'Lohar Tools and Hardware LLP', type: 'LLP', pan: 'F', category: 'Industrial Supplies', city: 'Chennai', state: 'Tamil Nadu', code: '33', pincode: '600001', street: '41, Anderson Street, Parrys', about: 'Hand tools, power tools, safety gear and car care for workshops and homes.', bank: ['Indian Bank', 'IDIB000P042'] },
  { slug: 'sheesham-craft', name: 'Sheesham Craft', legal: 'Sheesham Craft Furniture', type: 'PROPRIETORSHIP', pan: 'P', category: 'Furniture', city: 'Jodhpur', state: 'Rajasthan', code: '08', pincode: '342001', street: 'Plot 7, Basni Industrial Area Phase II', about: 'Solid sheesham and mango wood furniture, finished by hand in Jodhpur.', bank: ['Axis Bank', 'UTIB0000134'] },
  { slug: 'glow-naturals', name: 'Glow Naturals', legal: 'Glow Naturals Private Limited', type: 'PRIVATE_LIMITED', pan: 'C', category: 'Beauty & Personal Care', city: 'Kochi', state: 'Kerala', code: '32', pincode: '682011', street: 'MG Road, Ravipuram', about: 'Skin and hair care made with Kerala botanicals. Cruelty-free and dermatologically tested.', bank: ['Federal Bank', 'FDRL0001041'] },
];

// ───────────── Catalogue ─────────────
// [name, brand, category, price ₹, mrp ₹, stock, moq, art, hsn, variants, seller index, extra seller index | null, description, highlights, specs]
const PRODUCTS = [
  ['Sonik BassPods True Wireless Earbuds', 'Sonik Audio', 'Electronics', 1499, 2999, 240, 10, 'headphones', '85183000', ['Black', 'White'], 0, 1, 'Deep bass, a low-latency game mode and up to 30 hours of playback with the charging case.', ['Up to 30 hours with case', 'Bluetooth 5.3 with quick pairing', 'IPX5 sweat and splash resistant'], { 'Battery life': '30 hours', Bluetooth: '5.3', 'Water resistance': 'IPX5', Warranty: '1 year' }],
  ['Sonik Studio Wireless Over-Ear Headphones', 'Sonik Audio', 'Electronics', 2799, 4999, 120, 5, 'headphones', '85183000', ['Black', 'Navy'], 0, null, 'Soft memory-foam cushions, 40 mm drivers and a fold-flat design for travel.', ['40 mm dynamic drivers', '45-hour battery', 'Built-in mic for calls'], { 'Battery life': '45 hours', 'Driver size': '40 mm', Weight: '230 g', Warranty: '1 year' }],
  ['VoltEdge 20000mAh Fast-Charging Power Bank', 'VoltEdge', 'Electronics', 1299, 2199, 300, 10, 'box', '85076000', null, 0, 1, 'Charges two phones at once with 22.5 W fast charging over USB-C and USB-A.', ['22.5 W fast charging', 'USB-C input and output', 'BIS certified cells'], { Capacity: '20000 mAh', Output: '22.5 W', Ports: '1 × USB-C, 2 × USB-A', Warranty: '6 months' }],
  ['VoltEdge 65W GaN USB-C Charger', 'VoltEdge', 'Electronics', 1599, 2499, 180, 10, 'box', '85044030', null, 0, null, 'Compact charger for laptops, tablets and phones, with two USB-C ports and one USB-A port.', ['65 W total output', 'Charges a laptop and a phone together', 'Over-heat protection'], { Output: '65 W', Ports: '2 × USB-C, 1 × USB-A', Warranty: '1 year' }],
  ['PulseFit Active Smartwatch', 'PulseFit', 'Smart Gadgets', 2499, 5999, 160, 5, 'watch', '85176290', ['Midnight Black', 'Rose Gold'], 1, 0, '1.85-inch AMOLED display, Bluetooth calling, heart-rate and SpO2 tracking with 100+ sports modes.', ['1.85" AMOLED display', 'Bluetooth calling', '7-day battery'], { Display: '1.85" AMOLED', 'Battery life': '7 days', 'Water resistance': 'IP68', Warranty: '1 year' }],
  ['PulseFit Band 4 Fitness Tracker', 'PulseFit', 'Smart Gadgets', 1199, 2499, 220, 10, 'watch', '85176290', null, 1, null, 'Slim tracker for steps, sleep and heart rate, with a 14-day battery.', ['14-day battery', 'Sleep and stress tracking', '5 ATM water resistant'], { 'Battery life': '14 days', 'Water resistance': '5 ATM', Warranty: '1 year' }],
  ['VoltEdge Smart Wi-Fi Plug 16A', 'VoltEdge', 'Smart Gadgets', 799, 1499, 260, 10, 'box', '85366990', null, 1, null, 'Switch geysers and ACs on or off from your phone, set schedules and track energy use.', ['Works with Alexa and Google Assistant', '16 A for heavy appliances', 'Energy monitoring'], { Rating: '16 A', Connectivity: '2.4 GHz Wi-Fi', Warranty: '1 year' }],
  ['VoltEdge 360° Wi-Fi Home Security Camera', 'VoltEdge', 'Smart Gadgets', 1899, 3499, 140, 5, 'box', '85258900', null, 1, null, '2K camera with pan and tilt, night vision, two-way talk and motion alerts on your phone.', ['2K resolution', 'Colour night vision', 'Two-way audio'], { Resolution: '2K (3 MP)', Storage: 'microSD up to 256 GB', Warranty: '1 year' }],
  ['Tamra Pure Copper Water Bottle 1 Litre', 'Tamra', 'Home & Living', 649, 999, 300, 12, 'bottles', '74181021', ['Plain', 'Hammered'], 2, 4, 'Leak-proof, joint-free copper bottle. Store water overnight and drink in the morning.', ['99.7% pure copper', 'Leak-proof screw cap', 'Joint-free body'], { Capacity: '1 litre', Material: 'Copper', Care: 'Clean with lemon and salt' }],
  ['Kaveri Living 100% Cotton Double Bedsheet with 2 Pillow Covers', 'Kaveri Living', 'Home & Living', 899, 1599, 200, 10, 'box', '63041940', ['Indigo Floral', 'Sage Leaf'], 2, null, '180 TC pure cotton sheet in fast colours that soften with every wash.', ['180 thread count cotton', 'Fits king and queen beds', 'Includes 2 pillow covers'], { Size: '228 × 254 cm', Material: '100% cotton', 'Thread count': '180' }],
  ['Tamra Stainless Steel Pressure Cooker 5 Litre', 'Tamra', 'Home & Living', 1849, 2650, 110, 6, 'box', '73239390', null, 2, null, 'Induction-ready cooker with a sandwich bottom for even heating and a gasket release valve.', ['Works on gas and induction', 'ISI marked', '5-year warranty'], { Capacity: '5 litres', Material: 'Stainless steel', Warranty: '5 years' }],
  ['Kaveri Living Ceramic Table Lamp', 'Kaveri Living', 'Home & Living', 1299, 1999, 90, 4, 'lamp', '94052090', null, 2, null, 'Hand-glazed ceramic base with a linen shade, warm light for bedside or study.', ['Hand-glazed ceramic', 'Linen fabric shade', 'E27 holder (bulb not included)'], { Height: '42 cm', Holder: 'E27', Material: 'Ceramic and linen' }],
  ['Tamra South Indian Filter Coffee Maker', 'Tamra', 'Home & Living', 549, 799, 180, 12, 'coffee', '73239390', null, 2, null, 'Traditional two-part steel filter for strong decoction, enough for four cups.', ['Food-grade stainless steel', 'Makes 4 cups', 'Easy to clean'], { Capacity: '4 cups', Material: 'Stainless steel' }],
  ["Rangrez Men's Block-Print Cotton Kurta", 'Rangrez', 'Fashion', 799, 1499, 260, 12, 'box', '62052000', ['M', 'L', 'XL'], 3, null, 'Hand block-printed in Ahmedabad on breathable cotton, with a classic Mandarin collar.', ['Hand block-printed', '100% cotton', 'Machine washable'], { Fabric: 'Cotton', Fit: 'Regular', Sleeve: 'Full sleeve' }],
  ["Rangrez Women's Printed Rayon Kurti", 'Rangrez', 'Fashion', 699, 1299, 300, 12, 'box', '62044990', ['S', 'M', 'L', 'XL'], 3, null, 'Straight-cut, knee-length kurti in soft rayon with three-quarter sleeves.', ['Soft rayon fabric', 'Straight cut', 'Side pockets'], { Fabric: 'Rayon', Length: 'Knee length', Sleeve: '3/4 sleeve' }],
  ['Rangrez Canvas Laptop Backpack 25L', 'Rangrez', 'Fashion', 1199, 1999, 150, 10, 'bag', '42029200', ['Olive', 'Charcoal'], 3, null, 'Water-resistant canvas backpack with a padded 15.6-inch laptop sleeve.', ['Fits 15.6" laptops', 'Water-resistant canvas', 'Hidden back pocket'], { Capacity: '25 litres', Material: 'Canvas', Warranty: '6 months' }],
  ['Rangrez Handcrafted Jute Tote Bag', 'Rangrez', 'Fashion', 449, 699, 240, 20, 'bag', '46021990', null, 3, null, 'Sturdy jute tote with cotton handles and an inner zip pocket for daily shopping.', ['Eco-friendly jute', 'Inner zip pocket', 'Holds up to 10 kg'], { Material: 'Jute and cotton', Size: '40 × 35 × 12 cm' }],
  ['Annapurna Farms Cold-Pressed Groundnut Oil 1L', 'Annapurna Farms', 'Grocery', 329, 399, 400, 24, 'bottles', '15081000', null, 4, null, 'Wood-pressed (kachi ghani) groundnut oil with no refining or additives.', ['Wood cold-pressed', 'No chemicals or preservatives', 'Packed in food-grade bottle'], { Volume: '1 litre', 'Shelf life': '9 months' }],
  ['Desi Pantry Premium Basmati Rice 5kg', 'Desi Pantry', 'Grocery', 699, 899, 350, 10, 'box', '10063020', null, 4, null, 'Aged extra-long grain basmati that cooks fluffy and fragrant.', ['Aged 12 months', 'Extra-long grain', 'Sortex cleaned'], { Weight: '5 kg', 'Grain length': '8.3 mm' }],
  ['Desi Pantry Roasted Makhana 250g', 'Desi Pantry', 'Grocery', 299, 399, 300, 20, 'box', '08029900', ['Peri Peri', 'Himalayan Salt'], 4, null, 'Crunchy fox nuts roasted in olive oil, a light high-protein snack.', ['Roasted, not fried', 'High in protein', 'No added MSG'], { Weight: '250 g', 'Shelf life': '6 months' }],
  ['Annapurna Farms Organic Jaggery Powder 1kg', 'Annapurna Farms', 'Grocery', 179, 240, 380, 24, 'box', '17011390', null, 4, null, 'Chemical-free jaggery powder from Kolhapur sugarcane, a natural sweetener.', ['Certified organic', 'No sulphur used', 'Resealable pack'], { Weight: '1 kg', Origin: 'Kolhapur' }],
  ['Desi Pantry Assam CTC Tea 500g', 'Desi Pantry', 'Grocery', 249, 320, 320, 24, 'coffee', '09024020', null, 4, null, 'Strong, malty Assam CTC for a rich kadak chai.', ['Single-estate Assam', 'Strong and malty', 'Freshness-sealed pack'], { Weight: '500 g', Origin: 'Assam' }],
  ['Glow Naturals 10% Vitamin C Face Serum 30ml', 'Glow Naturals', 'Beauty & Personal Care', 499, 899, 260, 12, 'bottles', '33049990', null, 9, null, 'Lightweight serum with stable vitamin C and niacinamide for brighter, even-toned skin.', ['10% vitamin C', 'With niacinamide', 'Fragrance-free'], { Volume: '30 ml', 'Skin type': 'All skin types' }],
  ['Nilgiri Herbals Red Onion Hair Oil 200ml', 'Nilgiri Herbals', 'Beauty & Personal Care', 349, 499, 280, 12, 'bottles', '33059011', null, 9, null, 'Red onion and curry leaf oil in a coconut base to reduce hair fall.', ['Red onion and curry leaf', 'No mineral oil', 'Suitable for all hair types'], { Volume: '200 ml' }],
  ['Glow Naturals Pure Aloe Vera Gel 200g', 'Glow Naturals', 'Beauty & Personal Care', 249, 350, 320, 24, 'bottles', '33049990', null, 9, null, 'Soothing aloe gel for face, body and hair. Cools after sun exposure.', ['99% aloe vera', 'Non-sticky', 'Multipurpose'], { Weight: '200 g' }],
  ['Nilgiri Herbals Sandalwood Bathing Soap (Pack of 4)', 'Nilgiri Herbals', 'Beauty & Personal Care', 220, 280, 400, 24, 'box', '34011190', null, 9, null, 'Traditional sandalwood soaps with a long-lasting fragrance.', ['Real sandalwood oil', 'TFM grade 1', 'Pack of 4 × 125 g'], { Weight: '4 × 125 g' }],
  ['Sheesham Craft Solid Wood Coffee Table', 'Sheesham Craft', 'Furniture', 7499, 11999, 40, 2, 'box', '94036000', ['Honey Finish', 'Walnut Finish'], 8, null, 'Solid sheesham coffee table with a lower shelf, hand-finished with melamine polish.', ['Solid sheesham wood', 'Lower storage shelf', 'Assembled, ready to use'], { Dimensions: '100 × 55 × 45 cm', Material: 'Sheesham wood', Warranty: '1 year' }],
  ['Sheesham Craft Ergonomic Mesh Office Chair', 'Sheesham Craft', 'Furniture', 5999, 9999, 60, 2, 'chair', '94013000', null, 8, null, 'Breathable mesh back, adjustable lumbar support and 2D armrests for long workdays.', ['Adjustable lumbar support', 'Height-adjustable seat', 'Supports up to 120 kg'], { 'Max load': '120 kg', Material: 'Mesh and nylon base', Warranty: '2 years' }],
  ['Sheesham Craft 3-Tier Wooden Bookshelf', 'Sheesham Craft', 'Furniture', 6499, 9499, 35, 2, 'box', '94036000', null, 8, null, 'Open bookshelf in solid wood with three wide shelves for books and décor.', ['Solid sheesham wood', 'Three shelves', 'Wall anchor included'], { Dimensions: '80 × 30 × 110 cm', Material: 'Sheesham wood' }],
  ['Sheesham Craft Foldable Study Table', 'Sheesham Craft', 'Furniture', 2499, 3999, 80, 4, 'box', '94036000', null, 8, null, 'Space-saving folding table for study or work-from-home, with a drawer.', ['Folds flat', 'Built-in drawer', 'Scratch-resistant top'], { Dimensions: '80 × 50 × 75 cm', Material: 'Engineered wood' }],
  ['Lohar 108-Piece Home Tool Kit', 'Lohar', 'Industrial Supplies', 2799, 3999, 90, 4, 'box', '82060000', null, 7, null, 'Hammer, screwdrivers, pliers, spanners, sockets and more in a sturdy carry case.', ['108 pieces', 'Chrome vanadium steel', 'Blow-moulded case'], { Pieces: '108', Material: 'Chrome vanadium steel', Warranty: '1 year' }],
  ['Lohar 12V Cordless Drill Driver', 'Lohar', 'Industrial Supplies', 2999, 4499, 70, 4, 'box', '84672100', null, 7, null, 'Two-speed drill with 18 torque settings, a 1.5 Ah battery and fast charger.', ['2-speed gearbox', '18+1 torque settings', 'LED work light'], { Voltage: '12 V', Battery: '1.5 Ah Li-ion', Warranty: '1 year' }],
  ['Lohar ISI Safety Helmet (Pack of 5)', 'Lohar', 'Industrial Supplies', 1250, 1750, 120, 4, 'box', '65061010', ['White', 'Yellow'], 7, null, 'ISI-marked HDPE helmets with ratchet adjustment for sites and factories.', ['IS 2925 certified', 'Ratchet adjustment', 'Sweatband included'], { Material: 'HDPE', Standard: 'IS 2925' }],
  ['Lohar Nitrile Disposable Gloves (Box of 100)', 'Lohar', 'Industrial Supplies', 799, 1100, 200, 10, 'box', '40151900', ['M', 'L'], 7, null, 'Powder-free nitrile gloves for workshops, kitchens and cleaning.', ['Powder-free', 'Latex-free', 'Textured fingertips'], { Quantity: '100 gloves', Material: 'Nitrile' }],
  ['Likho A5 Ruled Notebooks (Pack of 6)', 'Likho', 'Office Supplies', 360, 480, 500, 20, 'box', '48202000', null, 5, 3, '172-page notebooks with smooth 70 GSM paper and sewn binding.', ['172 pages each', '70 GSM paper', 'Sewn binding'], { Size: 'A5', Pages: '172', Paper: '70 GSM' }],
  ['PaperCraft A4 Copier Paper 75 GSM (500 Sheets)', 'PaperCraft', 'Office Supplies', 349, 430, 600, 10, 'box', '48025690', null, 5, null, 'Bright white paper for laser and inkjet printers, jam-free performance.', ['75 GSM', 'For laser and inkjet', '500 sheets per ream'], { Size: 'A4', GSM: '75', Sheets: '500' }],
  ['Likho Gel Pens (Pack of 20)', 'Likho', 'Office Supplies', 199, 260, 600, 24, 'box', '96081019', null, 5, null, '0.5 mm gel pens with smooth, smudge-free ink.', ['0.5 mm tip', 'Smudge-free ink', 'Comfort grip'], { Tip: '0.5 mm', Colour: 'Blue' }],
  ['PaperCraft Bamboo Desk Organiser', 'PaperCraft', 'Office Supplies', 699, 999, 160, 10, 'box', '44219990', null, 5, null, 'Five compartments for pens, notes and a phone, in natural bamboo.', ['Natural bamboo', '5 compartments', 'Phone stand slot'], { Material: 'Bamboo', Dimensions: '25 × 15 × 12 cm' }],
  ['AutoShine Microfibre Cleaning Cloth (Pack of 6)', 'AutoShine', 'Automotive', 299, 499, 400, 20, 'box', '63079090', null, 7, null, 'Thick 350 GSM microfibre cloths for scratch-free car and bike cleaning.', ['350 GSM microfibre', 'Lint-free', 'Washable'], { Size: '40 × 40 cm', GSM: '350' }],
  ['AutoShine Car Wash Shampoo 1L', 'AutoShine', 'Automotive', 349, 450, 300, 12, 'bottles', '34059010', null, 7, null, 'pH-balanced foam shampoo that lifts dirt without stripping wax.', ['pH-balanced', 'Safe on wax and ceramic', 'Makes 50+ washes'], { Volume: '1 litre' }],
  ['AutoShine Portable Tyre Inflator 12V', 'AutoShine', 'Automotive', 1999, 2999, 100, 4, 'box', '84148011', null, 7, null, 'Digital tyre inflator with auto cut-off at your set pressure, runs from the car socket.', ['Digital pressure gauge', 'Auto cut-off', 'LED torch'], { Power: '12 V DC', 'Max pressure': '150 PSI', Warranty: '6 months' }],
  ['AutoShine Bike Mobile Holder', 'AutoShine', 'Automotive', 399, 699, 300, 20, 'box', '87149990', null, 7, null, 'Anti-shake handlebar mount for phones up to 7 inches.', ['360° rotation', 'Anti-shake grip', 'Fits 4.7–7" phones'], { Material: 'Aluminium alloy and silicone' }],
  ['Khiladi Kashmir Willow Cricket Bat', 'Khiladi', 'Sports', 1499, 2299, 120, 6, 'box', '95069920', ['Size 5', 'Size 6', 'Full Size'], 6, null, 'Kashmir willow bat with a cane handle, knocked-in and ready for leather or tennis ball.', ['Kashmir willow', 'Cane handle', 'Pre-knocked'], { Material: 'Kashmir willow', Weight: '1.1–1.2 kg' }],
  ['Khiladi Anti-Slip Yoga Mat 6mm', 'Khiladi', 'Sports', 699, 1199, 260, 10, 'box', '95069190', ['Purple', 'Teal'], 6, null, 'Cushioned, anti-slip mat with a carry strap for home and studio.', ['6 mm cushioning', 'Anti-slip texture', 'Carry strap included'], { Size: '183 × 61 cm', Thickness: '6 mm' }],
  ['Khiladi Adjustable Dumbbell Set 10kg', 'Khiladi', 'Sports', 1899, 2699, 90, 4, 'box', '95069190', null, 6, null, 'Two PVC dumbbell rods with plates, adjustable up to 5 kg each.', ['Adjustable plates', 'Spinlock collars', '10 kg total'], { 'Total weight': '10 kg' }],
  ['Khiladi Badminton Racquet Pair with Shuttles', 'Khiladi', 'Sports', 899, 1499, 180, 10, 'box', '95065900', null, 6, null, 'Two aluminium racquets with a cover and three nylon shuttles.', ['Lightweight aluminium', 'Includes 3 shuttles', 'Full cover'], { Weight: '95 g each' }],
  ['Khilona Wooden Building Blocks (50 Pieces)', 'Khilona', 'Toys', 799, 1199, 150, 10, 'box', '95030030', null, 6, null, 'Smooth, non-toxic painted wooden blocks for toddlers to build and stack.', ['50 pieces', 'Non-toxic paint', 'Ages 2+'], { Pieces: '50', Age: '2 years and up' }],
  ['Khilona Rechargeable Remote Control Car', 'Khilona', 'Toys', 1299, 1999, 120, 6, 'box', '95030090', ['Red', 'Blue'], 6, null, 'High-speed RC car with a rechargeable battery and shock-absorbing wheels.', ['Rechargeable battery', '2.4 GHz remote', 'Ages 6+'], { Battery: 'USB rechargeable', Age: '6 years and up' }],
  ["Khilona Young Scientist's Science Kit", 'Khilona', 'Toys', 649, 999, 140, 10, 'box', '95030090', null, 6, null, '25 safe experiments with a colour manual for curious kids.', ['25 experiments', 'Illustrated manual', 'Ages 8+'], { Experiments: '25', Age: '8 years and up' }],
];

// ───────────── People ─────────────
const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Rohan', 'Arjun', 'Karan', 'Rahul', 'Siddharth', 'Nikhil', 'Varun', 'Kabir', 'Ishaan', 'Manish', 'Suresh', 'Ravi', 'Priya', 'Ananya', 'Diya', 'Sneha', 'Pooja', 'Kavya', 'Meera', 'Riya', 'Neha', 'Shruti', 'Aditi', 'Lakshmi', 'Fatima', 'Sana', 'Harpreet', 'Gurpreet', 'Deepa', 'Anjali', 'Swati', 'Tanvi', 'Imran', 'Joseph', 'Thomas', 'Venkat', 'Prakash'];
const LAST = ['Sharma', 'Verma', 'Gupta', 'Iyer', 'Nair', 'Reddy', 'Patel', 'Shah', 'Mehta', 'Joshi', 'Kulkarni', 'Deshpande', 'Singh', 'Kaur', 'Das', 'Banerjee', 'Mukherjee', 'Pillai', 'Menon', 'Rao', 'Khan', 'Qureshi', 'Fernandes', 'Mathew', 'Agarwal', 'Bansal', 'Chopra', 'Malhotra', 'Bhat', 'Naidu'];
const CITIES = [
  ['Mumbai', 'Maharashtra', ['400050', '400076', '400097', '400703'], ['Hill Road, Bandra West', 'Powai, Hiranandani Gardens', 'Malad East', 'Sector 17, Vashi']],
  ['Pune', 'Maharashtra', ['411038', '411014', '411057'], ['Kothrud', 'Viman Nagar', 'Hinjewadi Phase 1']],
  ['Bengaluru', 'Karnataka', ['560038', '560102', '560076'], ['Indiranagar 12th Main', 'HSR Layout Sector 2', 'BTM Layout 2nd Stage']],
  ['New Delhi', 'Delhi', ['110017', '110092', '110085'], ['Malviya Nagar', 'Preet Vihar', 'Rohini Sector 9']],
  ['Gurugram', 'Haryana', ['122002', '122018'], ['DLF Phase 3', 'Sector 49, Sohna Road']],
  ['Noida', 'Uttar Pradesh', ['201301', '201304'], ['Sector 62', 'Sector 137']],
  ['Lucknow', 'Uttar Pradesh', ['226010', '226016'], ['Gomti Nagar', 'Indira Nagar']],
  ['Hyderabad', 'Telangana', ['500081', '500034', '500072'], ['Madhapur', 'Banjara Hills Road 12', 'Kukatpally']],
  ['Chennai', 'Tamil Nadu', ['600040', '600020', '600097'], ['Anna Nagar', 'Adyar', 'Perungudi']],
  ['Coimbatore', 'Tamil Nadu', ['641004'], ['RS Puram']],
  ['Kochi', 'Kerala', ['682024', '682030'], ['Kakkanad', 'Edappally']],
  ['Kolkata', 'West Bengal', ['700091', '700029'], ['Salt Lake Sector V', 'Ballygunge']],
  ['Ahmedabad', 'Gujarat', ['380015', '380054'], ['Satellite', 'Bodakdev']],
  ['Jaipur', 'Rajasthan', ['302017', '302021'], ['Malviya Nagar', 'Vaishali Nagar']],
  ['Chandigarh', 'Chandigarh', ['160022'], ['Sector 35']],
  ['Bhopal', 'Madhya Pradesh', ['462016'], ['Arera Colony']],
  ['Indore', 'Madhya Pradesh', ['452010'], ['Vijay Nagar']],
  ['Patna', 'Bihar', ['800001'], ['Fraser Road']],
  ['Bhubaneswar', 'Odisha', ['751024'], ['Patia']],
  ['Guwahati', 'Assam', ['781006'], ['Zoo Road']],
];
const BUSINESSES = [
  { legal: 'Sai Krishna Traders', trade: 'Sai Krishna Traders', type: 'PROPRIETORSHIP', pan: 'P', city: 'Hyderabad', state: 'Telangana', code: '36', pincode: '500095', street: '5-1-12, Troop Bazaar, Koti', credit: ['NET_30', 500000_00], people: [['Srinivas', 'Rao', 'OWNER'], ['Lavanya', 'Reddy', 'BUYER']] },
  { legal: 'Om Sai Caterers', trade: 'Om Sai Caterers & Banquets', type: 'PARTNERSHIP', pan: 'F', city: 'Pune', state: 'Maharashtra', code: '27', pincode: '411001', street: 'Office 4, Camp Area, East Street', credit: null, people: [['Mahesh', 'Kulkarni', 'OWNER']] },
  { legal: 'Brightpath Education Services Private Limited', trade: 'Brightpath Coaching Centre', type: 'PRIVATE_LIMITED', pan: 'C', city: 'Lucknow', state: 'Uttar Pradesh', code: '09', pincode: '226001', street: '2nd Floor, Hazratganj Commercial Complex', credit: ['NET_15', 150000_00], people: [['Ankit', 'Srivastava', 'OWNER'], ['Ritu', 'Mishra', 'APPROVER']] },
  { legal: 'GreenLeaf Facility Services LLP', trade: 'GreenLeaf Facility Services', type: 'LLP', pan: 'F', city: 'Gurugram', state: 'Haryana', code: '06', pincode: '122001', street: 'Unit 210, Udyog Vihar Phase 4', credit: null, people: [['Vikram', 'Malhotra', 'OWNER']] },
];

const REVIEWS = {
  5: [['Excellent quality', 'Better than I expected for the price. Packaging was neat and delivery was on time.'], ['Totally worth it', 'Using it daily for two weeks now, no complaints at all. Would recommend.'], ['Very happy', 'Exactly as described. The seller also called to confirm the address, nice touch.'], ['Great buy', 'Good finish and sturdy. Ordered a second one for my parents.']],
  4: [['Good product', 'Works well. Delivery took a day longer than shown but the product is good.'], ['Nice, value for money', 'Quality is good for the price. Packaging could be better.'], ['Satisfied', 'Does the job. Instructions could be clearer, otherwise fine.']],
  3: [['Okay', 'Average. It works but I expected slightly better finish.'], ['Decent', 'Fine for the price, nothing special.']],
  2: [['Not great', 'Colour was different from the photo. Thinking of returning it.']],
  1: [['Disappointed', 'Stopped working properly within a week. Raised a return request.']],
};
const RETURN_REASONS = ['Size doesn’t fit', 'Item is different from the photos', 'Received a damaged item', 'Quality not as expected', 'Ordered by mistake'];
const CANCEL_REASONS = ['Item went out of stock at our warehouse', 'Unable to ship to this PIN code on time', 'Product failed our pre-dispatch quality check'];
const COURIERS = ['Delhivery', 'Blue Dart', 'Ekart Logistics', 'DTDC', 'Xpressbees', 'India Post'];
const TICKETS = [
  ['Where is my order?', 'It’s been a few days and tracking hasn’t updated. Can you check?', 'We’ve checked with the courier; your parcel is at the local hub and will be delivered within 2 days.'],
  ['Need GST invoice', 'Please share the GST invoice for my order, I need it for office reimbursement.', 'You can download the invoice from Orders → your order → Invoice. We’ve also asked the seller to confirm the GSTIN.'],
  ['Change delivery address', 'I gave my old office address by mistake. Can it be changed?', 'Done — the address has been updated before dispatch. The seller has been informed.'],
  ['Refund status', 'My return was picked up last week. When will I get the refund?', 'The seller has received the item. The refund has been initiated and should reflect in 5–7 working days.'],
  ['Bulk order enquiry', 'We need 200 units for our office. Can we get a better price?', 'Please raise a request for quotation from the Wholesale page so sellers can send you their best price.'],
];

// ───────────── Helpers ─────────────
function isLocal(url) {
  try { return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(url).hostname); } catch { return false; }
}
const phone = () => `${pick(['9', '8', '7', '6'])}${String(int(100000000, 999999999))}`;
const slug = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);
const ago = (days, hours = 0) => new Date(Date.now() - days * DAY - hours * HOUR);

async function sql(db, text, ...values) { return db.$executeRawUnsafe(text, ...values); }

// ───────────── Removal ─────────────
/** Deletes everything belonging to the given stores and users (orders, listings, products, ledger …), children first. */
async function purge(db, { storeIds = [], userIds = [], orgIds = [], productIds = [], brandIds = [], couponCodes = [], promotionIds = [] }) {
  const s = storeIds.length ? storeIds : ['00000000-0000-0000-0000-000000000000'];
  const u = userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000'];
  const o = orgIds.length ? orgIds : ['00000000-0000-0000-0000-000000000000'];
  const orders = `SELECT id FROM orders WHERE "userId" = ANY($2::uuid[]) OR "organizationId" = ANY($3::uuid[]) OR id IN (SELECT "orderId" FROM seller_orders WHERE "storeId" = ANY($1::uuid[]))`;
  // Pass only the arrays a statement uses (PostgreSQL rejects unused parameters), renumbered from $1.
  const run = (text) => {
    const values = [s, u, o];
    const used = [1, 2, 3].filter((n) => text.includes(`$${n}`));
    let t = text;
    used.forEach((n, i) => { t = t.replaceAll(`$${n}`, `$@${i + 1}`); });
    return db.$executeRawUnsafe(t.replaceAll('$@', '$'), ...used.map((n) => values[n - 1]));
  };
  await run(`DELETE FROM support_tickets WHERE "userId" = ANY($2::uuid[]) OR "orderId" IN (${orders})`);
  await run(`DELETE FROM refunds WHERE "orderId" IN (${orders})`);
  await run(`DELETE FROM returns WHERE "orderId" IN (${orders})`);
  await run(`DELETE FROM inventory_reservations WHERE "listingId" IN (SELECT id FROM seller_listings WHERE "storeId" = ANY($1::uuid[]))`);
  await run(`DELETE FROM settlement_entries WHERE "storeId" = ANY($1::uuid[]) OR "orderId" IN (${orders})`);
  await run(`DELETE FROM payout_records WHERE "storeId" = ANY($1::uuid[])`);
  await run(`DELETE FROM audit_logs WHERE "entityId" IN (SELECT id::text FROM orders WHERE id IN (${orders}) UNION SELECT id::text FROM seller_orders WHERE "orderId" IN (${orders}))`);
  await run(`DELETE FROM orders WHERE id IN (${orders})`);
  await run(`DELETE FROM seller_listings WHERE "storeId" = ANY($1::uuid[])`);
  if (promotionIds.length) await db.$executeRawUnsafe('DELETE FROM promotions WHERE id = ANY($1::uuid[])', promotionIds);
  if (productIds.length) {
    await db.$executeRawUnsafe('DELETE FROM product_variants WHERE "catalogProductId" = ANY($1::uuid[]) AND NOT EXISTS (SELECT 1 FROM seller_listings l WHERE l."variantId" = product_variants.id)', productIds);
    await db.$executeRawUnsafe('DELETE FROM catalog_products cp WHERE id = ANY($1::uuid[]) AND NOT EXISTS (SELECT 1 FROM product_variants v WHERE v."catalogProductId" = cp.id)', productIds);
  }
  await run('DELETE FROM seller_stores WHERE id = ANY($1::uuid[])');
  await run('DELETE FROM organizations WHERE id = ANY($3::uuid[])');
  await run(`DELETE FROM audit_logs WHERE "actorId" = ANY($2::text[]) OR "entityId" = ANY($2::text[]) OR "entityId" = ANY($1::text[])`);
  await run('DELETE FROM users WHERE id = ANY($2::uuid[])');
  if (brandIds.length) await db.$executeRawUnsafe('DELETE FROM brands b WHERE id = ANY($1::uuid[]) AND NOT EXISTS (SELECT 1 FROM catalog_products cp WHERE cp."brandId" = b.id)', brandIds);
  if (couponCodes.length) await db.$executeRawUnsafe('DELETE FROM coupons c WHERE code = ANY($1::text[]) AND NOT EXISTS (SELECT 1 FROM coupon_redemptions r WHERE r."couponId" = c.id)', couponCodes);
}

export async function removeSample(db) {
  const row = await db.setting.findUnique({ where: { key: MARKER } });
  if (!row) return false;
  await purge(db, row.value);
  await db.setting.delete({ where: { key: MARKER } });
  return true;
}

/** Removes the old clearly-labelled demo catalogue (records with demo = true) so only realistic data remains. */
export async function removeDemo(db) {
  const ids = async (table) => (await db.$queryRawUnsafe(`SELECT id::text FROM ${table} WHERE demo`)).map((r) => r.id);
  const [storeIds, userIds, productIds, orgIds] = [await ids('seller_stores'), await ids('users'), await ids('catalog_products'), await ids('organizations')];
  const brandIds = (await db.$queryRawUnsafe('SELECT DISTINCT "brandId"::text AS id FROM catalog_products WHERE demo')).map((r) => r.id);
  // Demo-paid orders placed by real accounts against demo listings go too (they reference demo stores).
  await purge(db, { storeIds, userIds, orgIds, productIds, brandIds });
  await db.$executeRawUnsafe('DELETE FROM orders WHERE demo AND id NOT IN (SELECT "orderId" FROM refunds) AND id NOT IN (SELECT "orderId" FROM returns)');
  await db.coupon.updateMany({ where: { code: 'WELCOME10' }, data: { description: '10% off your first order, up to ₹500' } });
  return { stores: storeIds.length, products: productIds.length };
}

// ───────────── Seeding ─────────────
export async function seedSample(db, { encryptionKey, log = console.log } = {}) {
  rand = rng(20261123);
  if (await db.setting.findUnique({ where: { key: MARKER } })) { log('Sample data is already present. Use --reset to rebuild it.'); return null; }
  const { hashPassword, encrypt } = await import('../src/lib/security.js');
  const { transaction } = await import('../src/lib/db.js');
  const orders = await import('../src/services/orders.js');
  const { quote } = await import('../src/services/pricing.js');
  const { buildSearchText } = await import('../src/services/products.js');
  const { shipmentFlow } = await import('../src/integrations/shipping.js');
  const { nextNumber } = await import('../src/lib/sequence.js');

  const marker = { createdAt: new Date().toISOString(), storeIds: [], userIds: [], orgIds: [], productIds: [], brandIds: [], couponCodes: [], promotionIds: [] };
  const save = () => db.setting.upsert({ where: { key: MARKER }, create: { key: MARKER, value: marker }, update: { value: marker } });
  const passwordHash = await hashPassword(SAMPLE_PASSWORD);
  const categories = new Map((await db.category.findMany()).map((c) => [c.name, c]));
  const usedPhones = new Set((await db.user.findMany({ where: { phone: { not: null } }, select: { phone: true } })).map((x) => x.phone));
  const uniquePhone = () => { let p; do { p = phone(); } while (usedPhones.has(p)); usedPhones.add(p); return p; };
  const usedEmails = new Set();
  const email = (first, last) => { let e = `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, ''); let n = 1; while (usedEmails.has(e)) e = `${first}.${last}${++n}`.toLowerCase(); usedEmails.add(e); return `${e}@example.com`; };

  // Sellers, their owners, warehouses and verified bank accounts.
  log('Creating sellers…');
  const stores = [];
  for (const [i, s] of SELLERS.entries()) {
    const [first, last] = [pick(FIRST.slice(0, 15)), pick(LAST)];
    const created = ago(int(150, 200));
    const owner = await db.user.create({ data: { name: `${first} ${last}`, email: email(first, last), phone: uniquePhone(), passwordHash, emailVerifiedAt: created, termsAcceptedAt: created, createdAt: created } });
    marker.userIds.push(owner.id);
    const sPan = pan(s.pan);
    const address = { line1: s.street, city: s.city, state: s.state, pincode: s.pincode };
    const account = String(int(10000000, 99999999)) + String(int(1000, 9999));
    const store = await db.sellerStore.create({
      data: {
        slug: s.slug, name: s.name, description: s.about, legalName: s.legal, businessType: s.type, gstRegistered: true, gstin: gstin(s.code, sPan), pan: sPan,
        contactPhone: uniquePhone(), pickupAddress: address, stateCode: s.code, status: 'APPROVED', primaryCategoryId: categories.get(s.category)?.id ?? null,
        termsAcceptedAt: created, createdAt: created, handlingDays: int(1, 2),
        members: { create: { userId: owner.id, role: 'OWNER', createdAt: created } },
        warehouses: { create: { name: `${s.city} warehouse`, address, pincode: s.pincode } },
        payoutAccount: { create: { accountHolder: s.legal, accountNumberEnc: encrypt(account, encryptionKey), accountLast4: account.slice(-4), ifsc: s.bank[1], bankName: s.bank[0], verified: i !== 9 } },
      },
      include: { warehouses: true },
    });
    marker.storeIds.push(store.id);
    stores.push({ ...store, owner, warehouseId: store.warehouses[0].id, code: s.code });
  }
  await save();

  // Catalogue.
  log('Creating the catalogue…');
  const brands = new Map();
  const listings = [];
  const products = [];
  for (const [n, [name, brandName, categoryName, price, mrp, stock, moq, art, hsn, variants, sellerIdx, extraIdx, description, highlights, specs]] of PRODUCTS.entries()) {
    let brand = brands.get(brandName);
    if (!brand) {
      brand = await db.brand.findFirst({ where: { name: { equals: brandName, mode: 'insensitive' } } }) ?? await db.brand.create({ data: { name: brandName, slug: slug(brandName), verified: chance(0.6) } });
      if (!marker.brandIds.includes(brand.id)) marker.brandIds.push(brand.id);
      brands.set(brandName, brand);
    }
    const category = categories.get(categoryName);
    const created = ago(int(95, 140));
    const pslug = slug(name);
    const labels = variants ?? ['Standard'];
    const attrs = [];
    for (const [key, value] of Object.entries(specs)) {
      const attribute = await db.productAttribute.upsert({ where: { name: key }, create: { name: key }, update: {} });
      attrs.push({ attributeId: attribute.id, value });
    }
    const product = await db.catalogProduct.create({
      data: {
        slug: (await db.catalogProduct.findUnique({ where: { slug: pslug } })) ? `${pslug}-${n}` : pslug, name, brandId: brand.id, categoryId: category.id, hsnCode: hsn,
        status: 'APPROVED', featured: [0, 4, 8, 27, 13, 22].includes(n), description: `${description} Sold and shipped by a verified IBazzzar seller with a GST invoice.`, highlights,
        createdByStoreId: stores[sellerIdx].id, createdAt: created,
        searchText: buildSearchText({ name, brand: brandName, category: categoryName, highlights, attributes: specs, variantLabels: labels }),
        media: { create: { url: `/products/${art}.svg`, alt: name, sortOrder: 0 } },
        attributes: { create: attrs },
      },
    });
    marker.productIds.push(product.id);
    products.push(product);
    for (const [v, label] of labels.entries()) {
      const variant = await db.productVariant.create({ data: { catalogProductId: product.id, slug: `${product.slug}-${slug(label)}`, label, sortOrder: v, weightGrams: art === 'chair' || categoryName === 'Furniture' ? 14000 : categoryName === 'Grocery' ? 1200 : 600 } });
      for (const [k, idx] of [[0, sellerIdx], [1, extraIdx]]) {
        if (idx === null || idx === undefined) continue;
        const store = stores[idx];
        const p = (k === 0 ? price : Math.round((price * (1 + (chance(0.5) ? 0.04 : -0.03))) / 10) * 10) * 100;
        const prefix = store.slug.split('-').map((w) => w[0]).join('').toUpperCase();
        const listing = await db.sellerListing.create({
          data: {
            storeId: store.id, variantId: variant.id, sku: `${prefix}-${String(n + 1).padStart(3, '0')}${labels.length > 1 ? `-${v + 1}` : ''}`, pricePaise: p, mrpPaise: mrp * 100, moq,
            status: 'APPROVED', returnable: categoryName !== 'Grocery', codAllowed: price < 8000, createdAt: created,
            tiers: { create: [{ minQty: moq, pricePaise: Math.round((p * 0.92) / 100) * 100 }, { minQty: moq * 4, pricePaise: Math.round((p * 0.85) / 100) * 100 }] },
            inventory: { create: { warehouseId: store.warehouseId, onHand: Math.round((k === 0 ? stock : stock / 3) / labels.length) + 40 } },
          },
        });
        listings.push({ id: listing.id, storeId: store.id, productId: product.id, category: categoryName, price, moq, returnable: categoryName !== 'Grocery' });
      }
    }
  }
  await save();

  // Coupons and deals.
  const now = new Date();
  const coupons = [
    { code: 'FESTIVE15', description: '15% off on orders above ₹1,499, up to ₹300', kind: 'PERCENT', value: 15, maxDiscountPaise: 30000, minOrderPaise: 149900, startsAt: ago(60), endsAt: new Date(now.getTime() + 20 * DAY), public: true, perUserLimit: 2 },
    { code: 'FLAT200', description: '₹200 off on orders above ₹1,999', kind: 'FLAT', value: 20000, minOrderPaise: 199900, startsAt: ago(45), endsAt: new Date(now.getTime() + 30 * DAY), public: true, perUserLimit: 1 },
    { code: 'BULKBUY5', description: '5% off business orders, up to ₹2,000', kind: 'PERCENT', value: 5, maxDiscountPaise: 200000, minOrderPaise: 500000, mode: 'BUSINESS', startsAt: ago(80), endsAt: new Date(now.getTime() + 60 * DAY), public: false, perUserLimit: 5 },
    { code: 'MONSOON10', description: '10% off monsoon sale, up to ₹250', kind: 'PERCENT', value: 10, maxDiscountPaise: 25000, minOrderPaise: 99900, startsAt: ago(85), endsAt: ago(55), public: true, perUserLimit: 1 },
  ];
  for (const c of coupons) {
    if (await db.coupon.findUnique({ where: { code: c.code } })) continue;
    await db.coupon.create({ data: c });
    marker.couponCodes.push(c.code);
  }
  const dealListings = listings.filter((l) => ['Electronics', 'Smart Gadgets'].includes(l.category)).slice(0, 5).map((l) => l.id);
  const live = await db.promotion.create({ data: { name: 'Gadget Days', description: 'Up to 20% off earbuds, power banks and smartwatches', discountBps: 2000, startsAt: ago(1), endsAt: new Date(now.getTime() + 3 * DAY), items: { create: dealListings.map((listingId) => ({ listingId })) } } });
  const homeDeal = listings.filter((l) => l.category === 'Home & Living').slice(0, 4).map((l) => l.id);
  const next = await db.promotion.create({ data: { name: 'Home Refresh Week', description: '15% off copperware, linen and lamps', discountBps: 1500, startsAt: new Date(now.getTime() + 5 * DAY), endsAt: new Date(now.getTime() + 12 * DAY), items: { create: homeDeal.map((listingId) => ({ listingId })) } } });
  marker.promotionIds.push(live.id, next.id);
  await save();

  // Customers.
  log('Creating customers and business accounts…');
  const customers = [];
  for (let i = 0; i < 90; i++) {
    const [first, last] = [pick(FIRST), pick(LAST)];
    const [city, state, pins, streets] = pick(CITIES);
    const created = chance(0.7) ? ago(int(95, 240)) : ago(int(3, 94));
    const u = await db.user.create({ data: { name: `${first} ${last}`, email: email(first, last), phone: uniquePhone(), passwordHash, emailVerifiedAt: chance(0.85) ? created : null, termsAcceptedAt: created, marketingOptIn: chance(0.4), createdAt: created } });
    marker.userIds.push(u.id);
    const address = { name: `${first} ${last}`, phone: u.phone, line1: `${pick(['Flat', 'House No.', 'B-'])} ${int(2, 908)}, ${pick(['Shanti', 'Sai', 'Green', 'Lake View', 'Sunrise', 'Krishna'])} ${pick(['Apartments', 'Residency', 'Heights', 'Enclave'])}`, line2: pick(streets), city, state, pincode: pick(pins) };
    await db.address.create({ data: { userId: u.id, label: 'Home', ...address, isDefault: true, createdAt: created } });
    customers.push({ user: u, address, created, loyal: chance(0.25) });
  }
  // Business buyers.
  const orgs = [];
  for (const b of BUSINESSES) {
    const created = ago(int(100, 160));
    const oPan = pan(b.pan);
    const address = { line1: b.street, city: b.city, state: b.state, pincode: b.pincode };
    const members = [];
    for (const [first, last, role] of b.people) {
      const u = await db.user.create({ data: { name: `${first} ${last}`, email: email(first, last), phone: uniquePhone(), passwordHash, emailVerifiedAt: created, termsAcceptedAt: created, createdAt: created } });
      marker.userIds.push(u.id);
      members.push({ user: u, role });
    }
    const org = await db.organization.create({
      data: {
        legalName: b.legal, tradeName: b.trade, businessType: b.type, gstRegistered: true, gstin: gstin(b.code, oPan), pan: oPan, contactPhone: members[0].user.phone, registeredAddress: address,
        status: 'APPROVED', creditApproved: !!b.credit, allowedTerms: b.credit?.[0] ?? 'PREPAID', creditLimitPaise: b.credit?.[1] ?? 0, createdAt: created,
        members: { create: members.map((m) => ({ userId: m.user.id, role: m.role })) },
      },
    });
    marker.orgIds.push(org.id);
    orgs.push({ org, members, address: { name: members[0].user.name, phone: members[0].user.phone, ...address }, credit: !!b.credit, created });
  }
  await save();

  // ───────────── Orders over the last 90 days ─────────────
  log('Placing orders and running them through fulfilment (this takes a minute)…');
  const actorId = stores[0].owner.id;
  const plan = [];
  for (let d = 89; d >= 0; d--) {
    // Gentle growth with weekend peaks.
    const day = ago(d);
    const weekend = [0, 6].includes(new Date(day.getTime() + 5.5 * HOUR).getUTCDay());
    const count = Math.max(0, Math.round(1.5 + (89 - d) / 30 + (weekend ? 1.5 : 0) + (rand() - 0.5) * 2.5));
    for (let i = 0; i < count; i++) plan.push(new Date(day.getTime() - int(0, 20) * HOUR - int(0, 59) * 60_000));
  }
  const stats = { orders: 0, delivered: 0, cancelled: 0, returns: 0, reviews: 0, skipped: 0 };
  const reviewed = new Set();
  let ticketsLeft = TICKETS.length;

  for (const placedAt of plan.sort((a, b) => a - b)) {
    const age = (Date.now() - placedAt.getTime()) / DAY;
    const business = chance(0.12);
    let buyer; let address; let organizationId = null; let method;
    if (business) {
      const o = pick(orgs.filter((x) => x.created < placedAt));
      if (!o) continue;
      buyer = o.members[0].user; address = o.address; organizationId = o.org.id;
      method = o.credit && chance(0.6) ? 'CREDIT_TERMS' : pick(['ONLINE', 'BANK_TRANSFER']);
    } else {
      const pool = customers.filter((c) => c.created < placedAt);
      if (!pool.length) continue;
      const c = chance(0.35) ? pick(pool.filter((x) => x.loyal).length ? pool.filter((x) => x.loyal) : pool) : pick(pool);
      buyer = c.user; address = c.address;
      method = weighted([['ONLINE', 58], ['COD', 42]]);
    }
    const lineCount = business ? int(1, 3) : weighted([[1, 60], [2, 30], [3, 10]]);
    const chosen = new Map();
    for (let i = 0; i < lineCount; i++) {
      const l = pick(listings);
      if (chosen.has(l.id)) continue;
      chosen.set(l.id, business ? l.moq * int(1, 3) : l.price > 5000 ? 1 : weighted([[1, 70], [2, 22], [3, 8]]));
    }
    const items = [...chosen].map(([listingId, quantity]) => ({ listingId, quantity }));
    const coupon = !business && chance(0.16) ? pick(['FESTIVE15', 'FLAT200', 'WELCOME10']) : business && chance(0.3) ? 'BULKBUY5' : null;
    const before = new Date();
    let order;
    try {
      order = await transaction(db, async (tx) => {
        const input = { items, mode: business ? 'BUSINESS' : 'RETAIL', paymentMethod: method, state: address.state, pincode: address.pincode, userId: buyer.id };
        let q;
        try { q = await quote(tx, { ...input, couponCode: coupon ?? undefined }); } catch { q = await quote(tx, input); }
        if (q.problems?.length) throw new Error('unavailable');
        return orders.createOrder(tx, { user: buyer, organizationId, q, address, paymentMethod: method === 'COD' && !q.payment.cod.available ? 'ONLINE' : method, billingGstin: business ? (await tx.organization.findUnique({ where: { id: organizationId } })).gstin : undefined });
      });
    } catch { stats.skipped++; continue; }
    stats.orders++;

    // Payment.
    let paid = order.paymentMethod !== 'ONLINE' && order.paymentMethod !== 'BANK_TRANSFER';
    if (order.paymentMethod === 'ONLINE' || order.paymentMethod === 'BANK_TRANSFER') {
      const abandons = order.paymentMethod === 'ONLINE' && chance(0.08);
      if (order.paymentMethod === 'ONLINE') {
        const intentAt = new Date(placedAt.getTime() + 60_000);
        if (chance(0.12) || abandons) await db.paymentIntent.create({ data: { orderId: order.id, provider: 'razorpay', providerOrderId: `order_${randomBytes(7).toString('hex')}`, amountPaise: order.totalPaise, status: 'FAILED', createdAt: intentAt } });
        if (!abandons) {
          const ref = `pay_${randomBytes(7).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x')}`;
          const intent = await db.paymentIntent.create({ data: { orderId: order.id, provider: 'razorpay', providerOrderId: `order_${randomBytes(7).toString('hex')}`, amountPaise: order.totalPaise, status: 'CAPTURED', createdAt: new Date(intentAt.getTime() + 90_000) } });
          await db.paymentTransaction.create({ data: { intentId: intent.id, providerPaymentId: ref, amountPaise: order.totalPaise, status: 'captured', method: pick(['upi', 'upi', 'card', 'netbanking']), source: 'WEBHOOK', createdAt: new Date(intentAt.getTime() + 120_000) } });
          await transaction(db, (tx) => orders.applyPayment(tx, order.id, { paymentStatus: 'PAID', reference: ref, actorId: buyer.id }));
          paid = true;
        }
      } else if (age > 2 || chance(0.6)) {
        await transaction(db, (tx) => orders.applyPayment(tx, order.id, { paymentStatus: 'PAID', reference: `UTR ${pick(['HDFC', 'ICIC', 'SBIN', 'UTIB'])}${int(10000000, 99999999)}${int(1000, 9999)}`, actorId }));
        paid = true;
      }
      if (!paid && age > 1) {
        await transaction(db, (tx) => orders.cancelUnpaid(tx, order.id, { actorId: null, note: 'Payment not received in time' }));
        stats.cancelled++;
      }
    }

    // Fulfilment, per parcel.
    if (paid) {
      const parcels = await db.sellerOrder.findMany({ where: { orderId: order.id } });
      for (const so of parcels) {
        const store = stores.find((s) => s.id === so.storeId);
        const sellerActor = store.owner.id;
        if (age > 1.5 && chance(0.035)) {
          await transaction(db, (tx) => orders.sellerCancel(tx, so.id, { storeId: so.storeId, actorId: sellerActor, reason: pick(CANCEL_REASONS) }));
          stats.cancelled++;
          continue;
        }
        if (age < 0.6) continue; // still pending
        await transaction(db, (tx) => orders.markPacked(tx, so.id, { storeId: so.storeId, actorId: sellerActor }));
        if (age < 1.2) continue;
        const carrier = pick(COURIERS);
        const shipment = await transaction(db, (tx) => orders.ship(tx, so.id, { storeId: so.storeId, actorId: sellerActor, booking: { provider: 'MANUAL', carrier, trackingRef: `${carrier.slice(0, 2).toUpperCase()}${int(100000000, 999999999)}${int(10, 99)}` } }));
        const steps = age > 5 ? ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'] : age > 3 ? ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'] : ['PICKED_UP'];
        for (const status of steps) {
          await transaction(db, (tx) => orders.addTrackingEvent(tx, shipment.id, { storeId: so.storeId, actorId: sellerActor, status, location: status === 'DELIVERED' || status === 'OUT_FOR_DELIVERY' ? address.city : status === 'PICKED_UP' ? store.pickupAddress.city : `${pick(['Nagpur', 'Bhiwandi', 'Hosur', 'Manesar', 'Vijayawada'])} hub`, source: 'SELLER', flow: shipmentFlow }));
        }
        if (steps.includes('DELIVERED')) stats.delivered++;
      }
    }
    // Timestamps: spread this order's life over real days.
    await backdate(db, order.id, placedAt, before);

    // Returns and reviews on delivered parcels (only when the dates fit before today).
    const delivered = await db.sellerOrder.findMany({ where: { orderId: order.id, status: 'DELIVERED' }, include: { items: true } });
    for (const so of delivered) {
      const deliveredAt = (await db.orderStatusHistory.findFirst({ where: { sellerOrderId: so.id, status: 'DELIVERED' } }))?.createdAt;
      if (!deliveredAt) continue;
      const daysSince = (Date.now() - deliveredAt.getTime()) / DAY;
      const returnable = so.items.some((i) => listings.find((l) => l.id === i.listingId)?.returnable);
      if (returnable && daysSince > 6 && chance(0.07)) {
        const t0 = new Date();
        const item = so.items.find((i) => listings.find((l) => l.id === i.listingId)?.returnable);
        // The return was filed within the window at the time; the service checks against "now", so match that briefly.
        await sql(db, 'UPDATE order_status_history SET "createdAt" = now() WHERE "sellerOrderId" = $1::uuid AND status = \'DELIVERED\'', so.id);
        const ret = await transaction(db, (tx) => orders.requestReturn(tx, { user: buyer, orderId: order.id, sellerOrderId: so.id, items: [{ orderItemId: item.id, quantity: 1 }], reason: pick(RETURN_REASONS) }));
        await sql(db, 'UPDATE order_status_history SET "createdAt" = $1 WHERE "sellerOrderId" = $2::uuid AND status = \'DELIVERED\'', deliveredAt, so.id);
        const store = stores.find((s) => s.id === so.storeId);
        const approve = chance(0.85);
        await transaction(db, (tx) => orders.decideReturn(tx, ret.id, { storeId: so.storeId, actorId: store.owner.id, decision: approve ? 'APPROVED' : 'REJECTED', note: approve ? undefined : 'The item shows signs of use, so it can’t be returned.' }));
        if (approve) await transaction(db, (tx) => orders.receiveReturn(tx, ret.id, { storeId: so.storeId, actorId: store.owner.id }));
        const requestedAt = new Date(deliveredAt.getTime() + int(1, 4) * DAY);
        const doneAt = new Date(requestedAt.getTime() + int(2, 4) * DAY);
        await sql(db, 'UPDATE returns SET "createdAt" = $1, "updatedAt" = $2 WHERE id = $3::uuid', requestedAt, doneAt, ret.id);
        await sql(db, 'UPDATE refunds SET "createdAt" = $1 WHERE "returnId" = $2::uuid', doneAt, ret.id);
        await sql(db, 'UPDATE settlement_entries SET "createdAt" = $1 WHERE "sellerOrderId" = $2::uuid AND kind IN (\'REFUND_ADJUSTMENT\', \'COMMISSION_REVERSAL\') AND "createdAt" >= $3', doneAt, so.id, t0);
        await sql(db, 'UPDATE notifications SET "createdAt" = $1, read = true WHERE "createdAt" >= $2', doneAt, t0);
        await sql(db, 'UPDATE audit_logs SET "createdAt" = $1 WHERE "createdAt" >= $2', doneAt, t0);
        await sql(db, 'UPDATE stock_movements SET "createdAt" = $1 WHERE "createdAt" >= $2', doneAt, t0);
        // Most refunds were already paid out by finance; recent ones are still waiting.
        if (approve && daysSince > 12) await sql(db, 'UPDATE refunds SET status = \'PROCESSED\', "providerRef" = $1, "processedAt" = $2 WHERE "returnId" = $3::uuid AND status = \'PENDING_PROVIDER\'', `rfnd_${randomBytes(7).toString('hex')}`, new Date(doneAt.getTime() + DAY), ret.id);
        if (approve && daysSince > 12) await sql(db, 'UPDATE returns SET status = \'REFUNDED\' WHERE id = $1::uuid AND status = \'RECEIVED\'', ret.id);
        stats.returns++;
        continue;
      }
      for (const item of so.items) {
        const key = `${buyer.id}:${item.catalogProductId}`;
        if (reviewed.has(key) || daysSince < 3 || !chance(0.38)) continue;
        reviewed.add(key);
        const rating = weighted([[5, 50], [4, 32], [3, 11], [2, 4], [1, 3]]);
        const [title, body] = pick(REVIEWS[rating]);
        const r = await transaction(db, (tx) => orders.createReview(tx, buyer, item.catalogProductId, { rating, title, body }));
        await sql(db, 'UPDATE reviews SET "createdAt" = $1 WHERE id = $2::uuid', new Date(deliveredAt.getTime() + int(2, Math.min(12, Math.floor(daysSince))) * DAY - int(1, 20) * HOUR), r.id);
        stats.reviews++;
      }
    }
    // A few support conversations.
    if (ticketsLeft > 0 && age > 3 && chance(0.05)) {
      const [subject, message, reply] = TICKETS[TICKETS.length - ticketsLeft--];
      const at = new Date(placedAt.getTime() + int(2, 3) * DAY);
      await db.supportTicket.create({ data: { number: await nextNumber(db, 'ticket', 'SUP', { width: 5 }), userId: buyer.id, subject, orderId: order.id, status: chance(0.6) ? 'CLOSED' : 'AWAITING_CUSTOMER', createdAt: at, updatedAt: new Date(at.getTime() + 5 * HOUR), messages: { create: [{ author: 'CUSTOMER', authorId: buyer.id, authorName: buyer.name, body: message, createdAt: at }, { author: 'SUPPORT', authorName: 'IBazzzar Support', body: reply, createdAt: new Date(at.getTime() + 5 * HOUR) }] } } });
    }
    if (stats.orders % 40 === 0) log(`  ${stats.orders} orders…`);
  }

  // Credit-terms invoices older than 20 days have been paid by the business.
  const terms = await db.order.findMany({ where: { paymentStatus: 'ON_TERMS', organizationId: { in: marker.orgIds }, createdAt: { lt: ago(20) } } });
  for (const o of terms) {
    await transaction(db, (tx) => orders.recordTermsPayment(tx, o.id, { reference: `NEFT${int(100000000, 999999999)}`, actorId }));
    const paidAt = new Date(o.createdAt.getTime() + int(14, 19) * DAY);
    await sql(db, 'UPDATE order_status_history SET "createdAt" = $1 WHERE "orderId" = $2::uuid AND status = \'TERMS_PAID\'', paidAt, o.id);
    await sql(db, 'UPDATE orders SET "updatedAt" = $1 WHERE id = $2::uuid', paidAt, o.id);
  }

  // Payouts already sent for most of the older earnings.
  log('Recording seller payouts…');
  for (const store of stores) {
    const acct = await db.sellerPayoutAccount.findUnique({ where: { storeId: store.id } });
    if (!acct?.verified) continue;
    for (const [from, to, share] of [[90, 46, 0.95], [45, 16, 0.9]]) {
      const sum = await db.settlementEntry.aggregate({ where: { storeId: store.id, demo: false, createdAt: { gte: ago(from), lt: ago(to) } }, _sum: { amountPaise: true } });
      const amount = Math.floor((Number(sum._sum.amountPaise ?? 0) * share) / 100) * 100;
      if (amount < 100000) continue;
      const at = ago(to - 1);
      const ref = `${pick(['HDFC', 'ICIC', 'UTIB', 'KKBK'])}N${int(100000000, 999999999)}${int(100, 999)}`;
      const payout = await db.payoutRecord.create({ data: { storeId: store.id, amountPaise: amount, providerRef: ref, recordedBy: actorId, createdAt: at } });
      await db.settlementEntry.create({ data: { storeId: store.id, payoutId: payout.id, kind: 'PAYOUT', amountPaise: -amount, status: 'PAID_OUT', note: `Payout ${ref}`, createdAt: at } });
    }
  }
  // Old notifications have been read; system activity is attributed to the time it happened.
  await sql(db, 'UPDATE notifications SET read = true WHERE "createdAt" < $1', ago(3));
  await save();
  log(`Done: ${stores.length} sellers, ${products.length} products (${listings.length} offers), ${customers.length} customers, ${orgs.length} business accounts, ${stats.orders} orders (${stats.delivered} parcels delivered, ${stats.cancelled} cancellations, ${stats.returns} returns), ${stats.reviews} reviews.`);
  return stats;
}

/**
 * Moves one order's records from "now" to when it really happened: placed at `placedAt`, then packed, shipped and
 * delivered over the following days, never later than now. `since` marks when processing of this order started, so
 * notifications, audit entries and stock movements created for it can be moved with it.
 */
async function backdate(db, orderId, placedAt, since) {
  const limit = Date.now() - 15 * 60_000;
  const history = await db.orderStatusHistory.findMany({ where: { orderId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  const times = new Map();
  const parcelTimes = new Map();
  let t = placedAt.getTime();
  const step = { CONFIRMED: [2, 40, 60_000], PACKED: [5, 26, HOUR], SHIPPED: [3, 20, HOUR], PARTIALLY_SHIPPED: [0, 0, HOUR], DELIVERED: [40, 100, HOUR], CANCELLED: [3, 30, HOUR], TERMS_PAID: [480, 600, HOUR] };
  for (const h of history) {
    const [a, b, unit] = step[h.status] ?? [0, 1, HOUR];
    // Each parcel moves on its own clock from the order's confirmation.
    const base = h.sellerOrderId ? (parcelTimes.get(h.sellerOrderId) ?? t) : t;
    const at = Math.min(limit, base + int(a, b) * unit);
    times.set(h.id, at);
    if (h.sellerOrderId) parcelTimes.set(h.sellerOrderId, at); else t = Math.max(t, at);
  }
  for (const h of history) await sql(db, 'UPDATE order_status_history SET "createdAt" = $1 WHERE id = $2::uuid', new Date(times.get(h.id)), h.id);
  const at = (so, status) => { const h = history.find((x) => x.sellerOrderId === so && x.status === status); return h ? new Date(times.get(h.id)) : null; };
  const last = new Date(Math.max(placedAt.getTime(), ...times.values()));
  const order = await db.order.findUnique({ where: { id: orderId }, include: { sellerOrders: { include: { shipments: { include: { events: { orderBy: { occurredAt: 'asc' } } } } } } } });
  const due = order.paymentStatus === 'ON_TERMS' ? new Date(placedAt.getTime() + 30 * DAY) : order.paymentDueAt ? new Date(placedAt.getTime() + 30 * 60_000) : null;
  await sql(db, 'UPDATE orders SET "createdAt" = $1, "updatedAt" = $2, "paymentDueAt" = $3 WHERE id = $4::uuid', placedAt, last, due, orderId);
  await sql(db, 'UPDATE payment_intents SET "updatedAt" = "createdAt" WHERE "orderId" = $1::uuid', orderId);
  await sql(db, 'UPDATE coupon_redemptions SET "createdAt" = $1 WHERE "orderId" = $2::uuid', placedAt, orderId);
  for (const so of order.sellerOrders) {
    const shipped = at(so.id, 'SHIPPED');
    const delivered = at(so.id, 'DELIVERED');
    const parcelLast = new Date(Math.max(placedAt.getTime(), ...history.filter((h) => h.sellerOrderId === so.id).map((h) => times.get(h.id))));
    const estimate = new Date(placedAt.getTime() + int(4, 7) * DAY);
    await sql(db, 'UPDATE seller_orders SET "createdAt" = $1, "updatedAt" = $2, "estimatedDeliveryAt" = $3 WHERE id = $4::uuid', placedAt, parcelLast, estimate, so.id);
    if (shipped) await sql(db, 'UPDATE invoices SET "issuedAt" = $1 WHERE "sellerOrderId" = $2::uuid', shipped, so.id);
    for (const s of so.shipments) {
      const end = (delivered ?? new Date(Math.min(limit, shipped.getTime() + 2 * DAY))).getTime();
      await sql(db, 'UPDATE shipments SET "createdAt" = $1, "updatedAt" = $2 WHERE id = $3::uuid', shipped, new Date(end), s.id);
      s.events.forEach((e, i, all) => { e.when = i === 0 ? shipped.getTime() : e.status === 'DELIVERED' ? end : Math.min(end - HOUR, shipped.getTime() + ((end - shipped.getTime()) * i) / all.length); });
      for (const e of s.events) await sql(db, 'UPDATE tracking_events SET "occurredAt" = $1 WHERE id = $2::uuid', new Date(e.when), e.id);
    }
    if (delivered) await sql(db, 'UPDATE settlement_entries SET "createdAt" = $1 WHERE "sellerOrderId" = $2::uuid AND kind IN (\'SALE\', \'SHIPPING_FEE\', \'COMMISSION\')', delivered, so.id);
    const cancelled = at(so.id, 'CANCELLED');
    if (cancelled) {
      await sql(db, 'UPDATE refunds SET "createdAt" = $1 WHERE "orderId" = $2::uuid AND "storeId" = $3::uuid AND "returnId" IS NULL', cancelled, orderId, so.storeId);
      // Seller-cancellation refunds older than a week have been paid back.
      if (Date.now() - cancelled.getTime() > 7 * DAY) await sql(db, 'UPDATE refunds SET status = \'PROCESSED\', "providerRef" = $1, "processedAt" = $2 WHERE "orderId" = $3::uuid AND "storeId" = $4::uuid AND status = \'PENDING_PROVIDER\'', `rfnd_${randomBytes(7).toString('hex')}`, new Date(cancelled.getTime() + DAY), orderId, so.storeId);
    }
  }
  await sql(db, 'UPDATE notifications SET "createdAt" = $1 WHERE "createdAt" >= $2', last, since);
  await sql(db, 'UPDATE audit_logs SET "createdAt" = $1 WHERE "createdAt" >= $2', last, since);
  await sql(db, 'UPDATE stock_movements SET "createdAt" = $1 WHERE "createdAt" >= $2', placedAt, since);
  await sql(db, 'UPDATE inventory_reservations SET "createdAt" = $1, "expiresAt" = $2 WHERE "createdAt" >= $3', placedAt, new Date(placedAt.getTime() + 30 * 60_000), since);
}

// ───────────── CLI ─────────────
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { config: loadEnv } = await import('dotenv');
  const { fileURLToPath } = await import('node:url');
  loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
  if (process.env.NODE_ENV === 'production') { console.error('Refusing to seed sample data with NODE_ENV=production.'); process.exit(1); }
  if (!isLocal(process.env.DATABASE_URL) && !process.argv.includes('--allow-remote')) {
    console.error('Refusing: DATABASE_URL is not a database on this machine. Sample data is for local development only.');
    process.exit(1);
  }
  const { loadConfig } = await import('../src/config.js');
  const { createPrisma } = await import('../src/lib/db.js');
  const { seedReference } = await import('./seed.js');
  const config = loadConfig();
  const prisma = createPrisma(config);
  try {
    await seedReference(prisma);
    if (process.argv.includes('--remove') || process.argv.includes('--reset')) {
      console.log(await removeSample(prisma) ? 'Removed the previous sample data.' : 'No sample data to remove.');
    }
    if (process.argv.includes('--reset')) {
      const r = await removeDemo(prisma);
      if (r.stores || r.products) console.log(`Removed the old demo catalogue (${r.stores} stores, ${r.products} products).`);
    }
    if (!process.argv.includes('--remove')) {
      await seedSample(prisma, { encryptionKey: config.encryptionKey });
      console.log(`Sample accounts use example.com addresses and the password "${SAMPLE_PASSWORD}" (local only).`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
