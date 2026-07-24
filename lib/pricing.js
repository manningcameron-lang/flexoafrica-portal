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
