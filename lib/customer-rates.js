/**
 * RETIRED 2026-07-14 — do not use. Kept only as a tombstone.
 *
 * This module used to subscribe to settings/customers from the BROWSER to look
 * up a customer's cm² rate. That document contains the entire customer
 * register — every sell rate, repeat rate, VAT number, address and Sage id —
 * so any approved portal customer could read the whole rate card out of
 * devtools. Verified live: a customer-role token returned all 55 customers.
 *
 * Firestore rules now restrict /settings to staff, so these functions would
 * fail with permission-denied anyway.
 *
 * Replacements:
 *   - the customer's OWN rate  → GET /api/account/terms  (returns ratePerCm2)
 *   - matching a company name  → lib/company-match.js     (matchCustomer)
 *   - pricing an order         → POST /api/orders/create  (authoritative)
 */

const RETIRED =
  "lib/customer-rates.js is retired. The browser must not read " +
  "settings/customers — it exposes every customer's rate. Use " +
  "GET /api/account/terms for the caller's own rate instead.";

export function subscribeCustomerRates() {
  throw new Error(RETIRED);
}

export function resolveCustomerRate() {
  throw new Error(RETIRED);
}
