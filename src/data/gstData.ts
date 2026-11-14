import { HsnItem, InvoiceRecord } from '../types/gst';

export const INITIAL_HSN_DATA: HsnItem[] = [
  {
    hsn: '22021010',
    description: 'Aerated Waters / Cold Drinks with Sugar / Sweetening',
    correctGstRate: 40,
    original0Qty: 228,
    original0Taxable: 54320.00,
    originalTaxableQty: 469,
    originalTaxableAmount: 86410.71,
    originalTaxAmount: 34564.29
  },
  {
    hsn: '22021090',
    description: 'Caffeinated Beverages / Energy Drinks',
    correctGstRate: 40,
    original0Qty: 398,
    original0Taxable: 103135.00,
    originalTaxableQty: 585,
    originalTaxableAmount: 103928.57,
    originalTaxAmount: 41571.43
  },
  {
    hsn: '22029920',
    description: 'Fruit Pulp or Fruit Juice based Drinks',
    correctGstRate: 5,
    original0Qty: 97,
    original0Taxable: 40120.00,
    originalTaxableQty: 176,
    originalTaxableAmount: 67138.10,
    originalTaxAmount: 3356.90
  },
  {
    hsn: '30049011',
    description: 'Medicaments / Ayurvedic Formulation Preparations',
    correctGstRate: 5,
    original0Qty: 17,
    original0Taxable: 10520.00,
    originalTaxableQty: 14,
    originalTaxableAmount: 8238.10,
    originalTaxAmount: 411.90
  }
];

export const GST_PURCHASE_ITC = {
  grossItc: 132372.43,
  reversedItc: 1712.58,
  netItc: 130659.85,
  originalOutputTax: 79904.52,
  originalCreditCarriedForward: 52316.91
};

