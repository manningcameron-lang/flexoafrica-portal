// Tests for how a plate order turns into FA jobs.
//
// Run them with:  npm test
//
// THE FAULT THESE EXIST TO STOP: a four-colour plate order used to arrive in
// the MIS as FOUR separate FA jobs with four job numbers, so one order needed
// four invoices merged by hand. One plate line is one FA job. Cam 2026-10-26.
//
// Every test here is mutation-tested by tests/mutate.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  TRIM_CM,
  billedPlateDimensions,
  billedPlateMm,
  inkAreaForColour,
} from "../lib/plate-size.mjs";
import {
  MAX_COLOURS_ON_A_JOB_SHEET,
  coloursForLineItem,
  descriptionForLineItem,
  jobsForOrder,
  labelForColorKey,
  plateRowsForLineItem,
  tickedColourKeys,
} from "../lib/order-jobs.mjs";

// ─── helpers ──────────────────────────────────────────────────────────────

function line(selectedColors, extra = {}) {
  return { description: "Cereal box 500g", widthCm: 20, heightCm: 30, selectedColors, ...extra };
}

const CMYK = { "cmyk:C": true, "cmyk:M": true, "cmyk:Y": true, "cmyk:K": true };

// ─── THE REGRESSION: one job per line, never one per colour ───────────────

test("a four-colour line makes ONE job, not four", () => {
  const jobs = jobsForOrder([line(CMYK)]);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].plates.length, 4);
  assert.deepEqual(jobs[0].colours, ["Cyan", "Magenta", "Yellow", "Black"]);
});

test("three lines with 4, 1 and 2 colours make three jobs, not seven", () => {
  const jobs = jobsForOrder([
    line(CMYK),
    line({ "cmyk:K": true }),
    line({ "spot:Pantone 485 C": true, "cmyk:K": true }),
  ]);
  assert.equal(jobs.length, 3);
  assert.deepEqual(jobs.map((j) => j.plates.length), [4, 1, 2]);
});

test("ten colours on one line is still one job", () => {
  const ten = {};
  for (let i = 1; i <= 10; i++) ten[`spot:Ink ${i}`] = true;
  const jobs = jobsForOrder([line(ten)]);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].colours.length, 10);
});

test("the number of jobs follows the lines even when nothing is ticked", () => {
  const jobs = jobsForOrder([line({}), line({})]);
  assert.equal(jobs.length, 2);
});

// ─── colour names ─────────────────────────────────────────────────────────

test("process keys become printing names", () => {
  assert.equal(labelForColorKey("cmyk:C"), "Cyan");
  assert.equal(labelForColorKey("cmyk:M"), "Magenta");
  assert.equal(labelForColorKey("cmyk:Y"), "Yellow");
  assert.equal(labelForColorKey("cmyk:K"), "Black");
});

test("a spot colour keeps the customer's own name", () => {
  assert.equal(labelForColorKey("spot:Pantone 485 C"), "Pantone 485 C");
});

test("an unknown key is passed through rather than lost", () => {
  assert.equal(labelForColorKey("Opaque White"), "Opaque White");
  assert.equal(labelForColorKey("cmyk:Z"), "Z");
  assert.equal(labelForColorKey(""), "");
  assert.equal(labelForColorKey(null), "");
});

// ─── order of the colours ─────────────────────────────────────────────────

test("process colours are listed in printing order whatever order they were ticked", () => {
  const ticked = { "cmyk:K": true, "cmyk:Y": true, "cmyk:C": true, "cmyk:M": true };
  assert.deepEqual(coloursForLineItem(line(ticked)), ["Cyan", "Magenta", "Yellow", "Black"]);
});

test("spots come after the process colours, in the order they were ticked", () => {
  const ticked = {
    "spot:Pantone 485 C": true,
    "cmyk:K": true,
    "spot:Opaque White": true,
    "cmyk:C": true,
  };
  assert.deepEqual(coloursForLineItem(line(ticked)), [
    "Cyan",
    "Black",
    "Pantone 485 C",
    "Opaque White",
  ]);
});

test("an unticked box is not a colour", () => {
  const ticked = { "cmyk:C": true, "cmyk:M": false, "cmyk:Y": undefined, "cmyk:K": true };
  assert.deepEqual(tickedColourKeys(line(ticked)), ["cmyk:C", "cmyk:K"]);
});

