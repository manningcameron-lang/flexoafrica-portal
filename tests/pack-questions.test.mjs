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
  assert.match(route, /import \{ cleanPackAnswers \} from "@\/lib\/pack-questions\.mjs";/);
  assert.match(route, /Object\.assign\(out, cleanPackAnswers\(input\)\);/);
});

test("the upload form asks all three, optional, from the one list", () => {
  const page = read("app/amber/page.jsx");
  assert.match(page, /\{PACK_QUESTIONS\.map\(\(q\) => \(/);
  assert.match(page, /label=\{`\$\{q\.label\} \(optional\)`\} hint=\{q\.hint\}/);
  assert.match(page, /onChange=\{\(v\) => update\(\{ \[q\.key\]: v \}\)\}/);
  assert.match(page, /<Field label=\{label\} hint=\{hint \|\| undefined\}>/);
});

test("the staff file-check screen shows the answers in plain words, not as raw names", () => {
  const page = read("app/staff/file-checks/page.jsx");
  assert.match(page, /packAnswerLines\(spec\)\.map\(\(line\) => <li key=\{line\}>\{line\}<\/li>\)/);
  assert.match(page, /!PACK_KEYS\.includes\(k\)/);
});
