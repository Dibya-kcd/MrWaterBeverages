import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBillMessage,
  buildReceiptRows,
  buildReceiptText,
  generateReceiptPdf80,
  upiPayUri,
} from "../src/utils/receipt80";
import { setOdiaNameLookup } from "../src/utils/odiaNameLookup";
import { buildInvoicePdf, resolveInvoicePaper, invoicePdfFilename } from "../src/utils/invoicePdf";

const bill: any = {
  id: 1042,
  date: "2026-11-11",
  retailer: "Sri Jagannath General Store & Cold Drinks",
  phone: "9437012345",
  customerGstin: "21ABCDE1234F1Z5",
  supplyType: "B2B",
  invoiceType: "tax_invoice",
  isGstInvoice: true,
  items: [
    { productId: 1, productName: "Mr Water 1L (12 x 1L) Packaged Drinking Water", qty: 10, freeQty: 0, rate: 144, gross: 1440, discount: 0, amount: 1440, gst: 0.18 },
    { productId: 2, productName: "Mr Water 500ml (24 x 500ml)", qty: 20, freeQty: 2, rate: 168, gross: 3360, discount: 336, amount: 3024, gst: 0.18 },
    { productId: 3, productName: "Soda 250ml", qty: 5, freeQty: 5, rate: 120, gross: 600, discount: 600, amount: 0, isBundleFreeItem: true, gst: 0.18 },
  ],
  subtotal: 4464, discount: 936, additionalDiscount: 0, cgst: 401.76, sgst: 401.76, roundOff: 0.48, total: 5268, amountPaid: 3000,
};
const org: any = { name: "MrWater Beverages", address: "Main Godown Yard", city: "Sambalpur", phone: "9876543210", gstin: "21AAAAA0000A1Z5", upiId: "mrwater@upi" };
const settings: any = { invoicePrefix: "INV" };

test("receipt text never runs past the chosen width", () => {
  for (const w of [32, 42, 48] as const) {
    const lines = buildReceiptText(bill, org, settings, "gst", w).split("\n");
    assert.ok(lines.every((l) => l.length <= w), `a line is longer than ${w}`);
  }
});

test("receipt shows the bill's own figures", () => {
  const t = buildReceiptText(bill, org, settings, "gst", 42);
  assert.match(t, /INV-1042/);
  assert.match(t, /Rs 5,268\.00/); // total
  assert.match(t, /Rs 2,268\.00/); // balance = 5268 - 3000
  assert.match(t, /CGST/);
  assert.match(t, /FREE/); // free-stock line
});

test("non-GST receipt has no GST split and no buyer GSTIN", () => {
  const t = buildReceiptText({ ...bill, invoiceType: "retail", isGstInvoice: false }, org, settings, "non_gst", 32);
  assert.doesNotMatch(t, /CGST|SGST|Buyer GSTIN/);
  assert.match(t, /RETAIL BILL/);
});

test("WhatsApp style setting switches the message; detailed stays the default", () => {
  const detailed = buildBillMessage(bill, org, settings, "gst");
  const receipt = buildBillMessage(bill, org, { ...settings, whatsappTextStyle: "receipt", receiptTextWidth: 32 }, "gst");
  assert.match(detailed, /TAX INVOICE/);
  assert.ok(!detailed.startsWith("```"));
  assert.ok(receipt.startsWith("```\n") && receipt.endsWith("\n```"), "receipt text is fenced for a fixed-width font");
  const inner = receipt.slice(4, -4).split("\n");
  assert.ok(inner.every((l) => l.length <= 32));
});

test("receipt rows and text come from one model (same row count of items)", () => {
  const items = buildReceiptRows(bill, org, settings, "gst").filter((r) => r.k === "item");
  assert.equal(items.length, bill.items.length);
});

test("80 mm PDF is 80 mm wide and grows with the item count", () => {
  const small = generateReceiptPdf80({ ...bill, items: bill.items.slice(0, 1) }, org, settings, "gst");
  const many = generateReceiptPdf80({ ...bill, items: Array.from({ length: 30 }, (_, i) => ({ ...bill.items[0], productId: 100 + i })) }, org, settings, "gst");
  assert.equal(Math.round(small.internal.pageSize.getWidth()), 80);
  assert.equal(Math.round(many.internal.pageSize.getWidth()), 80);
  assert.ok(many.internal.pageSize.getHeight() > small.internal.pageSize.getHeight());
  assert.equal(many.getNumberOfPages(), 1, "receipt is one continuous page");
});

