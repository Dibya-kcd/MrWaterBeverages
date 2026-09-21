import {
  BillingSettings,
  CategoryInfo,
  CategoryKey,
  FontSize,
  OrganizationProfile,
  PaletteTokens,
  Product,
  Promotion,
  Warehouse,
} from '../types';

export const CATS: Record<CategoryKey, CategoryInfo> = {
  energy: { name: "Energy Drinks", hsn: "22021090", gst: 0.40 },
  vibe: { name: "Carbonated / Soda", hsn: "22021010", gst: 0.40 },
  joos: { name: "Fruit Juices", hsn: "22029920", gst: 0.05 },
  water: { name: "Water Bottles & Packaged Water", hsn: "22019010", gst: 0.18 },
  general: { name: "General Beverages", hsn: "22029990", gst: 0.18 },
};

export const DEFAULT_ORG_PROFILE: OrganizationProfile = {
  name: "MrWater",
  tagline: "Beverage Distribution Ledger & GRN Inventory Depot",
  ownerName: "Depot Administrator",
  phone: "9437000000",
  email: "support@mrwater.internal",
  address: "Main Godown Yard, Market Road",
  city: "Sambalpur",
  gstin: "21ABCDE1234F1Z5",
  fssai: "12024999000123",
  bankName: "State Bank of India",
  accountNumber: "38920192019",
  ifsc: "SBIN0001234",
  upiId: "mrwater@sbi",
  invoiceTerms: "Goods once sold will not be taken back. Payment due within 7 days. Breakage/leakage must be reported upon delivery.",
};

export const DEFAULT_BILLING_SETTINGS: BillingSettings = {
  invoicePrefix: "INV",
  defaultSaleType: "Retail",
  defaultGstMode: "inclusive",
  lowStockThreshold: 5,
  autoApplyPromotions: true,
  roundOffGrandTotal: true,
  maxSalesmanDiscountPercent: 10,
};

export const INIT_WAREHOUSES: Warehouse[] = [
  {
    id: "wh-kuchinda",
    name: "Kuchinda Central Godown",
    code: "KCH-01",
    location: "Main Market Yard, Kuchinda, Sambalpur",
    manager: "Depot Incharge",
    phone: "9437000000",
    isDefault: true,
    capacityCases: 2500,
    notes: "Central godown receiving manufacturer inward consignments",
  },
];

export const INIT_PRODUCTS: Product[] = [];

export const INIT_PROMOTIONS: Promotion[] = [];

export const PALETTES: Record<'standard' | 'highContrast', PaletteTokens> = {
  standard: {
    ink: "#1B1F23",
    navy: "#16324F",
    amber: "#784919", // passes 7:1 AAA on cream/white
    cream: "#FBF8F2",
    panel: "#FFFFFF",
    muted: "#42494F",
    line: "#8A8378",
    good: "#245A40",
    bad: "#8A2E20",
    warn: "#5E4A18",
    focus: "#16324F",
  },
  highContrast: {
    ink: "#000000",
    navy: "#000000",
    amber: "#5C3200",
    cream: "#FFFFFF",
    panel: "#FFFFFF",
    muted: "#000000",
    line: "#000000",
    good: "#0B3D22",
    bad: "#6B0000",
    warn: "#4A3600",
    focus: "#D7263D",
  },
};

export const FONT_SCALES: Record<FontSize, number> = {
  standard: 1,
  large: 1.25,
  xlarge: 1.55,
};
