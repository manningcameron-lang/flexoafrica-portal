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

/**
 * The name our customer list (settings/customers) uses for this company, when
 * the typed name matches exactly ONE customer there. Otherwise null.
 *
 * WHY (Cam, 24 Nov 2026, "Portal uses our list's name"): the job system makes
 * AMBER jobs under our list's name ("Top Flight Packaging cc"), but a customer
 * types their own at sign-up ("Top Flight Packaging"). The portal shows a job
 * only when the two are the same letter for letter, so that customer could not
 * see their own AMBER job or answer AMBER's file check. The portal now saves
 * our list's name on the account (and on plate orders), so both agree.
 *
 * @param {Array<object>} list  settings/customers `.list`
 * @param {string} companyName  the portal user's `company` field
 * @returns {string|null}
 */
export function registerNameFor(list, companyName) {
  const match = matchCustomer(list, companyName);
  const name = String(match?.name || "").trim();
  return name || null;
}

/**
 * The company name to SAVE on a customer's account, or null to leave it.
 * Only when the typed name matches exactly one customer on our list and is
 * not already that name letter for letter.
 */
export function companyNameUpdate(list, typedCompany) {
  const typed = String(typedCompany || "").trim();
  const name = registerNameFor(list, typed); // a blank name matches nobody
  if (!name || name === typed) return null;
  return name;
}
