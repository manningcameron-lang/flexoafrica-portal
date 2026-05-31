/**
 * Customer-specific cm² rate lookup.
 *
 * The MIS holds master customer data at `/settings/customers` as
 *   { list: [{ name, rate, repeatRate, ... }, ...] }
 *
 * Portal customers signed up with a `company` field. When the company name
 * EXACTLY matches a customer record in MIS Settings, the portal uses that
 * customer's per-cm² rate for pricing. Otherwise it falls back to the
 * placeholder PUBLIC_SELL_RATE_PER_CM2 so test / pre-onboarded customers
 * still see a price.
 */

import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { PUBLIC_SELL_RATE_PER_CM2 } from "./plate-types";

/**
 * Subscribe to the MIS customer settings and invoke `callback` whenever the
 * map of name -> rate updates. Returns an unsubscribe function.
 *
 * @param {(rates: { rates: Record<string, number>, repeats: Record<string, number> }) => void} callback
 */
export function subscribeCustomerRates(callback) {
  return onSnapshot(
    doc(db, "settings", "customers"),
    (snap) => {
      const data = snap.exists() ? snap.data() : null;
      const list = Array.isArray(data?.list) ? data.list : [];
      const rates = {};
      const repeats = {};
      for (const c of list) {
        const name = c?.name || (typeof c === "string" ? c : "");
        if (!name) continue;
        const rate = Number(c?.rate);
        const repeatRate = Number(c?.repeatRate);
        if (Number.isFinite(rate) && rate > 0) rates[name] = rate;
        if (Number.isFinite(repeatRate) && repeatRate > 0) repeats[name] = repeatRate;
      }
      callback({ rates, repeats });
    },
    () => {
      // Read failed (rules, network, etc.). Hand back empty maps so the
      // caller falls through to the public placeholder rate.
      callback({ rates: {}, repeats: {} });
    },
  );
}

/**
 * Pick the right rate for a customer at order time.
 *
 * @param {string} companyName - portal user's `company` field
 * @param {{ rates: Record<string, number>, repeats: Record<string, number> }} rateMaps
 * @param {boolean} isRepeat - true if this order is a repeat (currently always false for portal v1)
 * @returns {{ rate: number, source: "customer" | "placeholder", customerName: string | null }}
 */
export function resolveCustomerRate(companyName, rateMaps, isRepeat = false) {
  const name = (companyName || "").trim();
  if (!name) {
    return {
      rate: PUBLIC_SELL_RATE_PER_CM2,
      source: "placeholder",
      customerName: null,
    };
  }
  const standard = rateMaps?.rates?.[name];
  const repeat = rateMaps?.repeats?.[name];
  if (isRepeat && Number(repeat) > 0) {
    return { rate: Number(repeat), source: "customer", customerName: name };
  }
  if (Number(standard) > 0) {
    return { rate: Number(standard), source: "customer", customerName: name };
  }
  return {
    rate: PUBLIC_SELL_RATE_PER_CM2,
    source: "placeholder",
    customerName: null,
  };
}
