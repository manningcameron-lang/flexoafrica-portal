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
  "45#",
  "55#",
  "65#",
  "85#",
  "90#",
  "100#",
  "110#",
  "120#",
  "133#",
  "150#",
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
    sub: "48-72 hours from upload + approval",
    upliftPct: 0,
  },
  {
    id: "express",
    label: "Express",
    sub: "24-48 hours from upload + approval",
    upliftPct: RUSH_UPLIFT_PERCENT,
  },
];

