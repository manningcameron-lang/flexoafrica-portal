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
// NOTE for Cam: the brief asked for separate "gear teeth" and "gear pitch"
// boxes. The MIS has neither. It has ONE free-text box called Cylinder, which
// is where teeth are written today (for example "93T"). So teeth go there and
// no new field is invented.

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
  "45 thou", "67 thou", "100 thou", "112 thou", "125 thou", "185 thou",
  "250 thou", "Gold A", "NYLOFLEX WS 11 73 635 x 815",
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

// The exact marker a customer's "Not sure" answer stores. It is NOT a missing
// answer (the job is not refused), it is an answer that parks the job with us.
export const NOT_SURE = "__not_sure__";

export const NOT_SURE_LABELS = {
  plateDistortion: "Not sure, work it out with me",
  colours: "Not sure, AMBER suggests",
  cylinder: "Not sure, work it out with me",
  screenRuling: "Not sure, work it out with me",
  plateThickness: "Not sure, work it out with me",
};

// Every box a workticket needs before AMBER can start, with the plain-English
// name the customer is shown in the "what is missing" list.
export const REQUIRED_FIELDS = [
  { key: "jobName",         label: "Job name" },
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

// Boxes that are nice to have but never hold a job up.
export const OPTIONAL_FIELDS = [
  "barcode", "requiredByDate", "poNumber", "instructions",
  "gapAcrossMm", "gapAroundMm",
];

function isBlank(value) {
  if (value === null || value === undefined) return true;
  // The "Not sure" marker counts as BLANK here on purpose. It is only ever
  // accepted as an answer by the one explicit guard in missingSpecFields, so
  // that letting it through is a decision somebody made and can see, rather
  // than an accident of the marker being a long string.
  if (isNotSure(value)) return true;
  if (Array.isArray(value)) return value.filter((v) => String(v ?? "").trim()).length === 0;
  return String(value).trim() === "";
}

function isNotSure(value) {
  if (Array.isArray(value)) return value.length === 1 && value[0] === NOT_SURE;
  return value === NOT_SURE;
}

/**
 * What is still missing before this job can be made.
 *
 * A "Not sure" answer does NOT count as missing. It is an answer, and it
 * parks the job with us instead (see notSureFields).
 *
 * @param {object} submission
 * @param {{poRequired?: boolean}} [opts] PO-approved customers must give a PO
 * @returns {string[]} plain-English names, in the order the form asks them
 */
export function missingSpecFields(submission, opts = {}) {
  const s = submission || {};
  const spec = s.spec || {};
  const out = [];

  for (const field of REQUIRED_FIELDS) {
    const value = field.key in spec ? spec[field.key] : s[field.key];
    if (isNotSure(value)) continue;
    if (isBlank(value)) out.push(field.label);
  }

  const files = Array.isArray(s.files) ? s.files : [];
  if (files.length === 0) out.push("Artwork file");

  if (opts.poRequired && isBlank(spec.poNumber ?? s.poNumber)) {
    out.push("PO number");
  }

  return out;
}

/** Which boxes the customer answered "Not sure" to. */
export function notSureFields(submission) {
  const s = submission || {};
  const spec = s.spec || {};
  const out = [];
  for (const field of REQUIRED_FIELDS) {
    const value = field.key in spec ? spec[field.key] : s[field.key];
    if (isNotSure(value)) out.push(field.label);
  }
  return out;
}

/** Everything is in and nothing is a "Not sure" — the 24 hours can start. */
export function isComplete(submission, opts = {}) {
  return (
    missingSpecFields(submission, opts).length === 0 &&
    notSureFields(submission).length === 0
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
  if (notSureFields(submission).length > 0) return "waiting_flexo";
  return "with_amber";
}
