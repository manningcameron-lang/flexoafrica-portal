#!/bin/bash
# Deploy: Crystal plates flat R0.80/cm2 sell rate (portal). Generated 2026-07-24.
set -e
DIR="/Users/cameron/Documents/Claude/Projects/FA Job Dashboard/portal"
cd "$DIR" || { echo "!! cannot cd to portal dir"; exit 1; }
echo "==> Rehydrating iCloud-evicted repo (this can take a moment)..."
find . -type f -not -path './node_modules/*' -exec cat {} + >/dev/null 2>&1 || true
echo "==> Rehydrate done."
rm -f .git/*.lock 2>/dev/null || true
echo "==> Writing 5 changed files..."
mkdir -p "lib"
cat > 'lib/plate-types.js' <<'FA_CRYSTAL_EOF_0'
// Plate catalog used by the public configurator.
// Three tiers: Crystal (premium HD), Surface Engineered (mid-tier), Standard.
// Brand names intentionally not exposed publicly.

// Public anchor rate for the configurator when there's no logged-in customer
// (or the company doesn't match a MIS customer record). Logged-in customers
// get their company-specific rate via lib/customer-rates.js + MIS settings.
export const PUBLIC_SELL_RATE_PER_CM2 = 0.70;

// Crystal is the premium HD tier. It is priced at a FIXED sell rate per cm²
// that OVERRIDES any customer-negotiated or public anchor rate — Crystal costs
// us more from Polyflex (~R0.45/cm²), so every Crystal plate sells at this
// flat rate regardless of the account. Cam 2026-07-24. See tierRateFor().
export const CRYSTAL_FLAT_RATE_PER_CM2 = 0.80;

// Express (rush) uplift, percent on top of base.
export const RUSH_UPLIFT_PERCENT = 10;

// VAT percent.
export const VAT_PERCENT = 15;

// Plate trim allowance (cm) added to BOTH width and length when pricing.
// Customer enters print dimensions; we plate larger for trim. Example: a
// 20 x 20 cm print prices as 24 x 24 = 576 cm² with TRIM_CM = 4.
export const TRIM_CM = 4;

// ─── Delivery policy (2026-07-14) ────────────────────────────────────────
// Orders UNDER the threshold pay a flat courier fee. Orders at or above it
// ship free. Both figures are EXCLUDING VAT — the fee is added to the
// pre-VAT subtotal and VAT is then charged on the combined amount.
//
// Threshold is measured against the pre-VAT plate subtotal (including any
// express uplift), i.e. the same `afterRush` figure calcOrderTotals uses.
export const FREE_DELIVERY_THRESHOLD = 1500; // R, excl VAT
export const DELIVERY_FLAT_FEE = 350;        // R, excl VAT

// Legacy percent-tier model, retired 2026-07-14 in favour of the flat fee
// above. Kept as an empty list so any remaining caller of
// deliveryFeePercent() degrades to 0 rather than throwing.
export const DELIVERY_TIERS = [];

// Delivery vs collection. Collection = no delivery fee.
export const DELIVERY_METHOD_OPTIONS = [
  { id: "delivery", label: "Delivery", note: "Courier to your address" },
  { id: "collection", label: "Collection", note: "We hold for pickup, no delivery fee" },
];

/**
 * Flat delivery fee for a given pre-VAT subtotal.
 * Under R1500 → R350. R1500 and over → free.
 *
 * @param {number} subtotal pre-VAT subtotal incl. express uplift
 * @returns {number} fee in Rand, excl VAT
 */
export function deliveryFeeFor(subtotal) {
  const s = Number(subtotal);
  if (!Number.isFinite(s) || s <= 0) return 0;
  return s < FREE_DELIVERY_THRESHOLD ? DELIVERY_FLAT_FEE : 0;
}

// Deprecated: the fee is no longer a percentage. Always returns 0.
export function deliveryFeePercent(subtotal) {
  if (!DELIVERY_TIERS.length) return 0;
  for (const tier of DELIVERY_TIERS) {
    if (subtotal <= tier.maxSubtotal) return tier.percent;
  }
  return DELIVERY_TIERS[DELIVERY_TIERS.length - 1].percent;
}

export const TIERS = ["Crystal", "Surface Engineered", "Standard"];

// Thickness conversions: thou to mm. (1 thou = 0.0254 mm)
// Crystal:            45, 67                          (2 fine-detail specs)
// Surface Engineered: 45, 67, 100, 112, 125           (5 mid-tier specs)
// Standard:           45, Gold A, 67, 100, 112, 125, 155, 185, 250 (full range)
export const PLATE_TYPES = [
  // Crystal tier (premium HD photopolymer)
  { id: "C-45",  tier: "Crystal", name: "Crystal 45 thou", thicknessMm: 1.14, useCase: "Fine detail labels, premium flexible packaging" },
  { id: "C-67",  tier: "Crystal", name: "Crystal 67 thou", thicknessMm: 1.70, useCase: "Premium flexible packaging" },

  // Surface Engineered tier (mid-grade)
  { id: "SE-45",  tier: "Surface Engineered", name: "Surface Engineered 45 thou",  thicknessMm: 1.14, useCase: "Cleaner ink lay, fine-line packaging" },
  { id: "SE-67",  tier: "Surface Engineered", name: "Surface Engineered 67 thou",  thicknessMm: 1.70, useCase: "Mid-thickness flexible packaging" },
  { id: "SE-100", tier: "Surface Engineered", name: "Surface Engineered 100 thou", thicknessMm: 2.54, useCase: "Corrugated, board" },
  { id: "SE-112", tier: "Surface Engineered", name: "Surface Engineered 112 thou", thicknessMm: 2.84, useCase: "Heavier flexible, light corrugated" },
  { id: "SE-125", tier: "Surface Engineered", name: "Surface Engineered 125 thou", thicknessMm: 3.18, useCase: "Corrugated, post-print" },

  // Standard tier (digital photopolymer) - full thickness range, plus Gold A
  { id: "S-45",  tier: "Standard", name: "Standard 45 thou",  thicknessMm: 1.14, useCase: "General flexible packaging, labels" },
  { id: "S-GA",  tier: "Standard", name: "Standard Gold A",   thicknessMm: 1.16, useCase: "Premium specialty flexible packaging" },
  { id: "S-67",  tier: "Standard", name: "Standard 67 thou",  thicknessMm: 1.70, useCase: "Mid-thickness flexible packaging" },
  { id: "S-100", tier: "Standard", name: "Standard 100 thou", thicknessMm: 2.54, useCase: "Corrugated, board" },
  { id: "S-112", tier: "Standard", name: "Standard 112 thou", thicknessMm: 2.84, useCase: "Heavier flexible, light corrugated" },
  { id: "S-125", tier: "Standard", name: "Standard 125 thou", thicknessMm: 3.18, useCase: "Corrugated, post-print" },
  { id: "S-155", tier: "Standard", name: "Standard 155 thou", thicknessMm: 3.94, useCase: "Heavy flexible, corrugated" },
  { id: "S-185", tier: "Standard", name: "Standard 185 thou", thicknessMm: 4.70, useCase: "Heavy corrugated" },
  { id: "S-250", tier: "Standard", name: "Standard 250 thou", thicknessMm: 6.35, useCase: "Thick corrugated, specialty" },
];

/** True when a plate type id belongs to the premium Crystal tier. */
export function isCrystalPlateType(plateTypeId) {
  const pt = PLATE_TYPES.find((p) => p.id === plateTypeId);
  return !!pt && pt.tier === "Crystal";
}

/**
 * The effective sell rate (R/cm²) for a plate type, given the customer's base
 * rate. Crystal ALWAYS returns the flat Crystal rate (overrides the account
 * rate). Everything else uses the customer's rate, or the public anchor when
 * no rate is supplied. This is the single source of truth for tier pricing —
 * both the client quote and the server charge resolve the rate through here so
 * they can never disagree.
 *
 * @param {string} plateTypeId
 * @param {number} [baseRate] customer-negotiated R/cm² (optional)
 * @returns {number}
 */
export function tierRateFor(plateTypeId, baseRate) {
  if (isCrystalPlateType(plateTypeId)) return CRYSTAL_FLAT_RATE_PER_CM2;
  const r = Number(baseRate);
  return r > 0 ? r : PUBLIC_SELL_RATE_PER_CM2;
}

export const SUBSTRATE_OPTIONS = [
  { id: "film", label: "Flexible film" },
  { id: "label", label: "Label stock" },
  { id: "corrugated", label: "Corrugated" },
  { id: "paper", label: "Paper or board" },
  { id: "other", label: "Other" },
];

// Ink types — matches what customers use on press.
export const INK_TYPES = [
  { id: "waterbased", label: "Water-based" },
  { id: "solvent", label: "Solvent" },
  { id: "uv", label: "UV" },
];

// Screen ruling options (LPI). Aligned with the MIS rulings actually in use
// (memory 2026-06-29) so portal-placed jobs slot cleanly alongside
// operator-placed ones.
export const SCREEN_RULING_OPTIONS = [
  "75#",
  "90#",
  "110#",
  "126#",
];

// Surface vs reverse print side.
export const PRINT_SIDE_OPTIONS = [
  { id: "surface", label: "Surface print", note: "Ink on front of substrate" },
  { id: "reverse", label: "Reverse print", note: "Ink on back, viewed through substrate" },
];

// Turnaround tiers. Express adds RUSH_UPLIFT_PERCENT to the line price.
// Sub-copy aligned with the rest of the site (home hero, About page,
// configurator copy) — clock starts on file upload + proof approval.
export const TURNAROUND_TIERS = [
  {
    id: "standard",
    label: "Standard",
    sub: "48 to 72 hours from upload + approval",
    upliftPct: 0,
  },
  {
    id: "express",
    label: "Express",
    sub: "24 to 36 hours from upload + approval",
    upliftPct: RUSH_UPLIFT_PERCENT,
  },
];

FA_CRYSTAL_EOF_0
mkdir -p "lib"
cat > 'lib/pricing.js' <<'FA_CRYSTAL_EOF_1'
import {
  RUSH_UPLIFT_PERCENT,
  VAT_PERCENT,
  TRIM_CM,
  FREE_DELIVERY_THRESHOLD,
  deliveryFeeFor,
  tierRateFor,
} from "./plate-types";

/**
 * Per-plate billing dimensions. Polyflex rule: +TRIM_CM (4 cm) to each side
 * of the actual ink bbox.
 *
 * @param {number} widthCm
 * @param {number} heightCm
 * @returns {{ billedWidthCm: number, billedHeightCm: number, areaCm2: number }}
 */
export function billedPlateDimensions(widthCm, heightCm) {
  const w = toNumber(widthCm);
  const h = toNumber(heightCm);
  const billedWidthCm = w > 0 ? w + TRIM_CM : 0;
  const billedHeightCm = h > 0 ? h + TRIM_CM : 0;
  return {
    billedWidthCm: round2(billedWidthCm),
    billedHeightCm: round2(billedHeightCm),
    areaCm2: round2(billedWidthCm * billedHeightCm),
  };
}

// Per-line price (legacy: uses a single width x height for the whole line).
//
// `qty` is the number of plates (one per ticked colour). Delivery fee is
// NOT applied here — it's an order-level percentage of the combined
// subtotal, see calcOrderTotals.
//
// `ratePerCm2` is optional — if omitted, falls back to the public placeholder.
export function calcPrice({
  widthCm,
  heightCm,
  qty,
  isExpress,
  ratePerCm2,
  plateTypeId,
}) {
  const w = toNumber(widthCm);
  const h = toNumber(heightCm);
  const q = toNumber(qty);
  // Crystal overrides the account rate with a flat premium rate; everything
  // else uses the customer rate (or the public anchor). Single source of truth.
  const rate = tierRateFor(plateTypeId, ratePerCm2);

  const { billedWidthCm, billedHeightCm, areaCm2 } = billedPlateDimensions(w, h);
  const subtotal = areaCm2 * rate * q;
  const rushUplift = isExpress
    ? subtotal * (RUSH_UPLIFT_PERCENT / 100)
    : 0;
  const lineTotal = subtotal + rushUplift;

  return {
    areaCm2,
    billedWidthCm,
    billedHeightCm,
    trimCm: TRIM_CM,
    subtotal: round2(subtotal),
    rushUplift: round2(rushUplift),
    lineTotal: round2(lineTotal),
    rushUpliftPercent: RUSH_UPLIFT_PERCENT,
    vatPercent: VAT_PERCENT,
    ratePerCm2: rate,
  };
}

