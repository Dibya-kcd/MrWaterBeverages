export interface HsnItem {
  hsn: string;
  description: string;
  correctGstRate: 40 | 5;
  original0Qty: number;
  original0Taxable: number;
  originalTaxableQty: number;
  originalTaxableAmount: number;
  originalTaxAmount: number;
}

export interface GstRateSummary {
  rate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  totalTax: number;
}

export interface InvoiceRecord {
  invoiceNumber: string;
  customerName: string;
  hsn: string;
  hsnDescription: string;
  qty: number;
  grossAmount: number;
  originalBillType: 'Retail / Non-GST' | 'Tax Invoice';
  originalGstRate: number;
  originalTaxable: number;
  originalTax: number;
  
  // Rectified fields
  rectifiedBillType: 'B2C Tax Invoice';
  rectifiedGstRate: number;
  rectifiedTaxable: number;
  rectifiedCgst: number;
  rectifiedSgst: number;
  rectifiedTotalTax: number;
}

export interface GstState {
  isFixed: boolean;
  total0Gross: number;
  itcAvailable: number;
  itcReversed: number;
  netItc: number;
  invoices: InvoiceRecord[];
}
