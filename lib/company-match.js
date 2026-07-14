/**
 * Single source of truth for matching a portal user's free-text `company`
 * field against a customer record in the MIS register (settings/customers).
 *
 * WHY THIS EXISTS (2026-07-14):
 * Rates used to match on an EXACT string ("Top Flight" !== "Top Flight
 * Packaging (Pty) Ltd") and silently fell back to the R0.70 public anchor on a
 * miss — so a real customer could be billed at the wrong rate without anyone
 * noticing. Meanwhile the PO-terms lookup used a looser match, which meant a
 * company could resolve as PO-approved but still be priced at the public rate.
 *
 * Everything now goes through matchCustomer(). Rates and terms cannot disagree.
 */

/**
 * Normalise a company name for comparison.
 * Case-insensitive, collapses whitespace, and strips the common SA entity
 * suffixes and punctuation so "Blaze Braai Products (Pty) Ltd." matches
 * "blaze braai products".
 */
export function normalizeCompany(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\(.*?\)/g, " ")           // drop "(Pty)" etc.
    .replace(/\b(pty|proprietary|ltd|limited|cc|inc|t\/a)\b/g, " ")
    .replace(/[^a-z0-9&\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find the customer record for a company name.
 *
 * @param {Array<object>} list  settings/customers `.list`
 * @param {string} companyName  the portal user's `company` field
 * @returns {object|null} the matching customer record, or null
 */
export function matchCustomer(list, companyName) {
  const target = normalizeCompany(companyName);
  if (!target || !Array.isArray(list)) return null;

  // 1. Exact match on the raw name wins outright (fastest, least surprising).
  const raw = String(companyName || "").trim();
  const exact = list.find((c) => String(c?.name || "").trim() === raw);
  if (exact) return exact;

  // 2. Normalised match.
  const normed = list.filter((c) => normalizeCompany(c?.name) === target);
  // Ambiguous (two customers normalise the same) — refuse to guess. Falling
  // back to the public rate is safer than silently billing the wrong account.
  if (normed.length === 1) return normed[0];

  return null;
}
