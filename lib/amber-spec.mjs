// The press details a customer gives AMBER, and what counts as "complete".
//
// ⚠ The field NAMES and the dropdown CHOICES below are copied from the MIS
// Print Specification boxes (components/JobDetail.jsx and lib/constants.js on
// jobs.flexoafrica.com) so a portal job drops straight into a workticket with
// nothing to re-type or translate. Do NOT invent values here. If the MIS list
// changes, change this one to match.
//
// Read from the live MIS on 26 Oct 2026. The MIS has FOURTEEN print-spec
// boxes. Two of them (gap across / gap around) only appear for Labels.
//
// ⚠ CORRECTED 26 Oct 2026. An earlier version of this file claimed the MIS had
// no gear or teeth boxes. That was read off a copy of the MIS that was about
// eighteen changes out of date. The LIVE job screen has BOTH: "Press gear"
// (CP or DP) and "Teeth" (a number), alongside the free-text Cylinder box. The
// values below were read off that live screen, not off the stale copy.

export const TYPE_OPTIONS = [
  "SO Bag", "PSV Bag", "OMP Bag", "OMS Bag", "Pinch Bottom Bag", "Wraparound",
  "Shrink Sleeve", "Die Cut Box", "Stretch Sleeve", "Baler Bag",
  "Fill Form and Seal Bag", "Basewrap", "Label", "Pouch", "6mm Straw",
  "8mm Straw", "10mm Straw", "GP Ream", "1 Ply Serviette", "2 Ply Serviette",
  "Woven Bag",
];

export const MATERIAL_OPTIONS = [
  "White Paper", "Brown Paper", "Grease Proof Paper", "PET", "PVC",
  "Polywoven", "Cardboard", "Clear BOPP", "White BOPP", "Label Stock",
  "Clear LDPE", "White LDPE", "Polywoven Laminate", "Polypropylene",
  "Polyethylene", "Aluminum Foil",
];

export const PLATE_THICKNESS_OPTIONS = [
  "45 thou", "67 thou", "100 thou", "112 thou", "125 thou", "155 thou",
  "185 thou", "250 thou", "Gold A", "NYLOFLEX WS 11 73 635 x 815",
];

// Press gear. Stored as the short code, shown with the pitch so the customer
// can tell which one their press is.
export const GEAR_PITCH_OPTIONS = [
  { value: "CP", label: "CP (1/8 inch, 3.175 mm per tooth)" },
  { value: "DP", label: "DP (32 DP, 2.494 mm per tooth)" },
];

export const SCREEN_RULING_OPTIONS = [
  "45#", "55#", "65#", "75#", "85#", "90#", "100#", "110#", "120#", "126#",
  "133#", "150#",
];

export const PLATE_DISTORTION_OPTIONS = [
  "-6.6mm", "-9.9mm", "-15.16mm", "-17.08mm", "-19.15mm", "-28.73mm", "-39.10mm",
];

export const PRINT_DIRECTION_OPTIONS = ["Left to Right", "Top to Bottom"];
export const PRINT_SIDE_OPTIONS = ["Surface", "Reverse"];

// Which boxes the customer ticked "Not sure" on.
//
// ⚠ This is a LIST OF FIELD KEYS kept beside the spec, not a magic value
// written into the spec itself. The MIS reads it as `notSure: ["plateDistortion",
// "colours"]`. Keeping it separate means a spec value is always a real value,
// so nothing downstream can mistake a marker for an answer.
//
// A "Not sure" is an ANSWER, not a blank: it does not hold the job up, it
// means we work that box out and the 24 hours starts once it is filled in.

export const NOT_SURE_LABELS = {
  plateDistortion: "Not sure, work it out with me",
  colours: "Not sure, AMBER suggests",
  cylinder: "Not sure, work it out with me",
  cylinderTeeth: "Not sure, work it out with me",
  gearPitch: "Not sure, work it out with me",
  screenRuling: "Not sure, work it out with me",
  plateThickness: "Not sure, work it out with me",
};

// Only these boxes may be answered "Not sure". A customer cannot shrug at the
// job name or the artwork.
export const NOT_SURE_ALLOWED = Object.keys(NOT_SURE_LABELS);

