// Tests for the three pack questions on the AMBER upload form (Cam, 24 Nov
// 2026): food contact, recycling claim, colour approval. Optional, "Not sure"
// is an answer, only listed answers are kept, and the staff screen shows them
// in plain words.
//
// Every test here is mutation-tested by tests/mutate.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  NOT_SURE,
  PACK_KEYS,
  PACK_QUESTIONS,
  cleanPackAnswers,
  packAnswerLabel,
  packAnswerLines,
} from "../lib/pack-questions.mjs";
import { REQUIRED_FIELDS, NOT_SURE_ALLOWED } from "../lib/amber-spec.mjs";

const read = (p) => readFileSync(p, "utf8");

test("the three questions, their stored names and answers, as agreed with the tools engine", () => {
  assert.deepEqual([...PACK_KEYS], ["foodContact", "recyclableClaim", "colourApproval"]);
  const values = (k) => PACK_QUESTIONS.find((q) => q.key === k).options.map((o) => o.value);
  assert.deepEqual(values("foodContact"), ["no", "inside", "printedSide", "notSure"]);
  assert.deepEqual(values("recyclableClaim"), ["no", "yes", "notSure"]);
  assert.deepEqual(values("colourApproval"), ["screen", "office", "printerProof", "pressCheck", "notSure"]);
  assert.equal(NOT_SURE, "notSure");
});

test("the questions read as Cam's brief says, with the colour help line", () => {
  const q = Object.fromEntries(PACK_QUESTIONS.map((x) => [x.key, x]));
  assert.equal(q.foodContact.label, "Will food touch the pack?");
  assert.equal(q.recyclableClaim.label, "Will the pack say it is recyclable, or carry a recycling logo?");
  assert.equal(q.colourApproval.label, "How do you expect to approve colour?");
  assert.equal(q.colourApproval.hint,
    "Colour on a screen or office print is a guide only; brand colours are approved on the real material.");
  assert.equal(packAnswerLabel("foodContact", "printedSide"), "Yes, on the printed side (for example a wrap or tray face)");
  for (const x of PACK_QUESTIONS) {
    assert.equal(x.options[x.options.length - 1].label, "Not sure", `${x.key} ends with Not sure`);
  }
});

test("none of them can hold a job: not required, not on the job system's Not sure list", () => {
  for (const k of PACK_KEYS) {
    assert.equal(REQUIRED_FIELDS.some((f) => f.key === k), false);
    assert.equal(NOT_SURE_ALLOWED.includes(k), false);
  }
});

test("only listed answers are kept; anything else is dropped", () => {
  assert.deepEqual(
    cleanPackAnswers({ foodContact: "printedSide", recyclableClaim: "yes", colourApproval: "screen", other: "x" }),
    { foodContact: "printedSide", recyclableClaim: "yes", colourApproval: "screen" },
  );
  assert.deepEqual(cleanPackAnswers({ foodContact: "Yes!", recyclableClaim: "printedSide", colourApproval: 3 }), {});
  assert.deepEqual(cleanPackAnswers({ foodContact: "notSure" }), { foodContact: "notSure" });
  assert.deepEqual(cleanPackAnswers({ foodContact: ["no"] }), {});
  assert.deepEqual(cleanPackAnswers(null), {});
  assert.deepEqual(cleanPackAnswers("no"), {});
  assert.equal(packAnswerLabel("foodContact", "made-up"), "");
  assert.equal(packAnswerLabel("noSuchQuestion", "no"), "");
});

test("the staff screen lines are in the form's order, answered ones only", () => {
  assert.deepEqual(packAnswerLines({ colourApproval: "office", foodContact: "inside", other: 1 }), [
    "Food touches the pack: Yes, on the inside",
    "Colour approved by: Office print",
  ]);
  assert.deepEqual(packAnswerLines({ recyclableClaim: "notSure" }), ["Says it is recyclable: Not sure"]);
  assert.deepEqual(packAnswerLines({ foodContact: "bad" }), []);
  assert.deepEqual(packAnswerLines(undefined), []);
});

