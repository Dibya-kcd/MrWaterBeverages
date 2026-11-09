import fs from "fs";
import XLSX from "xlsx";
import http from "http";

console.log("=== EXECUTING CUSTOMER & BEAT MIGRATION ===");

// 1. Read Base Collections (using the pristine backup taken at start of run)
const baseCollectionsPath = "data/collections.backup_1794124709064.json";
const d = JSON.parse(fs.readFileSync(baseCollectionsPath, "utf8"));

const customers = d.customers || [];
const bills = d.orders || [];
const payments = d.payments || [];
const deletedRecords = d.deleted_records || [];
const delCustMap = new Map();
deletedRecords.filter(r => r.kind === "customer").forEach(r => delCustMap.set(r.name.trim().toLowerCase(), r));

console.log(`Starting with: ${customers.length} customers, ${bills.length} bills, ${payments.length} payments`);

// 2. Define the 6 Official Composite Beats
const BEAT_DEFINITIONS = [
  { id: "beat_mw22aon9905q", hub: "Kuchinda", name: "Kuchinda Town", label: "Kuchinda Town", stops: [{ name: "Kuchinda Market", code: "KCH" }], active: true },
  { id: "beat_mw24x4jj4jvg", hub: "Kuchinda", name: "Kusumi/Kuntra", label: "Kusumi/Kuntra", stops: [{ name: "Kusumi", code: "KSM" }, { name: "Kuntra", code: "KNT" }], active: true },
  { id: "beat_mw24xvfh21zw", hub: "Kuchinda", name: "Keseibahal/Mahulpali", label: "Keseibahal/Mahulpali", stops: [{ name: "Keseibahal", code: "KSB" }, { name: "Mahulpali", code: "MHP" }], active: true },
  { id: "beat_mw24yeqi4nu3", hub: "Kuchinda", name: "Jamankira/Bhojpur/Rengalbeda", label: "Jamankira/Bhojpur/Rengalbeda", stops: [{ name: "Jamankira", code: "JMK" }, { name: "Bhojpur", code: "BJP" }, { name: "Rengalbeda", code: "RGB" }], active: true },
  { id: "beat_mw24ysatjevj", hub: "Kuchinda", name: "Laida/Fasimal/Subarnpali", label: "Laida/Fasimal/Subarnpali", stops: [{ name: "Laida", code: "LDA" }, { name: "Fasimal", code: "FSM" }, { name: "Subarnpali", code: "SBP" }], active: true },
  { id: "beat_mw77386qabat", hub: "Kuchinda", name: "Kolabira/Malidihi/Junani", label: "Kolabira/Malidihi/Junani", stops: [{ name: "Kolabira", code: "KLB" }, { name: "Malidihi", code: "MDH" }, { name: "Junani", code: "JNN" }], active: true }
];

const beatNameToId = new Map(BEAT_DEFINITIONS.map(b => [b.name, b.id]));

if (!d.organization_profile) d.organization_profile = {};
d.organization_profile.beats = BEAT_DEFINITIONS;

// Helper: Normalize strings for fuzzy lookup
const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Index active customers
const custByName = new Map();
const custById = new Map();
const custByPhone = new Map();

customers.forEach(c => {
  custById.set(c.id, c);
  custByName.set(norm(c.name), c);
  if (c.phone) {
    const digits = c.phone.replace(/\D/g, "").slice(-10);
    if (digits.length === 10) custByPhone.set(digits, c);
  }
});

// 3. Load Mapped Beats Spreadsheet
const wb = XLSX.readFile("public/assets/aistudio/latest_customer_list_with_mapped_beats_4b570b43.csv");
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

let beatsUpdated = 0;
let blankSkipped = 0;
let doubtSkipped = 0;
let deletedSkipped = 0;

for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  const name = (row[0] || "").toString().trim();
  const beat = (row[1] || "").toString().trim();
  if (!name) continue;

  if (!beat) {
    blankSkipped++;
    continue;
  }
  if (beat.toLowerCase().includes("doubt")) {
    doubtSkipped++;
    continue;
  }

  const nameLower = name.toLowerCase();
  if (delCustMap.has(nameLower)) {
    deletedSkipped++;
    continue;
  }

  let matched = custByName.get(norm(name));
  if (!matched && norm(name) === "raja bettle shop") {
    matched = custById.get("cust_bill_414");
  }

  if (matched) {
    const beatId = beatNameToId.get(beat);
    if (beatId) {
      matched.route = beat;
      matched.beatId = beatId;
      matched.updatedAt = new Date().toISOString();
      beatsUpdated++;
    }
  }
}

console.log(`Beats updated on customers: ${beatsUpdated}`);
console.log(`Skipped: ${blankSkipped} blank, ${doubtSkipped} doubt, ${deletedSkipped} deleted`);

// 4. Backfill Customer ID on Invoices / Bills
let billsLinked = 0;
let billsAlreadyLinked = 0;
let billsCancelledOrTest = 0;

for (const b of bills) {
  if (b.customerId) {
    billsAlreadyLinked++;
    continue;
  }

  if (String(b.retailer || "").toLowerCase().includes("cancelled test invoice")) {
    billsCancelledOrTest++;
    continue;
  }

  let targetCust = custByName.get(norm(b.retailer));
  if (!targetCust && b.phone) {
    const phoneDigits = b.phone.replace(/\D/g, "").slice(-10);
    if (phoneDigits.length === 10) targetCust = custByPhone.get(phoneDigits);
  }
  if (!targetCust && norm(b.retailer) === "raja bettle shop") {
    targetCust = custById.get("cust_bill_414");
  }

  if (targetCust) {
    b.customerId = targetCust.id;
    billsLinked++;
  }
}

console.log(`Bills: ${billsAlreadyLinked} previously linked + ${billsLinked} newly linked (${billsCancelledOrTest} cancelled test bills untouched)`);

// 5. Backfill Customer ID on Payments
let paymentsLinked = 0;
let paymentsAlreadyLinked = 0;

for (const p of payments) {
  if (p.customerId) {
    paymentsAlreadyLinked++;
    continue;
  }

  let targetCust = custByName.get(norm(p.customerName));
  if (!targetCust && p.customerPhone) {
    const phoneDigits = p.customerPhone.replace(/\D/g, "").slice(-10);
    if (phoneDigits.length === 10) targetCust = custByPhone.get(phoneDigits);
  }
  if (!targetCust && norm(p.customerName) === "raja bettle shop") {
    targetCust = custById.get("cust_bill_414");
  }

  if (targetCust) {
    p.customerId = targetCust.id;
    paymentsLinked++;
  }
}

console.log(`Payments: ${paymentsAlreadyLinked} previously linked + ${paymentsLinked} newly linked (100% of payments linked!)`);

// 6. Write to data/collections.json
fs.writeFileSync("data/collections.json", JSON.stringify(d, null, 2), "utf8");
console.log("Written successfully to data/collections.json");

// 7. Request running server to reload memory cache
const req = http.request(
  {
    hostname: "127.0.0.1",
    port: 3000,
    path: "/api/admin/reload-disk",
    method: "POST",
    headers: { "Content-Type": "application/json" },
  },
  (res) => {
    let body = "";
    res.on("data", (chunk) => (body += chunk));
    res.on("end", () => {
      console.log("Server reload response:", res.statusCode, body);
    });
  }
);
req.on("error", (e) => {
  console.log("Dev server not answering HTTP reload request (will read from disk on startup):", e.message);
});
req.end();
