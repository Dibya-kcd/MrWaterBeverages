import React, { useMemo, useState, useCallback } from "react";
import { SizeChip } from "../common/SizeChip";
import { PackIcon } from "../common/PackIcon";
import { sizeTheme } from "../../utils/sizeColor";
import { Plus, Search, Trash2, X, Languages, Loader2, CheckSquare, Square, Layers } from "lucide-react";
import { useLedger } from "../../context/LedgerContext";
import { useLanguage } from "../../i18n/LanguageContext";
import { useAutoOdiaNameMap, nameFromMap } from "../../hooks/useAutoOdiaName";
import { CategoryKey, Product, Taxability } from "../../types";
import { CATS } from "../../constants/initialData";
import { CASE_PACK_SIZES, gstRateFromHsn, money, resolveProductGstRate, resolveProductHsn, volumeFromName, detectPack } from "../../utils/billing";
import { ConfirmModal, ToggleSwitch } from "../ui";
import { notify } from "../../utils/toast";

// Current GST slabs for beverages (12% and 28% no longer exist). An old product that still carries
// another rate keeps showing it until you pick a valid one.
const GST_OPTIONS = ["0%", "5%", "18%", "40%"];

const emptyProductForm = () => ({
  name: "",
  nameOr: "",
  sku: "",
  brand: "",
  category: "general" as CategoryKey,
  categoryText: "",
  taxability: "taxable" as Taxability,
  hsn: "",
  gstPct: "18%",
  cessPct: "0",
  unit: "pcs",
  unitsPerCase: "1",
  mrp: "0",
  purchaseRate: "0",
  labourCost: "0",
  freightCost: "0",
  retailRate: "0",
  wholesaleRate: "0",
  specialRate: "0",
  reorderLevel: "0",
  imageUrl: "",
  ratesIncludeGst: false,
  opening: "0",
  warehouseId: "",
  batchNumber: "",
  expiry: "",
  returnable: false,
  active: true,
});

function gstToRate(label: string): number {
  const n = parseFloat(label);
  return isNaN(n) ? 0.18 : n / 100;
}

function rateToGstLabel(rate?: number): string {
  if (rate == null) return "18%";
  const pct = Math.round(rate * 100 * 100) / 100;
  const match = GST_OPTIONS.find((o) => parseFloat(o) === pct);
  return match || `${pct}%`;
}

const hsnLooksValid = (h: string) => /^\d{8}$/.test(h.trim());

