/**
 * invoiceAi.ts  (server side - imported by server.ts)
 *
 * Reads a supplier invoice (photo / scanned PDF / digital PDF / pasted text) with Gemini and
 * returns data that has been cross-checked against the invoice's own arithmetic.
 *
 * Pipeline
 *   1. Extract   - best free Flash model first, JSON schema enforced, high media resolution.
 *   2. Normalise - numbers, dates, GSTIN checksum, free-case semantics, taxes (invoiceAiValidation.ts).
 *   3. Verify    - rows vs printed amounts, rows vs printed total cases, rows vs grand total.
 *   4. Repair    - if (3) found real problems, ONE focused second look at the document,
 *                  keeping whichever result has fewer problems.
 *
 * Free-tier friendly: 1 request per clean invoice, 2 at most.
 *
 * Optional env vars
 *   GEMINI_API_KEY   required
 *   GEMINI_MODELS    comma separated model ids, best first
 *                    (default: gemini-3.8-flash, gemini-flash-latest, gemini-3.1-flash-lite)
 */
import { GoogleGenAI, MediaResolution, Type } from '@google/genai';
import {
  AiInvoice,
  AiIssue,
  normalizeAiInvoice,
  validateInvoice,
} from './src/utils/invoiceAiValidation';

/* ------------------------------------------------------------------------------------ */
/* model selection + circuit breaker                                                     */
/* ------------------------------------------------------------------------------------ */

// Best quality FIRST. The lightest model is the last resort: it is the one most likely to
// skip rows or misread small print, so it must not be the default.
const DEFAULT_MODELS = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];

const coolDownUntil: Record<string, number> = {};

