import { Bill, BillEditEntry, BillItem, Product } from '../types';
import { billTotals, issuedGstMode, isWholeRupee, money } from './billing';
import { cartTaxMix, formatBillNumber, isGstExcludedBill } from './invoiceCommon';
import { stripOutputTax } from '../tax/appRegime';

export interface SplitMixedBillPlanParams {
  /** The mixed bill to split (either an existing saved bill or an edited draft with stock allocations resolved). */
  bill: Bill;
  /** Original bill before edits, used to decide which series keeps the original ID and to build accurate audit history. */
  originalBill?: Bill | null;
  products: Product[];
  gstMode: 'inclusive' | 'exclusive' | 'off';
  outputTaxOff: boolean;
  /** Newly reserved numeric bill ID for the newly created sibling document. */
  nextBillId: number;
  /** Newly reserved Non-GST display number (e.g. 'NG-1'), used if the original bill is in the GST series. */
  nextNonGstDocNo: string;
  invoicePrefix?: string;
  splitGroupId: string;
  editBy?: string;
  comment?: string;
  /** Total amount received typed by the user (before capping to either split bill). */
  requestedPaid?: number;
  /** Whether the edit accompanying this split changed crate quantities / stock. */
  stockChanged?: boolean;
  nowIso?: string;
}