test("no colours at all gives an empty list, not a phantom colour", () => {
  assert.deepEqual(coloursForLineItem(line({})), []);
  assert.deepEqual(coloursForLineItem({}), []);
});

// ─── the plate list ───────────────────────────────────────────────────────

test("one plate row per ticked colour, sized in millimetres", () => {
  const rows = plateRowsForLineItem(line({ "cmyk:C": true, "cmyk:K": true }));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.colour), ["Cyan", "Black"]);
  for (const row of rows) {
    // 20 x 30 cm print, plus 4 cm trim each way, in mm.
    assert.equal(row.width, 240);
    assert.equal(row.length, 340);
    assert.equal(row.active, true);
  }
});

test("a line with nothing ticked still gets one blank plate row", () => {
  const rows = plateRowsForLineItem(line({}));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].colour, "");
  assert.equal(rows[0].width, 240);
});

test("a missing or silly size becomes zero rather than NaN", () => {
  const rows = plateRowsForLineItem(line({ "cmyk:K": true }, { widthCm: "", heightCm: -5 }));
  assert.equal(rows[0].width, 0);
  assert.equal(rows[0].length, 0);
});

test("centimetres really are turned into millimetres", () => {
  const rows = plateRowsForLineItem(line({ "cmyk:K": true }, { widthCm: 12.5, heightCm: 7 }));
  assert.equal(rows[0].width, 165);
  assert.equal(rows[0].length, 110);
});

// ─── what the job is called ───────────────────────────────────────────────

test("the colour is NOT bolted onto the job name any more", () => {
  const jobs = jobsForOrder([line(CMYK)]);
  assert.equal(jobs[0].description, "Cereal box 500g");
  assert.ok(!jobs[0].description.includes("Cyan"));
});

test("the customer's own words win", () => {
  assert.equal(
    descriptionForLineItem(line(CMYK, { description: "  Sugar 1kg front  " }), "fallback"),
    "Sugar 1kg front",
  );
});

test("their special instructions are used when they named nothing", () => {
  assert.equal(
    descriptionForLineItem(line(CMYK, { description: "", specialInstructions: "Repeat of ITM-2410" }), "fallback"),
    "Repeat of ITM-2410",
  );
});

test("the plate type and size are the last resort", () => {
  assert.equal(
    descriptionForLineItem(line(CMYK, { description: "", specialInstructions: "" }), "Standard 20x30cm"),
    "Standard 20x30cm",
  );
});

test("more colours than the job sheet has boxes for are written into the name too", () => {
  const many = {};
  for (let i = 1; i <= MAX_COLOURS_ON_A_JOB_SHEET + 1; i++) many[`spot:Ink ${i}`] = true;
  const desc = descriptionForLineItem(line(many), "");
  assert.ok(desc.includes("colours:"));
  assert.ok(desc.includes(`Ink ${MAX_COLOURS_ON_A_JOB_SHEET + 1}`));
});

test("a job sheet that fits its colours is not cluttered with them", () => {
  const desc = descriptionForLineItem(line(CMYK), "");
  assert.ok(!desc.includes("colours:"));
});

test("the MIS job sheet has ten colour boxes", () => {
  assert.equal(MAX_COLOURS_ON_A_JOB_SHEET, 10);
});

// ─── the whole order ──────────────────────────────────────────────────────

test("each job knows which line it came from, in order", () => {
  const jobs = jobsForOrder([line(CMYK), line({ "cmyk:K": true })]);
  assert.deepEqual(jobs.map((j) => j.lineIndex), [0, 1]);
});

test("the colour keys are carried through next to the names", () => {
  const jobs = jobsForOrder([line({ "cmyk:K": true, "spot:Pantone 485 C": true })]);
  assert.deepEqual(jobs[0].colourKeys, ["cmyk:K", "spot:Pantone 485 C"]);
  assert.deepEqual(jobs[0].colours, ["Black", "Pantone 485 C"]);
});

test("an empty order makes no jobs", () => {
  assert.deepEqual(jobsForOrder([]), []);
});

// ─── the route that writes the jobs ───────────────────────────────────────
// The job-writing route needs Firebase, so it cannot be run here. But the one
// thing that broke before IS checkable from the source: how many job numbers
// one plate line is allowed to take. Exactly one. A second allocation, or an
// allocation inside a loop over colours, is how four invoices happened.

