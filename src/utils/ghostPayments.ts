import type { Bill, Customer, PaymentRecord } from "../types";

export const normCustNameForGhost = (n?: string): string =>
  (n || "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{M}\p{N}_\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const isDummyPhone = (phone?: string): boolean => {
  const d = (phone || "").replace(/\D/g, "");
  return !d || d === "1234567890" || /^0+$/.test(d) || /^9+$/.test(d) || d.length < 5;
};

const last10Of = (phone?: string): string => {
  if (isDummyPhone(phone)) return "";
  const d = (phone || "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
};

const DUPLICATE_OR_MISTAKE_RE =
  /\b(dup(?:licate)?|mistake|wrong|error|double|extra|test(?:ing)?|bogus|fake|cancelled|cancel|remove|dummy)\b/i;

/**
 * True when a bill deletion reason indicates the invoice was a duplicate, mistake, or test entry
 * (where keeping the payment as customer advance would create a ghost credit).
 */
export function looksLikeDuplicateOrMistakeReason(reason?: string): boolean {
  return DUPLICATE_OR_MISTAKE_RE.test((reason || "").trim());
}

export type GhostPaymentCategory =
  | "deleted_bill_advance"
  | "deleted_bill_link"
  | "deleted_customer"
  | "duplicate_synthetic";

export interface GhostPaymentCandidate {
  payment: PaymentRecord;
  category: GhostPaymentCategory;
  reason: string;
  referencedBillId?: number;
}

export interface FindGhostPaymentsInput {
  payments: PaymentRecord[];
  bills: Bill[];
  customers: Customer[];
  deletedBillIds?: Set<number>;
  deletedCustomerIds?: Set<string>;
  hiddenCustomerNames?: Set<string>;
}

const DELETED_INV_ADVANCE_RE = /from deleted invoice #(\d+)/i;

export function findGhostPayments(input: FindGhostPaymentsInput): GhostPaymentCandidate[] {
  const {
    payments,
    bills,
    customers,
    deletedBillIds = new Set<number>(),
    deletedCustomerIds = new Set<string>(),
    hiddenCustomerNames = new Set<string>(),
  } = input;

  const activeBillsById = new Map<number, Bill>();
  for (const b of bills || []) {
    if (b.status !== "cancelled" && !b.cancelled) {
      activeBillsById.set(Number(b.id), b);
    }
  }

  const activeCustIds = new Set<string>((customers || []).map((c) => c.id));
  const activeCustNames = new Set<string>(
    (customers || []).map((c) => normCustNameForGhost(c.name)).filter(Boolean),
  );
  const activeBillCustNames = new Set<string>(
    Array.from(activeBillsById.values())
      .map((b) => normCustNameForGhost(b.retailer))
      .filter(Boolean),
  );

  // Track real (non-synthetic) sums and synthetic rows per billId to catch duplicate/redundant synthetic rows.
  const realSumByBill = new Map<number, number>();
  const syntheticIdsByBill = new Map<number, string[]>();
  for (const p of payments || []) {
    if (!p?.id || !p.billId) continue;
    const bId = Number(p.billId);
    if (p.id.startsWith("pay_bill_") || p.id.startsWith("legacy_pay_")) {
      const list = syntheticIdsByBill.get(bId) || [];
      list.push(p.id);
      syntheticIdsByBill.set(bId, list);
    } else {
      realSumByBill.set(bId, (realSumByBill.get(bId) || 0) + (Number(p.amount) || 0));
    }
  }

  const results: GhostPaymentCandidate[] = [];
  const seenIds = new Set<string>();
  const pushCandidate = (
    payment: PaymentRecord,
    category: GhostPaymentCategory,
    reason: string,
    referencedBillId?: number,
  ) => {
    if (seenIds.has(payment.id)) return;
    seenIds.add(payment.id);
    results.push({ payment, category, reason, referencedBillId });
  };

  for (const p of payments || []) {
    if (!p?.id) continue;

    // 1. Payments pointing to a deleted or cancelled invoice
    if (p.billId) {
      const bId = Number(p.billId);
      const activeBill = activeBillsById.get(bId);
      if (!activeBill || deletedBillIds.has(bId)) {
        const isSynth = p.id.startsWith("pay_bill_") || p.id.startsWith("legacy_pay_");
        pushCandidate(
          p,
          isSynth ? "duplicate_synthetic" : "deleted_bill_link",
          isSynth
            ? `Auto-generated payment for deleted/cancelled invoice #${bId}`
            : `Receipt still linked to deleted/cancelled invoice #${bId}`,
          bId,
        );
        continue;
      }

      // Synthetic pay_bill_ row already covered by real payments or duplicated
      if (p.id.startsWith("pay_bill_") || p.id.startsWith("legacy_pay_")) {
        const realSum = realSumByBill.get(bId) || 0;
        const billPaid = Number(activeBill.amountPaid) || 0;
        const synths = syntheticIdsByBill.get(bId) || [];
        if (realSum >= billPaid - 0.005) {
          pushCandidate(
            p,
            "duplicate_synthetic",
            `Auto-generated row for invoice #${bId} is already covered by real receipt(s)`,
            bId,
          );
          continue;
        }
        if (synths.length > 1 && synths[0] !== p.id) {
          pushCandidate(
            p,
            "duplicate_synthetic",
            `Duplicate auto-generated payment row on invoice #${bId}`,
            bId,
          );
          continue;
        }
      }
    }

    // 2. Orphaned advance left behind when a deleted invoice defaulted to "Keep as advance"
    const advMatch = (p.referenceNote || "").match(DELETED_INV_ADVANCE_RE);
    if (advMatch && advMatch[1]) {
      const refId = Number(advMatch[1]);
      if (!activeBillsById.has(refId)) {
        pushCandidate(
          p,
          "deleted_bill_advance",
          `Kept as advance when invoice #${refId} was deleted (remove if #${refId} was a duplicate/mistake)`,
          refId,
        );
        continue;
      }
    }

    // 3. Payment tied to a deleted customer record
    if (p.customerId && deletedCustomerIds.has(p.customerId) && !activeCustIds.has(p.customerId)) {
      pushCandidate(
        p,
        "deleted_customer",
        "Belongs to a deleted customer record",
      );
      continue;
    }

    const pNorm = normCustNameForGhost(p.customerName);
    if (
      pNorm &&
      hiddenCustomerNames.has(pNorm) &&
      !activeCustNames.has(pNorm) &&
      !activeBillCustNames.has(pNorm) &&
      (!p.billId || !activeBillsById.has(Number(p.billId)))
    ) {
      pushCandidate(
        p,
        "deleted_customer",
        `Customer "${p.customerName}" was deleted and has no active bills`,
      );
    }
  }

  return results;
}

/**
 * Prevents payments explicitly tagged with a deleted customer's ID from silently falling back
 * to name/phone matching onto a surviving customer with the same name.
 */
export function isPaymentFromDeletedCustomerId(
  p: Pick<PaymentRecord, "customerId" | "billId">,
  deletedCustomerIds: Set<string>,
  activeCustomerIds: Set<string>,
  liveCustBillIds?: Set<number>,
): boolean {
  if (!p.customerId) return false;
  if (p.billId && liveCustBillIds?.has(Number(p.billId))) return false;
  return deletedCustomerIds.has(p.customerId) && !activeCustomerIds.has(p.customerId);
}

/**
 * Finds payment IDs belonging strictly to a customer being deleted.
 * Always includes payments where p.customerId === customer.id.
 * Only includes name/phone-matched payments without a conflicting customerId when NO other
 * surviving customer shares the same normalized name/phone.
 */
export function findPaymentsForDeletedCustomer(params: {
  customer: Pick<Customer, "id" | "name" | "phone" | "altPhone">;
  allCustomers: Customer[];
  payments: PaymentRecord[];
}): PaymentRecord[] {
  const { customer, allCustomers, payments } = params;
  const targetName = normCustNameForGhost(customer.name);
  const targetPhones = new Set(
    [customer.phone, customer.altPhone].map(last10Of).filter(Boolean),
  );
  const otherSurvivors = allCustomers.filter((c) => c.id !== customer.id);
  const survivorSameName = otherSurvivors.some(
    (c) => normCustNameForGhost(c.name) === targetName,
  );
  const survivorSamePhone =
    targetPhones.size > 0 &&
    otherSurvivors.some((c) =>
      [c.phone, c.altPhone].map(last10Of).some((ph) => ph && targetPhones.has(ph)),
    );

  return (payments || []).filter((p) => {
    if (p.customerId && p.customerId === customer.id) return true;
    if (p.customerId && p.customerId !== customer.id) return false;
    // Unlinked customerId: only claim if no surviving customer shares the name or phone
    if (survivorSameName || survivorSamePhone) return false;
    const pName = normCustNameForGhost(p.customerName);
    if (!pName || pName !== targetName) return false;
    const pPhone = last10Of(p.customerPhone);
    if (targetPhones.size > 0 && pPhone && !targetPhones.has(pPhone)) return false;
    return true;
  });
}
