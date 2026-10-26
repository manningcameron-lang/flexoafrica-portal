// How a plate order turns into FA jobs.
//
// ⛔ ONE FA JOB PER PLATE LINE. NEVER ONE PER COLOUR.
//
// Until 26 Oct 2026 this made a separate FA job for every colour the customer
// ticked, so a four-colour job arrived in the MIS as four FA jobs with four
// job numbers. Flexo Africa invoices one FA number once, so somebody had to
// merge them by hand on every single portal order. A plate line is ONE piece
// of artwork, so it is one job; the colours ticked on it are that job's
// colour list and its plate list. Cam 2026-10-26.
//
// Pure functions only, no Firebase and no Next, so the test suite can prove
// every rule in here without a network or a login.

// The MIS job screen has ten colour boxes (Colours 1 to 10). We still accept
// an order with more than that, but anything past the tenth is also written
// into the job description so it can never go missing off the job sheet.
export const MAX_COLOURS_ON_A_JOB_SHEET = 10;

// Process colours are always listed in printing order, then the spots in the
// order the customer ticked them. Fixed order means the job sheet reads the
// same way every time, and the tests can pin it.
const PROCESS_ORDER = ["cmyk:C", "cmyk:M", "cmyk:Y", "cmyk:K"];

const PROCESS_NAMES = { C: "Cyan", M: "Magenta", Y: "Yellow", K: "Black" };

/** "cmyk:C" → "Cyan", "spot:Pantone 485 C" → "Pantone 485 C". */
export function labelForColorKey(key) {
  if (!key) return "";
  if (key.startsWith("cmyk:")) {
    const ch = key.slice(5);
    return PROCESS_NAMES[ch] || ch;
  }
  if (key.startsWith("spot:")) return key.slice(5);
  return key;
}

/**
 * The colour keys the customer actually ticked on one plate line, process
 * first and then spots, with nothing counted twice.
 */
export function tickedColourKeys(lineItem) {
  const selected = lineItem?.selectedColors || {};
  const ticked = Object.keys(selected).filter((key) => selected[key]);
  const process = PROCESS_ORDER.filter((key) => ticked.includes(key));
  const spots = ticked.filter((key) => !PROCESS_ORDER.includes(key));
  return [...process, ...spots];
}

/** The colour names for one plate line, in the same fixed order. */
export function coloursForLineItem(lineItem) {
  return tickedColourKeys(lineItem).map(labelForColorKey);
}

/**
 * The plate rows for one plate line: one row per ticked colour, each sized
 * from the line's print dimensions in millimetres (the MIS plate list is in
 * mm). A line with nothing ticked yet still gets one blank row, which is how
 * it has always behaved.
 */
export function plateRowsForLineItem(lineItem) {
  const widthMm = cmToMm(lineItem?.widthCm);
  const lengthMm = cmToMm(lineItem?.heightCm);
  const keys = tickedColourKeys(lineItem);
  if (keys.length === 0) {
    return [{ key: "", colour: "", width: widthMm, length: lengthMm, active: true }];
  }
  return keys.map((key) => ({
    key,
    colour: labelForColorKey(key),
    width: widthMm,
    length: lengthMm,
    active: true,
  }));
}

/**
 * What the job is called on the job sheet. The customer's own words win; if
 * they gave none we fall back to whatever the caller worked out from the
 * plate type and size. The colour is NOT bolted on the end any more, because
 * one job now covers every colour on the line.
 *
 * If there are more colours than the MIS has boxes for, every colour is also
 * spelled out here, so a job sheet can never quietly lose one.
 */
export function descriptionForLineItem(lineItem, fallback = "") {
  const own =
    String(lineItem?.description || "").trim() ||
    String(lineItem?.specialInstructions || "").trim() ||
    String(fallback || "").trim();
  const colours = coloursForLineItem(lineItem);
  if (colours.length > MAX_COLOURS_ON_A_JOB_SHEET) {
    return `${own} (colours: ${colours.join(", ")})`.trim();
  }
  return own;
}

/**
 * The jobs one order becomes. Exactly one entry per plate line, in the order
 * the customer built them. This is the whole point of the file: the length of
 * what comes back must follow the number of LINES, never the number of ticks.
 */
export function jobsForOrder(lineItems = [], fallbacks = []) {
  return lineItems.map((lineItem, index) => ({
    lineIndex: index,
    description: descriptionForLineItem(lineItem, fallbacks[index] || ""),
    colours: coloursForLineItem(lineItem),
    colourKeys: tickedColourKeys(lineItem),
    plates: plateRowsForLineItem(lineItem),
  }));
}

function cmToMm(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n * 10 : 0;
}
