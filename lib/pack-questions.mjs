// Three short questions about the pack on the AMBER upload form (Cam, 24 Nov
// 2026, start-card pick "All three"):
//
//   1. Will food touch the pack?
//   2. Will the pack say it is recyclable, or carry a recycling logo?
//   3. How do you expect to approve colour?
//
// WHY: AMBER's issue spotter gained "10A Food contact and recycling" and a
// colour approval check (faults 91 to 94 and 100). She cannot see from a file
// which side of a bag touches the food, or whether the brand will print a
// recycling claim, so the customer's answer is what starts those checks. The
// tools engine reads them from the spec exactly as stored here (its note
// claude/tools-upload-check-faults-87-100-for-portal-2026-11-24.md):
// foodContact no / inside / printedSide, recyclableClaim no / yes,
// colourApproval screen / office / printerProof / pressCheck. "notSure"
// starts no check there.
//
// Every question is OPTIONAL and "Not sure" is one of the answers. None of
// them ever holds a job or starts the 24 hours late.
//
// Pure: no Firebase, no browser. Tested in tests/pack-questions.test.mjs.

export const NOT_SURE = "notSure";

export const PACK_QUESTIONS = Object.freeze([
  Object.freeze({
    key: "foodContact",
    label: "Will food touch the pack?",
    hint: "",
    shortLabel: "Food touches the pack",
    options: Object.freeze([
      Object.freeze({ value: "no", label: "No" }),
      Object.freeze({ value: "inside", label: "Yes, on the inside" }),
      Object.freeze({ value: "printedSide", label: "Yes, on the printed side (for example a wrap or tray face)" }),
      Object.freeze({ value: NOT_SURE, label: "Not sure" }),
    ]),
  }),
  Object.freeze({
    key: "recyclableClaim",
    label: "Will the pack say it is recyclable, or carry a recycling logo?",
    hint: "",
    shortLabel: "Says it is recyclable",
    options: Object.freeze([
      Object.freeze({ value: "no", label: "No" }),
      Object.freeze({ value: "yes", label: "Yes" }),
      Object.freeze({ value: NOT_SURE, label: "Not sure" }),
    ]),
  }),
  Object.freeze({
    key: "colourApproval",
    label: "How do you expect to approve colour?",
    hint: "Colour on a screen or office print is a guide only; brand colours are approved on the real material.",
    shortLabel: "Colour approved by",
    options: Object.freeze([
      Object.freeze({ value: "screen", label: "On screen" }),
      Object.freeze({ value: "office", label: "Office print" }),
      Object.freeze({ value: "printerProof", label: "A printed proof from the printer" }),
      Object.freeze({ value: "pressCheck", label: "Press check" }),
      Object.freeze({ value: NOT_SURE, label: "Not sure" }),
    ]),
  }),
]);

export const PACK_KEYS = Object.freeze(PACK_QUESTIONS.map((q) => q.key));

function question(key) {
  return PACK_QUESTIONS.find((q) => q.key === key) || null;
}

/**
 * Keep only the three answers, and only answers on the list. Anything else
 * (a made-up value, a number, a long text) is dropped, so nothing unexpected
 * reaches the record the job system and the tools engine trust.
 */
export function cleanPackAnswers(input) {
  const out = {};
  if (!input) return out;
  for (const q of PACK_QUESTIONS) {
    const v = input[q.key];
    if (q.options.some((o) => o.value === v)) out[q.key] = v;
  }
  return out;
}

/** The words a customer picked, for one answer; "" if not answered. */
export function packAnswerLabel(key, value) {
  const q = question(key);
  const o = q ? q.options.find((x) => x.value === value) : null;
  return o ? o.label : "";
}

/**
 * Plain lines for the staff screen, in the form's order, answered ones only:
 * "Food touches the pack: Yes, on the printed side (for example ...)".
 */
export function packAnswerLines(spec) {
  const clean = cleanPackAnswers(spec);
  return PACK_QUESTIONS.filter((q) => clean[q.key]).map(
    (q) => `${q.shortLabel}: ${packAnswerLabel(q.key, clean[q.key])}`,
  );
}
