// Shapes returned by the IBazzzar API.
export type Mode = 'RETAIL' | 'BUSINESS';
export type Rating = { average: number; count: number };

export type Product = {
  id: string; listingId: string; catalogProductId: string; slug: string; productSlug: string; name: string; brand: string; category: string;
  variantId: string; variantLabel: string; image: string; images: string[]; pricePaise: number; listPricePaise: number; mrpPaise: number;
  promotion: { id: string; name: string; discountBps: number; endsAt: string } | null; stock: number; moq: number; bulkPackUnits: number;
  wholesaleEnabled: boolean; tiers: { minQty: number; pricePaise: number }[]; codAllowed: boolean; returnable: boolean; taxRateBps: number;
  hsnCode: string | null; sellerId: string; sellerName: string; sellerSlug: string; demo: boolean;
  rating?: Rating | null; offerCount?: number; variantCount?: number;
};

export type Category = { id: string; name: string; slug: string; description: string | null; imageUrl: string | null; parentId: string | null; products: number; gstRateBps: number | null };

export type Membership = { id: string; name: string; status: string; role: string; slug?: string };
export type User = {
  id: string; name: string; email: string; phone: string | null; emailVerifiedAt: string | null; createdAt: string; marketingOptIn: boolean;
  staffRole: string | null; staffRoleLabel: string | null; roles: string[]; organizations: Membership[]; stores: Membership[];
  activeOrganizationId: string | null; activeStoreId: string | null;
};

export type Address = { id?: string; name: string; phone: string; line1: string; line2?: string; city: string; state: string; pincode: string; label?: string; gstin?: string; isDefault?: boolean };

export type QuoteLine = {
  listingId: string; name: string; variantLabel: string; image: string; productSlug: string; quantity: number; unitPaise: number; mrpPaise: number;
  priceSource: string; lineTotalPaise: number; discountPaise: number; totalPaise: number; taxRateBps: number; taxPaise: number | null;
  sellerId: string; sellerName: string; returnable: boolean;
};
export type Estimate = { serviceable: boolean; reason?: string; zone?: string; minDays?: number; maxDays?: number; codAvailable?: boolean };
export type Quote = {
  mode: Mode; lines: QuoteLine[];
  sellers: { sellerId: string; sellerName: string; goodsPaise: number; shippingPaise: number; taxPaise: number | null; totalPaise: number; estimate: Estimate | null; codAllowed: boolean }[];
  problems: { listingId: string; message: string }[]; coupon: { code: string; description: string } | null;
  subtotalPaise: number; discountPaise: number; shippingPaise: number; codFeePaise: number; taxPaise: number | null; totalPaise: number;
  serviceable: boolean; payment: { cod: { available: boolean; feePaise: number; reason: string | null }; bankTransfer: { available: boolean } };
  freeShippingThresholdPaise: number;
};

export type TrackingEvent = { status: string; location: string | null; note: string | null; at: string; source?: string };
export type Shipment = { id: string; provider: string; carrier: string; trackingRef: string; status: string; events: TrackingEvent[] };
export type OrderItem = { id: string; listingId: string; catalogProductId?: string; name: string; variantLabel: string; image: string | null; quantity: number; unitPaise: number; discountPaise?: number; totalPaise: number; taxRateBps: number; sku?: string };
export type Parcel = {
  id: string; sellerId: string; sellerName: string; sellerSlug: string; status: string; subtotalPaise: number; shippingPaise: number; taxPaise: number; totalPaise: number;
  estimatedDeliveryAt: string | null; invoiceNumber: string | null; shipments: Shipment[]; items: OrderItem[];
};
export type Order = {
  id: string; number: string; mode: Mode; status: string; paymentStatus: string; paymentMethod: string; paymentRef: string | null; paymentDueAt: string | null;
  createdAt: string; demo: boolean; subtotalPaise: number; discountPaise: number; shippingPaise: number; codFeePaise: number; taxPaise: number; totalPaise: number;
  couponCode: string | null; address: Address | null; billingGstin: string | null; purchaseOrderId: string | null; parcels: Parcel[]; itemCount: number;
  history: { status: string; note: string | null; at: string; parcelId: string | null }[];
  returns: { id: string; parcelId: string; status: string; reason: string; note: string | null; refundPaise: number; createdAt: string }[];
  refunds: { id: string; amountPaise: number; status: string; reason: string; createdAt: string; processedAt: string | null }[];
  placedBy?: string; mine?: boolean;
};
export type PaymentInfo = { required: boolean; method: string; provider: 'razorpay' | 'demo' | null; dueAt: string | null };

export type Review = { id: string; authorName: string; rating: number; title: string; body: string; createdAt: string; verified?: boolean; productName?: string; productSlug?: string; images?: string[]; helpfulCount?: number; votedHelpful?: boolean; mine?: boolean };
export type ReviewSummary = { average: number | null; count: number; breakdown: { stars: number; count: number }[]; withPhotos: number };
export type ReviewPage = { reviews: Review[]; total: number; page: number; pages: number; summary: ReviewSummary; photos: { url: string; reviewId: string }[] };
export type Notification = { id: string; title: string; body: string; link: string | null; read: boolean; createdAt: string };
export type Ticket = { id: string; number: string; subject: string; orderId: string | null; status: string; createdAt: string; updatedAt: string; customer?: { id: string; name: string; email: string }; messages: { id: string; from: string; authorName: string; body: string; at: string }[] };
export type Paged<K extends string, T> = { [key in K]: T[] } & { total: number; page: number; pages: number };
