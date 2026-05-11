import {
  PUBLIC_SELL_RATE_PER_CM2,
  RUSH_UPLIFT_PERCENT,
  VAT_PERCENT,
} from "./plate-types";

// Calculate the price breakdown for a plate spec.
// All inputs may be empty/zero. Returns zeros if so.
export function calcPrice({ widthCm, heightCm, qty, isExpress }) {
  const w = toNumber(widthCm);
  const h = toNumber(heightCm);
  const q = toNumber(qty);

  const areaCm2 = w * h;
  const subtotal = areaCm2 * PUBLIC_SELL_RATE_PER_CM2 * q;
  const rushUplift = isExpress
    ? subtotal * (RUSH_UPLIFT_PERCENT / 100)
    : 0;
  const beforeVat = subtotal + rushUplift;
  const vat = beforeVat * (VAT_PERCENT / 100);
  const total = beforeVat + vat;

  return {
    areaCm2: round2(areaCm2),
    subtotal: round2(subtotal),
    rushUplift: round2(rushUplift),
    vat: round2(vat),
    total: round2(total),
    rushUpliftPercent: RUSH_UPLIFT_PERCENT,
    vatPercent: VAT_PERCENT,
    ratePerCm2: PUBLIC_SELL_RATE_PER_CM2,
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
