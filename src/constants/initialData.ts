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
  name: "Hydrate Hub",
  tagline: "Beverage Distribution Ledger & GRN Inventory Depot",
  ownerName: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "Odisha",
  stateCode: "21",
  gstin: "",
  fssai: "",
  bankName: "",
  accountNumber: "",
  ifsc: "",
  upiId: "",
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
  /** Master scheme feature switch (enabled by default) */
  schemesEnabled: true,
  disableManualDiscountWhenSchemeApplied: false,
  allowSchemeOverride: true,
  showBatchOnInvoice: false,
  defaultInvoicePaper: "a4",
  whatsappTextStyle: "detailed",
  receiptTextWidth: 32,
  showUpiQrOnReceipt: true,
  showOdiaNameOnReceipt: false,
};

export const INIT_WAREHOUSES: Warehouse[] = [];

export const INIT_PRODUCTS: Product[] = [];

export const INIT_PROMOTIONS: Promotion[] = [];

export const PALETTES: Record<'standard' | 'highContrast', PaletteTokens> = {
  standard: {
    ink: "#0F172A",
    navy: "#0F172A",  // slate-900 — matches MrWater Beverages header
    amber: "#B45309",
    cream: "#F8FAFC",
    panel: "#FFFFFF",
    muted: "#64748B",
    line: "#E2E8F0",
    good: "#059669",  // emerald-600
    bad: "#DC2626",
    warn: "#D97706",
    focus: "#0284C7",
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
