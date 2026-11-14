/**
 * GST Tax Engine - shared types.
 *
 * Design rules (see docs/GST_ENGINE.md):
 *  - Registration type, product tax class and legal rules are INPUTS, never constants in code.
 *  - The engine is pure: same input + same RuleBook => same output. Persistence/audit live outside it.
 *  - Money is in rupees, rounded to 2 decimals with one deterministic rule (see money.ts).
 */

export type RegistrationType = 'regular' | 'composition' | 'unregistered';
export type CounterpartyType = RegistrationType | 'unknown';
export type CompositionCategory = 'trader' | 'manufacturer' | 'restaurant' | 'service';
export type Taxability = 'taxable' | 'exempt' | 'nil_rated' | 'non_gst';
export type TxnKind = 'sale' | 'purchase' | 'sale_return' | 'purchase_return';

export type DocumentType =
  | 'tax_invoice'
  | 'bill_of_supply'
  | 'credit_note' //            regular taxpayer: return of a tax invoice
  | 'debit_note' //             regular taxpayer: purchase return / supplier adjustment
  | 'sales_return_voucher' //   composition / unregistered: return of a bill of supply (CA to confirm wording)
  | 'purchase_invoice' //       supplier invoice recorded in our books
  | 'purchase_return_note';

/** The business's GST registration as it was on a given date. Keep one row per period (effective-dated). */
export interface BusinessTaxProfile {
  businessId: string;
  registrationType: RegistrationType;
  gstin?: string;
  /** 2-digit GST state code of the principal place of business, e.g. '21' for Odisha. */
  stateCode: string;
  compositionCategory?: CompositionCategory;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo?: string | null;
}

export interface Counterparty {
  gstin?: string;
  /** Registration type declared on the supplier / customer master. Ignored when there is no GSTIN. */
  declaredType?: CounterpartyType;
  /** State of the counterparty when no GSTIN exists (e.g. B2C delivery state). */
  stateCode?: string;
  name?: string;
}

export interface TaxLineInput {
  id: string;
  description?: string;
  hsn: string;
  qty: number;
  unitPrice: number;
  /** Absolute rupee discount on this line (not a percentage). */
  discount?: number;
  /** From the effective-dated product tax profile, resolved for the transaction date. */
  taxability: Taxability;
  gstRatePct: number;
  cessRatePct?: number;
  /** Section 17(5) style blocked-credit reason chosen by the user/rule. Purchases by regular taxpayers only. */
  itcBlockedReason?: string;
  /** ITC not yet confirmed (e.g. supplier invoice absent from GSTR-2B). */
  itcPending?: boolean;
  /** Category used to look up reverse-charge rules (purchases from unregistered suppliers). */
  rcmCategory?: string;
  /** Tax actually printed on the supplier's invoice. When present it wins over the computed tax. */
  supplierCharged?: { cgst?: number; sgst?: number; igst?: number; cess?: number };
}

export interface TaxInput {
  business: BusinessTaxProfile;
  kind: TxnKind;
  /** Transaction date YYYY-MM-DD. */
  date: string;
  counterparty: Counterparty;
  /** Place of supply (state code). Defaults to the counterparty state, else the business state. */
  placeOfSupplyStateCode?: string;
  /** Whether entered unit prices already include GST. Ignored for composition sales (no GST is ever extracted). */
  pricesIncludeTax: boolean;
  lines: TaxLineInput[];
  /** Required for returns: number of the document being reversed. */
  originalDocumentRef?: string;
  /** Required for returns: rules/rates are resolved as on the ORIGINAL document date. */
  originalDate?: string;
}

export type ItcStatus = 'eligible' | 'blocked' | 'pending' | 'not_applicable';

export interface TaxLineResult {
  id: string;
  hsn: string;
  taxability: Taxability;
  gstRatePct: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  /** Tax that is charged to / by the counterparty on the document (0 on every composition sale). */
  documentTax: number;
  lineTotal: number;
  itcStatus: ItcStatus;
  itcEligible: number;
  itcBlocked: number;
  itcPending: number;
  /** Tax that stays in cost of goods (purchases): all tax for composition buyers, blocked tax for regular. */
  taxCapitalised: number;
  rcm: boolean;
  /** Cost to stock = taxable + taxCapitalised (purchases only). */
  inventoryCost: number;
}

export interface Issue {
  code: string;
  message: string;
  lineId?: string;
}

export interface CompositionLiability {
  ratePct: number;
  cgstPct: number;
  sgstPct: number;
  base: number;
  cgst: number;
  sgst: number;
  total: number;
}

export interface TaxTotals {
  taxable: number;
  exemptValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  documentTax: number;
  invoiceValue: number;
  itcEligible: number;
  itcBlocked: number;
  itcPending: number;
  taxCapitalised: number;
  rcmTax: number;
  inventoryCost: number;
}

export interface TaxResult {
  ok: boolean;
  kind: TxnKind;
  documentType: DocumentType | null;
  counterpartyClass: 'B2B' | 'B2C';
  supply: 'intra_state' | 'inter_state';
  counterpartyType: CounterpartyType;
  /** What the printed document must show as tax. false for Bill of Supply. */
  showTaxOnDocument: boolean;
  /** Mandatory wording for the document (e.g. composition declaration). */
  declaration?: string;
  lines: TaxLineResult[];
  totals: TaxTotals;
  /** Composition tax payable by the business on this transaction (own liability, never charged to the customer). */
  compositionLiability?: CompositionLiability;
  errors: Issue[];
  warnings: Issue[];
  /** Deterministic identifier of rulebook version + rule ids applied; store with the snapshot. */
  ruleVersion: string;
  rulesApplied: string[];
  /** What the supplier's document is (purchases only): a tax invoice, a bill of supply, or none (unregistered). */
  supplierDocumentType?: 'tax_invoice' | 'bill_of_supply' | 'none';
  /** +1 for forward documents, -1 for returns (all amounts above are already signed). */
  sign: 1 | -1;
}