export function getCandidateModels(): string[] {
  const fromEnv = (process.env.GEMINI_MODELS || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  const pool = fromEnv.length ? fromEnv : DEFAULT_MODELS;
  const now = Date.now();
  const ready = pool.filter((m) => (coolDownUntil[m] || 0) <= now);
  const resting = pool.filter((m) => (coolDownUntil[m] || 0) > now);
  // models that are cooling down are still tried, but only after every healthy one
  return [...ready, ...resting];
}

/* ------------------------------------------------------------------------------------ */
/* prompt + schema                                                                       */
/* ------------------------------------------------------------------------------------ */

const SYSTEM_INSTRUCTION = `You are a meticulous data-entry clerk for an Indian beverage distributor.
You read supplier tax invoices, bills and quotations (soft drinks, energy drinks, fruit drinks, packaged water - e.g. Campa, Sosyo, Reliance Consumer Products, bottlers) and copy their contents into JSON exactly as printed.
Accuracy matters more than speed: a missed row or a wrong digit becomes a stock and accounting error.

HOW TO READ
1. Look at EVERY page. Find the line-item table and read its column headings first: which column is quantity, which is rate, which is discount, which is taxable value / amount, which are CGST/SGST/IGST. Note whether quantity is in cases (CS, CTN, CRT, BOX) or in pieces (PCS, BTL, NOS).
2. Read every product row from top to bottom on every page. Never skip, merge, split or duplicate rows. A table continued on the next page is the same table.
3. Rows that are NOT products must not be listed as items: totals, sub-totals, tax summaries, HSN summary tables, freight, loading, round-off, TCS, bank details.
4. Copy numbers exactly as printed (drop currency signs and thousands separators). Never calculate, estimate or "fix" a printed number. If something is not printed use null (numbers) or "" (text).
5. Before answering, check your own work: (a) is the number of rows right, (b) do the row quantities add up to the printed total quantity / total cases, (c) does each row's quantity x rate (less discount) match its amount, (d) do the rows add up to the invoice total. If anything disagrees, look at the document again and correct your reading.

PARTIES
- supplier = the company that ISSUED the invoice (letterhead / "From" / seller). Its GSTIN is the one next to its name at the top.
- billedTo / shippedTo = the buyer ("Bill to", "Consignee", "Ship to"). buyerGstin is the buyer's GSTIN. Do not swap supplier and buyer.

ROW FIELDS
- rawName: product description exactly as printed.
- productName: tidy Title Case version - Brand, product, size, pack (e.g. "CAMPA POWER UP 150ML PET" -> "Campa Power Up 150ml PET").
- category: "energy" (power up, boost, energy drinks), "vibe" (cola, lemon, orange, soda, carbonated), "joos" (juice, mango, guava, apple, mix fruit, nimbu), "water" (packaged drinking water), else "general".
- pack: PET, Can, Glass or Tetra.
- volume: size of ONE bottle/can/pack in ml as a number (e.g. 250 for 250ml, 750 for 750ml, 2250 for 2.25L, 1250 for 1.25L, 1500 for 1.5L, 600 for 600ml, 300 for 300ml, 200 for 200ml, 1000 for 1L). Pay extreme attention to the volume (ml) and pack type printed on each line so 250ml, 750ml, 2.25L, Cans, and RGB Glass bottles of similar brand names are strictly distinguished.
- hsn: the HSN printed on the row, or on the HSN summary for that product.
- qty: the quantity exactly as printed in the quantity column. qtyUnit: "case" or "pcs" (what that quantity counts). unitsPerCase: bottles per case if printed (e.g. "24x150ml" or "Pack: 24"), else null.
- freeQty: number of free / bonus / scheme units for the row, in the same unit as qty (0 if none).
- freeIncludedInQty: true if the printed qty ALREADY includes the free units (e.g. "Qty 70, of which 25 free"); false if free units are a separate column ON TOP of the billed quantity (e.g. "Billed 100 | Free 10"); null if you cannot tell.
- unitPrice: the basic rate BEFORE discount and tax. rateUnit: "case" or "pcs" (what that rate is per). Do NOT use MRP / retail price / "unit MRP" here.
- discountPercent / discountAmount: the row's trade discount, as printed (0 if none). A scheme that only gives free cases is NOT a discount.
- cgstPercent / sgstPercent: the rates printed on the row, or in the tax summary for that HSN (e.g. 20 and 20 for a 40% slab). For inter-state invoices that show IGST, put it in igstPercent instead.
- lineTotal: the row's amount exactly as printed (taxable value or total, whichever the table shows).
- batchNumber, expiryDate, mfgDate: only if printed (dates as YYYY-MM-DD; a month/year expiry becomes the last day of that month).
- schemeDescription: any scheme text for the row ("" if none).

HEADER FIELDS
- invoiceNo exactly as printed (keep slashes/dashes). invoiceDate as YYYY-MM-DD (Indian dates are day-month-year).
- overallDiscount: invoice-level discount in rupees (positive number). roundOff: signed. otherCharges: freight/TCS/etc. added to the total (0 if none).
- grandTotal: final payable amount. totalCases: total quantity / cases printed in the totals row (null if none).
- vehicleNo, placeOfSupply, supplierAddress, supplierPhone, supplierEmail when printed.

Return ONLY the JSON object.`;

const nullableNumber = { type: Type.NUMBER, nullable: true };
const text = { type: Type.STRING };

const ITEM_PROPERTIES = {
  rawName: text,
  productName: text,
  category: { type: Type.STRING, enum: ['energy', 'vibe', 'joos', 'water', 'general'] },
  pack: text,
  volume: nullableNumber,
  hsn: text,
  qty: { type: Type.NUMBER },
  qtyUnit: { type: Type.STRING, enum: ['case', 'pcs'] },
  unitsPerCase: nullableNumber,
  freeQty: { type: Type.NUMBER },
  freeIncludedInQty: { type: Type.BOOLEAN, nullable: true },
  unitPrice: nullableNumber,
  rateUnit: { type: Type.STRING, enum: ['case', 'pcs'] },
  discountPercent: nullableNumber,
  discountAmount: nullableNumber,
  cgstPercent: nullableNumber,
  sgstPercent: nullableNumber,
  igstPercent: nullableNumber,
  lineTotal: nullableNumber,
  batchNumber: text,
  expiryDate: text,
  mfgDate: text,
  schemeDescription: text,
};

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  propertyOrdering: [
    'supplierName', 'supplierGstin', 'supplierAddress', 'supplierPhone', 'supplierEmail',
    'invoiceNo', 'invoiceDate', 'vehicleNo', 'placeOfSupply',
    'billedTo', 'buyerGstin', 'shippedTo',
    'items',
    'overallDiscount', 'roundOff', 'otherCharges', 'grandTotal', 'totalCases',
  ],
  properties: {
    supplierName: text,
    supplierGstin: text,
    supplierAddress: text,
    supplierPhone: text,
    supplierEmail: text,
    invoiceNo: text,
    invoiceDate: text,
    vehicleNo: text,
    placeOfSupply: text,
    billedTo: text,
    buyerGstin: text,
    shippedTo: text,
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        propertyOrdering: Object.keys(ITEM_PROPERTIES),
        properties: ITEM_PROPERTIES,
        required: ['rawName', 'qty'],
      },
    },
    overallDiscount: nullableNumber,
    roundOff: nullableNumber,
    otherCharges: nullableNumber,
    grandTotal: nullableNumber,
    totalCases: nullableNumber,
  },
  required: ['items'],
};