test("paper setting picks A4 or 80 mm; A4 stays the default", () => {
  assert.equal(resolveInvoicePaper(undefined), "a4");
  assert.equal(resolveInvoicePaper({ ...settings, defaultInvoicePaper: "80mm" }), "80mm");
  assert.equal(resolveInvoicePaper({ ...settings, defaultInvoicePaper: "80mm" }, { paper: "a4" }), "a4");
  const a4 = buildInvoicePdf(bill, org, settings, "gst");
  const r80 = buildInvoicePdf(bill, org, settings, "gst", { paper: "80mm" });
  assert.equal(Math.round(a4.internal.pageSize.getWidth()), 210);
  assert.equal(Math.round(r80.internal.pageSize.getWidth()), 80);
  assert.match(invoicePdfFilename(bill, settings, "gst", { paper: "80mm" }), /_80mm\.pdf$/);
  assert.doesNotMatch(invoicePdfFilename(bill, settings, "gst"), /_80mm/);
});

test("UPI QR appears only when money is due, a UPI ID is set and the setting is not off", () => {
  const hasQr = (b: any, o: any, st: any) => buildReceiptRows(b, o, st, "gst").some((r) => r.k === "qr");
  assert.equal(hasQr(bill, org, settings), true, "balance due + UPI id -> QR");
  assert.equal(hasQr({ ...bill, amountPaid: bill.total }, org, settings), false, "fully paid -> no QR");
  assert.equal(hasQr(bill, { ...org, upiId: "" }, settings), false, "no UPI id -> no QR");
  assert.equal(hasQr(bill, org, { ...settings, showUpiQrOnReceipt: false }), false, "switched off -> no QR");
  const qr: any = buildReceiptRows(bill, org, settings, "gst").find((r) => r.k === "qr");
  assert.match(qr.data, /^upi:\/\/pay\?pa=mrwater@upi&/);
  assert.match(qr.data, /am=2268\.00/); // the balance, not the bill total
  assert.match(qr.caption, /2,268\.00/);
});

test("QR never lands in the WhatsApp text", () => {
  assert.doesNotMatch(buildReceiptText(bill, org, settings, "gst", 42), /upi:\/\//);
});

test("UPI link is encoded safely", () => {
  assert.equal(
    upiPayUri("shop@okaxis", "A & B Store", 940, "RET-7"),
    "upi://pay?pa=shop@okaxis&pn=A%20%26%20B%20Store&am=940.00&cu=INR&tn=RET-7"
  );
});

test("Odia product names print only when switched on and saved on the product", () => {
  setOdiaNameLookup((id) => (id === 1 ? "ମିଷ୍ଟର ୱାଟର" : ""));
  const on = buildReceiptText(bill, org, { ...settings, showOdiaNameOnReceipt: true }, "gst", 32);
  const off = buildReceiptText(bill, org, settings, "gst", 32);
  assert.match(on, /ମିଷ୍ଟର ୱାଟର/);
  assert.doesNotMatch(off, /ମିଷ୍ଟର/);
  // products with no saved Odia name stay English-only, and a PDF built without a canvas does not crash
  assert.doesNotThrow(() => generateReceiptPdf80(bill, org, { ...settings, showOdiaNameOnReceipt: true }, "gst"));
  setOdiaNameLookup(() => "");
});

test("WhatsApp detailed message uses aligned rows/columns and omits empty org GSTIN/phone", () => {
  const b2cBill: any = {
    id: 554,
    date: "2026-11-11",
    retailer: "BIKAS STORE, BANKEY",
    phone: "8260862945",
    supplyType: "B2C",
    invoiceType: "tax_invoice",
    isGstInvoice: true,
    items: [
      { productId: 1, productName: "E.H. VIBE COLA 185ML CAN", qty: 1, freeQty: 0, rate: 240, gross: 240, discount: 0, amount: 240, gst: 0.4 },
    ],
    subtotal: 171.43,
    discount: 0,
    additionalDiscount: 0,
    cgst: 34.29,
    sgst: 34.29,
    total: 240,
    amountPaid: 240,
  };
  const minimalOrg: any = { name: "HYDRATE HUB", phone: "", gstin: "" };
  const msg = buildBillMessage(b2cBill, minimalOrg, settings, "gst");
  assert.doesNotMatch(msg, /\uFFFD/, "no Unicode replacement characters");
  assert.doesNotMatch(msg, /\|\s*GSTIN:/, "no empty phone | GSTIN line");
  assert.doesNotMatch(msg, /GST B2B Tax Invoice/, "B2C bill should not say B2B");
  assert.match(msg, /ITEM          \| QTY\|   RATE\|  AMOUNT/);
  assert.match(msg, /E\.H\. VIBE COLA 185ML CAN/);
  assert.match(msg, /              \|   1\| 240\.00\|  240\.00/);
  const blockMatch = msg.match(/```\n([\s\S]*?)\n```/);
  assert.ok(blockMatch, "contains monospace table block");
  const tableLines = blockMatch[1].split("\n");
  assert.ok(tableLines.every((l) => l.length <= 36), "all monospace lines stay within 36 columns");
});