export const ProductsView: React.FC = () => {
  const {
    products,
    warehouses,
    addProduct,
    updateProductFields,
    bulkSetProductTaxability,
    deleteProduct,
  } = useLedger();
  const { language } = useLanguage();
  const productNameMap = useAutoOdiaNameMap(products || []);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyProductForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Product | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const toggleSelectProduct = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return products.filter((p) => {
      if (filterCat === "non_gst") {
        if (p.taxability !== "non_gst") return false;
      } else if (filterCat !== "all" && p.category !== filterCat) {
        return false;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.nameOr || "").toLowerCase().includes(q) ||
        (p.sku || "").toLowerCase().includes(q) ||
        (p.brand || "").toLowerCase().includes(q) ||
        (p.hsn || "").includes(q)
      );
    });
  }, [products, searchTerm, filterCat]);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyProductForm());
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditingId(p.id);
    const isNonGst = p.taxability === "non_gst";
    setForm({
      name: p.name || "",
      nameOr: p.nameOr || "",
      sku: p.sku || "",
      brand: p.brand || "",
      category: p.category || "general",
      categoryText: CATS[p.category]?.name || "",
      taxability: isNonGst ? "non_gst" : "taxable",
      hsn: resolveProductHsn(p),
      gstPct: isNonGst ? "0%" : rateToGstLabel(resolveProductGstRate(p)),
      cessPct: "0",
      unit: p.pack || "pcs",
      unitsPerCase: String(p.unitsPerCrate ?? 1),
      mrp: "0",
      purchaseRate: String(p.cost ?? 0),
      labourCost: String(p.labourCost ?? 0),
      freightCost: String(p.freightCost ?? 0),
      retailRate: String(p.retail ?? 0),
      wholesaleRate: String(p.wholesale ?? 0),
      specialRate: "0",
      reorderLevel: "0",
      imageUrl: "",
      ratesIncludeGst: !isNonGst && p.ratesIncludeGst === true,
      opening: String(p.opening ?? 0),
      warehouseId: p.warehouseId || "",
      batchNumber: p.batchNumber || "",
      expiry: p.expiry || "",
      returnable: p.returnable === true,
      active: p.active !== false,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const setField = <K extends keyof ReturnType<typeof emptyProductForm>>(
    key: K,
    value: ReturnType<typeof emptyProductForm>[K],
  ) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const landedPreview = useMemo(() => {
    const isNonGst = form.taxability === "non_gst";
    const rawRate = Math.max(0, Number(form.purchaseRate) || 0);
    const gstFrac = isNonGst ? 0 : gstToRate(form.gstPct);
    const exGstBase =
      !isNonGst && form.ratesIncludeGst && gstFrac > 0
        ? rawRate / (1 + gstFrac)
        : rawRate;
    const gstAmtPerCase = isNonGst ? 0 : exGstBase * gstFrac;
    const labour = Math.max(0, Number(form.labourCost) || 0);
    const freight = Math.max(0, Number(form.freightCost) || 0);
    const landedPerCase = Math.round((exGstBase + gstAmtPerCase + labour + freight) * 100) / 100;
    const unitsPerCase = Math.max(1, Number(form.unitsPerCase) || 1);
    const landedPerUnit = Math.round((landedPerCase / unitsPerCase) * 100) / 100;
    const effectiveCost = Math.round((exGstBase + labour + freight) * 100) / 100;
    return {
      isNonGst,
      exGstBase: Math.round(exGstBase * 100) / 100,
      gstAmtPerCase: Math.round(gstAmtPerCase * 100) / 100,
      labour,
      freight,
      landedPerCase,
      landedPerUnit,
      effectiveCost,
      unitsPerCase,
    };
  }, [form.taxability, form.purchaseRate, form.gstPct, form.ratesIncludeGst, form.labourCost, form.freightCost, form.unitsPerCase]);

  const handleSave = () => {
    const name = form.name.trim().toUpperCase();
    if (!name) {
      setFormError("Product name is required");
      return;
    }
    const cat = form.category;
    const isNonGst = form.taxability === "non_gst";
    const hsnClean = form.hsn.trim();
    if (!isNonGst && !hsnLooksValid(hsnClean)) {
      setFormError("Enter the full 8-digit HSN code, e.g. 22021090");
      return;
    }
    const detectedVol = volumeFromName(name);
    const existingVol = editingId != null ? products.find((p) => p.id === editingId)?.volume : undefined;
    const finalVolume = Number(existingVol) > 0 ? Number(existingVol) : (detectedVol || 150);
    const pack = form.unit.trim() && form.unit.trim() !== "pcs" ? form.unit.trim() : detectPack(name);
    const openingQty = Math.max(0, Number(form.opening) || 0);

    const payload: Omit<Product, "id"> = {
      name,
      nameOr: form.nameOr.trim() || undefined,
      sku: form.sku.trim() || undefined,
      brand: form.brand.trim(),
      category: cat,
      taxability: isNonGst ? "non_gst" : "taxable",
      hsn: hsnClean,
      gstRate: isNonGst ? 0 : gstToRate(form.gstPct),
      pack,
      unitsPerCrate: Math.max(1, Number(form.unitsPerCase) || 1),
      cost: Number(form.purchaseRate) || 0,
      labourCost: landedPreview.labour,
      freightCost: landedPreview.freight,
      effectiveCost: landedPreview.effectiveCost,
      landedCostPerCrate: landedPreview.landedPerCase,
      landedCostPerUnit: landedPreview.landedPerUnit,
      retail: Number(form.retailRate) || 0,
      wholesale: Number(form.wholesaleRate) || 0,
      volume: finalVolume,
      expiry: form.expiry.trim() || "",
      opening: openingQty,
      warehouseId: form.warehouseId || undefined,
      batchNumber: form.batchNumber.trim() || undefined,
      returnable: !!form.returnable,
      active: form.active !== false,
      ratesIncludeGst: !isNonGst && !!form.ratesIncludeGst,
    };

    if (editingId != null) {
      // Editing a catalog SKU must not overwrite existing batch stock or expiry dates.
      const { opening: _opening, expiry: _expiry, warehouseId: _wh, batchNumber: _bn, ...edited } = payload;
      updateProductFields(editingId, edited);
    } else {
      addProduct(payload);
    }
    setFormOpen(false);
    setEditingId(null);
  };

  /* ─── New / Edit product form ─── */
  if (formOpen) {
    return (
      <div className="fixed inset-0 z-50 bg-[var(--bg)] flex flex-col">
        <div className="sticky top-0 z-10 bg-[var(--bg)] border-b border-black/5 px-4 sm:px-6 py-3 flex items-center justify-between max-w-none lg:max-w-3xl mx-auto w-full">
          <h1 className="text-lg font-bold text-slate-900">
            {editingId != null ? "Edit product" : "New product"}
          </h1>
          <button
            type="button"
            onClick={() => setFormOpen(false)}
            className="p-2 rounded-full hover:bg-black/5 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 pb-28 max-w-none lg:max-w-3xl mx-auto w-full space-y-4">
          {formError && (
            <div className="text-sm font-medium text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
              {formError}
            </div>
          )}

          <Field label="Name (English)">
            <input
              className="crate-input uppercase"
              value={form.name}
              onChange={(e) => setField("name", e.target.value.toUpperCase())}
              autoFocus
            />
          </Field>

          <Field label="Name (Odia / ଓଡ଼ିଆ) — optional">
            <input
              className="crate-input"
              value={form.nameOr}
              onChange={(e) => setField("nameOr", e.target.value)}
              placeholder="ଉଦାହରଣ: ଆପଲ୍ ଫିଜ୍"
              dir="auto"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="SKU / Code">
              <input
                className="crate-input"
                value={form.sku}
                onChange={(e) => setField("sku", e.target.value)}
              />
            </Field>
            <Field label="Brand">
              <input
                className="crate-input"
                value={form.brand}
                onChange={(e) => setField("brand", e.target.value)}
              />
            </Field>
          </div>

          {/* Tax regime toggle */}
          <div className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Tax Applicability
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {form.taxability === "non_gst"
                    ? "Non-GST / Trading item: 0% GST, prints on separate Cash Memo (NG-...) & excluded from GST returns."
                    : "GST taxable item: HSN & GST slab apply normally."}
                </p>
              </div>
              <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setForm((f) => {
                      const inferred = f.hsn.length === 8 ? gstRateFromHsn(f.hsn) : null;
                      const fallback = inferred ?? CATS[f.category]?.gst ?? 0.18;
                      return {
                        ...f,
                        taxability: "taxable",
                        gstPct: f.gstPct === "0%" ? rateToGstLabel(fallback) : f.gstPct,
                      };
                    });
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                    form.taxability !== "non_gst"
                      ? "bg-[var(--primary)] text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  GST Product
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setForm((f) => ({
                      ...f,
                      taxability: "non_gst",
                      gstPct: "0%",
                      cessPct: "0",
                      ratesIncludeGst: false,
                    }));
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                    form.taxability === "non_gst"
                      ? "bg-amber-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Non-GST Product
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Category">
              <input
                className="crate-input"
                placeholder="Soft drink, Juice, Water..."
                value={form.categoryText}
                onChange={(e) => {
                  const t = e.target.value;
                  setField("categoryText", t);
                  const lower = t.toLowerCase();
                  let key: CategoryKey = "general";
                  if (lower.includes("energy")) key = "energy";
                  else if (lower.includes("soda") || lower.includes("carbon"))
                    key = "vibe";
                  else if (lower.includes("juice") || lower.includes("joos"))
                    key = "joos";
                  else if (lower.includes("water")) key = "water";
                  setField("category", key);
                  if (form.taxability !== "non_gst" && !form.hsn) {
                    setField("hsn", CATS[key]?.hsn || "");
                    setField("gstPct", rateToGstLabel(CATS[key]?.gst));
                  }
                }}
              />
            </Field>
            <Field label={form.taxability === "non_gst" ? "HSN (optional for Non-GST)" : "HSN"}>
              <input
                className="crate-input"
                value={form.hsn}
                inputMode="numeric"
                placeholder={form.taxability === "non_gst" ? "Optional" : "e.g. 22021090"}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, "");
                  setField("hsn", v);
                  if (form.taxability !== "non_gst") {
                    const known = v.length === 8 ? gstRateFromHsn(v) : null;
                    if (known != null) setField("gstPct", rateToGstLabel(known));
                  }
                }}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="GST %">
              {form.taxability === "non_gst" ? (
                <div className="crate-input bg-slate-50 text-slate-500 font-semibold flex items-center justify-between">
                  <span>0% (Non-GST)</span>
                  <span className="text-[11px] uppercase tracking-wide text-amber-700">Tax Free</span>
                </div>
              ) : (
                <>
                  <select
                    className="crate-input"
                    value={form.gstPct}
                    onChange={(e) => setField("gstPct", e.target.value)}
                  >
                    {(GST_OPTIONS.includes(form.gstPct) ? GST_OPTIONS : [...GST_OPTIONS, form.gstPct]).map((g) => (
                      <option key={g} value={g}>
                        {g}
                        {GST_OPTIONS.includes(g) ? "" : " (old rate - please change)"}
                      </option>
                    ))}
                  </select>
                  {(() => {
                    const expect = form.hsn.length >= 6 ? gstRateFromHsn(form.hsn) : null;
                    if (expect == null || rateToGstLabel(expect) === form.gstPct) return null;
                    return (
                      <p className="text-[11px] text-amber-700 mt-1">
                        HSN {form.hsn} is normally {rateToGstLabel(expect)} - check the rate.
                      </p>
                    );
                  })()}
                </>
              )}
            </Field>
            <Field label="Cess %">
              <input
                className="crate-input disabled:bg-slate-50 disabled:text-slate-400"
                inputMode="decimal"
                disabled={form.taxability === "non_gst"}
                value={form.taxability === "non_gst" ? "0" : form.cessPct}
                onChange={(e) => setField("cessPct", e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Unit">
              <input
                className="crate-input"
                value={form.unit}
                onChange={(e) => setField("unit", e.target.value)}
              />
            </Field>
            <Field label="Units per case">
              <input
                className="crate-input"
                inputMode="numeric"
                value={form.unitsPerCase}
                onChange={(e) => setField("unitsPerCase", e.target.value)}
              />
              <div className="flex gap-1.5 mt-1.5">
                {CASE_PACK_SIZES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setField("unitsPerCase", String(n))}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer ${
                      String(n) === String(form.unitsPerCase)
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-700 border-slate-300"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="MRP">
              <input
                className="crate-input"
                inputMode="decimal"
                value={form.mrp}
                onChange={(e) => setField("mrp", e.target.value)}
              />
            </Field>
            <Field label={form.taxability === "non_gst" ? "Purchase rate (₹/case)" : form.ratesIncludeGst ? "Purchase rate incl. GST (₹/case)" : "Purchase rate ex-GST (₹/case)"}>
              <input
                className="crate-input tabular-nums"
                inputMode="decimal"
                value={form.purchaseRate}
                onChange={(e) => setField("purchaseRate", e.target.value)}
              />
            </Field>
          </div>

          {/* Manual Labour & Freight + Auto-Decided Landed Price */}
          <div className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Handling &amp; Auto-Decided Landed Cost
              </span>
              {form.taxability !== "non_gst" && (
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.ratesIncludeGst}
                    onChange={(e) => setField("ratesIncludeGst", e.target.checked)}
                    className="rounded border-slate-300 accent-[var(--primary)]"
                  />
                  Purchase rate includes GST
                </label>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Labour (₹ / case)">
                <input
                  className="crate-input tabular-nums"
                  inputMode="decimal"
                  placeholder="0"
                  value={form.labourCost}
                  onChange={(e) => setField("labourCost", e.target.value)}
                />
              </Field>
              <Field label="Freight (₹ / case)">
                <input
                  className="crate-input tabular-nums"
                  inputMode="decimal"
                  placeholder="0"
                  value={form.freightCost}
                  onChange={(e) => setField("freightCost", e.target.value)}
                />
              </Field>
            </div>
            <div className="rounded-xl bg-emerald-50/70 border border-emerald-200 px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
                  Auto Landed Cost
                </div>
                <div className="flex items-baseline gap-2.5 mt-0.5 tabular-nums">
                  <span className="text-base font-bold text-slate-900">
                    ₹{money(landedPreview.landedPerCase)} <span className="text-xs font-medium text-slate-500">/ case</span>
                  </span>
                  <span className="text-xs font-semibold text-emerald-800">
                    ₹{money(landedPreview.landedPerUnit)} / unit ({landedPreview.unitsPerCase} pcs)
                  </span>
                </div>
                <div className="text-[11px] text-slate-600 mt-0.5 tabular-nums">
                  {landedPreview.isNonGst
                    ? `Base ₹${money(landedPreview.exGstBase)} + Labour ₹${money(landedPreview.labour)} + Freight ₹${money(landedPreview.freight)} · Non-GST`
                    : `Ex-GST ₹${money(landedPreview.exGstBase)} + GST ₹${money(landedPreview.gstAmtPerCase)} + Labour ₹${money(landedPreview.labour)} + Freight ₹${money(landedPreview.freight)}`}
                </div>
              </div>
              {landedPreview.landedPerCase > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const baseForMargin = landedPreview.landedPerCase;
                    const ws = Math.round(baseForMargin * 1.15);
                    const rt = Math.round(baseForMargin * 1.25);
                    setForm((f) => ({
                      ...f,
                      wholesaleRate: String(ws),
                      retailRate: String(rt),
                    }));
                  }}
                  className="shrink-0 px-3 py-1.5 rounded-xl bg-white border border-emerald-300 text-emerald-800 text-xs font-semibold hover:bg-emerald-100/70 cursor-pointer"
                >
                  Apply +15% W/S · +25% Retail
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Retail rate">
              <input
                className="crate-input tabular-nums"
                inputMode="decimal"
                value={form.retailRate}
                onChange={(e) => setField("retailRate", e.target.value)}
              />
            </Field>
            <Field label="Wholesale rate">
              <input
                className="crate-input tabular-nums"
                inputMode="decimal"
                value={form.wholesaleRate}
                onChange={(e) => setField("wholesaleRate", e.target.value)}
              />
            </Field>
          </div>

          {editingId == null && (
            <div className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Initial Opening Stock (Optional · Individual Entry)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Opening cases">
                  <input
                    className="crate-input tabular-nums"
                    inputMode="numeric"
                    placeholder="0"
                    value={form.opening}
                    onChange={(e) => setField("opening", e.target.value)}
                  />
                </Field>
                <Field label="Warehouse">
                  <select
                    className="crate-input"
                    value={form.warehouseId}
                    onChange={(e) => setField("warehouseId", e.target.value)}
                  >
                    <option value="">Default godown</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.code})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Batch / Lot no. (optional)">
                  <input
                    className="crate-input font-mono"
                    placeholder="Auto-generated if blank"
                    value={form.batchNumber}
                    onChange={(e) => setField("batchNumber", e.target.value)}
                  />
                </Field>
                <Field label="Expiry date (optional)">
                  <input
                    type="date"
                    className="crate-input"
                    value={form.expiry}
                    onChange={(e) => setField("expiry", e.target.value)}
                  />
                </Field>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Special rate">
              <input
                className="crate-input"
                inputMode="decimal"
                value={form.specialRate}
                onChange={(e) => setField("specialRate", e.target.value)}
              />
            </Field>
            <Field label="Reorder level">
              <input
                className="crate-input"
                inputMode="numeric"
                value={form.reorderLevel}
                onChange={(e) => setField("reorderLevel", e.target.value)}
              />
            </Field>
          </div>

          <Field label="Image URL">
            <input
              className="crate-input"
              value={form.imageUrl}
              onChange={(e) => setField("imageUrl", e.target.value)}
            />
          </Field>

          <div className="space-y-3 pt-1">
            <ToggleRow
              label="Returnable crates / bottles"
              on={form.returnable}
              onChange={(v) => setField("returnable", v)}
            />
            <ToggleRow
              label="Active"
              on={form.active}
              onChange={(v) => setField("active", v)}
            />
          </div>
        </div>

        <div className="sticky bottom-0 z-10 bg-[var(--bg)] border-t border-black/5 px-4 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={handleSave}
            className="w-full max-w-none lg:max-w-3xl mx-auto block py-3.5 rounded-2xl bg-[var(--primary)] text-white font-semibold text-base shadow-sm cursor-pointer active:scale-[0.99]"
          >
            Save product
          </button>
          {editingId != null && (
            <button
              type="button"
              onClick={() => {
                const target = products.find((x) => x.id === editingId);
                if (!target) return;
                setFormOpen(false);
                setToDelete(target);
              }}
              className="w-full max-w-none lg:max-w-3xl mx-auto mt-2 flex items-center justify-center gap-2 py-3 rounded-2xl border border-red-200 bg-white text-red-600 font-semibold text-sm cursor-pointer active:scale-[0.99]"
            >
              <Trash2 className="w-4 h-4" />
              Delete product
            </button>
          )}
        </div>

        <style>{`
          .crate-input {
            width: 100%;
            padding: 0.65rem 0.9rem;
            border-radius: 0.85rem;
            border: 1px solid rgba(0,0,0,0.08);
            background: #fff;
            font-size: 0.9rem;
            color: #1e293b;
            outline: none;
          }
          .crate-input:focus {
            border-color: rgba(13, 74, 58, 0.45);
            box-shadow: 0 0 0 3px rgba(13, 74, 58, 0.12);
          }
        `}</style>
      </div>
    );
  }

  /* ─── Catalogue list ─── */
  return (
    <div className="hh-view w-full min-w-0 pb-24">
      <div className="w-full min-w-0">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Products
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {products.length} product{products.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setBulkMode((v) => !v);
                setSelectedIds([]);
              }}
              className={`px-3 py-2 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 border cursor-pointer transition ${
                bulkMode
                  ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                  : "bg-white text-slate-700 border-black/10 hover:bg-slate-50"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{bulkMode ? "Exit Bulk Switch" : "Bulk Tax Switch"}</span>
            </button>
            <button
              type="button"
              onClick={openAdd}
              className="size-10 sm:size-11 rounded-full bg-[var(--primary)] text-white flex items-center justify-center shadow-md cursor-pointer active:scale-95"
              aria-label="Add product"
            >
              <Plus className="w-5 h-5" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        <div className="relative mt-3 mb-3">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input enterKeyHint="search"
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search name, brand, SKU"
            className="w-full pl-10 pr-4 py-2.5 rounded-full bg-white border border-black/8 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/25 focus:border-[var(--primary)]/40"
          />
        </div>

        <div className="flex gap-2 mb-3 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Chip
            active={filterCat === "all"}
            onClick={() => setFilterCat("all")}
            label="All"
          />
          <Chip
            active={filterCat === "non_gst"}
            onClick={() => setFilterCat("non_gst")}
            label={`Non-GST (${products.filter((p) => p.taxability === "non_gst").length})`}
          />
          {(Object.keys(CATS) as CategoryKey[]).map((k) => (
            <Chip
              key={k}
              active={filterCat === k}
              onClick={() => setFilterCat(k)}
              label={CATS[k].name.split(/[\/&]/)[0].trim()}
            />
          ))}
        </div>

        {bulkMode && (
          <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-3.5 py-2.5 flex items-center justify-between gap-2 flex-wrap">
            <div className="text-xs font-semibold text-amber-950">
              Tap products below to switch between <span className="font-bold">Non-GST Trading (NG-...)</span> and <span className="font-bold">GST Taxable</span>. ({selectedIds.length} selected)
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const visibleIds = filtered.map((p) => p.id);
                  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
                  setSelectedIds(allSelected ? [] : visibleIds);
                }}
                className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-xs font-semibold text-amber-900 cursor-pointer"
              >
                {filtered.length > 0 && filtered.every((p) => selectedIds.includes(p.id)) ? "Clear visible" : `Select visible (${filtered.length})`}
              </button>
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-black/5 shadow-sm px-6 py-12 text-center">
            <p className="text-base font-bold text-slate-900">No products yet</p>
            <p className="text-sm text-slate-500 mt-1.5 max-w-xs mx-auto">
              Add your beverages with HSN, GST rate and prices.
            </p>
          </div>
        ) : (
          <ul className="hh-list-grid">
            {filtered.map((p) => {
              const isSelected = selectedIds.includes(p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => (bulkMode ? toggleSelectProduct(p.id) : openEdit(p))}
                    style={{ borderLeftWidth: 6, borderLeftColor: sizeTheme(p.volume, p.name).hex }}
                    className={`w-full text-left bg-white rounded-2xl border shadow-sm px-3 sm:px-4 py-3 flex items-center gap-2.5 sm:gap-3 cursor-pointer active:scale-[0.99] transition ${
                      bulkMode && isSelected
                        ? "border-amber-500 ring-2 ring-amber-400/30 bg-amber-50/30"
                        : "border-black/5 hover:border-black/10"
                    }`}
                  >
                    {bulkMode && (
                      <span className="shrink-0 text-amber-700">
                        {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-slate-400" />}
                      </span>
                    )}
                    <PackIcon pack={p.pack} name={p.name} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] sm:text-base font-semibold text-slate-900 leading-snug break-words">
                        {nameFromMap(productNameMap, p, language)}{' '}
                        <SizeChip volume={p.volume} pack={p.pack} name={nameFromMap(productNameMap, p, language)} className="align-middle ml-1" />
                        {p.taxability === "non_gst" && (
                          <span className="inline-block align-middle ml-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            Non-GST
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] sm:text-xs text-slate-500 leading-tight mt-0.5 break-words">
                        {[
                          p.brand,
                          p.sku,
                          CATS[p.category]?.name,
                          p.taxability === "non_gst" ? "0% GST (Trading)" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-slate-800">
                        ₹{money(p.retail || p.wholesale || 0)}
                      </div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                        retail
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {bulkMode && selectedIds.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-xl bg-slate-900 text-white rounded-2xl shadow-xl px-4 py-3 flex items-center justify-between gap-2.5 flex-wrap">
          <span className="text-xs font-bold tabular-nums">{selectedIds.length} selected</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const count = bulkSetProductTaxability(selectedIds, "non_gst");
                notify(`${count} product${count === 1 ? "" : "s"} marked Non-GST / Trading (0% GST).`);
                setSelectedIds([]);
                setBulkMode(false);
              }}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold cursor-pointer"
            >
              Mark Non-GST (0%)
            </button>
            <button
              type="button"
              onClick={() => {
                const count = bulkSetProductTaxability(selectedIds, "taxable");
                notify(`${count} product${count === 1 ? "" : "s"} restored to GST Taxable.`);
                setSelectedIds([]);
                setBulkMode(false);
              }}
              className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-bold cursor-pointer"
            >
              Mark GST Taxable
            </button>
          </div>
        </div>
      )}

      {toDelete && (
        <ConfirmModal
          isOpen
          title="Delete product?"
          message={`Remove ${toDelete.name} from products? Its stock batches are removed too. Old bills that already contain it are not changed.`}
          confirmButtonLabel="Delete"
          variant="danger"
          onConfirm={() => {
            deleteProduct(toDelete.id);
            setToDelete(null);
          }}
          onClose={() => setToDelete(null)}
        />
      )}
    </div>
  );
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return <ToggleSwitch checked={on} onChange={onChange} />;
}

function ToggleRow({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <Toggle on={on} onChange={onChange} />
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
        active
          ? "bg-[var(--primary)] text-white shadow-sm"
          : "bg-white text-slate-600 border border-black/8"
      }`}
    >
      {label}
    </button>
  );
}
