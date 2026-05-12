import {
  PUBLIC_SELL_RATE_PER_CM2,
  RUSH_UPLIFT_PERCENT,
  VAT_PERCENT,
  TRIM_CM,
  deliveryFeePercent,
} from "./plate-types";

// Per-plate / per-line price.
//
// Pricing dimensions = (widthCm + TRIM_CM) x (heightCm + TRIM_CM), so a
// 20 x 20 cm print prices as 24 x 24 cm with TRIM_CM = 4.
//
// `qty` is the number of plates (one per ticked colour). Delivery fee is
// NOT applied here — it's an order-level percentage of the combined
// subtotal, see calcOrderTotals.
export function calcPrice({ widthCm, heightCm, qty, isExpress }) {
  const w = toNumber(widthCm);
  const h = toNumber(heightCm);
  const q = toNumber(qty);

  const billedWidthCm = w > 0 ? w + TRIM_CM : 0;
  const billedHeightCm = h > 0 ? h + TRIM_CM : 0;
  const areaCm2 = billedWidthCm * billedHeightCm;
  const subtotal = areaCm2 * PUBLIC_SELL_RATE_PER_CM2 * q;
  const rushUplift = isExpress
    ? subtotal * (RUSH_UPLIFT_PERCENT / 100)
    : 0;
  const lineTotal = subtotal + rushUplift;

  return {
    areaCm2: round2(areaCm2),
    billedWidthCm: round2(billedWidthCm),
    billedHeightCm: round2(billedHeightCm),
    trimCm: TRIM_CM,
    subtotal: round2(subtotal),
    rushUplift: round2(rushUplift),
    lineTotal: round2(lineTotal),
    rushUpliftPercent: RUSH_UPLIFT_PERCENT,
    vatPercent: VAT_PERCENT,
    ratePerCm2: PUBLIC_SELL_RATE_PER_CM2,
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
