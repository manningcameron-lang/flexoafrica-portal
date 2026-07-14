// Order/job numbering + the demo-mode switch.
//
// Kept in its own module (no firebase imports) so BOTH the browser and the
// server route /api/orders/create can import it. lib/orders.js pulls in the
// firebase *client* SDK, which must never be imported into a route handler.

// ──────────────────────────────────────────────────────────────────────────
// DEMO MODE
// While the portal is still being built, every portal-created order/job is
// flagged demo:true, allocated from a SEPARATE counter, and uses distinctive
// prefixes (PDO / PD) so they cannot be confused with real FA work tickets.
// The MIS dashboard filters demo:true jobs out.
//
// To go live: set PORTAL_DEMO_MODE = false. Real customers' orders will then
// use the real `orderNumber` / `jobNumber` counters and show up in the MIS
// dashboard with the PORTAL badge.
// ──────────────────────────────────────────────────────────────────────────
export const PORTAL_DEMO_MODE = false;

export const ORDER_COUNTER_KEY = PORTAL_DEMO_MODE ? "demoOrderNumber" : "orderNumber";
export const JOB_COUNTER_KEY = PORTAL_DEMO_MODE ? "demoJobNumber" : "jobNumber";

const ORDER_PREFIX = PORTAL_DEMO_MODE ? "PDO" : "FAO";
const JOB_PREFIX = PORTAL_DEMO_MODE ? "PD" : "FA";

export function formatOrderNumber(n) {
  return ORDER_PREFIX + String(n).padStart(6, "0");
}

export function formatJobNumber(n) {
  return JOB_PREFIX + String(n).padStart(6, "0");
}