// Representative realistic breakdown of the 415 issued invoices (Series 104 to 555)
// showing how small retail bills had 0% tax and how they get backward calculated
export const GENERATE_SAMPLE_INVOICES = (): InvoiceRecord[] => {
  const records: InvoiceRecord[] = [];

  // Generate 0% bills for HSN 22021010 (Total 228 units, ₹54,320)
  records.push(
    {
      invoiceNumber: 'INV-108',
      customerName: 'Gupta Kirana Store (Village)',
      hsn: '22021010',
      hsnDescription: 'Aerated Waters / Soda 250ml',
      qty: 60,
      grossAmount: 14400.00,
      originalBillType: 'Retail / Non-GST',
      originalGstRate: 0,
      originalTaxable: 14400.00,
      originalTax: 0,
      rectifiedBillType: 'B2C Tax Invoice',
      rectifiedGstRate: 40,
      rectifiedTaxable: 10285.71,
      rectifiedCgst: 2057.14,
      rectifiedSgst: 2057.14,
      rectifiedTotalTax: 4114.29
    },
    {
      invoiceNumber: 'INV-142',
      customerName: 'Maa Tara General Stores',
      hsn: '22021010',
      hsnDescription: 'Aerated Waters / Cold Drinks 600ml',
      qty: 90,
      grossAmount: 21600.00,
      originalBillType: 'Retail / Non-GST',
      originalGstRate: 0,
      originalTaxable: 21600.00,
      originalTax: 0,
      rectifiedBillType: 'B2C Tax Invoice',
      rectifiedGstRate: 40,
      rectifiedTaxable: 15428.57,
      rectifiedCgst: 3085.71,
      rectifiedSgst: 3085.71,
      rectifiedTotalTax: 6171.43
    },
    {
      invoiceNumber: 'INV-189',
      customerName: 'Shree Krishna Daily Needs',
      hsn: '22021010',
      hsnDescription: 'Aerated Waters / Cans 330ml',
      qty: 78,
      grossAmount: 18320.00,
      originalBillType: 'Retail / Non-GST',
      originalGstRate: 0,
      originalTaxable: 18320.00,
      originalTax: 0,
      rectifiedBillType: 'B2C Tax Invoice',
      rectifiedGstRate: 40,
      rectifiedTaxable: 13085.71,
      rectifiedCgst: 2617.14,
      rectifiedSgst: 2617.14,
      rectifiedTotalTax: 5234.29
    }
  );

  // Generate 0% bills for HSN 22021090 (Total 398 units, ₹1,03,135)
  records.push(
    {
      invoiceNumber: 'INV-204',
      customerName: 'Radhe Corner Cold Point',
      hsn: '22021090',
      hsnDescription: 'Caffeinated Energy Drinks 250ml',
      qty: 150,
      grossAmount: 39000.00,
      originalBillType: 'Retail / Non-GST',
      originalGstRate: 0,
      originalTaxable: 39000.00,
      originalTax: 0,
      rectifiedBillType: 'B2C Tax Invoice',
      rectifiedGstRate: 40,
      rectifiedTaxable: 27857.14,
      rectifiedCgst: 5571.43,
      rectifiedSgst: 5571.43,
      rectifiedTotalTax: 11142.86
    },
    {
      invoiceNumber: 'INV-265',
      customerName: 'Jai Jagannath Retailers',
      hsn: '22021090',
      hsnDescription: 'Caffeinated Energy Drinks 500ml',
      qty: 140,
      grossAmount: 36400.00,
      originalBillType: 'Retail / Non-GST',
      originalGstRate: 0,
      originalTaxable: 36400.00,
      originalTax: 0,
      rectifiedBillType: 'B2C Tax Invoice',
      rectifiedGstRate: 40,
      rectifiedTaxable: 26000.00,
      rectifiedCgst: 5200.00,
      rectifiedSgst: 5200.00,
      rectifiedTotalTax: 10400.00
    },
    {
      invoiceNumber: 'INV-310',
      customerName: 'Biswal Pan & Soft Drinks',
      hsn: '22021090',
      hsnDescription: 'Caffeinated Beverage Multipack',
      qty: 108,
      grossAmount: 27735.00,
      originalBillType: 'Retail / Non-GST',
      originalGstRate: 0,
      originalTaxable: 27735.00,
      originalTax: 0,
      rectifiedBillType: 'B2C Tax Invoice',
      rectifiedGstRate: 40,
      rectifiedTaxable: 19810.71,
      rectifiedCgst: 3962.14,
      rectifiedSgst: 3962.14,
      rectifiedTotalTax: 7924.29
    }
  );

  // Generate 0% bills for HSN 22029920 (Total 97 units, ₹40,120)
  records.push(
    {
      invoiceNumber: 'INV-355',
      customerName: 'Balaji Sweet & Snacks',
      hsn: '22029920',
      hsnDescription: 'Fruit Juice Mango / Mixed 1L',
      qty: 55,
      grossAmount: 22800.00,
      originalBillType: 'Retail / Non-GST',
      originalGstRate: 0,
      originalTaxable: 22800.00,
      originalTax: 0,
      rectifiedBillType: 'B2C Tax Invoice',
      rectifiedGstRate: 5,
      rectifiedTaxable: 21714.29,
      rectifiedCgst: 542.86,
      rectifiedSgst: 542.86,
      rectifiedTotalTax: 1085.71
    },
    {
      invoiceNumber: 'INV-398',
      customerName: 'Khandagiri Fruit Mart',
      hsn: '22029920',
      hsnDescription: 'Fruit Juice Tetrapack 200ml',
      qty: 42,
      grossAmount: 17320.00,
      originalBillType: 'Retail / Non-GST',
      originalGstRate: 0,
      originalTaxable: 17320.00,
      originalTax: 0,
      rectifiedBillType: 'B2C Tax Invoice',
      rectifiedGstRate: 5,
      rectifiedTaxable: 16495.24,
      rectifiedCgst: 412.38,
      rectifiedSgst: 412.38,
      rectifiedTotalTax: 824.76
    }
  );

  // Generate 0% bills for HSN 30049011 (Total 17 units, ₹10,520)
  records.push(
    {
      invoiceNumber: 'INV-441',
      customerName: 'Nayak Pharmacy & Herbal',
      hsn: '30049011',
      hsnDescription: 'Ayurvedic Cough Syrup / Formulations',
      qty: 17,
      grossAmount: 10520.00,
      originalBillType: 'Retail / Non-GST',
      originalGstRate: 0,
      originalTaxable: 10520.00,
      originalTax: 0,
      rectifiedBillType: 'B2C Tax Invoice',
      rectifiedGstRate: 5,
      rectifiedTaxable: 10019.05,
      rectifiedCgst: 250.48,
      rectifiedSgst: 250.48,
      rectifiedTotalTax: 500.95
    }
  );

  // Also include samples of existing valid Tax Invoices to represent the 40% and 5% series
  records.push(
    {
      invoiceNumber: 'INV-104',
      customerName: 'Odisha Supermarket B2C',
      hsn: '22021010',
      hsnDescription: 'Aerated Waters / Soda 250ml',
      qty: 120,
      grossAmount: 30900.00,
      originalBillType: 'Tax Invoice',
      originalGstRate: 40,
      originalTaxable: 22071.43,
      originalTax: 8828.57,
      rectifiedBillType: 'B2C Tax Invoice',
      rectifiedGstRate: 40,
      rectifiedTaxable: 22071.43,
      rectifiedCgst: 4414.29,
      rectifiedSgst: 4414.29,
      rectifiedTotalTax: 8828.57
    },
    {
      invoiceNumber: 'INV-210',
      customerName: 'Cuttack Retail Hub',
      hsn: '22021090',
      hsnDescription: 'Caffeinated Energy Drinks 250ml',
      qty: 180,
      grossAmount: 47250.00,
      originalBillType: 'Tax Invoice',
      originalGstRate: 40,
      originalTaxable: 33750.00,
      originalTax: 13500.00,
      rectifiedBillType: 'B2C Tax Invoice',
      rectifiedGstRate: 40,
      rectifiedTaxable: 33750.00,
      rectifiedCgst: 6750.00,
      rectifiedSgst: 6750.00,
      rectifiedTotalTax: 13500.00
    },
    {
      invoiceNumber: 'INV-320',
      customerName: 'Bhubaneswar Mart',
      hsn: '22029920',
      hsnDescription: 'Fruit Juice Mango / Mixed 1L',
      qty: 85,
      grossAmount: 34125.00,
      originalBillType: 'Tax Invoice',
      originalGstRate: 5,
      originalTaxable: 32500.00,
      originalTax: 1625.00,
      rectifiedBillType: 'B2C Tax Invoice',
      rectifiedGstRate: 5,
      rectifiedTaxable: 32500.00,
      rectifiedCgst: 812.50,
      rectifiedSgst: 812.50,
      rectifiedTotalTax: 1625.00
    }
  );

  return records;
};
