// Flavours (variants) and trapping on an AMBER job.
//
// WHAT WAS WRONG (Cam, 13 Nov 2026): a customer with the same bag in
// Chocolate, Strawberry and Banana had to fill the whole form in three times,
// once per flavour, even though only the inks and the barcode change. And
// there was nowhere to say how much trapping their printer wants.
//
// WHAT IT DOES NOW:
//   - "Add a flavour" works like Variants on the job system's workticket: the
//     print spec is typed once, and each flavour has only its own name, inks
//     (up to 10, in print order) and barcode. The first click moves the inks
//     and barcode already typed into flavour 1 and adds a blank flavour 2.
//     Taking it back down to one flavour puts that flavour's inks and barcode
//     back in the normal boxes.
//   - Each flavour is R499 excl VAT (Cam's pick, 13 Nov 2026: "R499 per
//     flavour"), the same as the page always promised ("another flavour is its
//     own job"). A first free job covers the first flavour only.
//   - An optional "Trapping" box takes a figure in mm, for example 0.2.
//
// The flavours are saved on the job sheet as spec.variants, in the job
// system's own shape: [{ id, name, colours: [...], barcode }].
//
// ⚠ SWITCH: FLAVOURS_AND_TRAPPING_LIVE. The job system has to read
// spec.variants and spec.trappingMm before customers may type them, or the
// flavours would be lost on the way to the workticket. Until the MIS thread
// says its side is live, the switch is OFF: the page does not show the boxes
// and the server drops both fields. Turning it on is a one-line change.
//
// Pure functions, no imports, so the tests can load this file on its own.

export const FLAVOURS_AND_TRAPPING_LIVE = false;

/** Most flavours one AMBER job takes. */
export const MAX_FLAVOURS = 10;
/** Most inks one flavour takes, the same ten slots as the job system. */
export const MAX_INKS = 10;
/** The biggest trapping figure we accept, in mm. Real traps are 0.1 to 1.5. */
export const MAX_TRAPPING_MM = 5;

function str(v) {
  return String(v ?? "").trim();
}

function inkList(colours) {
  return (Array.isArray(colours) ? colours : [])
    .map((c) => str(c).slice(0, 60))
    .filter(Boolean)
    .slice(0, MAX_INKS);
}

let counter = 0;
/** A short id for a new flavour, like the job system's ("v" + time + random). */
export function newFlavourId(now = Date.now()) {
  counter = (counter + 1) % 1296;
  return "v" + now.toString(36) + counter.toString(36).padStart(2, "0");
}

/**
 * Keep only real flavours, cleaned: a name of 80 characters at most, up to
 * 10 inks with blanks removed, and a barcode of 40 characters at most. Never
 * more than 10 flavours. Anything that is not a flavour is dropped.
 */
export function cleanFlavours(input) {
  const list = Array.isArray(input) ? input : [];
  return list
    .filter((v) => v && typeof v === "object" && !Array.isArray(v))
    .slice(0, MAX_FLAVOURS)
    .map((v) => ({
      id: str(v.id).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || newFlavourId(),
      name: str(v.name).replace(/\s+/g, " ").slice(0, 80),
      colours: inkList(v.colours),
      barcode: str(v.barcode).slice(0, 40),
    }));
}

/** The flavours on a spec, or [] when it is a normal one-flavour job. */
export function flavoursOf(spec) {
  const list = Array.isArray(spec?.variants) ? spec.variants : [];
  return list.length >= 2 ? list : [];
}

/** How many flavours the job is charged for: 1 for a normal job. */
export function flavourCount(spec) {
  return flavoursOf(spec).length || 1;
}

/**
 * The first "Add a flavour": the inks and barcode already typed become
 * flavour 1, and a blank flavour 2 is added. Later clicks add one blank
 * flavour each, up to 10. Returns the fields to change on the spec.
 */
export function addFlavour(spec) {
  const current = flavoursOf(spec);
  if (current.length === 0) {
    return {
      variants: [
        { id: newFlavourId(), name: "", colours: inkList(spec?.colours), barcode: str(spec?.barcode) },
        { id: newFlavourId(), name: "", colours: [], barcode: "" },
      ],
      colours: [],
      barcode: "",
    };
  }
  if (current.length >= MAX_FLAVOURS) return {};
  return { variants: [...current, { id: newFlavourId(), name: "", colours: [], barcode: "" }] };
}

/** Change one flavour's name, inks or barcode. */
export function updateFlavour(spec, index, patch) {
  const current = flavoursOf(spec);
  if (index < 0 || index >= current.length) return {};
  return { variants: current.map((v, i) => (i === index ? { ...v, ...patch } : v)) };
}

/**
 * Take a flavour away. Down to one flavour, its inks and barcode go back into
 * the normal boxes and the flavour list is cleared, so a one-flavour job looks
 * exactly like it always did.
 */
export function removeFlavour(spec, index) {
  const current = flavoursOf(spec);
  if (index < 0 || index >= current.length) return {};
  const left = current.filter((_, i) => i !== index);
  if (left.length >= 2) return { variants: left };
  const only = left[0] || { colours: [], barcode: "" };
  return { variants: [], colours: inkList(only.colours), barcode: str(only.barcode) };
}

/**
 * What is still needed on the flavours, in plain English. Empty for a normal
 * one-flavour job. `inksNotSure` is true when the customer ticked "Not sure,
 * AMBER suggests" for the inks, which then covers every flavour.
 */
export function flavourGaps(spec, { inksNotSure = false } = {}) {
  const list = flavoursOf(spec);
  const out = [];
  const seen = new Map();
  list.forEach((v, i) => {
    const name = str(v?.name);
    const label = name || `flavour ${i + 1}`;
    if (!name) out.push(`Name of flavour ${i + 1}`);
    else {
      const key = name.toLowerCase();
      if (seen.has(key)) out.push(`A different name for flavour ${i + 1} (${name} is used twice)`);
      seen.set(key, true);
    }
    if (!inksNotSure && inkList(v?.colours).length === 0) out.push(`Inks for ${label}`);
  });
  return out;
}

/**
 * Read a trapping figure the way people type it: "0.2", "0,2", "0.2 mm".
 * Returns the number, null when blank, or NaN when it is not a sensible trap
 * (not a number, zero or less, or more than 5 mm).
 */
export function parseTrappingMm(v) {
  const s = str(v).toLowerCase().replace(/\s*mm$/, "").replace(",", ".");
  if (s === "") return null;
  if (!/^\d*\.?\d+$/.test(s)) return NaN;
  const n = Number(s);
  if (!(n > 0) || n > MAX_TRAPPING_MM) return NaN;
  return n;
}

/** The trapping gap in plain English, or null when it is fine or blank. */
export function trappingGap(spec) {
  return Number.isNaN(parseTrappingMm(spec?.trappingMm))
    ? "Trapping in mm (a number up to 5, for example 0.2)"
    : null;
}

/**
 * The fields the server keeps for flavours and trapping. While the switch is
 * off, neither is kept, so nothing can reach the job system that it would
 * drop. `live` is only there so the tests can try both.
 */
export function cleanFlavourFields(input, { live = FLAVOURS_AND_TRAPPING_LIVE } = {}) {
  if (!live) return {};
  const out = {};
  if (input && "variants" in input) {
    const list = cleanFlavours(input.variants);
    out.variants = list.length >= 2 ? list : [];
  }
  if (input && "trappingMm" in input) out.trappingMm = str(input.trappingMm).slice(0, 20);
  return out;
}