/**
 * Per-plate price using per-separation bounding boxes from the analyser.
 *
 * @param {Array<{ bboxWidthCm: number, bboxHeightCm: number }>} plates
 *        One entry per ticked separation; bbox dims are the actual ink size.
 * @param {boolean} isExpress
 * @param {number} ratePerCm2
 * @returns {{
 *   plates: Array<{ widthCm: number, heightCm: number, areaCm2: number, sell: number }>,
 *   subtotal: number,
 *   rushUplift: number,
 *   lineTotal: number,
 *   ratePerCm2: number,
 *   trimCm: number,
 * }}
 */
export function calcPricePerPlate({ plates = [], isExpress, ratePerCm2, plateTypeId }) {
  // Crystal overrides the account rate with a flat premium rate; everything
  // else uses the customer rate (or the public anchor). Single source of truth.
  const rate = tierRateFor(plateTypeId, ratePerCm2);

  const breakdown = plates.map((p) => {
    const { billedWidthCm, billedHeightCm, areaCm2 } =
      billedPlateDimensions(p.bboxWidthCm, p.bboxHeightCm);
    return {
      widthCm: billedWidthCm,
      heightCm: billedHeightCm,
      areaCm2,
      sell: round2(areaCm2 * rate),
    };
  });
  const subtotal = breakdown.reduce((s, p) => s + p.sell, 0);
  const rushUplift = isExpress ? subtotal * (RUSH_UPLIFT_PERCENT / 100) : 0;
  return {
    plates: breakdown,
    subtotal: round2(subtotal),
    rushUplift: round2(rushUplift),
    lineTotal: round2(subtotal + rushUplift),
    ratePerCm2: rate,
    trimCm: TRIM_CM,
  };
}

// ─── Shared line-item pricing ────────────────────────────────────────────
// Used by BOTH the order form (to display a quote) and /api/orders/create
// (to recompute the authoritative price server-side). Keeping one
// implementation means the customer can never be shown one number and
// charged another. Cam 2026-07-14.

/** Number of plates for a line item = number of ticked separations (min 1). */
export function platesForLineItem(li) {
  const sel = li?.selectedColors || {};
  const ticked = Object.values(sel).filter(Boolean).length;
  return ticked || 1;
}

/**
 * Per-plate dimensions for a line item. Each ticked separation becomes one
 * plate, sized to the analyser bbox when we have one, else the page dims.
 */
export function platesFromLineItem(li) {
  const sel = li?.selectedColors || {};
  const seps = li?.pdfAnalysis?.separations || [];
  const tickedKeys = Object.keys(sel).filter((k) => sel[k]);
  if (tickedKeys.length === 0) {
    return [
      {
        bboxWidthCm: Number(li?.widthCm) || 0,
        bboxHeightCm: Number(li?.heightCm) || 0,
      },
    ];
  }
  return tickedKeys.map((k) => {
    const sep = seps.find((s) => s.key === k);
    if (sep && sep.bboxWidthCm && sep.bboxHeightCm) {
      return { bboxWidthCm: sep.bboxWidthCm, bboxHeightCm: sep.bboxHeightCm };
    }
    return {
      bboxWidthCm: Number(li?.widthCm) || 0,
      bboxHeightCm: Number(li?.heightCm) || 0,
    };
  });
}

/**
 * Price every line item. Prefers precise per-separation bbox pricing when the
 * analyser gave us bboxes; falls back to page dims x qty.
 *
 * @param {Array<object>} lineItems
 * @param {boolean} isExpress
 * @param {number} ratePerCm2
 * @returns {Array<{subtotal:number, rushUplift:number, lineTotal:number}>}
 */
export function priceLineItems({ lineItems = [], isExpress, ratePerCm2 }) {
  return lineItems.map((li) => {
    const plates = platesFromLineItem(li);
    const hasPerPlateDims = plates.some(
      (p) => p.bboxWidthCm > 0 && p.bboxHeightCm > 0
    );
    if (hasPerPlateDims) {
      return calcPricePerPlate({ plates, isExpress, ratePerCm2, plateTypeId: li.plateTypeId });
    }
    return calcPrice({
      widthCm: li.widthCm,
      heightCm: li.heightCm,
      qty: platesForLineItem(li),
      isExpress,
      ratePerCm2,
      plateTypeId: li.plateTypeId,
    });
  });
}

/**
 * Order-level totals: delivery fee applies once (based on tier of summed
 * subtotal), then VAT applies on (subtotal + rush + delivery).
 *
 * @param {Array<{subtotal:number, rushUplift:number}>} linePrices
 * @param {"delivery"|"collection"} deliveryMethod
 */
export function calcOrderTotals(linePrices, deliveryMethod = "delivery") {
  const subtotal = linePrices.reduce((s, p) => s + (p.subtotal || 0), 0);
  const rushUplift = linePrices.reduce((s, p) => s + (p.rushUplift || 0), 0);
  const afterRush = subtotal + rushUplift;

  // Flat courier fee: R350 excl VAT on orders under R1500 excl VAT.
  // Collection is always free. Empty carts (afterRush = 0) are never charged.
  const isCollection = deliveryMethod === "collection";
  const deliveryFee = isCollection ? 0 : deliveryFeeFor(afterRush);

  // How much more they'd need to spend to earn free delivery. Drives the
  // "spend R X more" nudge on the order form.
  const freeDeliveryShortfall =
    !isCollection && deliveryFee > 0
      ? round2(FREE_DELIVERY_THRESHOLD - afterRush)
      : 0;

  const beforeVat = afterRush + deliveryFee;
  const vat = beforeVat * (VAT_PERCENT / 100);
  const total = beforeVat + vat;

  return {
    subtotal: round2(subtotal),
    rushUplift: round2(rushUplift),
    // Retained for backwards compatibility with existing order docs; the
    // fee is a flat amount now, not a percentage.
    deliveryPct: 0,
    deliveryFee: round2(deliveryFee),
    freeDeliveryShortfall,
    freeDeliveryThreshold: FREE_DELIVERY_THRESHOLD,
    beforeVat: round2(beforeVat),
    vat: round2(vat),
    total: round2(total),
    vatPercent: VAT_PERCENT,
    isCollection,
  };
}

export function formatZAR(amount) {
  if (!Number.isFinite(amount)) amount = 0;
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
  }).format(amount);
}

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
FA_CRYSTAL_EOF_1
mkdir -p "app/configurator"
cat > 'app/configurator/page.jsx' <<'FA_CRYSTAL_EOF_2'
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PLATE_TYPES, SUBSTRATE_OPTIONS, TIERS } from "@/lib/plate-types";
import { calcPrice, formatZAR } from "@/lib/pricing";
import { saveQuote } from "@/lib/quotes";

export default function ConfiguratorPage() {
  const [substrate, setSubstrate] = useState("");
  const [plateTier, setPlateTier] = useState("");
  const [plateTypeId, setPlateTypeId] = useState("");
  const [widthCm, setWidthCm] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [qty, setQty] = useState(1);
  const [tier, setTier] = useState("standard"); // turnaround tier: standard | express
  const [showSaveModal, setShowSaveModal] = useState(false);

  const filteredTypes = useMemo(
    () => PLATE_TYPES.filter((t) => !plateTier || t.tier === plateTier),
    [plateTier]
  );
  const selectedType = PLATE_TYPES.find((t) => t.id === plateTypeId);

  const price = useMemo(
    () =>
      calcPrice({
        widthCm,
        heightCm,
        qty,
        isExpress: tier === "express",
        plateTypeId,
      }),
    [widthCm, heightCm, qty, tier, plateTypeId]
  );

  const isComplete =
    !!substrate &&
    !!plateTier &&
    !!plateTypeId &&
    Number(widthCm) > 0 &&
    Number(heightCm) > 0 &&
    Number(qty) > 0;

  function buildSpec() {
    return {
      substrate,
      plateTier,
      plateTypeId,
      plateTypeName: selectedType?.name || null,
      thicknessMm: selectedType?.thicknessMm || null,
      widthCm: Number(widthCm) || 0,
      heightCm: Number(heightCm) || 0,
      qty: Number(qty) || 0,
      tier,
    };
  }

  const orderHref = isComplete
    ? `/signup?spec=${encodeURIComponent(JSON.stringify(buildSpec()))}`
    : "#";

  return (
    <>
      {/* Header */}
      <section className="bg-gradient-to-br from-brand-50 via-white to-brand-100 border-b border-brand-100">
        <div className="max-w-page mx-auto px-4 sm:px-6 py-12 md:py-16">
          <p className="text-accent-500 font-semibold text-sm uppercase tracking-wider mb-3">
            Configurator
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-brand-900 leading-tight max-w-3xl">
            Price your plate. Live ZAR, no signup needed.
          </h1>
          <p className="mt-3 text-brand-700 max-w-2xl">
            Tell us your spec and dimensions. We calculate a price using our
            list rates. Sign up when you are ready to place the order, or save
            the quote for later.
          </p>
        </div>
      </section>

      {/* Body */}
      <section className="border-b border-brand-100">
        <div className="max-w-page mx-auto px-4 sm:px-6 py-10 md:py-12 grid md:grid-cols-3 gap-8 items-start">
          {/* Form */}
          <div className="md:col-span-2 space-y-6">
            <Card title="Substrate">
              <Select
                value={substrate}
                onChange={(e) => setSubstrate(e.target.value)}
              >
                <option value="">What are you printing on?</option>
                {SUBSTRATE_OPTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Card>

            <Card title="Plate tier">
              <div className="grid sm:grid-cols-3 gap-3">
                {TIERS.map((t) => (
                  <TierPickerButton
                    key={t}
                    label={t}
                    sub={
                      t === "Crystal"
                        ? "Premium HD"
                        : t === "Surface Engineered"
                        ? "Cleaner ink lay"
                        : "Standard digital"
                    }
                    active={plateTier === t}
                    onClick={() => {
                      setPlateTier(t);
                      // reset plate type when switching tier
                      setPlateTypeId("");
                    }}
                  />
                ))}
              </div>
            </Card>

            <Card title="Plate thickness" disabled={!plateTier} disabledHint="Choose a tier first">
              <Select
                value={plateTypeId}
                onChange={(e) => setPlateTypeId(e.target.value)}
                disabled={!plateTier}
              >
                <option value="">Select a plate thickness</option>
                {filteredTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.thicknessMm.toFixed(2)} mm)
                  </option>
                ))}
              </Select>
              {selectedType && (
                <p className="mt-2 text-sm text-brand-600">
                  Use case: {selectedType.useCase}
                </p>
              )}
            </Card>

            <Card title="Plate dimensions">
              <div className="grid sm:grid-cols-3 gap-4">
                <NumberField
                  label="Width (cm)"
                  value={widthCm}
                  onChange={setWidthCm}
                  max={203}
                  hint="Max 203 cm"
                />
                <NumberField
                  label="Height (cm)"
                  value={heightCm}
                  onChange={setHeightCm}
                  max={127}
                  hint="Max 127 cm"
                />
                <NumberField
                  label="Quantity"
                  value={qty}
                  onChange={setQty}
                  min={1}
                  hint="Plates"
                />
              </div>
            </Card>

            <Card title="Turnaround">
              <div className="grid sm:grid-cols-2 gap-3">
                <TierToggle
                  label="Standard"
                  sub="48 to 72 hours from upload + approval"
                  active={tier === "standard"}
                  onClick={() => setTier("standard")}
                />
                <TierToggle
                  label="Express"
                  sub="24 to 36 hours after upload + approval, +25%"
                  active={tier === "express"}
                  onClick={() => setTier("express")}
                  accent
                />
              </div>
            </Card>
          </div>

          {/* Sticky price card */}
          <aside className="md:sticky md:top-20 space-y-4">
            <PriceCard
              price={price}
              tier={tier}
              isComplete={isComplete}
              orderHref={orderHref}
              onSave={() => setShowSaveModal(true)}
            />
            <p className="text-xs text-brand-500 text-center px-4">
              Prices are estimates based on our standard list rates and your
              dimensions. Final price confirmed at order placement.
            </p>
          </aside>
        </div>
      </section>

      {showSaveModal && (
        <SaveQuoteModal
          spec={buildSpec()}
          price={price}
          onClose={() => setShowSaveModal(false)}
        />
      )}
    </>
  );
}

