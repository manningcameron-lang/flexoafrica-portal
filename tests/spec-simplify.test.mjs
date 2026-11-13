// Tests for the shorter AMBER form.
//
// Run them with:  npm test
//
// WHAT WAS WRONG (Cam, 11 Nov 2026): the AMBER page asked customers for
// Press, Plate thickness, Screen ruling and Distortion. Most portal customers
// are first-timers who do not know those: they belong to the PRINTER, and
// Flexo Africa knows them or finds them out. A customer who guessed put a
// wrong value on the workticket; one who did not know was stuck.
//
// WHAT IT DOES NOW: those four boxes are gone from the form. At Submit the
// three the job system needs are handed over as WAITING ON US, so the job is
// still made, lands with Flexo Africa to fill in, and the 24 hours starts
// once they are in. The customer is told exactly that, by page and by email.
//
// Every test here is mutation-tested by tests/mutate.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  REQUIRED_FIELDS,
  WE_FILL_FIELDS,
  NOT_SURE_ALLOWED,
  missingSpecFields,
  notSureFields,
  notSureForMis,
} from "../lib/amber-spec.mjs";
import { buildEmail, JOB_RECEIVED } from "../lib/amber-emails.mjs";

const read = (p) => readFileSync(p, "utf8");

const SPEC = {
  description: "Klipdrif Charcoal 4kg",
  printer: "Crown Bag",
  bagType: "SO Bag",
  material: "Brown Paper",
  printSide: "Surface",
  widthMm: 330,
  pitchMm: 660,
  across: 1,
  around: 1,
  cylinder: "660",
  printDirection: "Top to Bottom",
  colours: ["Black", "PANTONE 485 C"],
};

// ─── the form asks less ──────────────────────────────────────────────────────

test("form: press, plate thickness, screen ruling and distortion are not asked", () => {
  const keys = REQUIRED_FIELDS.map((f) => f.key);
  for (const gone of ["press", "plateThickness", "screenRuling", "plateDistortion"]) {
    assert.equal(keys.includes(gone), false, gone);
  }
});

test("form: everything Cam ticked is still asked", () => {
  const keys = REQUIRED_FIELDS.map((f) => f.key);
  for (const kept of ["description", "bagType", "material", "printSide",
    "widthMm", "pitchMm", "across", "around", "cylinder", "printDirection", "colours"]) {
    assert.equal(keys.includes(kept), true, kept);
  }
});

test("form: a job with none of the four boxes is complete for the customer", () => {
  const sub = { files: [{ path: "a.pdf" }], notSure: [], spec: { ...SPEC } };
  assert.deepEqual(missingSpecFields(sub), []);
});

test("form: the page no longer shows the four boxes", () => {
  const page = read("app/amber/page.jsx");
  assert.equal(page.includes('label="Press"'), false);
  assert.equal(page.includes('label="Plate thickness"'), false);
  assert.equal(page.includes('label="Screen ruling"'), false);
  assert.equal(page.includes('label="Distortion"'), false);
  assert.ok(page.includes('<Text label="Printer (if you know it)" hint="Who prints it, for example Bright Bag Printers. Leave it blank if you are not sure"'));
});

// ─── the job system is told those boxes wait on us ───────────────────────────

test("handover: the three boxes the job system needs are parked with us", () => {
  assert.deepEqual(WE_FILL_FIELDS.map((f) => f.key), ["plateThickness", "screenRuling", "plateDistortion"]);
  const sub = { files: [{ path: "a.pdf" }], notSure: [], spec: { ...SPEC } };
  assert.deepEqual(notSureForMis(sub), ["plateThickness", "screenRuling", "plateDistortion"]);
});

test("handover: the job system is allowed to accept every one of them as Not sure", () => {
  for (const f of WE_FILL_FIELDS) assert.equal(NOT_SURE_ALLOWED.includes(f.key), true, f.key);
});

test("handover: a value already on the sheet is kept, not parked", () => {
  const sub = { files: [{ path: "a" }], notSure: [], spec: { ...SPEC, plateThickness: "125 thou", screenRuling: " " } };
  assert.deepEqual(notSureForMis(sub), ["screenRuling", "plateDistortion"]);
});

test("handover: what the customer ticked Not sure is kept, once", () => {
  const sub = { files: [{ path: "a" }], notSure: ["colours", "plateDistortion"], spec: { ...SPEC, colours: [] } };
  assert.deepEqual(notSureForMis(sub), ["colours", "plateDistortion", "plateThickness", "screenRuling"]);
});

test("handover: the parked boxes have names for the team", () => {
  const sub = { files: [{ path: "a" }], notSure: ["plateThickness", "screenRuling"], spec: { ...SPEC } };
  assert.deepEqual(notSureFields(sub), ["Plate thickness", "Screen ruling"]);
});

test("handover: Submit saves the list on the sheet before asking the job system", () => {
  const route = read("app/api/amber/submit/route.js");
  assert.ok(route.includes("const notSureNow = notSureForMis(submission);"));
  assert.ok(route.includes("const patch = { notSure: notSureNow, updatedAt: new Date() };"));
  assert.ok(route.includes("await ref.update(patch);"));
  assert.ok(route.indexOf("notSureForMis(submission)") < route.indexOf("await fetch(MIS_JOB_URL"));
});

// ─── the customer is told the truth ──────────────────────────────────────────

test("customer: a job waiting on us still gets an email with its number", () => {
  const route = read("app/api/amber/submit/route.js");
  assert.ok(route.includes('if ((answer.outcome === "made" || answer.outcome === "made_waiting_on_us") && !answer.again) {'));
  assert.ok(route.includes('kind: answer.outcome === "made" ? JOB_MADE : JOB_RECEIVED,'));
});

test("customer: that email promises no time it cannot keep", () => {
  const got = buildEmail(JOB_RECEIVED, { jobNumber: "FA005460", jobName: "Klipdrif Charcoal 4kg", link: "https://portal.flexoafrica.com/jobs" });
  assert.equal(got.subject, "Your job FA005460 is with AMBER");
  assert.ok(got.text.includes("Got it. Your job is FA005460, Klipdrif Charcoal 4kg. We are confirming your printer and its plate settings"));
  assert.ok(got.text.includes("within 24 working hours of that"));
  assert.deepEqual(got.copyTo, []);
});

test("customer: the page says the same thing after Submit", () => {
  const page = read("app/amber/page.jsx");
  assert.ok(page.includes("We are confirming your printer and its plate settings, and AMBER starts as soon as they are in."));
  assert.equal(page.includes("You told us you were not sure about a few press details"), false);
});

// ─── Printer is optional (MIS PR #72 live 11 Nov 2026) ───────────────────────

test("printer: a customer who does not know their printer can still send the job", () => {
  const sub = { files: [{ path: "a.pdf" }], notSure: [], spec: { ...SPEC, printer: "" } };
  assert.deepEqual(missingSpecFields(sub), []);
  assert.equal(REQUIRED_FIELDS.some((f) => f.key === "printer"), false);
});

test("printer: a blank printer is not faked as Not sure (the job system handles blank)", () => {
  const sub = { files: [{ path: "a.pdf" }], notSure: [], spec: { ...SPEC, printer: "" } };
  assert.equal(notSureForMis(sub).includes("printer"), false);
});

test("printer: the box says it is optional", () => {
  const page = read("app/amber/page.jsx");
  assert.ok(page.includes('label="Printer (if you know it)"'));
  assert.equal(page.includes('<Text label="Printer" '), false);
});