const ROUTE = readFileSync("app/api/orders/create/route.js", "utf8");

test("a plate line takes exactly ONE FA job number", () => {
  const allocations = ROUTE.split("nextNumber(adminDb, jobCounter)").length - 1;
  assert.equal(allocations, 1);
});

test("the route builds its jobs from the one-job-per-line rule", () => {
  assert.ok(ROUTE.includes("plannedJobs = jobsForOrder("));
});

// ─── THE SECOND REGRESSION: the job sheet must say the plate we BILL ───────
// The price was worked out from the ink area plus 4 cm of trim; the job sheet
// recorded the raw page size with no trim. So a 20 x 30 cm job was charged as
// 816 cm2 and written down as 600 cm2, a quarter small, every time.

test("the trim is 4 cm and it is added to both the width and the length", () => {
  assert.equal(TRIM_CM, 4);
  const billed = billedPlateDimensions(20, 30);
  assert.equal(billed.billedWidthCm, 24);
  assert.equal(billed.billedHeightCm, 34);
  assert.equal(billed.areaCm2, 816);
});

test("no size at all stays zero, so nothing is billed for 4 x 4 of nothing", () => {
  const billed = billedPlateDimensions(0, 0);
  assert.equal(billed.billedWidthCm, 0);
  assert.equal(billed.billedHeightCm, 0);
  assert.equal(billed.areaCm2, 0);
});

test("the job sheet records the trimmed plate, not the print size", () => {
  const rows = plateRowsForLineItem(line(CMYK));
  for (const row of rows) {
    assert.equal(row.width, 240);
    assert.equal(row.length, 340);
    assert.notEqual(row.width, 200);
  }
});

test("each colour gets its OWN measured size plus the trim", () => {
  const measured = line(CMYK, {
    pdfAnalysis: {
      separations: [
        { key: "cmyk:C", bboxWidthCm: 18, bboxHeightCm: 28 },
        { key: "cmyk:M", bboxWidthCm: 19, bboxHeightCm: 29 },
        { key: "cmyk:Y", bboxWidthCm: 12, bboxHeightCm: 10 },
        { key: "cmyk:K", bboxWidthCm: 20, bboxHeightCm: 30 },
      ],
    },
  });
  const rows = plateRowsForLineItem(measured);
  assert.deepEqual(
    rows.map((r) => `${r.colour} ${r.width}x${r.length}`),
    ["Cyan 220x320", "Magenta 230x330", "Yellow 160x140", "Black 240x340"],
  );
});

test("a colour the file checker never measured falls back to the whole page", () => {
  const measured = line({ "cmyk:C": true, "spot:Opaque White": true }, {
    pdfAnalysis: { separations: [{ key: "cmyk:C", bboxWidthCm: 18, bboxHeightCm: 28 }] },
  });
  const rows = plateRowsForLineItem(measured);
  assert.equal(rows[0].width, 220);
  assert.equal(rows[1].width, 240);
});

test("a measured size of zero is not trusted, the page is used instead", () => {
  const ink = inkAreaForColour(
    line({ "cmyk:C": true }, {
      pdfAnalysis: { separations: [{ key: "cmyk:C", bboxWidthCm: 0, bboxHeightCm: 28 }] },
    }),
    "cmyk:C",
  );
  assert.equal(ink.bboxWidthCm, 20);
  assert.equal(ink.bboxHeightCm, 30);
});

test("the plate size in mm is the ink area plus the trim, times ten", () => {
  const plate = billedPlateMm(line({ "cmyk:K": true }), "cmyk:K");
  assert.equal(plate.widthMm, 240);
  assert.equal(plate.lengthMm, 340);
  assert.equal(plate.areaCm2, 816);
});

// ─── one source of truth for the plate size ───────────────────────────────
// The whole fault was two places working out a plate size differently. The
// price must read its sizes from the SAME file the job sheet reads.

const PRICING = readFileSync("lib/pricing.js", "utf8");

test("the price reads its plate sizes from the same file the job sheet does", () => {
  assert.ok(PRICING.includes('from "./plate-size.mjs"'));
});

test("the price does not keep its own copy of the plate size rule", () => {
  assert.ok(!PRICING.includes("export function billedPlateDimensions"));
  assert.ok(!PRICING.includes("+ TRIM_CM"));
});
