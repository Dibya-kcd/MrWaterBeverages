import { Bill, DemoPresetId, OrganizationProfile, Product, Promotion, Trip } from '../types';
import { DEFAULT_ORG_PROFILE, INIT_PRODUCTS, INIT_PROMOTIONS } from './initialData';

export interface DemoPresetData {
  name: string;
  description: string;
  products: Product[];
  promotions: Promotion[];
  bills: Bill[];
  trips: Trip[];
  orgProfile: OrganizationProfile;
}

export const SAMPLE_BILLS_STANDARD: Bill[] = [];
export const SAMPLE_TRIPS_STANDARD: Trip[] = [];
export const SAMPLE_BILLS_BUSY: Bill[] = [];
export const SAMPLE_TRIPS_BUSY: Trip[] = [];

export const DEMO_PRESETS: Record<DemoPresetId, DemoPresetData> = {
  standard: {
    name: "Clean Ledger",
    description: "Start with an empty ledger ready for your own inventory, batches, and invoices.",
    products: INIT_PRODUCTS,
    promotions: INIT_PROMOTIONS,
    bills: [],
    trips: [],
    orgProfile: DEFAULT_ORG_PROFILE,
  },
  busy: {
    name: "Active Operations",
    description: "Ready for live day-to-day transactions with no dummy records.",
    products: INIT_PRODUCTS,
    promotions: INIT_PROMOTIONS,
    bills: [],
    trips: [],
    orgProfile: DEFAULT_ORG_PROFILE,
  },
  fresh: {
    name: "Clean Slate",
    description: "Completely clear database with zero mock records.",
    products: INIT_PRODUCTS,
    promotions: INIT_PROMOTIONS,
    bills: [],
    trips: [],
    orgProfile: DEFAULT_ORG_PROFILE,
  },
};