export interface SplitMixedBillPlanResult {
  gstBill: Bill;
  nonGstBill: Bill;
  /** Which bill kept the original bill ID (updated in place). */
  updatedBill: Bill;
  /** Which bill was newly created with nextBillId. */
  createdBill: Bill;
  combinedTotal: number;
  requestedPaid: number;
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Pure planner that splits a mixed bill (containing both GST-taxable and Non-GST items)
 * into a linked GST invoice (`INV-`) + Non-GST cash memo (`NG-`) pair without altering
 * existing batch allocations, stock quantities, trip linkage, or total collected money.
 */
export function planSplitMixedBill(params: SplitMixedBillPlanParams): SplitMixedBillPlanResult | null {
  const {
    bill,
    originalBill,
    products,
    gstMode,
    outputTaxOff,
    nextBillId,
    nextNonGstDocNo,
    invoicePrefix = 'INV',
    splitGroupId,
    editBy = 'Admin',
    comment,
    requestedPaid,
    stockChanged = false,
    nowIso = new Date().toISOString(),
  } = params;

  const mix = cartTaxMix(bill.items || [], products);
  if (!mix.hasMixed) return null;

  const orig = originalBill || bill;
  // Determine which series owns the original bill ID so existing invoice numbers are never broken.
  const origWasNonGst =
    orig.gstExclude === true ||
    orig.docSeries === 'non_gst' ||
    Boolean(orig.docNo && orig.docNo.toUpperCase().startsWith('NG-')) ||
    isGstExcludedBill(orig, products);

  const rawGstItems: BillItem[] = mix.taxable.map((it) => ({ ...it }));
  const rawNonGstItems: BillItem[] = mix.nonGst.map((it) => ({
    ...it,
    taxability: 'non_gst' as const,
    gst: 0,
    cgstRate: 0,
    sgstRate: 0,
    cgst: 0,
    sgst: 0,
    taxable: Number(it.amount) || 0,
  }));

  const gstItems = outputTaxOff ? stripOutputTax(rawGstItems) : rawGstItems;
  const nonGstItems = stripOutputTax(rawNonGstItems);

  const totalDiscount = Math.max(0, Number(bill.additionalDiscount) || 0);
  const gstAmtSum = gstItems.reduce((s, it) => s + Math.max(0, Number(it.amount) || 0), 0);
  const nonGstAmtSum = nonGstItems.reduce((s, it) => s + Math.max(0, Number(it.amount) || 0), 0);
  const totalAmtSum = gstAmtSum + nonGstAmtSum;

  let gstDiscount =
    totalDiscount > 0 && totalAmtSum > 0
      ? r2(totalDiscount * (gstAmtSum / totalAmtSum))
      : 0;
  gstDiscount = Math.min(gstDiscount, gstAmtSum);
  const nonGstDiscount = Math.min(Math.max(0, r2(totalDiscount - gstDiscount)), nonGstAmtSum);

  const roundOpt = isWholeRupee(bill.total);
  const gstForceOff =
    outputTaxOff ||
    (!origWasNonGst &&
      (bill.invoiceType === 'bill_of_supply' ||
        bill.invoiceType === 'retail' ||
        bill.isGstInvoice === false));
  const effectiveGstMode: 'inclusive' | 'exclusive' | 'off' = gstForceOff
    ? 'off'
    : origWasNonGst
      ? gstMode
      : issuedGstMode(bill, gstMode);

  const gstTotals = billTotals(gstItems, effectiveGstMode, gstDiscount, { round: roundOpt });
  const nonGstTotals = billTotals(nonGstItems, 'off', nonGstDiscount, { round: roundOpt });
  const combinedTotal = r2(gstTotals.total + nonGstTotals.total);

  const effRequestedPaid =
    requestedPaid !== undefined
      ? Math.max(0, Number(requestedPaid) || 0)
      : Math.max(0, Number(bill.amountPaid) || 0);
  const totalPaid = Math.min(effRequestedPaid, combinedTotal);
  const gstPaid = r2(Math.min(totalPaid, gstTotals.total));
  const nonGstPaid = r2(Math.min(Math.max(0, totalPaid - gstPaid), nonGstTotals.total));

  const cleanPrefix = (invoicePrefix || '').trim() || 'INV';
  const gstId = origWasNonGst ? nextBillId : bill.id;
  const nonGstId = origWasNonGst ? bill.id : nextBillId;
  const gstDocNo = origWasNonGst
    ? `${cleanPrefix}-${gstId}`
    : (bill.docNo && bill.docNo.trim()) ||
      formatBillNumber(
        {
          ...bill,
          id: gstId,
          docNo: undefined,
          docSeries: 'gst',
          gstExclude: false,
        },
        cleanPrefix,
      );
  const nonGstDocNo = origWasNonGst
    ? (bill.docNo && bill.docNo.trim()) || `NG-${nonGstId}`
    : nextNonGstDocNo;

  const movedNames = (origWasNonGst ? gstItems : nonGstItems)
    .map((it) => it.productName)
    .filter(Boolean)
    .join(', ');
  const targetDocNo = origWasNonGst ? gstDocNo : nonGstDocNo;
  const targetTotal = origWasNonGst ? gstTotals.total : nonGstTotals.total;
  const defaultComment = origWasNonGst
    ? `Split GST items into ${gstDocNo}`
    : `Split Non-GST items into ${nonGstDocNo}`;
  const editEntry: BillEditEntry = {
    at: nowIso,
    by: editBy,
    comment: (comment || '').trim() || defaultComment,
    changes: [
      `Moved ${origWasNonGst ? 'GST' : 'Non-GST'} item(s) (${movedNames}) to linked ${
        origWasNonGst ? 'GST invoice' : 'Non-GST cash memo'
      } ${targetDocNo} (₹${money(targetTotal)})`,
    ],
    stockChanged,
    totalBefore: Number(orig.total) || 0,
    totalAfter: origWasNonGst ? nonGstTotals.total : gstTotals.total,
    paidBefore: Number(orig.amountPaid) || 0,
    paidAfter: origWasNonGst ? nonGstPaid : gstPaid,
  };

  const gstInvoiceType: Bill['invoiceType'] = outputTaxOff
    ? 'bill_of_supply'
    : origWasNonGst
      ? 'tax_invoice'
      : bill.invoiceType === 'bill_of_supply' || bill.invoiceType === 'retail'
        ? bill.invoiceType
        : 'tax_invoice';
  const gstIsTaxInvoice = outputTaxOff
    ? false
    : origWasNonGst
      ? true
      : bill.isGstInvoice !== undefined
        ? bill.isGstInvoice
        : gstInvoiceType === 'tax_invoice';

  const gstBill: Bill = {
    ...(origWasNonGst
      ? {
          retailer: bill.retailer,
          phone: bill.phone,
          customerId: bill.customerId,
          date: bill.date,
          warehouseId: bill.warehouseId || '',
          tripId: bill.tripId,
          vehicle: bill.vehicle,
          salesman: bill.salesman,
          salesmanId: bill.salesmanId,
          paymentDate: bill.paymentDate || bill.date,
          paymentMode: bill.paymentMode || 'cash',
          paymentNote: bill.paymentNote,
          isRetrospective: bill.isRetrospective === true,
        }
      : bill),
    ...gstTotals,
    id: gstId,
    docNo: gstDocNo,
    docSeries: 'gst',
    gstExclude: false,
    splitGroupId,
    items: gstItems,
    additionalDiscount: gstDiscount,
    amountPaid: gstPaid,
    supplyType:
      !origWasNonGst && bill.supplyType === 'B2B' && bill.customerGstin ? 'B2B' : 'B2C',
    customerGstin:
      !origWasNonGst && bill.supplyType === 'B2B' ? bill.customerGstin || undefined : undefined,
    invoiceType: gstInvoiceType,
    isGstInvoice: gstIsTaxInvoice,
    updatedAt: nowIso,
    ...(origWasNonGst
      ? {}
      : { editHistory: [...(orig.editHistory || []), editEntry] }),
  };

  const nonGstBill: Bill = {
    ...(origWasNonGst
      ? bill
      : {
          retailer: bill.retailer,
          phone: bill.phone,
          customerId: bill.customerId,
          date: bill.date,
          warehouseId: bill.warehouseId || '',
          tripId: bill.tripId,
          vehicle: bill.vehicle,
          salesman: bill.salesman,
          salesmanId: bill.salesmanId,
          paymentDate: bill.paymentDate || bill.date,
          paymentMode: bill.paymentMode || 'cash',
          paymentNote: bill.paymentNote,
          isRetrospective: bill.isRetrospective === true,
        }),
    ...nonGstTotals,
    id: nonGstId,
    docNo: nonGstDocNo,
    docSeries: 'non_gst',
    gstExclude: true,
    splitGroupId,
    items: nonGstItems,
    additionalDiscount: nonGstDiscount,
    amountPaid: nonGstPaid,
    supplyType: 'B2C',
    customerGstin: undefined,
    invoiceType: 'bill_of_supply',
    isGstInvoice: false,
    ewayBillNo: undefined,
    irn: undefined,
    taxStamp: undefined,
    updatedAt: nowIso,
    ...(origWasNonGst
      ? { editHistory: [...(orig.editHistory || []), editEntry] }
      : {}),
  };

  return {
    gstBill,
    nonGstBill,
    updatedBill: origWasNonGst ? nonGstBill : gstBill,
    createdBill: origWasNonGst ? gstBill : nonGstBill,
    combinedTotal,
    requestedPaid: effRequestedPaid,
  };
}