function buildRepairPrompt(previousJson: string, problems: AiIssue[]): string {
  const list = problems
    .filter((p) => p.level !== 'info')
    .slice(0, 12)
    .map((p, i) => `${i + 1}. ${p.message}`)
    .join('\n');
  return `A first reading of this document was automatically checked against the invoice's own arithmetic and these problems were found:
${list}

First reading (may contain mistakes):
${previousJson}

Look at the document again, concentrating on the rows and totals mentioned above. Re-read the table column by column. Fix real misreadings, add rows that were missed, remove rows that were duplicated or are not products, and correct swapped columns (quantity vs free vs rate vs amount). If a problem is genuinely caused by the invoice itself (for example a printed rounding difference), keep the printed values.
Return the COMPLETE corrected JSON object (all rows), nothing else.`;
}

/* ------------------------------------------------------------------------------------ */
/* Gemini call with fallbacks                                                            */
/* ------------------------------------------------------------------------------------ */

interface CallInput {
  parts: any[];
}

interface ModelError {
  model: string;
  error: string;
  status?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function errorStatus(e: any): number | undefined {
  const s = e?.status ?? e?.code ?? e?.error?.code;
  const n = Number(s);
  if (Number.isFinite(n) && n > 0) return n;
  const m = String(e?.message || '').match(/\b(4\d\d|5\d\d)\b/);
  return m ? Number(m[1]) : undefined;
}

function errorMessage(e: any): string {
  return e?.message || String(e);
}

class FatalAiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function generate(
  ai: GoogleGenAI,
  models: string[],
  { parts }: CallInput,
  errors: ModelError[],
): Promise<{ text: string; model: string; truncated: boolean }> {
  for (const model of models) {
    // Optional features are dropped one by one if a model rejects them (HTTP 400).
    const ladder = [
      { schema: true, hiRes: true },
      { schema: true, hiRes: false },
      { schema: false, hiRes: false },
    ];
    let rung = 0;
    let transientTries = 0;

    while (rung < ladder.length) {
      const { schema, hiRes } = ladder[rung];
      try {
        console.log(`[invoice-ai] ${model} (schema=${schema}, hiRes=${hiRes}, try ${transientTries + 1})`);
        const response = await ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts }],
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
            ...(schema ? { responseSchema: RESPONSE_SCHEMA as any } : {}),
            ...(hiRes ? { mediaResolution: MediaResolution.MEDIA_RESOLUTION_HIGH } : {}),
            temperature: 0.1,
            // thinking tokens count against this limit, and a 60-row invoice is a long JSON
            maxOutputTokens: 32768,
          },
        });
        const out = (response.text || '').trim();
        if (out) {
          const finish = String((response as any).candidates?.[0]?.finishReason || '');
          return { text: out, model, truncated: /MAX_TOKENS/i.test(finish) };
        }
        errors.push({ model, error: 'empty response' });
        break; // try next model
      } catch (e: any) {
        const status = errorStatus(e);
        const msg = errorMessage(e);
        errors.push({ model, error: msg, status });
        console.warn(`[invoice-ai] ${model} failed (${status ?? '?'}): ${msg.slice(0, 300)}`);

        if (status === 401 || status === 403 || /API key (not valid|expired)|PERMISSION_DENIED|API_KEY_INVALID/i.test(msg)) {
          throw new FatalAiError(
            'The Gemini API key is invalid, expired or not allowed. Create a new key in Google AI Studio and update GEMINI_API_KEY on the server.',
            503,
          );
        }
        if (status === 404 || /not found|no longer available|not supported for generateContent/i.test(msg)) {
          coolDownUntil[model] = Date.now() + 60 * 60 * 1000; // retired / renamed model: skip for an hour
          break;
        }
        if (status === 400) {
          const configRelated = /schema|resolution|responseMimeType|response_mime|mime type|unsupported|not supported|thinking/i.test(msg);
          if (configRelated && rung < ladder.length - 1) {
            rung++; // retry the same model without the optional feature
            continue;
          }
          // the request itself is bad (corrupt/blocked/oversized file): other models will say the same
          throw new FatalAiError(
            `Gemini could not read this file (${msg.slice(0, 180)}). Try a clearer photo, or a smaller / non-password-protected PDF.`,
            422,
          );
        }
        if (status === 429) {
          const daily = /per\s*day|PerDay|daily/i.test(msg);
          coolDownUntil[model] = Date.now() + (daily ? 60 * 60 * 1000 : 65 * 1000);
          break;
        }
        if (status === 500 || status === 502 || status === 503 || status === 504 || /overloaded|high demand|unavailable|timeout|timed out|ECONN|fetch failed/i.test(msg)) {
          if (transientTries < 1) {
            transientTries++;
            await sleep(1200 + Math.floor(Math.random() * 600));
            continue; // one quick retry on the same model
          }
          coolDownUntil[model] = Date.now() + 45 * 1000;
          break;
        }
        break; // unknown error: next model
      }
    }
  }
  const allBusy = errors.length > 0 && errors.every((e) => e.status === 429 || e.status === 503 || /high demand|overloaded|unavailable|quota/i.test(e.error));
  const quota = errors.some((e) => e.status === 429);
  throw new FatalAiError(
    allBusy
      ? quota
        ? 'The free Gemini quota is used up for the moment (per-minute or per-day limit). Wait a minute and press Retry, or upload an Excel/CSV copy of the invoice.'
        : 'Google Gemini is busy right now (503). Press Retry in a few seconds, or upload an Excel/CSV copy of the invoice.'
      : `AI recognition failed: ${errors.map((e) => `${e.model}: ${e.error.slice(0, 160)}`).join(' | ')}`,
    allBusy ? 503 : 500,
  );
}