test("the server keeps the answers through the one cleaner", () => {
  const route = read("app/api/amber/submission/route.js");
  assert.match(route, /import \{ cleanInspectionAnswers, cleanLaminate, cleanPackAnswers \} from "@\/lib\/pack-questions\.mjs";/);
  assert.match(route, /Object\.assign\(out, cleanPackAnswers\(input\)\);/);
});

test("the upload form asks all three, optional, from the one list", () => {
  const page = read("app/amber/page.jsx");
  assert.match(page, /\{PACK_QUESTIONS\.map\(\(q\) => \(/);
  assert.match(page, /<ChooseValued key=\{q\.key\} label=\{`\$\{q\.label\} \(optional\)`\} hint=\{q\.hint\}/);
  assert.match(page, /onChange=\{\(v\) => update\(\{ \[q\.key\]: v \}\)\}/);
  assert.match(page, /<Field label=\{label\} hint=\{hint \|\| undefined\}>/);
});

test("the staff file-check screen shows the answers in plain words, not as raw names", () => {
  const page = read("app/staff/file-checks/page.jsx");
  assert.match(page, /packAnswerLines\(spec\)\.map\(\(line\) => <li key=\{line\}>\{line\}<\/li>\)/);
  assert.match(page, /!PACK_KEYS\.includes\(k\)/);
});

// ─── Laminate, film jobs only (Cam, 24 Nov 2026 evening) ───
import {
  FILM_MATERIALS,
  LAMINATE_KEYS,
  LAMINATE_QUESTION,
  LAYERS_HINT,
  LAYERS_KEY,
  LAYERS_LABEL,
  MAX_LAYERS,
  cleanLaminate,
  isFilm,
} from "../lib/pack-questions.mjs";
import { MATERIAL_OPTIONS } from "../lib/amber-spec.mjs";

test("the laminate question is asked on films only, named as the form names them", () => {
  assert.deepEqual([...FILM_MATERIALS], [
    "PET", "PVC", "Clear BOPP", "White BOPP", "Clear LDPE", "White LDPE",
    "Polywoven Laminate", "Polypropylene", "Polyethylene", "Aluminum Foil",
  ]);
  for (const m of FILM_MATERIALS) assert.ok(MATERIAL_OPTIONS.includes(m), `${m} is on the form's list`);
  for (const m of ["White Paper", "Brown Paper", "Grease Proof Paper", "Polywoven", "Cardboard", "Label Stock"]) {
    assert.equal(isFilm(m), false, m);
  }
  assert.equal(isFilm("Clear BOPP"), true);
  assert.equal(isFilm("clear bopp"), false);
  assert.equal(isFilm(undefined), false);
});

test("the laminate question reads plainly and ends with Not sure", () => {
  assert.equal(LAMINATE_QUESTION.key, "laminated");
  assert.equal(LAMINATE_QUESTION.label, "Is the film laminated (two or more layers stuck together)?");
  assert.deepEqual(LAMINATE_QUESTION.options.map((o) => o.value), ["no", "yes", "notSure"]);
  assert.deepEqual(LAMINATE_QUESTION.options.map((o) => o.label), ["No, one layer", "Yes", "Not sure"]);
  assert.equal(LAYERS_KEY, "laminateLayers");
  assert.equal(LAYERS_LABEL, "Layers, outside first (optional)");
  assert.equal(LAYERS_HINT, "For example: 12 micron PET / 50 micron PE");
  assert.deepEqual([...LAMINATE_KEYS], ["laminated", "laminateLayers"]);
  assert.equal(MAX_LAYERS, 120);
});

test("the laminate answer is never required and never holds a job", () => {
  for (const k of LAMINATE_KEYS) {
    assert.equal(REQUIRED_FIELDS.some((f) => f.key === k), false);
    assert.equal(NOT_SURE_ALLOWED.includes(k), false);
    assert.equal(PACK_KEYS.includes(k), false, "the three engine questions stay as they are");
  }
});

test("only a listed laminate answer on a film job is kept; layers only when Yes", () => {
  assert.deepEqual(
    cleanLaminate({ material: "Clear BOPP", laminated: "yes", laminateLayers: "  20 micron BOPP /\n 25 micron CPP " }),
    { laminated: "yes", laminateLayers: "20 micron BOPP / 25 micron CPP" },
  );
  assert.deepEqual(cleanLaminate({ material: "PET", laminated: "no", laminateLayers: "12 PET / 50 PE" }), { laminated: "no" });
  assert.deepEqual(cleanLaminate({ material: "PET", laminated: "notSure", laminateLayers: "x" }), { laminated: "notSure" });
  assert.deepEqual(cleanLaminate({ material: "PET", laminated: "yes", laminateLayers: "   " }), { laminated: "yes" });
  assert.deepEqual(cleanLaminate({ material: "PET", laminated: "yes" }), { laminated: "yes" });
  assert.deepEqual(cleanLaminate({ material: "PET", laminated: "yes", laminateLayers: 12 }), { laminated: "yes" });
  // Not a film: nothing kept, even a good answer (the customer changed the material).
  assert.deepEqual(cleanLaminate({ material: "Brown Paper", laminated: "yes", laminateLayers: "12 PET" }), {});
  assert.deepEqual(cleanLaminate({ laminated: "yes" }), {});
  // Made-up answers: nothing kept.
  assert.deepEqual(cleanLaminate({ material: "PET", laminated: "maybe", laminateLayers: "12 PET" }), {});
  assert.deepEqual(cleanLaminate({ material: "PET", laminated: ["yes"] }), {});
  assert.deepEqual(cleanLaminate(null), {});
  assert.deepEqual(cleanLaminate("yes"), {});
});

test("the layers are one line of plain text, cut at 120", () => {
  const long = "12 micron PET / ".repeat(20);
  const kept = cleanLaminate({ material: "PET", laminated: "yes", laminateLayers: long }).laminateLayers;
  assert.equal(kept.length, 120);
  assert.equal(kept, long.replace(/\s+/g, " ").trim().slice(0, 120));
  assert.equal(
    cleanLaminate({ material: "PET", laminated: "yes", laminateLayers: "<b>12 PET</b>\u0007 — 50 PE–foil" }).laminateLayers,
    "12 PET, 50 PE, foil",
  );
});

test("the staff screen shows the laminate lines after the three, on film jobs only", () => {
  assert.deepEqual(
    packAnswerLines({ material: "White BOPP", foodContact: "no", laminated: "yes", laminateLayers: "12 PET / 50 PE" }),
    ["Food touches the pack: No", "Laminated: Yes", "Layers, outside first: 12 PET / 50 PE"],
  );
  assert.deepEqual(packAnswerLines({ material: "PET", laminated: "no" }), ["Laminated: No, one layer"]);
  assert.deepEqual(packAnswerLines({ material: "Cardboard", laminated: "yes", laminateLayers: "x" }), []);
});

test("the server keeps the laminate answer through its cleaner", () => {
  const route = read("app/api/amber/submission/route.js");
  assert.match(route, /import \{ cleanInspectionAnswers, cleanLaminate, cleanPackAnswers \} from "@\/lib\/pack-questions\.mjs";/);
  assert.match(route, /Object\.assign\(out, cleanLaminate\(input\)\);/);
});

test("the form asks the laminate question on films, and the layers only on Yes", () => {
  const page = read("app/amber/page.jsx");
  assert.match(page, /\{isFilm\(spec\.material\) && \(\s*<div data-laminate-question>/);
  assert.match(page, /\{isFilm\(spec\.material\) && spec\[LAMINATE_QUESTION\.key\] === "yes" && \(\s*<div data-laminate-layers>/);
  assert.match(page, /value=\{spec\[LAMINATE_QUESTION\.key\]\} options=\{LAMINATE_QUESTION\.options\}/);
  assert.match(page, /onChange=\{\(v\) => update\(\{ \[LAMINATE_QUESTION\.key\]: v \}\)\}/);
  assert.match(page, /<Text label=\{LAYERS_LABEL\} hint=\{LAYERS_HINT\}\s*value=\{spec\[LAYERS_KEY\]\} onChange=\{\(v\) => update\(\{ \[LAYERS_KEY\]: v \}\)\}/);
});

test("the staff screen does not show the laminate answer twice as raw names", () => {
  assert.match(read("app/staff/file-checks/page.jsx"), /!LAMINATE_KEYS\.includes\(k\)/);
});

// ─── Print inspection and pharma (Cam, 24 Nov 2026 evening, "1/2/3") ───
import { INSPECTION_KEYS, INSPECTION_QUESTIONS, cleanInspectionAnswers } from "../lib/pack-questions.mjs";

test("the two inspection questions read as the spotter note asks", () => {
  assert.deepEqual([...INSPECTION_KEYS], ["printInspection", "pharmaPack"]);
  const q = Object.fromEntries(INSPECTION_QUESTIONS.map((x) => [x.key, x]));
  assert.equal(q.printInspection.label, "Does your printer run 100% print inspection (a camera that checks every metre)?");
  assert.deepEqual(q.printInspection.options.map((o) => [o.value, o.label]), [["yes", "Yes"], ["no", "No"], ["notSure", "Not sure"]]);
  assert.equal(q.pharmaPack.label, "Is this a pharmaceutical or medical pack?");
  assert.deepEqual(q.pharmaPack.options.map((o) => [o.value, o.label]), [["no", "No"], ["yes", "Yes"]]);
  assert.equal(q.printInspection.hint, "");
  assert.equal(q.pharmaPack.hint, "");
});

test("the inspection questions never hold a job and stay off the engine's three", () => {
  for (const k of INSPECTION_KEYS) {
    assert.equal(REQUIRED_FIELDS.some((f) => f.key === k), false);
    assert.equal(NOT_SURE_ALLOWED.includes(k), false);
    assert.equal(PACK_KEYS.includes(k), false);
  }
});

test("only listed inspection answers are kept", () => {
  assert.deepEqual(cleanInspectionAnswers({ printInspection: "yes", pharmaPack: "no", foodContact: "no" }),
    { printInspection: "yes", pharmaPack: "no" });
  assert.deepEqual(cleanInspectionAnswers({ printInspection: "notSure" }), { printInspection: "notSure" });
  assert.deepEqual(cleanInspectionAnswers({ pharmaPack: "notSure", printInspection: "maybe" }), {});
  assert.deepEqual(cleanInspectionAnswers({ printInspection: ["yes"], pharmaPack: true }), {});
  assert.deepEqual(cleanInspectionAnswers(null), {});
  assert.deepEqual(cleanInspectionAnswers(undefined), {});
});

test("the staff screen shows the inspection answers last, in plain words", () => {
  assert.deepEqual(
    packAnswerLines({ material: "PET", laminated: "no", pharmaPack: "yes", printInspection: "notSure", colourApproval: "screen" }),
    ["Colour approved by: On screen", "Laminated: No, one layer",
      "Printer runs camera inspection: Not sure", "Pharmaceutical or medical pack: Yes"],
  );
  assert.deepEqual(packAnswerLines({ pharmaPack: "maybe" }), []);
});

test("the server keeps the inspection answers, the form asks them, the staff screen skips the raw names", () => {
  assert.match(read("app/api/amber/submission/route.js"), /Object\.assign\(out, cleanInspectionAnswers\(input\)\);/);
  const page = read("app/amber/page.jsx");
  assert.match(page, /\{INSPECTION_QUESTIONS\.map\(\(q\) => \(\s*<div key=\{q\.key\} data-inspection-question>/);
  assert.match(page, /<ChooseValued label=\{`\$\{q\.label\} \(optional\)`\} hint=\{q\.hint\}\s*value=\{spec\[q\.key\]\} options=\{q\.options\}\s*onChange=\{\(v\) => update\(\{ \[q\.key\]: v \}\)\} \/>\s*<\/div>\s*\)\)\}\s*\{\/\* Film jobs only/);
  assert.match(read("app/staff/file-checks/page.jsx"), /!INSPECTION_KEYS\.includes\(k\)/);
});
