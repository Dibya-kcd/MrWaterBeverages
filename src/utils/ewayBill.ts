/**
 * E-way bill support. An e-way bill is required when goods worth more than Rs 50,000 are moved. The app does not
 * talk to the GST portal; it builds the JSON file the portal's "Generate in bulk" tool accepts (version 1.0.0621),
 * lists what is missing for each invoice, and stores the e-way bill number you get back on the invoice.
 */
import { Bill, Customer, OrganizationProfile, Product } from '../types';
import { billTaxBreakdown } from './gstReports';

export const EWAY_BILL_THRESHOLD = 50000;

export interface EwayInvoiceCheck {
  billId: number;
  invoiceNo: string;
  customer: string;
  total: number;
  hasEwayBill: boolean;
  needed: boolean;
  problems: string[]; // what must be fixed before the invoice can be exported
}

const dmy = (iso: string) => {
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : '';
};
const pin = (s?: string) => (String(s || '').match(/\b[1-9]\d{5}\b/g) || []).pop() || '';
const gstinState = (g?: string) => Number(String(g || '').slice(0, 2)) || 0;
const clean = (s?: string, max = 100) => String(s || '').replace(/[^\w .,/&()-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function checkEwayInvoices(
  bills: Bill[],
  org: OrganizationProfile,
  customers: Customer[],
  invoiceNoOf: (b: Bill) => string,
  products: Product[] = []
): EwayInvoiceCheck[] {
  const out: EwayInvoiceCheck[] = [];
  for (const b of bills) {
    if (b.status === 'cancelled') continue;
    const total = Number(b.total) || 0;
    const needed = total > EWAY_BILL_THRESHOLD;
    if (!needed && !b.ewayBillNo) continue;
    const cust = customers.find((c) => c.name.trim().toLowerCase() === (b.retailer || '').trim().toLowerCase());
    const problems: string[] = [];
    if (!/^[0-9A-Z]{15}$/.test((org.gstin || '').trim())) problems.push('Your GSTIN is missing in Settings');
    if (!pin(org.address) && !pin(org.city)) problems.push('Your address needs a 6-digit pincode (Settings)');
    if (b.supplyType === 'B2B' && !/^[0-9A-Z]{15}$/.test(b.customerGstin || '')) problems.push('Buyer GSTIN is not valid');
    if (!pin(`${cust?.address || ''} ${cust?.city || ''}`)) problems.push('Customer address needs a 6-digit pincode');
    if (!b.vehicle && !b.transporterName) problems.push('Vehicle number or transporter is missing');
    if (!(Number(b.transportDistanceKm) > 0)) problems.push('Distance (km) is missing');
    if (billTaxBreakdown(b, products).lines.some((l) => !/^\d{4,8}$/.test(String(l.hsn || '').trim())))
      problems.push('Some products have no valid HSN code');
    out.push({
      billId: b.id,
      invoiceNo: invoiceNoOf(b),
      customer: b.retailer,
      total,
      hasEwayBill: Boolean(b.ewayBillNo),
      needed,
      problems,
    });
  }
  return out;
}

/** Builds the bulk-upload JSON for the given invoices (only those with no problems should be passed in). */
export function buildEwayBillJson(
  bills: Bill[],
  org: OrganizationProfile,
  customers: Customer[],
  invoiceNoOf: (b: Bill) => string,
  products: Product[] = []
) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const sellerPin = Number(pin(org.address) || pin(org.city)) || 0;
  const sellerState = gstinState(org.gstin);
  const billList = bills.map((b) => {
    const cust = customers.find((c) => c.name.trim().toLowerCase() === (b.retailer || '').trim().toLowerCase());
    const buyerPin = Number(pin(`${cust?.address || ''} ${cust?.city || ''}`)) || 0;
    const buyerState = gstinState(b.customerGstin) || sellerState;
    const interState = buyerState !== sellerState;
    const lines = billTaxBreakdown(b, products).lines;
    let taxable = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    const itemList: Record<string, unknown>[] = [];
    (b.items || []).forEach((i, idx) => {
      const l = lines[idx];
      if (!l || (Number(i.qty) || 0) <= 0) return;
      taxable += l.taxable;
      if (interState) igst += l.tax;
      else {
        cgst += l.cgst;
        sgst += l.sgst;
      }
      itemList.push({
        productName: clean(i.productName, 100),
        productDesc: clean(i.productName, 100),
        hsnCode: Number(String(l.hsn).replace(/\D/g, '')) || 0,
        quantity: r2(Number(i.qty) || 0),
        qtyUnit: 'BOX',
        taxableAmount: r2(l.taxable),
        sgstRate: interState ? 0 : l.ratePct / 2,
        cgstRate: interState ? 0 : l.ratePct / 2,
        igstRate: interState ? l.ratePct : 0,
        cessRate: 0,
      });
    });
    return {
      userGstin: org.gstin,
      supplyType: 'O',
      subSupplyType: 1,
      docType: 'INV',
      docNo: invoiceNoOf(b),
      docDate: dmy(b.date),
      fromGstin: org.gstin,
      fromTrdName: clean(org.name),
      fromAddr1: clean(org.address),
      fromPlace: clean(org.city),
      fromPincode: sellerPin,
      actFromStateCode: sellerState,
      fromStateCode: sellerState,
      toGstin: b.customerGstin || 'URP',
      toTrdName: clean(b.retailer),
      toAddr1: clean(cust?.address),
      toPlace: clean(cust?.city),
      toPincode: buyerPin,
      actToStateCode: buyerState,
      toStateCode: buyerState,
      transactionType: 1,
      totalValue: r2(taxable),
      cgstValue: r2(cgst),
      sgstValue: r2(sgst),
      igstValue: r2(igst),
      cessValue: 0,
      totInvValue: r2(Number(b.total) || 0),
      transporterId: b.transporterId || '',
      transporterName: clean(b.transporterName),
      transDocNo: '',
      transMode: '1',
      transDistance: String(Math.round(Number(b.transportDistanceKm) || 0)),
      vehicleNo: String(b.vehicle || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase(),
      vehicleType: 'R',
      itemList,
    };
  });
  return { version: '1.0.0621', billLists: billList };
}

/**
 * E-invoice (IRP schema INV-01, version 1.1). Only B2B invoices are included. E-invoicing is mandatory above a
 * turnover limit set by the government; if it applies to you, upload this file on the e-invoice portal's bulk tool,
 * then store the IRN you receive on the invoice (Edit bill). The app does not talk to the portal and cannot create
 * the IRN or QR code itself.
 */
export function buildEinvoiceJson(
  bills: Bill[],
  org: OrganizationProfile,
  customers: Customer[],
  invoiceNoOf: (b: Bill) => string,
  products: Product[] = []
) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const sellerPin = Number(pin(org.address) || pin(org.city)) || 0;
  const sellerState = String(gstinState(org.gstin)).padStart(2, '0');
  return bills
    .filter((b) => /^[0-9A-Z]{15}$/.test(b.customerGstin || ''))
    .map((b) => {
      const cust = customers.find((c) => c.name.trim().toLowerCase() === (b.retailer || '').trim().toLowerCase());
      const buyerState = String(gstinState(b.customerGstin)).padStart(2, '0');
      const inter = buyerState !== sellerState;
      const lines = billTaxBreakdown(b, products).lines;
      let ass = 0, cg = 0, sg = 0, ig = 0;
      const ItemList: Record<string, unknown>[] = [];
      (b.items || []).forEach((i, idx) => {
        const l = lines[idx];
        const qty = Number(i.qty) || 0;
        if (!l || qty <= 0) return;
        const itemCg = inter ? 0 : l.cgst;
        const itemSg = inter ? 0 : l.sgst;
        const itemIg = inter ? l.tax : 0;
        ass += l.taxable; cg += itemCg; sg += itemSg; ig += itemIg;
        ItemList.push({
          SlNo: String(ItemList.length + 1),
          PrdDesc: clean(i.productName, 300),
          IsServc: 'N',
          HsnCd: String(l.hsn).replace(/\D/g, ''),
          Qty: r2(qty),
          Unit: 'BOX',
          UnitPrice: Math.round((l.taxable / qty) * 1000) / 1000,
          TotAmt: r2(l.taxable),
          Discount: 0,
          AssAmt: r2(l.taxable),
          GstRt: l.ratePct,
          IgstAmt: r2(itemIg),
          CgstAmt: r2(itemCg),
          SgstAmt: r2(itemSg),
          CesRt: 0,
          CesAmt: 0,
          OthChrg: 0,
          TotItemVal: r2(l.taxable + itemCg + itemSg + itemIg),
        });
      });
      return {
        Version: '1.1',
        TranDtls: { TaxSch: 'GST', SupTyp: 'B2B', RegRev: 'N', IgstOnIntra: 'N' },
        DocDtls: { Typ: 'INV', No: invoiceNoOf(b), Dt: dmy(b.date) },
        SellerDtls: { Gstin: org.gstin, LglNm: clean(org.name, 100), Addr1: clean(org.address, 100), Loc: clean(org.city, 50), Pin: sellerPin, Stcd: sellerState },
        BuyerDtls: {
          Gstin: b.customerGstin, LglNm: clean(b.retailer, 100), Pos: buyerState,
          Addr1: clean(cust?.address, 100) || clean(b.retailer, 100), Loc: clean(cust?.city, 50) || 'NA',
          Pin: Number(pin(`${cust?.address || ''} ${cust?.city || ''}`)) || 0, Stcd: buyerState,
        },
        ItemList,
        ValDtls: {
          AssVal: r2(ass), CgstVal: r2(cg), SgstVal: r2(sg), IgstVal: r2(ig), CesVal: 0, Discount: 0,
          RndOffAmt: r2(Number((b as any).roundOff) || 0), TotInvVal: r2(Number(b.total) || 0),
        },
      };
    });
}
