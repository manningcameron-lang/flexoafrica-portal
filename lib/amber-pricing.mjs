// What an AMBER job costs the customer.
//
// ⛔ AMBER DOES ARTWORK ONLY. R499 excl VAT a job, 2 rounds of changes
// included, and the FIRST job per company is free.
//
// It used to offer "Plates from my ready file" as well, which showed no price
// and took no payment, so a customer who is not on account could get plates
// made without paying, while the same customer going through Order Plates had
// to pay by card first. Plates now go through Order Plates, which always takes
// a card payment or a purchase order. Cam 2026-10-26.
//
// "A job" means ONE artwork in ONE size. Another flavour or another size is
// another job, and is charged again.
//
// Nobody pays up front. Account customers get it on their normal invoice;
// everyone else is invoiced once the open file has been delivered.

export const AMBER_REPRO_PRICE_EXCL_VAT = 499;
export const AMBER_REPRO_REVISIONS_INCLUDED = 2;
export const VAT_PERCENT = 15;

export const CHOICE_REPRO = "repro";
// Kept only so an older job sheet that already says "plates" can still be
// recognised. Nothing creates one any more.
export const CHOICE_PLATES = "plates";

// What a NEW AMBER job sheet is, always. The page and the server both read
// this, so neither can drift from the other.
export const NEW_SUBMISSION_KIND = CHOICE_REPRO;

export const FIRST_JOB_FREE_NOTE = "AMBER repro, first job free";

/**
 * Price an AMBER repro job.
 *
 * ⚠ `companyHasHadFreeJob` is decided by the MIS, which is the only place
 * that can see every past job for that company. The portal only SHOWS the
 * answer the MIS gives. Never let the browser decide this.
 *
 * @param {{companyHasHadFreeJob?: boolean}} args
 */
export function priceReproJob({ companyHasHadFreeJob = false } = {}) {
  if (!companyHasHadFreeJob) {
    return {
      exclVat: 0,
      vat: 0,
      inclVat: 0,
      free: true,
      note: FIRST_JOB_FREE_NOTE,
      customerText: "This one is on us: your first AMBER job is free",
    };
  }
  const exclVat = AMBER_REPRO_PRICE_EXCL_VAT;
  const vat = round2((exclVat * VAT_PERCENT) / 100);
  return {
    exclVat,
    vat,
    inclVat: round2(exclVat + vat),
    free: false,
    note: null,
    customerText: "R499 excl VAT",
  };
}

// ─── Showing "First job free" ────────────────────────────────────────────
//
// WHAT WAS WRONG (Cam, 27 Oct 2026): the AMBER page said "First job free"
// unless the price check had come back and said otherwise. So while the page
// was still loading, or when the check failed, a returning customer was told
// their job was free, and the job system then billed them R499.
//
// WHAT IT DOES NOW: "free" is shown ONLY when the check came back and said,
// in so many words, that this company has never had an AMBER job. Still
// loading, failed, no company, a company we cannot find on the customer list,
// or too many sheets to be sure: all of those show the normal R499.
//
// The job system still makes the final call when the job is made, and the
// invoice follows that. This only stops the page promising "free" too early.

// How many of a company's AMBER sheets the price check reads. If it reads
// this many and none has a job number yet, it cannot be sure, so it says so.
export const FREE_JOB_CHECK_LIMIT = 200;

/**
 * The price check's answer to "has this company already had its free job?".
 *   true  = yes, it has (charge R499)
 *   false = no, confirmed never (show "free")
 *   null  = cannot be sure (show R499)
 *
 * @param {{company?: string, customerFound?: boolean, sheetJobNumbers?: Array<any>, readLimit?: number}} args
 */
export function firstJobAnswer({
  company = "",
  customerFound = false,
  sheetJobNumbers = [],
  readLimit = FREE_JOB_CHECK_LIMIT,
} = {}) {
  if (!String(company).trim()) return null;
  if (!customerFound) return null;
  if (sheetJobNumbers.some((n) => !!n)) return true;
  if (sheetJobNumbers.length >= readLimit) return null;
  return false;
}

/** True only when the price check has CONFIRMED the first job is free. */
export function freeJobConfirmed(terms) {
  return terms?.companyHasHadFreeJob === false;
}

/** The price the AMBER page shows, from whatever the price check said. */
export function priceShownToCustomer(terms) {
  return priceReproJob({ companyHasHadFreeJob: !freeJobConfirmed(terms) });
}

/**
 * RETIRED 26 Oct 2026. AMBER no longer sells plates, so nothing calls this.
 * Kept for a moment in case an older job sheet needs reading back.
 * Plate pricing lives in lib/pricing.js and lib/plate-size.mjs.
 */
export function pricePlatesJob({ areaCm2, ratePerCm2 }) {
  const area = Number(areaCm2);
  const rate = Number(ratePerCm2);
  if (!(area > 0) || !(rate > 0)) {
    return { exclVat: 0, vat: 0, inclVat: 0, free: false, note: null, customerText: null };
  }
  const exclVat = round2(area * rate);
  const vat = round2((exclVat * VAT_PERCENT) / 100);
  return {
    exclVat,
    vat,
    inclVat: round2(exclVat + vat),
    free: false,
    note: null,
    customerText: formatRand(exclVat) + " excl VAT",
  };
}

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function formatRand(n) {
  return "R" + Number(n).toFixed(2);
}

/** A third round of changes and beyond is quoted before we start. */
export const EXTRA_REVISIONS_NOTE = "More changes are quoted first";