/* ------------------------------------------------------------------------------------ */
/* JSON parsing (tolerates fences and a truncated tail)                                  */
/* ------------------------------------------------------------------------------------ */

export function parseModelJson(textIn: string): { value: any; salvaged: boolean } {
  let t = textIn.trim();
  if (t.startsWith('```')) t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try {
      return { value: JSON.parse(t.slice(first, last + 1)), salvaged: false };
    } catch {
      /* fall through to salvage */
    }
  }
  // Truncated output: keep every COMPLETE item object and close the document.
  const itemsAt = t.indexOf('"items"');
  const arrayAt = itemsAt === -1 ? -1 : t.indexOf('[', itemsAt);
  if (arrayAt !== -1) {
    let depth = 0;
    let inStr = false;
    let esc = false;
    let lastCompleteEnd = -1;
    for (let i = arrayAt + 1; i < t.length; i++) {
      const c = t[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) lastCompleteEnd = i;
      }
    }
    if (lastCompleteEnd !== -1) {
      const head = t.slice(first, lastCompleteEnd + 1);
      try {
        return { value: JSON.parse(head + ']}'), salvaged: true };
      } catch {
        /* give up below */
      }
    }
  }
  throw new Error('The model returned a response that is not valid JSON.');
}

/* ------------------------------------------------------------------------------------ */
/* public entry point                                                                    */
/* ------------------------------------------------------------------------------------ */

