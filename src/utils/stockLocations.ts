/**
 * Stock-location helpers (pure, no React) — the single place that answers
 * "which product, in which warehouse, in which batch, expiring when, how many".
 *
 * DESIGN RULE
 * -----------
 * Stock lives ONLY on InventoryBatch rows (product x warehouse x batch).
 * `Product.warehouseId / batchNumber / expiry` are legacy, single-valued summary
 * fields and must NEVER be used to decide where stock physically is — a product can
 * sit in many warehouses at once, each with several batches.
 */
import { GRN, InventoryBatch, Product, StockTransfer, Warehouse } from '../types';

export const NEAR_EXPIRY_DAYS = 60;
export const CRITICAL_EXPIRY_DAYS = 30;

export type ExpiryStatus = 'expired' | 'critical' | 'warning' | 'ok' | 'unknown';

const DAY_MS = 86_400_000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Parses YYYY-MM-DD (or any Date-parsable string). Returns null when empty/invalid. */
export function parseDateSafe(value?: string | null): Date | null {
  if (!value || !String(value).trim()) return null;
  const s = String(value).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function expiryInfo(
  expiry?: string | null,
  today: Date = new Date()
): { status: ExpiryStatus; daysLeft: number | null } {
  const d = parseDateSafe(expiry);
  if (!d) return { status: 'unknown', daysLeft: null };
  const daysLeft = Math.round((startOfDay(d) - startOfDay(today)) / DAY_MS);
  if (daysLeft < 0) return { status: 'expired', daysLeft };
  if (daysLeft <= CRITICAL_EXPIRY_DAYS) return { status: 'critical', daysLeft };
  if (daysLeft <= NEAR_EXPIRY_DAYS) return { status: 'warning', daysLeft };
  return { status: 'ok', daysLeft };
}

/* ------------------------------------------------------------------ */
/* Per product: warehouse -> batch lines                               */
/* ------------------------------------------------------------------ */

export interface BatchLine {
  /** stable key: warehouse|batch|expiry */
  key: string;
  productId: number;
  warehouseId: string;
  warehouseName: string;
  batchNumber: string;
  mfgDate?: string;
  expiryDate: string;
  expiryStatus: ExpiryStatus;
  daysLeft: number | null;
  /** physically received into this warehouse+batch (billed + free + additive scheme free) */
  receivedQty: number;
  billedQty: number;
  /** free cases carried inside the invoice (inclusive scheme = invoice discount) */
  freeQty: number;
  /** additive supplier-scheme free cases on top of the invoice */
  schemeFreeQty: number;
  /** received minus sales/adjustments, allocated First-Expiry-First-Out */
  availableQty: number;
  supplierInvoiceNos: string[];
  supplierNames: string[];
  lastInwardDate?: string;
  /** ids of the underlying InventoryBatch rows (traceability back to each GRN line) */
  sourceBatchIds: string[];
}

export interface WarehouseStockSummary {
  warehouseId: string;
  warehouseName: string;
  receivedQty: number;
  availableQty: number;
  batchCount: number;
  nearestExpiry?: string;
  nearestExpiryStatus: ExpiryStatus;
  lines: BatchLine[];
}

const UNASSIGNED_ID = '';
const UNASSIGNED_NAME = 'Unassigned (no warehouse)';

function whName(warehouses: Warehouse[], id: string): string {
  if (!id) return UNASSIGNED_NAME;
  return warehouses.find((w) => w.id === id)?.name || `Unknown warehouse (${id})`;
}

function cmpExpiry(a: BatchLine, b: BatchLine): number {
  // FEFO: earliest expiry first; unknown expiry sorts last
  const ad = parseDateSafe(a.expiryDate)?.getTime() ?? Number.POSITIVE_INFINITY;
  const bd = parseDateSafe(b.expiryDate)?.getTime() ?? Number.POSITIVE_INFINITY;
  if (ad !== bd) return ad - bd;
  return a.batchNumber.localeCompare(b.batchNumber);
}

/**
 * Aggregates raw InventoryBatch rows for one product into one line per
 * (warehouse, batch number, expiry). Two GRNs that bring the SAME batch into the SAME
 * warehouse become a single line; the same batch number in a DIFFERENT warehouse stays
 * a separate line.
 *
 * `availableByWarehouse` (optional) = live available crates per warehouse, already net of
 * sales and reconciliation adjustments (see `productWarehouseStock` in the ledger
 * context). It is allocated across that warehouse's lines First-Expiry-First-Out
 * (sales drain the earliest-expiring batch first, so what remains is the latest expiry).
 * When omitted, availableQty === receivedQty.
 */
export function buildProductBatchLines(
  productId: number,
  batches: InventoryBatch[],
  warehouses: Warehouse[],
  availableByWarehouse?: Record<string, number>,
  today: Date = new Date(),
  /** crates actually sold from each InventoryBatch id (from bill batchAllocations) */
  soldByBatchId?: Record<string, number>
): BatchLine[] {
  const map = new Map<string, BatchLine>();

  for (const b of batches) {
    if (b.productId !== productId) continue;
    const whId = b.warehouseId || UNASSIGNED_ID;
    const batchNo = (b.batchNumber || '').trim() || '(no batch)';
    const exp = (b.expiryDate || '').trim();
    const key = `${whId}|${batchNo.toUpperCase()}|${exp}`;
    const qty = Number(b.quantity) || 0;
    const schemeFree = Number(b.supplierSchemeFreeQty) || 0;

    let line = map.get(key);
    if (!line) {
      const info = expiryInfo(exp, today);
      line = {
        key,
        productId,
        warehouseId: whId,
        warehouseName: whName(warehouses, whId),
        batchNumber: batchNo,
        mfgDate: b.mfgDate,
        expiryDate: exp,
        expiryStatus: info.status,
        daysLeft: info.daysLeft,
        receivedQty: 0,
        billedQty: 0,
        freeQty: 0,
        schemeFreeQty: 0,
        availableQty: 0,
        supplierInvoiceNos: [],
        supplierNames: [],
        sourceBatchIds: [],
      };
      map.set(key, line);
    }
    line.receivedQty += qty;
    line.billedQty += Number(b.billedQuantity) || 0;
    line.freeQty += Number(b.freeQuantity) || 0;
    line.schemeFreeQty += schemeFree;
    if (b.supplierInvoiceNo && !line.supplierInvoiceNos.includes(b.supplierInvoiceNo)) {
      line.supplierInvoiceNos.push(b.supplierInvoiceNo);
    }
    if (b.supplierName && !line.supplierNames.includes(b.supplierName)) {
      line.supplierNames.push(b.supplierName);
    }
    if (b.inwardDate && (!line.lastInwardDate || b.inwardDate > line.lastInwardDate)) {
      line.lastInwardDate = b.inwardDate;
    }
    if (!line.mfgDate && b.mfgDate) line.mfgDate = b.mfgDate;
    line.sourceBatchIds.push(b.id);
  }

  const lines = Array.from(map.values());

  // Allocate live availability per warehouse, FEFO.
  const byWh = new Map<string, BatchLine[]>();
  for (const l of lines) {
    const arr = byWh.get(l.warehouseId) || [];
    arr.push(l);
    byWh.set(l.warehouseId, arr);
  }
  byWh.forEach((whLines, whId) => {
    whLines.sort(cmpExpiry);
    const received = whLines.reduce((s, l) => s + l.receivedQty, 0);
    const available =
      availableByWarehouse && availableByWarehouse[whId] !== undefined
        ? Math.max(0, availableByWarehouse[whId])
        : received;
    // 1) Take off what bills really drew from each batch (batchAllocations)...
    let allocatedLeft = 0;
    for (const l of whLines) {
      const sold = soldByBatchId
        ? l.sourceBatchIds.reduce((s, id) => s + (soldByBatchId[id] || 0), 0)
        : 0;
      l.availableQty = Math.max(0, l.receivedQty - sold);
      allocatedLeft += l.availableQty;
    }
    // 2) ...then reconcile with the godown's real book balance (unallocated/legacy sales, audit
    // adjustments, disposals, returns) earliest-expiry first, so the totals always agree.
    let toConsume = Math.max(0, allocatedLeft - available);
    for (const l of whLines) {
      const take = Math.min(l.availableQty, toConsume);
      l.availableQty -= take;
      toConsume -= take;
    }
    const received_ = allocatedLeft; // available stock implied by batch trails
    // Extra positive adjustments (available > received): park on the latest-expiry line.
    if (available > received_ && whLines.length > 0) {
      whLines[whLines.length - 1].availableQty += available - received_;
    }
  });

  return lines.sort((a, b) => {
    if (a.warehouseId !== b.warehouseId) return a.warehouseName.localeCompare(b.warehouseName);
    return cmpExpiry(a, b);
  });
}

export function summariseByWarehouse(lines: BatchLine[]): WarehouseStockSummary[] {
  const map = new Map<string, WarehouseStockSummary>();
  for (const l of lines) {
    let s = map.get(l.warehouseId);
    if (!s) {
      s = {
        warehouseId: l.warehouseId,
        warehouseName: l.warehouseName,
        receivedQty: 0,
        availableQty: 0,
        batchCount: 0,
        nearestExpiryStatus: 'unknown',
        lines: [],
      };
      map.set(l.warehouseId, s);
    }
    s.receivedQty += l.receivedQty;
    s.availableQty += l.availableQty;
    s.batchCount += 1;
    s.lines.push(l);
  }
  const out = Array.from(map.values());
  for (const s of out) {
    // nearest expiry among lines that still have stock (fall back to any line)
    const live = s.lines.filter((l) => l.availableQty > 0 && l.expiryDate);
    const pool = live.length > 0 ? live : s.lines.filter((l) => l.expiryDate);
    const first = [...pool].sort(cmpExpiry)[0];
    if (first) {
      s.nearestExpiry = first.expiryDate;
      s.nearestExpiryStatus = first.expiryStatus;
    }
  }
  return out.sort((a, b) => a.warehouseName.localeCompare(b.warehouseName));
}

/** True when the product has (or had) a batch in that warehouse — used by warehouse filters. */
export function productHasBatchInWarehouse(
  productId: number,
  batches: InventoryBatch[],
  warehouseId: string
): boolean {
  return batches.some((b) => b.productId === productId && b.warehouseId === warehouseId);
}

/** FEFO pick: the in-stock line that expires first. Used to keep legacy Product fields honest. */
export function pickPrimaryBatch(lines: BatchLine[]): BatchLine | undefined {
  const live = lines.filter((l) => l.availableQty > 0);
  return [...(live.length > 0 ? live : lines)].sort(cmpExpiry)[0];
}

/* ------------------------------------------------------------------ */
/* GRN validation — one function used by every inward path             */
/* ------------------------------------------------------------------ */

export type GrnIssueCode =
  | 'NO_WAREHOUSE'
  | 'UNKNOWN_WAREHOUSE'
  | 'NO_ITEMS'
  | 'NO_INVOICE_NO'
  | 'DUPLICATE_INVOICE'
  | 'BAD_QTY'
  | 'NO_PRODUCT_NAME'
  | 'NO_BATCH'
  | 'NO_EXPIRY'
  | 'BAD_EXPIRY'
  | 'EXPIRY_BEFORE_MFG'
  | 'FREE_GT_QTY'
  | 'NEGATIVE_AMOUNT'
  | 'ALREADY_EXPIRED'
  | 'NEAR_EXPIRY'
  | 'BATCH_EXPIRY_CONFLICT';

export interface GrnIssue {
  level: 'error' | 'warning';
  code: GrnIssueCode;
  message: string;
  /** 0-based index into items when the issue belongs to one line */
  lineIndex?: number;
}

export interface GrnDraftLine {
  productId?: number;
  productName: string;
  qty: number;
  freeQty?: number;
  schemeMode?: 'inclusive' | 'additive';
  unitPrice?: number;
  discountAmount?: number;
  batchNumber?: string;
  expiry?: string;
  mfgDate?: string;
}

export interface GrnDraft {
  warehouseId?: string;
  supplierName?: string;
  invoiceNo?: string;
  items: GrnDraftLine[];
}

const norm = (s?: string) => (s || '').trim().toLowerCase();

export function validateGrnDraft(
  draft: GrnDraft,
  ctx: {
    warehouses: Warehouse[];
    grns: GRN[];
    existingBatches?: InventoryBatch[];
    /** the GRN being edited (excluded from duplicate checks) */
    editingGrnId?: string;
    today?: Date;
  }
): GrnIssue[] {
  const issues: GrnIssue[] = [];
  const today = ctx.today || new Date();

  // 1. Warehouse — mandatory, manual, must exist. No default, no fallback.
  if (!draft.warehouseId || !draft.warehouseId.trim()) {
    issues.push({
      level: 'error',
      code: 'NO_WAREHOUSE',
      message: 'Select the warehouse this invoice is being received into. It is mandatory — there is no default.',
    });
  } else if (!ctx.warehouses.some((w) => w.id === draft.warehouseId)) {
    issues.push({
      level: 'error',
      code: 'UNKNOWN_WAREHOUSE',
      message: 'The selected warehouse no longer exists. Pick a valid warehouse.',
    });
  }

  // 2. Header
  if (!draft.items || draft.items.length === 0) {
    issues.push({ level: 'error', code: 'NO_ITEMS', message: 'Add at least one product line.' });
  }
  if (!norm(draft.invoiceNo)) {
    issues.push({ level: 'error', code: 'NO_INVOICE_NO', message: 'Supplier invoice number is required.' });
  } else {
    const dup = ctx.grns.find(
      (g) =>
        g.id !== ctx.editingGrnId &&
        norm(g.invoiceNo) === norm(draft.invoiceNo) &&
        norm(g.supplierName) === norm(draft.supplierName)
    );
    if (dup) {
      issues.push({
        level: 'error',
        code: 'DUPLICATE_INVOICE',
        message: `Invoice ${draft.invoiceNo} from ${draft.supplierName || 'this supplier'} is already posted as ${dup.grnNumber}. Importing it again would double the stock.`,
      });
    }
  }

  // 3. Lines
  draft.items.forEach((it, i) => {
    const label = it.productName?.trim() || `Line ${i + 1}`;
    const at = (level: 'error' | 'warning', code: GrnIssueCode, msg: string) =>
      issues.push({ level, code, message: `${label}: ${msg}`, lineIndex: i });

    if (!norm(it.productName)) at('error', 'NO_PRODUCT_NAME', 'product name is empty.');
    if (!(Number(it.qty) > 0)) at('error', 'BAD_QTY', 'quantity must be greater than 0.');
    if ((it.schemeMode || 'inclusive') === 'inclusive' && (Number(it.freeQty) || 0) > (Number(it.qty) || 0)) {
      at('error', 'FREE_GT_QTY', 'free cases cannot exceed the invoiced quantity (free cases are part of the billed quantity).');
    }
    if ((Number(it.discountAmount) || 0) < 0 || (Number(it.unitPrice) || 0) < 0) {
      at('error', 'NEGATIVE_AMOUNT', 'rate and discount cannot be negative.');
    }

    if (!norm(it.batchNumber)) {
      at('error', 'NO_BATCH', 'batch number is required.');
    }

    const exp = parseDateSafe(it.expiry);
    if (!norm(it.expiry)) {
      at('error', 'NO_EXPIRY', 'expiry date is required.');
    } else if (!exp) {
      at('error', 'BAD_EXPIRY', `expiry "${it.expiry}" is not a valid date.`);
    } else {
      const mfg = parseDateSafe(it.mfgDate);
      if (mfg && exp.getTime() <= mfg.getTime()) {
        at('error', 'EXPIRY_BEFORE_MFG', 'expiry date is on or before the manufacturing date.');
      }
      const info = expiryInfo(it.expiry, today);
      if (info.status === 'expired') {
        at('warning', 'ALREADY_EXPIRED', `this batch already expired (${it.expiry}).`);
      } else if (info.status === 'critical' || info.status === 'warning') {
        at('warning', 'NEAR_EXPIRY', `expires in ${info.daysLeft} day(s) (${it.expiry}).`);
      }
    }
  });

  // 4. Same product + same batch number but a different expiry (in this invoice or already in stock)
  const seen = new Map<string, string>(); // productKey|batch -> expiry
  const existing = ctx.existingBatches || [];
  draft.items.forEach((it, i) => {
    if (!norm(it.batchNumber) || !norm(it.expiry)) return;
    const pKey = it.productId ? `id:${it.productId}` : `n:${norm(it.productName)}`;
    const key = `${pKey}|${norm(it.batchNumber)}`;
    const prev = seen.get(key);
    if (prev && prev !== it.expiry) {
      issues.push({
        level: 'warning',
        code: 'BATCH_EXPIRY_CONFLICT',
        message: `${it.productName}: batch ${it.batchNumber} appears twice on this invoice with different expiry dates (${prev} vs ${it.expiry}).`,
        lineIndex: i,
      });
    }
    seen.set(key, it.expiry as string);
    if (it.productId) {
      const clash = existing.find(
        (b) =>
          b.productId === it.productId &&
          norm(b.batchNumber) === norm(it.batchNumber) &&
          b.expiryDate &&
          b.expiryDate !== it.expiry
      );
      if (clash) {
        issues.push({
          level: 'warning',
          code: 'BATCH_EXPIRY_CONFLICT',
          message: `${it.productName}: batch ${it.batchNumber} is already in stock with expiry ${clash.expiryDate}, but this invoice says ${it.expiry}. Check the batch/expiry.`,
          lineIndex: i,
        });
      }
    }
  });

  return issues;
}

export const grnErrors = (issues: GrnIssue[]) => issues.filter((i) => i.level === 'error');
export const grnWarnings = (issues: GrnIssue[]) => issues.filter((i) => i.level === 'warning');

/** Thrown by postGrn/updateGrn when a draft violates a hard rule. */
export class GrnValidationError extends Error {
  issues: GrnIssue[];
  constructor(issues: GrnIssue[]) {
    super(grnErrors(issues).map((i) => i.message).join(' | ') || 'Invalid GRN');
    this.name = 'GrnValidationError';
    this.issues = issues;
  }
}

/** Re-export type used by callers that build a draft from a GRN */
export type { Product };


/**
 * A godown-to-godown transfer moves quantity between batch rows and may create a destination batch row.
 * Batches rebuilt from GRNs alone (app start without cloud data) know nothing about that, so transfers
 * would silently vanish and the old godown would show its stock again. This re-applies them, oldest
 * first, with the same rules the Transfer screen uses (named batch, otherwise earliest expiry first).
 * The destination batch keeps the source batch's cost / tax fields so margins stay correct.
 */
export function replayStockTransfers(batches: InventoryBatch[], transfers: StockTransfer[]): InventoryBatch[] {
  const list = [...(transfers || [])].sort((a, b) => {
    const d = (a.date || '').localeCompare(b.date || '');
    return d !== 0 ? d : String(a.id).localeCompare(String(b.id));
  });
  let next = batches.map((b) => ({ ...b }));
  const byFefo = (a: InventoryBatch, b: InventoryBatch) => {
    const ea = (a.expiryDate || '9999-12-31').slice(0, 10);
    const eb = (b.expiryDate || '9999-12-31').slice(0, 10);
    if (ea !== eb) return ea.localeCompare(eb);
    return (a.inwardDate || '0000-01-01').slice(0, 10).localeCompare((b.inwardDate || '0000-01-01').slice(0, 10));
  };
  let seq = 0;
  for (const t of list) {
    let left = Math.floor(Number(t.quantity) || 0);
    if (left <= 0 || !t.fromWarehouseId || !t.toWarehouseId || t.fromWarehouseId === t.toWarehouseId) continue;
    const bn = (t.batchNumber || '').trim().toUpperCase();
    const sources = next
      .filter(
        (b) =>
          b.productId === t.productId &&
          b.warehouseId === t.fromWarehouseId &&
          (Number(b.quantity) || 0) > 0 &&
          (!bn || (b.batchNumber || '').toUpperCase() === bn),
      )
      .sort(byFefo);
    for (const src of sources) {
      if (left <= 0) break;
      const take = Math.min(left, Number(src.quantity) || 0);
      if (take <= 0) continue;
      left -= take;
      next = next.map((b) => (b.id === src.id ? { ...b, quantity: (Number(b.quantity) || 0) - take } : b));
      const dest = next.find(
        (b) =>
          b.productId === t.productId &&
          b.warehouseId === t.toWarehouseId &&
          (b.batchNumber || '').toUpperCase() === (src.batchNumber || '').toUpperCase(),
      );
      if (dest) {
        next = next.map((b) => (b.id === dest.id ? { ...b, quantity: (Number(b.quantity) || 0) + take } : b));
      } else {
        next.push({
          ...src,
          id: `batch_xfer_${t.id}_${seq++}`,
          warehouseId: t.toWarehouseId,
          quantity: take,
          billedQuantity: undefined,
          freeQuantity: undefined,
          supplierSchemeFreeQty: undefined,
          notes: `Transferred from ${t.fromWarehouseId}`,
        });
      }
    }
  }
  return next;
}