// ----- presentational components -----

function Card({ title, children, disabled, disabledHint }) {
  return (
    <div className="bg-white rounded-xl border border-brand-100 p-5 shadow-sm">
      <h3 className="font-semibold text-brand-900 text-sm uppercase tracking-wider">
        {title}
      </h3>
      <div className="mt-3">{children}</div>
      {disabled && disabledHint && (
        <p className="mt-2 text-xs text-brand-500">{disabledHint}</p>
      )}
    </div>
  );
}

function Select({ children, ...rest }) {
  return (
    <select
      {...rest}
      className="block w-full rounded-md border border-brand-200 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
    >
      {children}
    </select>
  );
}

function NumberField({ label, value, onChange, min = 0, max, hint }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-brand-800">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step="0.1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-md border border-brand-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      {hint && (
        <span className="text-xs text-brand-500 mt-1 block">{hint}</span>
      )}
    </label>
  );
}

function TierPickerButton({ label, sub, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-md border px-4 py-3 text-left transition " +
        (active
          ? "border-brand-700 bg-brand-700 text-white"
          : "border-brand-200 bg-white text-brand-800 hover:bg-brand-50")
      }
    >
      <div className="font-semibold">{label}</div>
      <div className={"text-xs mt-0.5 " + (active ? "text-white/85" : "text-brand-600")}>
        {sub}
      </div>
    </button>
  );
}

function TierToggle({ label, sub, active, onClick, accent = false }) {
  const activeStyle = accent
    ? "border-accent-500 bg-accent-500 text-white"
    : "border-brand-700 bg-brand-700 text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-md border px-4 py-3 text-left transition " +
        (active
          ? activeStyle
          : "border-brand-200 bg-white text-brand-800 hover:bg-brand-50")
      }
    >
      <div className="font-semibold">{label}</div>
      <div
        className={
          "text-xs mt-0.5 " +
          (active ? "text-white/85" : "text-brand-600")
        }
      >
        {sub}
      </div>
    </button>
  );
}