export interface RecognizeInput {
  apiKey: string;
  fileBase64?: string;
  mimeType?: string;
  fileName?: string;
  textContent?: string;
}

export interface RecognizeResult {
  data: AiInvoice;
  model: string;
  warnings: string[];
  repaired: boolean;
}

export async function recognizeInvoiceWithGemini(input: RecognizeInput): Promise<RecognizeResult> {
  const ai = new GoogleGenAI({
    apiKey: input.apiKey,
    httpOptions: {
      timeout: 90_000,
      headers: { 'User-Agent': 'aistudio-build' },
    },
  });

  // the document goes first, the instruction after it (best practice for multimodal prompts)
  const contentParts: any[] =
    input.fileBase64 && input.mimeType
      ? [{ inlineData: { mimeType: input.mimeType, data: input.fileBase64 } }]
      : [{ text: `INVOICE CONTENT (file ${input.fileName || 'invoice.csv'}):\n${input.textContent}` }];
  const askParts: any[] = [{ text: 'Read this invoice and return the JSON.' }];

  const errors: ModelError[] = [];
  const models = getCandidateModels();

  /* ---- pass 1: extract ---- */
  const first = await generate(ai, models, { parts: [...contentParts, ...askParts] }, errors);
  let parsed = parseModelJson(first.text);
  let norm = normalizeAiInvoice(parsed.value);
  let check = validateInvoice(norm.invoice, norm.issues);
  if (parsed.salvaged || first.truncated) {
    check.issues.push({
      level: 'warn',
      code: 'truncated',
      message: 'The AI answer was cut short, so rows at the end of the invoice may be missing. Compare the item count with the invoice.',
    });
    check.needsRepair = true;
  }

  let best = { invoice: norm.invoice, issues: check.issues, score: check.score, model: first.model };
  let repaired = false;

  /* ---- pass 2: one focused repair when the checks found real problems ---- */
  if (check.needsRepair) {
    try {
      const repairParts = [
        ...contentParts,
        { text: buildRepairPrompt(JSON.stringify(parsed.value), check.issues) },
      ];
      // the repair is allowed to use the same (best) model again; reorder so that the model
      // that just worked is first
      const ordered = [first.model, ...getCandidateModels().filter((m) => m !== first.model)];
      const second = await generate(ai, ordered, { parts: repairParts }, errors);
      const parsed2 = parseModelJson(second.text);
      const norm2 = normalizeAiInvoice(parsed2.value);
      const check2 = validateInvoice(norm2.invoice, norm2.issues);
      if (check2.score < best.score || (check2.score === best.score && norm2.invoice.items.length > best.invoice.items.length)) {
        best = { invoice: norm2.invoice, issues: check2.issues, score: check2.score, model: second.model };
        repaired = true;
        console.log(`[invoice-ai] repair pass improved result (score ${check.score} -> ${check2.score})`);
      } else {
        console.log(`[invoice-ai] repair pass did not improve result (score ${check.score} vs ${check2.score}); keeping first reading`);
      }
    } catch (e: any) {
      // a failed repair must never lose the first reading
      console.warn('[invoice-ai] repair pass failed:', errorMessage(e));
    }
  }

  const warnings = best.issues
    .filter((i) => i.level !== 'info' || i.code === 'gstin_repaired' || i.code.startsWith('free_'))
    .map((i) => i.message);

  return { data: best.invoice, model: best.model, warnings, repaired };
}

export { FatalAiError };
