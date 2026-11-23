// Shipping provider adapters.
// SANDBOX generates clearly-labelled test tracking numbers ("SBX…") and lets a seller or admin step the parcel through
// courier statuses. It never claims to be a real courier. MANUAL records a courier and AWB the seller booked themselves.
// A real courier aggregator (Shiprocket, Delhivery, etc.) implements the same createShipment/serviceability methods.
import { randomBytes } from 'node:crypto';
import { deliveryEstimate } from '../../../../packages/shared/src/index.js';

export function createShipping() {
  return {
    provider: 'SANDBOX',
    live: false,
    serviceability: (fromPincode, toPincode, handlingDays, settings) => deliveryEstimate(fromPincode, toPincode, handlingDays, settings),
    async createShipment({ mode, carrier, trackingRef }) {
      if (mode === 'MANUAL') return { provider: 'MANUAL', carrier, trackingRef: trackingRef.toUpperCase() };
      return { provider: 'SANDBOX', carrier: 'IBazzzar Sandbox Courier', trackingRef: `SBX${randomBytes(5).toString('hex').toUpperCase()}` };
    },
  };
}

export const shipmentFlow = {
  CREATED: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['IN_TRANSIT', 'FAILED_DELIVERY'],
  IN_TRANSIT: ['OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED_DELIVERY'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED_DELIVERY'],
  FAILED_DELIVERY: ['OUT_FOR_DELIVERY', 'RETURNED'],
};