function PriceCard({ price, tier, isComplete, orderHref, onSave }) {
  return (
    <div className="bg-brand-900 text-white rounded-xl shadow-lg overflow-hidden">
      <div className="p-5">
        <div className="text-xs uppercase tracking-wider text-brand-300">
          Live quote
        </div>
        <div className="mt-1 text-3xl font-bold">
          {formatZAR(price.total)}
        </div>
        <div className="mt-1 text-xs text-brand-300">
          incl. {price.vatPercent}% VAT
        </div>
      </div>

      <div className="bg-brand-800 px-5 py-4 space-y-2 text-sm">
        <Row
          label={`Plate area (${price.areaCm2} cm²)`}
          value={formatZAR(price.subtotal)}
        />
        {tier === "express" && price.rushUplift > 0 && (
          <Row
            label={`Express +${price.rushUpliftPercent}%`}
            value={formatZAR(price.rushUplift)}
            highlight
          />
        )}
        <Row label={`VAT ${price.vatPercent}%`} value={formatZAR(price.vat)} />
      </div>

      <div className="p-5 bg-brand-900 space-y-2">
        {isComplete ? (
          <Link
            href={orderHref}
            className="block w-full text-center px-4 py-3 bg-accent-500 hover:bg-accent-600 text-white font-medium rounded-md"
          >
            Sign up to order
          </Link>
        ) : (
          <button
            disabled
            className="block w-full text-center px-4 py-3 bg-brand-700 text-brand-300 cursor-not-allowed rounded-md"
          >
            Complete the form to order
          </button>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={!isComplete}
          className="block w-full text-center px-4 py-3 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white font-medium rounded-md"
        >
          Save / email this quote
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, highlight }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className={highlight ? "text-accent-400" : "text-brand-200"}>
        {label}
      </span>
      <span className={"font-medium " + (highlight ? "text-accent-300" : "text-white")}>
        {value}
      </span>
    </div>
  );
}

function SaveQuoteModal({ spec, price, onClose }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState("idle"); // idle | submitting | success | error
  const [errorMsg, setErrorMsg] = useState(null);

  async function handleSave(e) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg(null);
    try {
      await saveQuote({ email, name, spec, price });
      setStatus("success");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setErrorMsg(err?.message || "Could not save quote.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center px-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        {status === "success" ? (
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-50 text-green-600 text-2xl mb-3">
              v
            </div>
            <h3 className="text-xl font-bold text-brand-900">Quote saved</h3>
            <p className="mt-2 text-brand-700">
              We have your quote. We will email a copy to {email} and our team
              will follow up within one business day.
            </p>
            <button
              onClick={onClose}
              className="mt-6 px-4 py-2 bg-brand-700 hover:bg-brand-800 text-white font-medium rounded-md"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <h3 className="text-xl font-bold text-brand-900">Save this quote</h3>
            <p className="text-sm text-brand-700">
              Pop in your email and we will save the spec plus the live price
              for you, and follow up within one business day.
            </p>
            <label className="block">
              <span className="text-sm font-medium text-brand-800">Your name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full rounded-md border border-brand-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-brand-800">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-md border border-brand-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                required
              />
            </label>
            {status === "error" && (
              <div className="rounded-md bg-red-50 border border-red-200 text-red-800 px-3 py-2 text-sm">
                {errorMsg}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-brand-100 hover:bg-brand-200 text-brand-800 font-medium rounded-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={status === "submitting"}
                className="flex-1 px-4 py-2 bg-brand-700 hover:bg-brand-800 disabled:opacity-60 text-white font-medium rounded-md"
              >
                {status === "submitting" ? "Saving..." : "Save quote"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
FA_CRYSTAL_EOF_2
mkdir -p "app/order/new"
cat > 'app/order/new/page.jsx' <<'FA_CRYSTAL_EOF_3'
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import {
  PLATE_TYPES,
  TIERS,
  SUBSTRATE_OPTIONS,
  INK_TYPES,
  SCREEN_RULING_OPTIONS,
  PRINT_SIDE_OPTIONS,
  TURNAROUND_TIERS,
  DELIVERY_METHOD_OPTIONS,
  VAT_PERCENT,
  PUBLIC_SELL_RATE_PER_CM2,
} from "@/lib/plate-types";
import {
  calcPrice,
  calcPricePerPlate,
  calcOrderTotals,
  formatZAR,
} from "@/lib/pricing";
import { createOrderFromPortal } from "@/lib/orders";
import { analyzePdfClient } from "@/lib/pdf-analyzer";

function newLineItem() {
  return {
    plateTier: "",
    plateTypeId: "",
    substrate: "",
    inkType: "",
    screenRuling: "",
    printSide: "",
    cylinderSize: "",
    widthCm: "",
    heightCm: "",
    qty: 1,
    specialInstructions: "",
    // Customer's own name / reference for this job (free text, compulsory).
    description: "",
    // Optional customer item code / their internal job number.
    itemCode: "",
    pdfFile: null,
    pdfAnalysis: null,
    // Map of separation key -> boolean. Populated when a PDF is dropped;
    // every detected separation defaults to true. The customer can untick
    // any they don't need. Plate count = number of true entries.
    selectedColors: {},
  };
}

export default function NewOrderPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  // ----- header -----
  const [poNumber, setPoNumber] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [requiredByDate, setRequiredByDate] = useState("");
  const [turnaroundTier, setTurnaroundTier] = useState("standard");
  const [deliveryMethod, setDeliveryMethod] = useState("delivery");

  // ----- line items -----
  const [lineItems, setLineItems] = useState([newLineItem()]);

  // ----- purchase order (PO-approved companies only) -----
  const [poFile, setPoFile] = useState(null);

  // ----- account terms (resolved server-side) -----
  // Whether this customer's company is approved to order on a purchase order.
  // Resolved by /api/account/terms, which reads the MIS customer register with
  // admin credentials. We deliberately do NOT read settings/customers from the
  // client — it holds every customer's sell rate.
  //
  // `poApproved` here only drives the UI. The authoritative check runs again
  // server-side when the order is created, so a tampered client can't skip
  // payment. Cam 2026-07-14.
  const [terms, setTerms] = useState({ loading: true, poApproved: false });
  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/account/terms", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        setTerms({
          loading: false,
          poApproved: !!body.poApproved,
          companyDeliveryAddress: body.companyDeliveryAddress || "",
          ratePerCm2: Number(body.ratePerCm2) > 0 ? Number(body.ratePerCm2) : null,
        });
      } catch {
        // Fail CLOSED: if we can't confirm account terms, treat the customer
        // as pay-by-card rather than letting an order through unpaid.
        if (!cancelled)
          setTerms({ loading: false, poApproved: false, ratePerCm2: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  // ----- submit state -----
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState("");
  const [error, setError] = useState(null);

  // Auth gate
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (profile && profile.role !== "customer")
      router.replace("/login?error=role");
    else if (profile && profile.status !== "active")
      router.replace(
        profile.status === "pending" ? "/awaiting-approval" : "/suspended"
      );
  }, [user, profile, loading, router]);

  // Auto-populate delivery address. Prefers the customer's saved default
  // (Profile → Default delivery address), then the company address on the MIS
  // record, then falls back to a stub built from what we know about them.
  useEffect(() => {
    if (!profile || deliveryAddress) return;
    const saved = (profile.deliveryAddress || "").trim();
    if (saved) {
      setDeliveryAddress(saved);
      return;
    }
    const fromCompany = (terms.companyDeliveryAddress || "").trim();
    if (fromCompany) {
      setDeliveryAddress(fromCompany);
      return;
    }
    const lines = [];
    if (profile.company) lines.push(profile.company);
    if (profile.contactName) lines.push(`Attn: ${profile.contactName}`);
    if (profile.phone) lines.push(profile.phone);
    if (profile.email) lines.push(profile.email);
    lines.push("", "Delivery address:");
    setDeliveryAddress(lines.join("\n"));
  }, [profile, terms.companyDeliveryAddress]); // eslint-disable-line

  // ----- customer rate -----
  // Comes from /api/account/terms (see the `terms` fetch above), which returns
  // only THIS customer's rate.
  //
  // It used to subscribe to settings/customers directly from the browser — but
  // that document holds every customer's sell rate, repeat rate, VAT number and
  // addresses. Any signed-in customer could read the entire rate card out of
  // devtools. Firestore rules now restrict /settings to staff. Cam 2026-07-14.
  //
  // This rate is for DISPLAY ONLY. The server re-resolves it and reprices the
  // order at /api/orders/create; whatever we show here is a quote.
  const ratePerCm2 = terms.ratePerCm2 || PUBLIC_SELL_RATE_PER_CM2;

  // ----- pricing -----
  // Plate quantity = number of ticked separations (one plate per colour).
  // Falls back to 1 if nothing ticked yet so the form still renders something.
  function platesForLineItem(li) {
    const sel = li.selectedColors || {};
    const ticked = Object.values(sel).filter(Boolean).length;
    return ticked || 1;
  }

  // Build the per-plate input for a line item from its ticked separations.
  // Each ticked separation produces one plate, sized to the analyser bbox if
  // we have one for that key, otherwise falling back to the page dimensions.
  function platesFromLineItem(li) {
    const sel = li.selectedColors || {};
    const seps = li.pdfAnalysis?.separations || [];
    const tickedKeys = Object.keys(sel).filter((k) => sel[k]);
    if (tickedKeys.length === 0) {
      // Fallback when no colours ticked yet — show one plate using page dims.
      return [
        {
          bboxWidthCm: Number(li.widthCm) || 0,
          bboxHeightCm: Number(li.heightCm) || 0,
        },
      ];
    }
    return tickedKeys.map((k) => {
      const sep = seps.find((s) => s.key === k);
      if (sep && sep.bboxWidthCm && sep.bboxHeightCm) {
        return {
          bboxWidthCm: sep.bboxWidthCm,
          bboxHeightCm: sep.bboxHeightCm,
        };
      }
      // No precise bbox — use page dims as fallback.
      return {
        bboxWidthCm: Number(li.widthCm) || 0,
        bboxHeightCm: Number(li.heightCm) || 0,
      };
    });
  }

  const tierInfo = TURNAROUND_TIERS.find((t) => t.id === turnaroundTier) || TURNAROUND_TIERS[0];
  const upliftPct = tierInfo.upliftPct || 0;
  const isExpress = upliftPct > 0;

  const lineItemPrices = useMemo(
    () =>
      lineItems.map((li) => {
        // Per-plate pricing when we have separation data with bboxes (precise
        // mode from the cloud analyser). Otherwise fall back to page-level
        // dimensions x qty (the old approximate path).
        const plates = platesFromLineItem(li);
        const hasPerPlateDims = plates.some(
          (p) => p.bboxWidthCm > 0 && p.bboxHeightCm > 0,
        );
        if (hasPerPlateDims) {
          return calcPricePerPlate({
            plates,
            isExpress,
            ratePerCm2,
            plateTypeId: li.plateTypeId,
          });
        }
        return calcPrice({
          widthCm: li.widthCm,
          heightCm: li.heightCm,
          qty: platesForLineItem(li),
          isExpress,
          ratePerCm2,
          plateTypeId: li.plateTypeId,
        });
      }),
    [lineItems, isExpress, ratePerCm2]
  );

  const orderTotals = useMemo(
    () => calcOrderTotals(lineItemPrices, deliveryMethod),
    [lineItemPrices, deliveryMethod]
  );
  const {
    subtotal,
    rushUplift: expressUplift,
    deliveryFee: deliveryFeeTotal,
    deliveryPct: deliveryFeePctApplied,
    freeDeliveryShortfall,
    freeDeliveryThreshold,
    vat,
    total,
    isCollection,
  } = orderTotals;

  // Pre-VAT subtotal incl. express uplift — the figure the R1500 free-delivery
  // threshold is measured against.
  const orderSubtotalExVat = subtotal + expressUplift;

  // Accepts either:
  //   updateLineItem(idx, "fieldName", value)   — single field
  //   updateLineItem(idx, { a: 1, b: 2 })       — batch update (object patch)
  function updateLineItem(idx, fieldOrPatch, value) {
    setLineItems((items) =>
      items.map((li, i) => {
        if (i !== idx) return li;
        if (fieldOrPatch && typeof fieldOrPatch === "object") {
          return { ...li, ...fieldOrPatch };
        }
        return { ...li, [fieldOrPatch]: value };
      })
    );
  }
  function addLineItem() {
    setLineItems((items) => [...items, newLineItem()]);
  }
  function removeLineItem(idx) {
    setLineItems((items) => (items.length === 1 ? items : items.filter((_, i) => i !== idx)));
  }

  function validate() {
    // PO-approved companies order on account, so finance needs both the PO
    // number and the PO document up front. Cam 2026-07-14.
    if (terms.poApproved) {
      if (!poNumber.trim())
        return "Enter your purchase order number.";
      if (!poFile)
        return "Upload your purchase order document.";
    }
    if (!deliveryAddress.trim()) return "Add a delivery address.";
    if (!requiredByDate) return "Pick a required-by date.";
    for (let i = 0; i < lineItems.length; i++) {
      const li = lineItems[i];
      const idx = i + 1;
      if (!li.description || !li.description.trim())
        return `Plate ${idx}: add a job description.`;
      if (!li.substrate) return `Plate ${idx}: choose a substrate.`;
      if (!li.plateTier) return `Plate ${idx}: choose a tier.`;
      if (!li.plateTypeId) return `Plate ${idx}: choose a thickness.`;
      if (!li.inkType) return `Plate ${idx}: choose an ink type.`;
      if (!li.printSide) return `Plate ${idx}: choose surface or reverse print.`;
      if (!li.screenRuling) return `Plate ${idx}: pick a screen ruling.`;
      if (!li.cylinderSize || !li.cylinderSize.trim())
        return `Plate ${idx}: enter the cylinder / tooth size.`;
      if (!(Number(li.widthCm) > 0)) return `Plate ${idx}: enter width.`;
      if (!(Number(li.heightCm) > 0)) return `Plate ${idx}: enter height.`;
      if (!li.pdfFile) return `Plate ${idx}: upload your artwork PDF.`;
    }
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSubmitting(true);
    try {
      setSubmitProgress("Uploading and placing order...");
      // NOTE: we deliberately do NOT send the price or paymentTerms. The
      // server recomputes the total from the customer's rate in the MIS
      // register and derives the payment route from settings/customers. The
      // figures shown on this page are a quote, not the source of truth.
      const result = await createOrderFromPortal({
        user,
        profile: { ...profile, uid: user.uid },
        header: {
          poNumber,
          deliveryAddress,
          requiredByDate,
          tier: turnaroundTier,
          deliveryMethod,
        },
        poFile,
        lineItems,
      });
      setSubmitProgress("Done. Redirecting...");
      router.push(`/order/${result.orderId}/success`);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Could not place order. Please try again.");
      setSubmitting(false);
      setSubmitProgress("");
    }
  }

  if (loading || !profile || profile.status !== "active") {
    return (
      <div className="max-w-page mx-auto px-4 sm:px-6 py-20 text-center text-ink-muted">
        Loading...
      </div>
    );
  }

  return (
    <>
      {/* Breadcrumb / page header */}
      <section className="border-b border-ink/10 bg-white">
        <div className="max-w-page mx-auto px-4 sm:px-6 py-4 text-sm text-ink-muted flex items-center gap-2">
          <Link href="/dashboard" className="hover:text-ink">Dashboard</Link>
          <span className="text-ink/30">/</span>
          <span className="text-ink font-medium">Configure your plate</span>
        </div>
      </section>

      <form
        onSubmit={handleSubmit}
        className="max-w-page mx-auto px-4 sm:px-6 py-8 grid gap-8 lg:grid-cols-[260px_1fr] items-start"
      >
        {/* ----- LEFT SIDEBAR ----- */}
        <aside className="space-y-6 lg:sticky lg:top-20">
          {/* Reference image — flexo press photo, contextual hint of what
              the customer's plates run on. Easy to swap to a different
              asset by changing the src path. */}
          <div className="rounded-xl overflow-hidden border border-ink/10 bg-white">
            <div className="aspect-square bg-brand-50">
              <img
                src="/hero.jpg"
                alt="Flexographic press with photopolymer plates mounted"
                className="block w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Trust badges */}
          <div className="grid grid-cols-2 gap-3 text-center text-[11px]">
            <TrustBadge icon="handshake" title="Confidentiality" sub="on all your saved data" />
            <TrustBadge icon="shield" title="Secure SSL" sub="encrypted transactions" />
            <TrustBadge icon="truck" title="48 to 72 hours" sub="standard turnaround" />
            <TrustBadge icon="qa" title="QA checked" sub="every plate before dispatch" />
          </div>

          {/* Fast quote calculator */}
          <FastQuote
            total={total}
            subtotal={subtotal}
            expressUplift={expressUplift}
            upliftPct={upliftPct}
            deliveryFee={deliveryFeeTotal}
            vat={vat}
            lineItemCount={lineItems.length}
            tierLabel={tierInfo.label}
          />

          {/* Contact for help */}
          <div className="rounded-xl border border-ink/10 bg-white p-4 text-sm">
            <div className="text-xs uppercase tracking-wider text-ink-muted font-semibold mb-2">
              Need help?
            </div>
            <a href="tel:+27726652041" className="block text-ink font-semibold hover:text-accent-500">
              +27 72 665 2041
            </a>
            <a
              href="https://wa.me/27645867535"
              target="_blank"
              rel="noopener noreferrer"
              className="block mt-2 text-brand-green hover:underline text-xs font-semibold"
            >
              WhatsApp: +27 64 586 7535
            </a>
          </div>
        </aside>

        {/* ----- RIGHT: STEPS ----- */}
        <div className="space-y-8">
          {/* Error banner */}
          {error && (
            <div className="rounded-md border border-accent-500/40 bg-accent-50 px-4 py-3 text-sm text-accent-700">
              {error}
            </div>
          )}

          {/* STEP 1: Configure plate */}
          <div>
            <StepHeader number="1" title="Select your print specifications" />

            {lineItems.map((li, idx) => (
              <PlateCard
                key={idx}
                idx={idx}
                lineItem={li}
                price={lineItemPrices[idx]}
                canRemove={lineItems.length > 1}
                onChange={(fieldOrPatch, value) => updateLineItem(idx, fieldOrPatch, value)}
                onRemove={() => removeLineItem(idx)}
              />
            ))}
          </div>

          {/* STEP 2: Order details */}
          <div>
            <StepHeader number="2" title="Order details" />

            <div className="bg-white rounded-xl border border-ink/10 p-6 space-y-5 shadow-card">
              {/* Turnaround tier */}
              <div>
                <div className="text-sm font-semibold text-ink mb-3">
                  Turnaround <span className="text-accent-500">*</span>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {TURNAROUND_TIERS.map((t) => (
                    <TurnaroundCard
                      key={t.id}
                      tier={t}
                      selected={turnaroundTier === t.id}
                      onClick={() => setTurnaroundTier(t.id)}
                    />
                  ))}
                </div>
              </div>

              {/* Delivery vs Collection */}
              <div>
                <div className="text-sm font-semibold text-ink mb-3">
                  Delivery method <span className="text-accent-500">*</span>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {DELIVERY_METHOD_OPTIONS.map((opt) => (
                    <DeliveryMethodCard
                      key={opt.id}
                      option={opt}
                      selected={deliveryMethod === opt.id}
                      onClick={() => setDeliveryMethod(opt.id)}
                    />
                  ))}
                </div>
                {deliveryMethod === "delivery" && deliveryFeeTotal > 0 && (
                  <p className="mt-2 text-xs text-ink-muted">
                    Delivery fee:{" "}
                    <span className="font-semibold text-ink">
                      {formatZAR(deliveryFeeTotal)}
                    </span>{" "}
                    on orders under {formatZAR(freeDeliveryThreshold)} excl. VAT.
                    {freeDeliveryShortfall > 0 && (
                      <>
                        {" "}
                        Add{" "}
                        <span className="font-semibold text-ink">
                          {formatZAR(freeDeliveryShortfall)}
                        </span>{" "}
                        more to qualify for free delivery.
                      </>
                    )}
                  </p>
                )}
                {deliveryMethod === "delivery" &&
                  deliveryFeeTotal === 0 &&
                  orderSubtotalExVat > 0 && (
                    <p className="mt-2 text-xs text-green-700">
                      Free delivery — this order is over{" "}
                      {formatZAR(freeDeliveryThreshold)} excl. VAT.
                    </p>
                  )}
                {isCollection && (
                  <p className="mt-2 text-xs text-green-700">
                    Collection selected. We'll let you know when your plates
                    are ready to collect.
                  </p>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <Field
                  label={
                    terms.poApproved
                      ? "Purchase order number"
                      : "PO number (optional)"
                  }
                  required={terms.poApproved}
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  placeholder="e.g. PO-2026-1234"
                />
                <DateField
                  label="Required by"
                  required
                  value={requiredByDate}
                  onChange={(e) => setRequiredByDate(e.target.value)}
                />
              </div>

              {/* ── Account customers: PO document upload ──────────────────
                  Companies flagged "Approved to order on PO" in MIS order on
                  account. They must attach the actual purchase order, which
                  finance needs to raise the invoice against. Everyone else
                  pays by card on the success page and never sees this.
                  Cam 2026-07-14. */}
              {terms.poApproved && (
                <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-brand-600 text-lg flex-shrink-0">
                      🧾
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-brand-900 text-sm">
                        Your company orders on account
                      </p>
                      <p className="text-xs text-brand-700 mt-0.5">
                        No card payment needed. Attach your purchase order and
                        we&apos;ll invoice against it.
                      </p>

                      <label className="block mt-3">
                        <span className="text-xs font-semibold text-ink uppercase tracking-wider">
                          Purchase order document{" "}
                          <span className="text-accent-500">*</span>
                        </span>
                        <input
                          type="file"
                          accept=".pdf,image/png,image/jpeg"
                          onChange={(e) =>
                            setPoFile(e.target.files?.[0] || null)
                          }
                          className="mt-1 block w-full text-sm text-ink-muted file:mr-3 file:rounded-md file:border-0 file:bg-brand-700 file:px-4 file:py-2 file:text-white file:font-medium hover:file:bg-brand-800"
                        />
                        <span className="mt-1 block text-[11px] text-ink-muted">
                          PDF, PNG or JPG. A photo or scan of a signed PO is
                          fine.
                        </span>
                      </label>

                      {poFile && (
                        <p className="mt-2 text-xs text-green-700 font-medium">
                          ✓ Attached: {poFile.name}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              <label className="block">
                <span className="text-sm font-medium text-ink">
                  Delivery address <span className="text-accent-500">*</span>
                </span>
                <p className="text-xs text-ink-muted mt-1 mb-1">
                  Pre-filled from your profile. Add the actual street address below.
                </p>
                <textarea
                  required
                  rows={5}
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="block w-full rounded-md border border-ink/20 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 font-mono text-sm"
                  placeholder="Company, street, city, country, contact name, phone"
                />
              </label>
            </div>
          </div>

          {/* STEP 3: Submit */}
          <div>
            <StepHeader number="3" title="Place your order" />

            <div className="bg-ink text-white rounded-xl p-6 shadow-card">
              <div className="flex flex-col sm:flex-row sm:items-end gap-4 justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wider text-white/70">Total incl. VAT</div>
                  <div className="text-4xl font-bold mt-1">{formatZAR(total)}</div>
                  <div className="text-xs text-white/60 mt-1">
                    {tierInfo.label} turnaround ·{" "}
                    {isCollection
                      ? "collection"
                      : deliveryFeeTotal > 0
                      ? `incl. ${formatZAR(deliveryFeeTotal)} delivery`
                      : "free delivery"}{" "}
                    · {VAT_PERCENT}% VAT
                  </div>
                  {upliftPct > 0 && (
                    <div className="mt-2 text-xs text-accent-300">
                      Includes Express uplift +{upliftPct}% ({formatZAR(expressUplift)})
                    </div>
                  )}
                  {deliveryFeeTotal > 0 && (
                    <div className="mt-1 text-xs text-white/60">
                      Delivery fee: {formatZAR(deliveryFeeTotal)}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 sm:items-end">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-6 py-3 bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white font-semibold rounded-md whitespace-nowrap"
                  >
                    {submitting ? "Placing order..." : "Confirm and place order"}
                  </button>
                  {submitProgress && (
                    <div className="text-xs text-white/70">{submitProgress}</div>
                  )}
                </div>
              </div>
              <p className="mt-4 text-xs text-white/60 max-w-xl">
                Submitting creates a job per plate in our system. Our team prepares your artwork
                and sends a proof for approval before plates are made. Track progress in your dashboard.
              </p>
              <p className="mt-3 text-xs text-white/50 max-w-xl">
                Placing an order means you accept our{" "}
                <Link href="/terms" className="underline hover:text-white" target="_blank">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="underline hover:text-white" target="_blank">
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      </form>
    </>
  );
}

// ─── Step header ──────────────────────────────────────────────────────────

function StepHeader({ number, title }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent-500 text-white font-bold text-lg">
        {number}
      </div>
      <h2 className="text-2xl font-bold text-ink tracking-tight">{title}</h2>
    </div>
  );
}

// ─── One plate card (the meat) ────────────────────────────────────────────

function PlateCard({ idx, lineItem, price, canRemove, onChange, onRemove }) {
  const filteredTypes = PLATE_TYPES.filter(
    (t) => !lineItem.plateTier || t.tier === lineItem.plateTier
  );
  const selectedType = PLATE_TYPES.find((t) => t.id === lineItem.plateTypeId);

  // Drop a PDF: kick off analysis, auto-fill width / length, default-tick
  // every detected separation. Batched so all updates land in one state change.
  async function handlePdfDrop(file) {
    if (!file) {
      onChange({
        pdfFile: null,
        pdfAnalysis: null,
        selectedColors: {},
      });
      return;
    }
    onChange({ pdfFile: file, pdfAnalysis: { loading: true } });
    try {
      const result = await analyzePdfClient(file);
      const patch = { pdfAnalysis: result };
      if (result.ok) {
        if (!lineItem.widthCm || lineItem.widthCm === "") {
          patch.widthCm = String(result.widthCm);
        }
        if (!lineItem.heightCm || lineItem.heightCm === "") {
          patch.heightCm = String(result.heightCm);
        }
        // Default-tick every detected separation.
        const sel = {};
        for (const s of result.separations || []) {
          sel[s.key] = true;
        }
        patch.selectedColors = sel;
      }
      onChange(patch);
    } catch (err) {
      onChange({
        pdfAnalysis: {
          ok: false,
          error: err?.message || "Could not analyse PDF",
          warnings: [],
        },
      });
    }
  }

  function toggleColor(key) {
    const cur = lineItem.selectedColors || {};
    onChange({
      selectedColors: { ...cur, [key]: !cur[key] },
    });
  }

  // Number of plates this line item will produce = number of ticked colours,
  // or 1 if no PDF / no separations yet.
  const selectedColorCount = Object.values(
    lineItem.selectedColors || {}
  ).filter(Boolean).length;
  const platesFromColors = selectedColorCount || 1;

  return (
    <div className="bg-white rounded-xl border border-ink/10 shadow-card mb-4">
      {/* Header: customer's job description + item code. Both sit alongside
          the FA job ticket number once we receive the order. */}
      <div className="px-6 py-4 border-b border-ink/10 space-y-3">
        <label className="block">
          <span className="text-xs font-semibold text-ink uppercase tracking-wider">
            Job description <span className="text-accent-500">*</span>
          </span>
          <input
            type="text"
            value={lineItem.description}
            onChange={(e) => onChange("description", e.target.value)}
            placeholder="e.g. Cereal box - 500g - front panel"
            required
            className="mt-1 block w-full rounded-md border border-ink/10 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
          />
          <span className="mt-1 block text-[11px] text-ink-muted">
            Your name for this job. It sits alongside the FA job ticket number once we receive your order.
          </span>
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-ink uppercase tracking-wider">
            Item code / Job number
            <span className="ml-2 text-[10px] font-normal text-ink-muted normal-case">(optional)</span>
          </span>
          <input
            type="text"
            value={lineItem.itemCode}
            onChange={(e) => onChange("itemCode", e.target.value)}
            placeholder="e.g. ITM-2410, PO-887, your internal job number"
            className="mt-1 block w-full rounded-md border border-ink/10 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
          />
          <span className="mt-1 block text-[11px] text-ink-muted">
            Your internal reference. We carry it through onto our paperwork.
          </span>
        </label>
      </div>

      <div className="p-6 space-y-6">
        {/* Substrate visual selector */}
        <div>
          <div className="text-sm font-semibold text-ink mb-3">
            Substrate <span className="text-accent-500">*</span>
            <span className="ml-2 text-xs font-normal text-ink-muted">What are you printing on?</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {SUBSTRATE_OPTIONS.map((s) => (
              <SubstrateCircle
                key={s.id}
                substrate={s}
                selected={lineItem.substrate === s.id}
                onClick={() => onChange("substrate", s.id)}
              />
            ))}
          </div>
        </div>

        {/* Plate tier */}
        <div>
          <div className="text-sm font-semibold text-ink mb-3">
            Plate tier <span className="text-accent-500">*</span>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            {TIERS.map((t) => (
              <TierCard
                key={t}
                tier={t}
                selected={lineItem.plateTier === t}
                onClick={() => {
                  onChange("plateTier", t);
                  onChange("plateTypeId", "");
                }}
              />
            ))}
          </div>
        </div>

        {/* Thickness */}
        {lineItem.plateTier && (
          <div>
            <div className="text-sm font-semibold text-ink mb-2">
              Plate thickness <span className="text-accent-500">*</span>
            </div>
            <select
              value={lineItem.plateTypeId}
              onChange={(e) => onChange("plateTypeId", e.target.value)}
              className="block w-full sm:w-72 rounded-md border border-ink/20 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
            >
              <option value="">Select thickness</option>
              {filteredTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name.replace(`${lineItem.plateTier} `, "")} ({t.thicknessMm.toFixed(2)} mm)
                </option>
              ))}
            </select>
            {selectedType && (
              <p className="mt-2 text-xs text-ink-muted">{selectedType.useCase}</p>
            )}
          </div>
        )}

        {/* Ink type */}
        <div>
          <div className="text-sm font-semibold text-ink mb-3">
            Ink type <span className="text-accent-500">*</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {INK_TYPES.map((ink) => (
              <InkCircle
                key={ink.id}
                ink={ink}
                selected={lineItem.inkType === ink.id}
                onClick={() => onChange("inkType", ink.id)}
              />
            ))}
          </div>
        </div>

        {/* Print side */}
        <div>
          <div className="text-sm font-semibold text-ink mb-3">
            Print side <span className="text-accent-500">*</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {PRINT_SIDE_OPTIONS.map((side) => (
              <PrintSideCard
                key={side.id}
                side={side}
                selected={lineItem.printSide === side.id}
                onClick={() => onChange("printSide", side.id)}
              />
            ))}
          </div>
        </div>

        {/* Screen ruling + cylinder size — both compulsory */}
        <div>
          <div className="text-sm font-semibold text-ink mb-2">
            Press setup <span className="text-accent-500">*</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-ink-muted">
                Screen ruling (LPI) <span className="text-accent-500">*</span>
              </span>
              <select
                value={lineItem.screenRuling || ""}
                onChange={(e) => onChange("screenRuling", e.target.value)}
                required
                className="mt-1 block w-full rounded-md border border-ink/20 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
              >
                <option value="">Select ruling</option>
                {SCREEN_RULING_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-ink-muted">
                Cylinder / tooth size <span className="text-accent-500">*</span>
              </span>
              <input
                type="text"
                value={lineItem.cylinderSize || ""}
                onChange={(e) => onChange("cylinderSize", e.target.value)}
                placeholder="e.g. 120 teeth or 508mm"
                required
                className="mt-1 block w-full rounded-md border border-ink/20 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
              />
            </label>
          </div>
        </div>

        {/* PDF upload — placed AFTER press setup, BEFORE print dimensions, so
            the analysis can auto-fill the width/length below. */}
        <div>
          <div className="text-sm font-semibold text-ink mb-2">
            Upload your artwork PDF <span className="text-accent-500">*</span>
          </div>
          <PdfDropzone
            file={lineItem.pdfFile}
            onChange={handlePdfDrop}
          />
          {/* Inline analysis report + separations + checkboxes */}
          <PdfAnalysisReport
            analysis={lineItem.pdfAnalysis}
            selectedColors={lineItem.selectedColors}
            onToggleColor={toggleColor}
            platesFromColors={platesFromColors}
          />
        </div>

        {/* Dimensions */}
        <div>
          <div className="text-sm font-semibold text-ink mb-2">
            Print dimensions <span className="text-accent-500">*</span>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs text-ink-muted">Print width (cm)</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={203}
                step="0.1"
                value={lineItem.widthCm}
                onChange={(e) => onChange("widthCm", e.target.value)}
                className="mt-1 block w-full rounded-md border border-ink/20 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
              />
            </label>
            <label className="block">
              <span className="text-xs text-ink-muted">Print length (cm)</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={127}
                step="0.1"
                value={lineItem.heightCm}
                onChange={(e) => onChange("heightCm", e.target.value)}
                className="mt-1 block w-full rounded-md border border-ink/20 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
              />
            </label>
            <label className="block">
              <span className="text-xs text-ink-muted">Plates (auto)</span>
              <div className="mt-1 flex items-center rounded-md border border-ink/20 bg-ink/[0.02] px-3 py-2 h-[42px]">
                <span className="text-2xl font-bold text-ink">
                  {platesFromColors}
                </span>
                <span className="ml-2 text-xs text-ink-muted">
                  from {Object.keys(lineItem.selectedColors || {}).length || "—"} colours
                </span>
              </div>
            </label>
          </div>
          {price && price.areaCm2 > 0 && (
            <p className="mt-2 text-xs text-ink-muted">
              Plate size with trim:{" "}
              <span className="font-semibold text-ink">
                {price.billedWidthCm} × {price.billedHeightCm} cm
              </span>
              <span className="mx-2">·</span>
              Plate area: <span className="font-semibold text-ink">{price.areaCm2} cm²</span>
              <span className="mx-2">·</span>
              Line total ({platesFromColors} {platesFromColors === 1 ? "plate" : "plates"}):{" "}
              <span className="font-semibold text-ink">{formatZAR(price.subtotal)}</span>
            </p>
          )}
        </div>

        {/* Special instructions */}
        <details className="group">
          <summary className="text-sm font-medium text-ink-muted cursor-pointer select-none flex items-center gap-2 list-none [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-ink/5 text-ink text-xs group-open:rotate-45 transition-transform">+</span>
            Special instructions (optional)
          </summary>
          <textarea
            rows={2}
            value={lineItem.specialInstructions}
            onChange={(e) => onChange("specialInstructions", e.target.value)}
            placeholder="Anything our repro team should know about this plate"
            className="mt-3 block w-full rounded-md border border-ink/20 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
          />
        </details>
      </div>
    </div>
  );
}

// ─── Substrate visual selector ────────────────────────────────────────────

function SubstrateCircle({ substrate, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "group rounded-xl border-2 p-3 text-center transition " +
        (selected
          ? "border-accent-500 bg-accent-50"
          : "border-ink/10 bg-white hover:border-ink/30")
      }
    >
      <div
        className={
          "mx-auto h-16 w-16 rounded-full grid place-items-center transition " +
          (selected ? "bg-accent-500 text-white" : "bg-ink/5 text-ink-muted group-hover:bg-ink/10")
        }
      >
        <SubstrateIcon id={substrate.id} />
      </div>
      <div className={"mt-2 text-xs font-medium " + (selected ? "text-accent-700" : "text-ink")}>
        {substrate.label}
      </div>
    </button>
  );
}

function SubstrateIcon({ id }) {
  const cls = "h-8 w-8";
  if (id === "film") {
    return (
      <svg className={cls} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M6 10c4-4 8-2 12 0s8 4 8 4-4 8-8 10-12-2-12-2V10z" strokeLinejoin="round" />
      </svg>
    );
  }
  if (id === "label") {
    return (
      <svg className={cls} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="6" y="8" width="20" height="16" rx="2" />
        <path d="M10 13h12M10 17h8" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === "corrugated") {
    return (
      <svg className={cls} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M4 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0 4 2 6 0M4 20c2-2 4-2 6 0s4 2 6 0 4-2 6 0 4 2 6 0" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === "paper") {
    return (
      <svg className={cls} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M10 4h10l6 6v18a2 2 0 01-2 2H10a2 2 0 01-2-2V6a2 2 0 012-2z" strokeLinejoin="round" />
        <path d="M20 4v6h6" />
      </svg>
    );
  }
  return (
    <svg className={cls} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="16" cy="16" r="10" />
      <path d="M16 11v6M16 19v.5" strokeLinecap="round" />
    </svg>
  );
}

// ─── Ink type selector (3 circles) ────────────────────────────────────────

function InkCircle({ ink, selected, onClick }) {
  const colorMap = {
    waterbased: "bg-brand-blue/15 text-brand-blue",
    solvent: "bg-brand-orange/15 text-brand-orange",
    uv: "bg-brand-yellow/30 text-yellow-700",
  };
  const selectedColor = {
    waterbased: "border-brand-blue bg-brand-blue text-white",
    solvent: "border-brand-orange bg-brand-orange text-white",
    uv: "border-brand-yellow bg-brand-yellow text-ink",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "group rounded-xl border-2 p-3 text-center transition " +
        (selected
          ? "border-accent-500 bg-accent-50"
          : "border-ink/10 bg-white hover:border-ink/30")
      }
    >
      <div
        className={
          "mx-auto h-14 w-14 rounded-full grid place-items-center transition border-2 " +
          (selected
            ? selectedColor[ink.id]
            : "border-transparent " + (colorMap[ink.id] || "bg-ink/5 text-ink-muted"))
        }
      >
        <InkDrop />
      </div>
      <div className={"mt-2 text-xs font-medium " + (selected ? "text-accent-700" : "text-ink")}>
        {ink.label}
      </div>
    </button>
  );
}

function InkDrop() {
  return (
    <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3c-3 5-6 8-6 12a6 6 0 0012 0c0-4-3-7-6-12z" />
    </svg>
  );
}

// ─── Print side selector ──────────────────────────────────────────────────

function PrintSideCard({ side, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-xl border-2 p-4 text-left transition " +
        (selected
          ? "border-accent-500 bg-accent-50"
          : "border-ink/10 bg-white hover:border-ink/30")
      }
    >
      <div className="flex items-center justify-between">
        <span className="font-bold text-ink">{side.label}</span>
        <span
          className={
            "h-5 w-5 rounded-full border-2 " +
            (selected ? "border-accent-500 bg-accent-500" : "border-ink/20 bg-white")
          }
        >
          {selected && (
            <svg viewBox="0 0 20 20" fill="white" className="h-full w-full p-0.5">
              <path d="M16.7 5.3a1 1 0 010 1.4l-7.4 7.4a1 1 0 01-1.4 0L3.3 9.5a1 1 0 011.4-1.4l3.9 3.9 6.7-6.7a1 1 0 011.4 0z" />
            </svg>
          )}
        </span>
      </div>
      <p className="mt-2 text-xs text-ink-muted">{side.note}</p>
    </button>
  );
}

// ─── Delivery method selector (Delivery / Collection) ────────────────────

function DeliveryMethodCard({ option, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-xl border-2 p-4 text-left transition " +
        (selected
          ? "border-accent-500 bg-accent-50"
          : "border-ink/10 bg-white hover:border-ink/30")
      }
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="font-bold text-ink">{option.label}</div>
          <div className="text-xs text-ink-muted mt-0.5">{option.note}</div>
        </div>
        <span
          className={
            "h-5 w-5 rounded-full border-2 " +
            (selected
              ? "border-accent-500 bg-accent-500"
              : "border-ink/20 bg-white")
          }
        >
          {selected && (
            <svg viewBox="0 0 20 20" fill="white" className="h-full w-full p-0.5">
              <path d="M16.7 5.3a1 1 0 010 1.4l-7.4 7.4a1 1 0 01-1.4 0L3.3 9.5a1 1 0 011.4-1.4l3.9 3.9 6.7-6.7a1 1 0 011.4 0z" />
            </svg>
          )}
        </span>
      </div>
    </button>
  );
}

// ─── Turnaround tier selector (Standard / Express) ────────────────────────

function TurnaroundCard({ tier, selected, onClick }) {
  const isExpress = tier.id === "express";
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-xl border-2 p-4 text-left transition " +
        (selected
          ? isExpress
            ? "border-accent-500 bg-accent-500 text-white"
            : "border-ink bg-ink text-white"
          : "border-ink/10 bg-white text-ink hover:border-ink/30")
      }
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="font-bold">{tier.label}</div>
          <div className={"text-xs mt-0.5 " + (selected ? "text-white/85" : "text-ink-muted")}>
            {tier.sub}
          </div>
        </div>
        {tier.upliftPct > 0 && (
          <div
            className={
              "text-xs font-bold px-2 py-0.5 rounded-full " +
              (selected ? "bg-white text-accent-600" : "bg-accent-500/15 text-accent-600")
            }
          >
            +{tier.upliftPct}%
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Plate tier card selector ─────────────────────────────────────────────

const TIER_INFO = {
  Crystal: {
    tagline: "Premium HD photopolymer",
    note: "Fine detail labels and premium flexible packaging.",
    accent: "from-accent-50 to-white",
  },
  "Surface Engineered": {
    tagline: "Cleaner ink lay, mid-tier",
    note: "Engineered surface for consistent ink transfer.",
    accent: "from-brand-blue/10 to-white",
  },
  Standard: {
    tagline: "Everyday photopolymer",
    note: "Reliable daily production across packaging.",
    accent: "from-brand-green/10 to-white",
  },
};

function TierCard({ tier, selected, onClick }) {
  const info = TIER_INFO[tier] || {};
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-xl border-2 p-4 text-left transition " +
        (selected
          ? "border-accent-500 bg-gradient-to-br " + info.accent
          : "border-ink/10 bg-white hover:border-ink/30")
      }
    >
      <div className="flex items-center justify-between">
        <span className={"font-bold " + (selected ? "text-ink" : "text-ink")}>{tier}</span>
        <span
          className={
            "h-5 w-5 rounded-full border-2 " +
            (selected ? "border-accent-500 bg-accent-500" : "border-ink/20 bg-white")
          }
        >
          {selected && (
            <svg viewBox="0 0 20 20" fill="white" className="h-full w-full p-0.5">
              <path d="M16.7 5.3a1 1 0 010 1.4l-7.4 7.4a1 1 0 01-1.4 0L3.3 9.5a1 1 0 011.4-1.4l3.9 3.9 6.7-6.7a1 1 0 011.4 0z" />
            </svg>
          )}
        </span>
      </div>
      <p className="mt-2 text-sm text-ink font-medium">{info.tagline}</p>
      <p className="mt-1 text-xs text-ink-muted leading-relaxed">{info.note}</p>
    </button>
  );
}

// ─── PDF dropzone ─────────────────────────────────────────────────────────

function PdfDropzone({ file, onChange }) {
  return (
    <label className="block">
      <div className="relative rounded-md border-2 border-dashed border-ink/20 hover:border-accent-500 transition-colors bg-ink/[0.02]">
        <input
          type="file"
          accept="application/pdf,image/*"
          onChange={(e) => onChange(e.target.files?.[0] || null)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div className="px-4 py-8 text-center pointer-events-none">
          {file ? (
            <div>
              <div className="inline-flex items-center gap-2 text-ink font-medium">
                <svg className="h-5 w-5 text-accent-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" strokeLinejoin="round" />
                  <path d="M14 3v6h6" />
                </svg>
                {file.name}
              </div>
              <div className="text-xs text-ink-muted mt-1">
                {(file.size / 1024 / 1024).toFixed(2)} MB · Click to replace
              </div>
            </div>
          ) : (
            <div>
              <div className="text-ink font-medium">
                Drop your PDF here, or click to choose
              </div>
              <div className="text-xs text-ink-muted mt-1">
                Final Esko or normalised PDF, ready for platemaking · Max 50 MB
              </div>
            </div>
          )}
        </div>
      </div>
    </label>
  );
}

// ─── PDF analysis report (shown inline after a PDF is dropped) ────────────

function PdfAnalysisReport({
  analysis,
  selectedColors,
  onToggleColor,
  platesFromColors,
}) {
  if (!analysis) return null;

  // Loading state — show while pdfjs is parsing.
  if (analysis.loading) {
    return (
      <div className="mt-3 rounded-md border border-ink/10 bg-ink/[0.02] px-4 py-3 flex items-center gap-3 text-sm text-ink-muted">
        <span
          className="inline-block h-4 w-4 border-2 border-current border-r-transparent rounded-full animate-spin"
          role="status"
          aria-label="Analysing"
        />
        Checking your PDF and generating separations...
      </div>
    );
  }

  // Error / not OK
  if (!analysis.ok) {
    return (
      <div className="mt-3 rounded-md border border-accent-500/40 bg-accent-50 px-4 py-3 text-sm text-accent-700">
        <span className="font-semibold">Could not analyse this PDF.</span>{" "}
        {analysis.error || "We will still upload it for our team to check."}
      </div>
    );
  }

  const hasWarnings = analysis.warnings && analysis.warnings.length > 0;
  const headlineColor = hasWarnings
    ? "border-amber-200 bg-amber-50"
    : "border-green-200 bg-green-50";
  const headlineDot = hasWarnings ? "bg-amber-500" : "bg-green-500";
  const separations = analysis.separations || [];

  return (
    <div className="mt-3 space-y-3">
      {/* Summary banner */}
      <div className={"rounded-md border px-4 py-3 text-sm " + headlineColor}>
        <div className="flex items-start gap-3">
          <span
            className={
              "mt-1 inline-block h-2 w-2 rounded-full flex-none " + headlineDot
            }
          />
          <div className="flex-1">
            <div className="font-semibold text-ink">
              Page 1: {analysis.widthCm} × {analysis.heightCm} cm
              <span className="ml-2 text-xs font-normal text-ink-muted">
                ({analysis.widthMm.toFixed(0)} × {analysis.heightMm.toFixed(0)} mm)
              </span>
            </div>
            <div className="text-xs text-ink-muted mt-0.5">
              {analysis.pageCount}{" "}
              {analysis.pageCount === 1 ? "page" : "pages"} ·{" "}
              {analysis.fileSizeMb} MB · {platesFromColors}{" "}
              {platesFromColors === 1 ? "plate" : "plates"} from this PDF
            </div>

            {hasWarnings && (
              <ul className="mt-2 space-y-1">
                {analysis.warnings.map((w, i) => (
                  <li
                    key={i}
                    className={
                      "text-xs " +
                      (w.level === "error"
                        ? "text-red-700"
                        : w.level === "warning"
                        ? "text-amber-800"
                        : "text-ink-muted")
                    }
                  >
                    • {w.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Composite + separations grid */}
      <div className="rounded-md border border-ink/10 bg-white p-3">
        <div className="text-xs uppercase tracking-wider text-ink-muted font-semibold mb-3">
          Tick the colours you want plates for
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {/* Composite — always shown, no checkbox (it's a preview, not a plate) */}
          {analysis.previewDataUrl && (
            <div className="rounded-md border border-ink/10 overflow-hidden bg-ink">
              <div className="text-[10px] uppercase tracking-wider text-white px-2 py-1 font-semibold text-center">
                Composite
              </div>
              <div className="bg-white aspect-[4/3] flex items-center justify-center overflow-hidden">
                <img
                  src={analysis.previewDataUrl}
                  alt="PDF page 1 composite preview"
                  className="block max-w-full max-h-full object-contain"
                />
              </div>
            </div>
          )}

          {/* Separations */}
          {separations.map((sep) => (
            <SeparationTile
              key={sep.key}
              sep={sep}
              selected={!!(selectedColors && selectedColors[sep.key])}
              onToggle={() => onToggleColor(sep.key)}
            />
          ))}
        </div>

        <div className="mt-3 text-[10px] text-ink-muted italic">
          CMYK separations are approximations rendered from the composite in
          your browser. Spot colours are detected by name from the PDF and may
          not include a thumbnail. Untick anything you do not need plated.
        </div>
      </div>
    </div>
  );
}

function SeparationTile({ sep, selected, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={
        "text-left rounded-md border-2 overflow-hidden transition " +
        (selected
          ? "border-accent-500"
          : "border-ink/10 hover:border-ink/30 opacity-60")
      }
    >
      <div className="flex items-center justify-between bg-ink/[0.04] px-2 py-1">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-ink truncate">
          {sep.label}
        </span>
        <span
          className={
            "h-4 w-4 rounded-sm border flex items-center justify-center flex-none " +
            (selected
              ? "border-accent-500 bg-accent-500 text-white"
              : "border-ink/30 bg-white")
          }
        >
          {selected && (
            <svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor">
              <path d="M10.4 3.6L5 9 1.6 5.6l1.4-1.4L5 6.2l4-4z" />
            </svg>
          )}
        </span>
      </div>
      <div className="bg-white aspect-[4/3] flex items-center justify-center overflow-hidden">
        {sep.previewDataUrl ? (
          <img
            src={sep.previewDataUrl}
            alt={sep.label + " separation"}
            className="block max-w-full max-h-full object-contain"
          />
        ) : (
          <div className="text-center px-2 py-3">
            <div className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider">
              Spot
            </div>
            <div className="text-xs text-ink mt-1 break-words">{sep.label}</div>
          </div>
        )}
      </div>
      {/* Per-plate dimensions readout. Shows the BILLED plate size (ink bbox
          + 4cm Polyflex trim — 2cm each side). That's the actual plate Cam
          mounts and what the customer is charged for, so showing the raw
          bbox would mismatch the price. */}
      {Number(sep.bboxWidthCm) > 0 && Number(sep.bboxHeightCm) > 0 && (
        <div className="bg-ink/[0.02] px-2 py-1 text-[10px] text-ink-muted border-t border-ink/5">
          <div className="flex items-center justify-between">
            <span className="font-medium text-ink">
              {(Number(sep.bboxWidthCm) + 4).toFixed(1)} × {(Number(sep.bboxHeightCm) + 4).toFixed(1)} cm
            </span>
            {Number(sep.coveragePct) > 0 && (
              <span className="text-ink-muted/80">
                {Number(sep.coveragePct).toFixed(1)}%
              </span>
            )}
          </div>
          <div className="text-[9px] text-ink-muted/70 mt-0.5">
            plate · incl. 4cm trim
          </div>
        </div>
      )}
    </button>
  );
}

// ─── Trust badge (sidebar) ────────────────────────────────────────────────

function TrustBadge({ icon, title, sub }) {
  return (
    <div className="rounded-lg bg-white border border-ink/10 p-3">
      <div className="mx-auto h-8 w-8 grid place-items-center text-accent-500">
        <TrustIcon id={icon} />
      </div>
      <div className="mt-2 text-ink font-semibold leading-tight">{title}</div>
      <div className="mt-0.5 text-ink-muted leading-tight">{sub}</div>
    </div>
  );
}

function TrustIcon({ id }) {
  const cls = "h-7 w-7";
  if (id === "handshake") {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M8 11l3-3 4 4 5-5M3 13l5 5 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (id === "shield") {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" strokeLinejoin="round" />
        <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (id === "truck") {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M3 7h11v10H3zM14 10h4l3 3v4h-7" strokeLinejoin="round" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="17" cy="18" r="2" />
      </svg>
    );
  }
  // qa
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

// ─── Fast quote (sidebar) ─────────────────────────────────────────────────

function FastQuote({ total, subtotal, expressUplift, upliftPct, deliveryFee, vat, lineItemCount, tierLabel }) {
  return (
    <div className="rounded-xl border border-ink/10 bg-white p-4">
      <div className="text-xs uppercase tracking-wider text-ink-muted font-semibold">Fast quote</div>
      <div className="mt-2 text-2xl font-bold text-ink">{formatZAR(total)}</div>
      <div className="mt-1 text-[11px] text-ink-muted">
        {tierLabel} · incl. {VAT_PERCENT}% VAT
      </div>
      <div className="mt-3 pt-3 border-t border-ink/10 space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-ink-muted">Subtotal</span>
          <span className="text-ink font-medium">{formatZAR(subtotal)}</span>
        </div>
        {upliftPct > 0 && (
          <div className="flex justify-between text-accent-600">
            <span>Express +{upliftPct}%</span>
            <span className="font-medium">{formatZAR(expressUplift)}</span>
          </div>
        )}
        {deliveryFee > 0 && (
          <div className="flex justify-between">
            <span className="text-ink-muted">Delivery</span>
            <span className="text-ink font-medium">{formatZAR(deliveryFee)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-ink-muted">VAT</span>
          <span className="text-ink font-medium">{formatZAR(vat)}</span>
        </div>
      </div>
      <p className="mt-3 text-[10px] text-ink-muted italic leading-relaxed">
        Fast quote based on dimensions plus trim allowance. Final price confirmed when artwork is reviewed.
      </p>
    </div>
  );
}

// ─── Reference plate illustration ─────────────────────────────────────────

function PlateIllustration() {
  return (
    <svg viewBox="0 0 200 200" className="h-32 w-32" fill="none">
      <defs>
        <linearGradient id="plate-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FEE2E2" />
          <stop offset="100%" stopColor="#FCA5A5" />
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="100" rx="80" ry="60" fill="url(#plate-grad)" stroke="#DC2626" strokeWidth="1.5" />
      <ellipse cx="100" cy="95" rx="50" ry="35" fill="none" stroke="#991B1B" strokeWidth="1" opacity="0.4" />
      <path d="M60 100 Q100 80 140 100 T180 100" stroke="#991B1B" strokeWidth="0.8" fill="none" opacity="0.3" />
      <path d="M55 110 Q100 90 145 110" stroke="#991B1B" strokeWidth="0.8" fill="none" opacity="0.3" />
    </svg>
  );
}

// ─── Small form atoms ─────────────────────────────────────────────────────

function Field({ label, required, ...rest }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">
        {label} {required && <span className="text-accent-500">*</span>}
      </span>
      <input
        required={required}
        {...rest}
        className="mt-1 block w-full rounded-md border border-ink/20 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
      />
    </label>
  );
}

function DateField({ label, required, ...rest }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">
        {label} {required && <span className="text-accent-500">*</span>}
      </span>
      <input
        type="date"
        min={today}
        required={required}
        {...rest}
        className="mt-1 block w-full rounded-md border border-ink/20 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
      />
    </label>
  );
}
FA_CRYSTAL_EOF_3
mkdir -p "app/api/orders/create"
cat > 'app/api/orders/create/route.js' <<'FA_CRYSTAL_EOF_4'
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, verifyRequest } from "@/lib/firebase-admin";
import { PLATE_TYPES, SUBSTRATE_OPTIONS, TURNAROUND_TIERS, tierRateFor } from "@/lib/plate-types";
import { priceLineItems, calcOrderTotals } from "@/lib/pricing";
import { matchCustomer } from "@/lib/company-match";
import { PORTAL_DEMO_MODE, formatOrderNumber, formatJobNumber } from "@/lib/order-format";

/**
 * POST /api/orders/create
 *
 * AUTHORITATIVE order creation. Everything that decides what the customer pays
 * is computed HERE, server-side, with admin credentials:
 *
 *   - the caller's identity          → from their verified Firebase ID token
 *   - their company                  → from /users/{uid} (not the request body)
 *   - their per-cm² rate             → from settings/customers (never exposed)
 *   - whether they may order on a PO → from settings/customers.poApproved
 *   - the order total                → recomputed from the rate + dimensions
 *
 * Previously all of this happened in the browser, which meant a customer could
 * write their own orderTotalIncVat (pay R1 for a R5,000 order — the PayFast ITN
 * cross-check compared the payment against a figure the customer supplied) or
 * set paymentTerms:"po" to skip payment entirely. Cam 2026-07-14.
 *
 * The client still uploads the artwork PDFs and the PO document to Storage
 * (rules-guarded, and the bytes are the customer's own), and passes us the
 * resulting references.
 */

const MAX_LINE_ITEMS = 25;
const MAX_PLATES_PER_LINE = 12;

export async function POST(request) {
  try {
    const decoded = await verifyRequest(request);
    if (!decoded) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { header = {}, lineItems = [], poDocument = null } = body;

    if (!Array.isArray(lineItems) || lineItems.length === 0) {
      return NextResponse.json({ error: "Add at least one plate" }, { status: 400 });
    }
    if (lineItems.length > MAX_LINE_ITEMS) {
      return NextResponse.json({ error: "Too many line items" }, { status: 400 });
    }

    const adminDb = getAdminDb();

    // ─── 1. Resolve the caller (never trust the body for identity) ────────
    const userSnap = await adminDb.collection("users").doc(decoded.uid).get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    const profile = userSnap.data();
    if (profile.role !== "customer" || profile.status !== "active") {
      return NextResponse.json({ error: "Account not permitted to order" }, { status: 403 });
    }

    const company = (profile.company || "").trim();

    // ─── 2. Resolve rate + PO terms from the MIS register ────────────────
    const settingsSnap = await adminDb.collection("settings").doc("customers").get();
    const list = settingsSnap.exists ? settingsSnap.data()?.list || [] : [];
    const customer = matchCustomer(list, company);

    // Rate: the customer's negotiated rate, or undefined → priceLineItems falls
    // back to the public anchor. Never taken from the client.
    const ratePerCm2 = Number(customer?.rate) > 0 ? Number(customer.rate) : undefined;

    // Payment terms: derived ONLY from the register.
    const poApproved = !!customer?.poApproved;
    const paymentTerms = poApproved ? "po" : "prepaid";

    if (paymentTerms === "po") {
      if (!String(header.poNumber || "").trim()) {
        return NextResponse.json(
          { error: "A purchase order number is required for account orders" },
          { status: 400 }
        );
      }
      if (!poDocument?.url) {
        return NextResponse.json(
          { error: "A purchase order document is required for account orders" },
          { status: 400 }
        );
      }
    }

    // ─── 3. Validate line items ──────────────────────────────────────────
    for (const li of lineItems) {
      const plateType = PLATE_TYPES.find((p) => p.id === li.plateTypeId);
      if (!plateType) {
        return NextResponse.json({ error: `Invalid plate type: ${li.plateTypeId}` }, { status: 400 });
      }
      const ticked = Object.values(li.selectedColors || {}).filter(Boolean).length;
      if (ticked > MAX_PLATES_PER_LINE) {
        return NextResponse.json({ error: "Too many plates on one line" }, { status: 400 });
      }
      if (!(Number(li.widthCm) > 0) || !(Number(li.heightCm) > 0)) {
        return NextResponse.json({ error: "Every plate needs width and height" }, { status: 400 });
      }
    }

    // ─── 4. Recompute the price. THIS is what the customer pays. ─────────
    const tier = header.tier === "express" ? "express" : "standard";
    const priority = tier === "express" ? "rush" : "normal";
    const tierInfo = TURNAROUND_TIERS.find((t) => t.id === tier) || TURNAROUND_TIERS[0];
    const isExpress = (tierInfo.upliftPct || 0) > 0;

    const deliveryMethod = header.deliveryMethod === "collection" ? "collection" : "delivery";
    const linePrices = priceLineItems({ lineItems, isExpress, ratePerCm2 });
    const totals = calcOrderTotals(linePrices, deliveryMethod);

    // ─── 5. Allocate numbers + write, all with admin credentials ─────────
    const orderCounter = PORTAL_DEMO_MODE ? "demoOrderNumber" : "orderNumber";
    const jobCounter = PORTAL_DEMO_MODE ? "demoJobNumber" : "jobNumber";

    const orderNumberInt = await nextNumber(adminDb, orderCounter);
    const orderNumber = formatOrderNumber(orderNumberInt);

    const orderRef = adminDb.collection("orders").doc();
    await orderRef.set({
      orderNumber,
      orderNumberInt,
      customerUid: decoded.uid,
      customerName: profile.contactName || "",
      customerCompany: company,
      customerEmail: profile.email || decoded.email || "",
      customerPhone: profile.phone || "",
      poNumber: String(header.poNumber || "").trim(),
      deliveryAddress: String(header.deliveryAddress || "").trim(),
      requiredByDate: header.requiredByDate || "",
      tier,
      priority,
      deliveryMethod,
      deliveryFeePct: 0,
      deliveryFeeAmount: totals.deliveryFee,
      // Server-computed. The client's figure is ignored entirely.
      orderSubtotalExVat: totals.beforeVat,
      orderVat: totals.vat,
      orderTotalIncVat: totals.total,
      // Which rate we actually charged, and whether we matched a real customer
      // record. If matchedCustomer is false we billed the public anchor rate —
      // worth an operator eyeballing before invoicing.
      ratePerCm2: ratePerCm2 ?? null,
      matchedCustomer: !!customer,
      status: "submitted",
      paymentTerms,
      paymentStatus: paymentTerms === "po" ? "on_account" : "unpaid",
      poDocument: poDocument || null,
      source: "portal",
      demo: PORTAL_DEMO_MODE,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      jobIds: [],
    });

    // ─── 6. One job per ticked colour, MIS-compatible schema ─────────────
    const createdJobs = [];
    for (const li of lineItems) {
      const plateType = PLATE_TYPES.find((p) => p.id === li.plateTypeId);
      // The rate we actually charge for this line's plate type. Crystal is the
      // flat premium rate; everything else is the customer's rate. Stored on
      // the job so MIS shows the real sell rate, not the account base.
      const jobRate = tierRateFor(li.plateTypeId, ratePerCm2);
      const sel = li.selectedColors || {};
      const colourKeys = Object.keys(sel).filter((k) => sel[k]);
      const platesToCreate =
        colourKeys.length > 0
          ? colourKeys.map((key) => ({ key, label: labelForColorKey(key) }))
          : [{ key: "", label: "" }];

      // The client already uploaded the PDF under jobs/{preAllocatedJobId}/…
      // Reuse that id for the first plate so the storage path still matches.
      const pdfMeta = li.pdfMeta || null;
      const preAllocatedJobId = li.preAllocatedJobId || null;

      for (let plateIdx = 0; plateIdx < platesToCreate.length; plateIdx++) {
        const plate = platesToCreate[plateIdx];
        const jobNumberInt = await nextNumber(adminDb, jobCounter);
        const jobName = formatJobNumber(jobNumberInt);

        const jobRef =
          plateIdx === 0 && preAllocatedJobId
            ? adminDb.collection("jobs").doc(preAllocatedJobId)
            : adminDb.collection("jobs").doc();

        const baseDesc =
          li.description ||
          li.specialInstructions ||
          `${plateType.name} ${li.widthCm}x${li.heightCm}cm`;
        const fullDesc = plate.label ? `${baseDesc} - ${plate.label}` : baseDesc;

        await jobRef.set({
          jobName,
          jobNumberInt,
          stage: "artwork",
          priority,
          customer: company || profile.contactName || "Portal customer",
          printer: "",
          description: fullDesc,
          dueDate: header.requiredByDate || "",
          plateThickness: plateType.thicknessMm.toFixed(2) + " mm",
          screenRuling: li.screenRuling || "",
          material: SUBSTRATE_OPTIONS.find((s) => s.id === li.substrate)?.label || "",
          bagType: "",
          cylinder: li.cylinderSize || "",
          plateDistortion: "",
          printDirection: "",
          printSide: li.printSide
            ? li.printSide.charAt(0).toUpperCase() + li.printSide.slice(1)
            : "",
          inkType: li.inkType || "",
          widthMm: String(Number(li.widthCm) * 10),
          pitchMm: String(Number(li.heightCm) * 10),
          across: "",
          around: "",
          barcode: "",
          colours: plate.label ? [plate.label] : [],
          sellRate: jobRate ?? null,
          totalSell: 0,
          totalCost: 0,
          margin: null,
          invoiceNumber: "",
          invoiced: false,
          paid: false,
          plates: [
            {
              colour: plate.label || "",
              width: Number(li.widthCm) * 10,
              length: Number(li.heightCm) * 10,
              active: true,
            },
          ],
          revisions: [],
          reproServices: [],
          legacy: false,
          historical: false,

          source: "portal",
          demo: PORTAL_DEMO_MODE,
          orderId: orderRef.id,
          orderNumber,
          customerUid: decoded.uid,
          customerCompany: company,
          customerContactName: profile.contactName || "",
          customerEmail: profile.email || decoded.email || "",
          plateTier: plateType.tier,
          plateTypeId: plateType.id,
          plateTypeName: plateType.name,
          portalQty: Number(li.qty) || 1,
          portalWidthCm: Number(li.widthCm),
          portalHeightCm: Number(li.heightCm),
          portalSubstrate: li.substrate || "",
          portalColourKey: plate.key,
          portalColourLabel: plate.label,
          portalCustomerDescription: li.description || "",

          pdfUrls: pdfMeta ? [pdfMeta] : [],

          createdBy: decoded.uid,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        createdJobs.push({
          jobId: jobRef.id,
          jobName,
          jobNumberInt,
          colourLabel: plate.label,
        });
      }
    }

    return NextResponse.json({
      orderId: orderRef.id,
      orderNumber,
      jobs: createdJobs,
      total: totals.total,
      paymentTerms,
    });
  } catch (err) {
    console.error("orders/create error:", err);
    return NextResponse.json({ error: "Could not place order" }, { status: 500 });
  }
}

/** Atomic counter increment using the admin SDK. */
async function nextNumber(adminDb, counterKey) {
  const ref = adminDb.collection("counters").doc(counterKey);
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? snap.data().value || 0 : 0;
    const next = current + 1;
    tx.set(ref, { value: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return next;
  });
}

function labelForColorKey(key) {
  if (!key) return "";
  if (key.startsWith("cmyk:")) {
    const ch = key.slice(5);
    return { C: "Cyan", M: "Magenta", Y: "Yellow", K: "Black" }[ch] || ch;
  }
  if (key.startsWith("spot:")) return key.slice(5);
  return key;
}
FA_CRYSTAL_EOF_4
echo "==> Files written. Staging..."
git add 'lib/plate-types.js' 'lib/pricing.js' 'app/configurator/page.jsx' 'app/order/new/page.jsx' 'app/api/orders/create/route.js'
echo "==> git status (staged):"
git status --short 'lib/plate-types.js' 'lib/pricing.js' 'app/configurator/page.jsx' 'app/order/new/page.jsx' 'app/api/orders/create/route.js'
git commit -m "Crystal plates: flat R0.80/cm2 sell rate (client quote + server charge)" || echo "!! commit failed (nothing to commit?)"
echo "==> Pushing to origin main..."
git push origin main
echo "==================================================="
echo "DEPLOY DONE. Latest commit:"
git --no-pager log -1 --oneline
echo "==================================================="
