import test from "node:test";
import assert from "node:assert/strict";
import { buildWhatsAppCaption, sendBillOnWhatsApp, whatsAppResultMessage } from "../src/utils/whatsappBill";

const bill: any = {
  id: 1042, date: "2026-11-11", retailer: "Sri Jagannath General Store", phone: "9437012345",
  invoiceType: "retail", isGstInvoice: false,
  items: [{ productId: 1, productName: "Mr Water 1L", qty: 10, freeQty: 0, rate: 144, gross: 1440, discount: 0, amount: 1440, gst: 0.18 }],
  subtotal: 1440, discount: 0, additionalDiscount: 0, cgst: 0, sgst: 0, roundOff: 0, total: 1440, amountPaid: 1000,
};
const org: any = { name: "MrWater Beverages", city: "Sambalpur", phone: "9876543210" };
const settings: any = { invoicePrefix: "RET" };

function setBrowser(nav: any, opened: string[]) {
  Object.defineProperty(globalThis, "navigator", { value: nav, configurable: true });
  (globalThis as any).window = { open: (u: string) => { opened.push(u); return null; } };
}

test("caption is short and shows total, paid and due", () => {
  const c = buildWhatsAppCaption(bill, org, settings);
  assert.match(c, /MrWater Beverages/);
  assert.match(c, /RET-1042/);
  assert.match(c, /Due/);
  assert.ok(c.split("\n").length <= 5);
});

test("phone with file sharing: one 80 mm PDF is handed to the share sheet", async () => {
  let shared: any = null;
  setBrowser({ canShare: () => true, share: async (d: any) => { shared = d; } }, []);
  const r = await sendBillOnWhatsApp(bill, org, settings, "non_gst");
  assert.equal(r, "shared");
  assert.equal(shared.files.length, 1);
  assert.equal(shared.files[0].type, "application/pdf");
  assert.match(shared.files[0].name, /80mm\.pdf$/);
  assert.match(shared.text, /Thank you/);
  assert.equal(whatsAppResultMessage(r), null);
});

test("person closes the share sheet: reported as cancelled, nothing else happens", async () => {
  const opened: string[] = [];
  setBrowser({ canShare: () => true, share: async () => { const e: any = new Error("x"); e.name = "AbortError"; throw e; } }, opened);
  assert.equal(await sendBillOnWhatsApp(bill, org, settings, "non_gst"), "cancelled");
  assert.equal(opened.length, 0);
});
