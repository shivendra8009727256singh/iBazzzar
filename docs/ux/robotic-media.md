# Robotic media library — production brief

Status: **brief only.** None of these images exist yet except `apps/web/public/images/mall-concept.png` (hero, AI-generated concept, labelled on the site). Generate or commission each asset, review it against this brief, then add it to the manifest below.

Every scene is a **brand concept**. Captions on the site must say so (e.g. "A vision of tomorrow · brand concept"). Never use these images as product photos, and never imply IBazzzar operates robot warehouses or delivery fleets.

## Character: the IBazzzar concierge

| Attribute | Specification |
| --- | --- |
| Build | Slim humanoid, human proportions, approx. 1.7 m, calm upright posture |
| Shell | Ivory/white ceramic finish (#F8F4E8), satin, soft subsurface sheen |
| Accents | Forest-green metallic panels (#174B37) at shoulders, forearms, torso seams |
| Details | Thin warm-gold trims (#C99A3D) — collar ring, wrist bands, chest emblem disc (blank, no text) |
| Face | Smooth visor; two soft rounded LED eyes, warm white; no mouth, no teeth |
| Mood | Welcoming, attentive, professional. Open-palm gestures. Never aggressive, armed or childish |
| Avoid | Cartoon style, exposed wiring, red eyes, military styling, logos or readable text on the robot |

Keep the same character in every scene (same proportions, colours and visor).

## Global style suffix

Append to every prompt:

> photorealistic commercial photography, premium luxury retail interior, deep emerald green (#092C20) and warm metallic gold (#C99A3D) architecture with ivory (#F8F4E8) surfaces, soft cinematic lighting, shallow depth of field, clean composition with negative space on the left for headline text, no text, no logos, no watermarks, 16:9

Negative prompt: `text, letters, logos, watermark, distorted hands, extra limbs, cartoon, anime, neon cyberpunk, blue colour cast, weapons, clutter`

## Scenes

| # | File (`apps/web/public/images/robotics/`) | Used on | Prompt (before the style suffix) |
| --- | --- | --- | --- |
| 1 | `mall-entrance.webp` | Homepage hero | The ivory-and-green humanoid concierge robot welcoming shoppers at the grand entrance of a multi-level luxury mall, arched gold portals, marble floor, diverse Indian shoppers in the background |
| 2 | `electronics.webp` | Electronics department | The concierge robot demonstrating wireless headphones to a young customer in an elegant electronics showroom with emerald display walls |
| 3 | `fashion.webp` | Fashion | The concierge robot adjusting a garment on a boutique display while a shopper browses, warm gold rails, ivory fitting area |
| 4 | `grocery.webp` | Grocery | Two concierge robots neatly arranging fresh produce and pantry goods on wooden shelves in a premium grocery hall |
| 5 | `home-living.webp` | Home & Living / Furniture | The concierge robot presenting a sofa and lamp vignette in a calm furniture showroom |
| 6 | `beauty.webp` | Beauty | The concierge robot holding a skincare bottle at a softly lit beauty counter with ivory shelves |
| 7 | `wholesale-storage.webp` | Wholesale hub | Wide view of a clean high-bay storage hall with emerald racking and labelled cartons (labels blank), robots moving pallets |
| 8 | `inventory-scan.webp` | Seller landing | The concierge robot scanning a carton with a handheld scanner, soft gold light beam |
| 9 | `packing.webp` | Commerce story: Order | Robotic arm and the concierge robot packing an order into a kraft box on an ivory packing table |
| 10 | `sorting.webp` | Commerce story: Fulfilment | Parcels moving along a gentle conveyor in an emerald-lit sorting hall, robots supervising |
| 11 | `last-mile.webp` | Commerce story: Delivery | Illustrative, clearly futuristic: the concierge robot handing a parcel to a smiling customer at a residential doorway at dusk |
| 12 | `seller-command.webp` | Seller dashboard empty states | A seller at a desk with large screens showing abstract charts (no text), the concierge robot standing beside them |
| 13 | `procurement.webp` | Business workspace | Business buyers in a meeting room reviewing a tablet with the concierge robot presenting samples |
| 14 | `support.webp` | Help centre | The concierge robot at an ivory help desk listening attentively to a customer |
| 15 | `order-success.webp` | Order confirmation | The concierge robot giving a gentle bow beside a wrapped gift box with gold ribbon, plain ivory backdrop |
| 16 | `mascot.png` (transparent, 1:1) | Empty states, onboarding | Full-body concierge robot waving, isolated on transparent background, soft studio lighting |

## Delivery specs

- Masters: 3200 px wide PNG, kept outside the repo. Web: WebP, 1920 px wide, quality ~82, under 300 KB (hero under 220 KB).
- Mobile crops: subject on the right third so headlines on the left stay readable at 360 px.
- Alt text: describe the scene and end with "brand concept illustration".
- Licensing: record the generator or photographer and licence terms in the manifest. Do not use stock images whose licence forbids commercial use.

## Manifest

| File | Source | Licence | Reviewed by | Date |
| --- | --- | --- | --- | --- |
| `images/mall-concept.png` | AI-generated (Codex session) | Owner-generated | — | 2026-11-19 |