export const REQUIRED_FIELDS = [
  { key: "description",     label: "Job name" },
  { key: "printer",         label: "Printer" },
  { key: "press",           label: "Press" },
  { key: "bagType",         label: "Product type" },
  { key: "material",        label: "Material" },
  { key: "printSide",       label: "Print side" },
  { key: "widthMm",         label: "Width in mm" },
  { key: "pitchMm",         label: "Repeat (pitch) in mm" },
  { key: "across",          label: "Number across" },
  { key: "around",          label: "Number around" },
  { key: "plateThickness",  label: "Plate thickness" },
  { key: "screenRuling",    label: "Screen ruling" },
  { key: "cylinder",        label: "Cylinder or gear teeth" },
  { key: "plateDistortion", label: "Distortion" },
  { key: "printDirection",  label: "Print direction" },
  { key: "colours",         label: "Inks, in print order" },
];

// Gear and teeth are asked for on LABELS only, the same as the gap boxes.
// On a bag they are meaningless, so they are never on the missing list.
export const LABEL_ONLY_REQUIRED_FIELDS = [
  { key: "gearPitch",     label: "Press gear" },
  { key: "cylinderTeeth", label: "Teeth" },
];

// Boxes that are nice to have but never hold a job up.
export const OPTIONAL_FIELDS = [
  "barcode", "requiredBy", "poNumber", "instructions",
  "gapAcrossMm", "gapAroundMm",
];

function isBlank(value) {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.filter((v) => String(v ?? "").trim()).length === 0;
  return String(value).trim() === "";
}

/** The "Not sure" keys on a submission, cleaned of anything not allowed. */
export function notSureKeys(submission) {
  const raw = Array.isArray(submission?.notSure) ? submission.notSure : [];
  return raw.filter((k) => NOT_SURE_ALLOWED.includes(k));
}

/** Every box this submission must fill in, given what it is. */
export function requiredFieldsFor(submission) {
  const spec = submission?.spec || {};
  // Gear and teeth are a label thing. On a bag they mean nothing.
  return spec.bagType === "Label"
    ? [...REQUIRED_FIELDS, ...LABEL_ONLY_REQUIRED_FIELDS]
    : REQUIRED_FIELDS;
}

/**
 * What is still missing before this job can be made.
 *
 * A box the customer ticked "Not sure" on does NOT count as missing. It is an
 * answer, and it parks that box with us (see notSureFields).
 *
 * @param {object} submission
 * @param {{poRequired?: boolean}} [opts] PO-approved customers must give a PO
 * @returns {string[]} plain-English names, in the order the form asks them
 */
export function missingSpecFields(submission, opts = {}) {
  const s = submission || {};
  const spec = s.spec || {};
  const unsure = notSureKeys(s);
  const out = [];

  for (const field of requiredFieldsFor(s)) {
    if (unsure.includes(field.key)) continue;
    const value = field.key in spec ? spec[field.key] : s[field.key];
    if (isBlank(value)) out.push(field.label);
  }

  const files = Array.isArray(s.files) ? s.files : [];
  if (files.length === 0) out.push("Artwork file");

  if (opts.poRequired && isBlank(spec.poNumber ?? s.poNumber)) {
    out.push("PO number");
  }

  return out;
}

/** Which boxes the customer answered "Not sure" to, in plain English. */
export function notSureFields(submission) {
  const unsure = notSureKeys(submission);
  const all = [...REQUIRED_FIELDS, ...LABEL_ONLY_REQUIRED_FIELDS];
  return unsure
    .map((key) => all.find((f) => f.key === key)?.label)
    .filter(Boolean);
}

/** Everything is in and nothing is a "Not sure" — the 24 hours can start. */
export function isComplete(submission, opts = {}) {
  return (
    missingSpecFields(submission, opts).length === 0 &&
    notSureKeys(submission).length === 0
  );
}

/**
 * What the customer is shown as the job's state.
 *   waiting_details   - we need more from them
 *   waiting_flexo     - they said "Not sure", the ball is with us
 *   with_amber        - complete, the clock is running
 */
export function submissionStatus(submission, opts = {}) {
  if (missingSpecFields(submission, opts).length > 0) return "waiting_details";
  if (notSureKeys(submission).length > 0) return "waiting_flexo";
  return "with_amber";
}
