import {
  PUBLIC_SELL_RATE_PER_CM2,
  RUSH_UPLIFT_PERCENT,
  VAT_PERCENT,
  TRIM_CM,
  deliveryFeePercent,
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
}) {
  const w = toNumber(widthCm);
  const h = toNumber(heightCm);
  const q = toNumber(qty);
  const rate = Number(ratePerCm2) > 0
    ? Number(ratePerCm2)
    : PUBLIC_SELL_RATE_PER_CM2;

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
export function calcPricePerPlate({ plates = [], isExpress, ratePerCm2 }) {
  const rate = Number(ratePerCm2) > 0
    ? Number(ratePerCm2)
    : PUBLIC_SELL_RATE_PER_CM2;

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

  const isCollection = deliveryMethod === "collection";
  const deliveryPct = isCollection ? 0 : deliveryFeePercent(afterRush);
  const deliveryFee = afterRush * (deliveryPct / 100);

  const beforeVat = afterRush + deliveryFee;
  const vat = beforeVat * (VAT_PERCENT / 100);
  const total = beforeVat + vat;

  return {
    subtotal: round2(subtotal),
    rushUplift: round2(rushUplift),
    deliveryPct,
    deliveryFee: round2(deliveryFee),
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
