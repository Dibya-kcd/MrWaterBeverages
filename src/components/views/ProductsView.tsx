import React, { useMemo, useState } from "react";
import { SizeChip } from "../common/SizeChip";
import { sizeTheme } from "../../utils/sizeColor";
import { Package, Plus, Search, Trash2, X } from "lucide-react";
import { useLedger } from "../../context/LedgerContext";
import { CategoryKey, Product } from "../../types";
import { CATS } from "../../constants/initialData";
import { CASE_PACK_SIZES, gstRateFromHsn, money, resolveProductGstRate, resolveProductHsn, volumeFromName, detectPack } from "../../utils/billing";
import { ConfirmModal } from "../ui";

// Current GST slabs for beverages (12% and 28% no longer exist). An old product that still carries
// another rate keeps showing it until you pick a valid one.
const GST_OPTIONS = ["0%", "5%", "18%", "40%"];

const emptyProductForm = () => ({
  name: "",
  sku: "",
  brand: "",
  category: "general" as CategoryKey,
  categoryText: "",
  hsn: "",
  gstPct: "18%",
  cessPct: "0",
  unit: "pcs",
  unitsPerCase: "1",
  mrp: "0",
  purchaseRate: "0",
  retailRate: "0",
  wholesaleRate: "0",
  specialRate: "0",
  reorderLevel: "0",
  imageUrl: "",
  ratesIncludeGst: false,
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
    addProduct,
    updateProductFields,
    deleteProduct,
  } = useLedger();

  const [searchTerm, setSearchTerm] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyProductForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Product | null>(null);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return products.filter((p) => {
      if (filterCat !== "all" && p.category !== filterCat) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
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
    setForm({
      name: p.name || "",
      sku: p.sku || "",
      brand: p.brand || "",
      category: p.category || "general",
      categoryText: CATS[p.category]?.name || "",
      hsn: resolveProductHsn(p),
      gstPct: rateToGstLabel(resolveProductGstRate(p)),
      cessPct: "0",
      unit: p.pack || "pcs",
      unitsPerCase: String(p.unitsPerCrate ?? 1),
      mrp: "0",
      purchaseRate: String(p.cost ?? 0),
      retailRate: String(p.retail ?? 0),
      wholesaleRate: String(p.wholesale ?? 0),
      specialRate: "0",
      reorderLevel: "0",
      imageUrl: "",
      ratesIncludeGst: false,
      returnable: false,
      active: true,
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

  const handleSave = () => {
    const name = form.name.trim().toUpperCase();
    if (!name) {
      setFormError("Product name is required");
      return;
    }
    const cat = form.category;
    const hsnClean = form.hsn.trim();
    if (!hsnLooksValid(hsnClean)) {
      setFormError("Enter the full 8-digit HSN code, e.g. 22021090");
      return;
    }
    const detectedVol = volumeFromName(name);
    const existingVol = editingId != null ? products.find((p) => p.id === editingId)?.volume : undefined;
    const finalVolume = Number(existingVol) > 0 ? Number(existingVol) : (detectedVol || 150);
    const pack = form.unit.trim() && form.unit.trim() !== "pcs" ? form.unit.trim() : detectPack(name);

    const payload: Omit<Product, "id"> = {
      name,
      sku: form.sku.trim() || undefined,
      brand: form.brand.trim() || undefined,
      category: cat,
      hsn: hsnClean,
      gstRate: gstToRate(form.gstPct),
      pack,
      unitsPerCrate: Number(form.unitsPerCase) || 1,
      cost: Number(form.purchaseRate) || 0,
      retail: Number(form.retailRate) || 0,
      wholesale: Number(form.wholesaleRate) || 0,
      volume: finalVolume,
      expiry: "",
      opening: 0,
      returnable: !!form.returnable,
      active: form.active !== false,
    };

    if (editingId != null) {
      // The form has no opening-stock or expiry field, so the placeholder values in `payload` must not be written
      // over the real ones (an edit used to reset opening stock to 0 and clear the expiry date).
      const { opening: _opening, expiry: _expiry, ...edited } = payload;
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
      <div className="fixed inset-0 z-50 bg-[#f6f4ef] flex flex-col">
        <div className="sticky top-0 z-10 bg-[#f6f4ef] border-b border-black/5 px-4 sm:px-6 py-3 flex items-center justify-between max-w-none lg:max-w-2xl mx-auto w-full">
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

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 pb-28 max-w-none lg:max-w-2xl mx-auto w-full space-y-4">
          {formError && (
            <div className="text-sm font-medium text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
              {formError}
            </div>
          )}

          <Field label="Name">
            <input
              className="crate-input uppercase"
              value={form.name}
              onChange={(e) => setField("name", e.target.value.toUpperCase())}
              autoFocus
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
                  if (!form.hsn) {
                    setField("hsn", CATS[key]?.hsn || "");
                    setField("gstPct", rateToGstLabel(CATS[key]?.gst));
                  }
                }}
              />
            </Field>
            <Field label="HSN">
              <input
                className="crate-input"
                value={form.hsn}
                inputMode="numeric"
                placeholder="e.g. 22021090"
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, "");
                  setField("hsn", v);
                  // a complete 8-digit HSN with a known slab pre-selects the GST rate (you can still change it)
                  const known = v.length === 8 ? gstRateFromHsn(v) : null;
                  if (known != null) setField("gstPct", rateToGstLabel(known));
                }}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="GST %">
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
            </Field>
            <Field label="Cess %">
              <input
                className="crate-input"
                inputMode="decimal"
                value={form.cessPct}
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
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
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
            <Field label="Purchase rate">
              <input
                className="crate-input"
                inputMode="decimal"
                value={form.purchaseRate}
                onChange={(e) => setField("purchaseRate", e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Retail rate">
              <input
                className="crate-input"
                inputMode="decimal"
                value={form.retailRate}
                onChange={(e) => setField("retailRate", e.target.value)}
              />
            </Field>
            <Field label="Wholesale rate">
              <input
                className="crate-input"
                inputMode="decimal"
                value={form.wholesaleRate}
                onChange={(e) => setField("wholesaleRate", e.target.value)}
              />
            </Field>
          </div>

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

        <div className="sticky bottom-0 bg-[#f6f4ef] border-t border-black/5 px-4 sm:px-6 py-3">
          <button
            type="button"
            onClick={handleSave}
            className="w-full max-w-none lg:max-w-2xl mx-auto block py-3.5 rounded-2xl bg-[#0d4a3a] text-white font-semibold text-base shadow-sm cursor-pointer active:scale-[0.99]"
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
              className="w-full max-w-none lg:max-w-2xl mx-auto mt-2 flex items-center justify-center gap-2 py-3 rounded-2xl border border-red-200 bg-white text-red-600 font-semibold text-sm cursor-pointer active:scale-[0.99]"
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
    <div className="min-h-[100dvh] bg-[#f6f4ef] pb-24">
      <div className="px-4 sm:px-6 pt-2 pb-4 max-w-none lg:max-w-2xl mx-auto">
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
              onClick={openAdd}
              className="size-10 sm:size-11 rounded-full bg-[#0d4a3a] text-white flex items-center justify-center shadow-md cursor-pointer active:scale-95"
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
            className="w-full pl-10 pr-4 py-2.5 rounded-full bg-white border border-black/8 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0d4a3a]/25 focus:border-[#0d4a3a]/40"
          />
        </div>

        <div className="flex gap-2 mb-3 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Chip
            active={filterCat === "all"}
            onClick={() => setFilterCat("all")}
            label="All"
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

        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-black/5 shadow-sm px-6 py-12 text-center">
            <p className="text-base font-bold text-slate-900">No products yet</p>
            <p className="text-sm text-slate-500 mt-1.5 max-w-xs mx-auto">
              Add your beverages with HSN, GST rate and prices.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => openEdit(p)}
                  style={{ borderLeftWidth: 6, borderLeftColor: sizeTheme(p.volume, p.name).hex }}
                  className="w-full text-left bg-white rounded-2xl border border-black/5 shadow-sm px-3 sm:px-4 py-3 flex items-center gap-2.5 sm:gap-3 hover:border-black/10 cursor-pointer active:scale-[0.99] transition"
                >
                  <div className="hidden min-[400px]:flex size-10 rounded-xl bg-[#ebe8e1] text-[#0d4a3a] items-center justify-center shrink-0">
                    <Package className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] sm:text-base font-semibold text-slate-900 leading-snug break-words">
                      {p.name}{' '}
                      <SizeChip volume={p.volume} pack={p.pack} name={p.name} className="align-middle ml-1" />
                    </div>
                    <div className="text-[11px] sm:text-xs text-slate-500 leading-tight mt-0.5 break-words">
                      {[p.brand, p.sku, CATS[p.category]?.name]
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
            ))}
          </ul>
        )}
      </div>

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
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer shrink-0 ${
        on ? "bg-[#0d4a3a]" : "bg-slate-300"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
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
          ? "bg-[#0d4a3a] text-white shadow-sm"
          : "bg-white text-slate-600 border border-black/8"
      }`}
    >
      {label}
    </button>
  );
}
