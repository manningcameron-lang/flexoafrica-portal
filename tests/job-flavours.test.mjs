// Tests for the flavours shown on the customer's job page and the staff
// file-check screen (Cam, 24 Nov 2026 evening).
//
// Every test here is mutation-tested by tests/mutate.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { MAX_BARCODE, MAX_INKS, MAX_NAME, MAX_SHOWN, flavourList, inksLine } from "../lib/job-flavours.mjs";

const read = (p) => readFileSync(p, "utf8");

const FA005550 = [
  { id: "vportal1", name: "Chocolate", colours: ["Black", "PANTONE 469 U"], barcode: "6001234500011" },
  { id: "vportal2", name: "Strawberry", colours: ["Black", "PANTONE 185 U"], barcode: "6001234500028" },
  { id: "vportal3", name: "Banana", colours: ["Black", "PANTONE 116 U"], barcode: "6001234500035" },
];

test("a 3-flavour job shows each flavour's name, inks and barcode, in order, without the id", () => {
  assert.deepEqual(flavourList(FA005550), [
    { name: "Chocolate", colours: ["Black", "PANTONE 469 U"], barcode: "6001234500011" },
    { name: "Strawberry", colours: ["Black", "PANTONE 185 U"], barcode: "6001234500028" },
    { name: "Banana", colours: ["Black", "PANTONE 116 U"], barcode: "6001234500035" },
  ]);
  // The door's shape (no id) reads the same.
  assert.deepEqual(flavourList(FA005550.map(({ id, ...v }) => v)), flavourList(FA005550));
});

test("a normal job, one flavour or no list shows nothing new", () => {
  assert.deepEqual(flavourList(undefined), []);
  assert.deepEqual(flavourList(null), []);
  assert.deepEqual(flavourList("Chocolate"), []);
  assert.deepEqual(flavourList({ 0: FA005550[0], 1: FA005550[1] }), []);
  assert.deepEqual(flavourList([]), []);
  assert.deepEqual(flavourList([FA005550[0]]), []);
  // Two entries but only one with a name is one flavour.
  assert.deepEqual(flavourList([FA005550[0], { name: "  ", colours: ["Black"] }]), []);
});

test("junk entries are dropped and odd values cleaned", () => {
  const list = flavourList([
    null, "x", ["Black"], 7,
    { name: "  Mint   Choc ", colours: [" Black ", "", null, 5, "PANTONE 7724 C"], barcode: 123 },
    { name: "Plain", colours: "Black", barcode: "  600 123  " },
  ]);
  assert.deepEqual(list, [
    { name: "Mint Choc", colours: ["Black", "PANTONE 7724 C"], barcode: "" },
    { name: "Plain", colours: [], barcode: "600 123" },
  ]);
});

test("lengths are capped as the job system caps them", () => {
  assert.equal(MAX_SHOWN, 10);
  assert.equal(MAX_NAME, 60);
  assert.equal(MAX_INKS, 10);
  assert.equal(MAX_BARCODE, 40);
  const many = Array.from({ length: 12 }, (_, i) => ({
    name: `F${i} ${"x".repeat(70)}`,
    colours: Array.from({ length: 12 }, (_, j) => `Ink ${j} ${"y".repeat(70)}`),
    barcode: "9".repeat(50),
  }));
  const list = flavourList(many);
  assert.equal(list.length, 10);
  assert.equal(list[0].name.length, 60);
  assert.equal(list[0].colours.length, 10);
  assert.equal(list[0].colours[0].length, 60);
  assert.equal(list[0].barcode.length, 40);
  assert.equal(list[9].name.startsWith("F9 "), true);
});

test("the inks read as one line, or say none were given", () => {
  assert.equal(inksLine({ colours: ["Black", "PANTONE 469 U"] }), "Black, PANTONE 469 U");
  assert.equal(inksLine({ colours: [] }), "No inks given");
});

test("the customer's job page shows a Flavours card from the job's flavours", () => {
  const page = read("app/jobs/[id]/page.jsx");
  assert.match(page, /import \{ flavourList, inksLine \} from "@\/lib\/job-flavours\.mjs";/);
  assert.match(page, /\{flavourList\(job\.variants\)\.length > 0 && \(\s*<DetailCard title="Flavours">/);
  assert.match(page, /\{flavourList\(job\.variants\)\.map\(\(v, i\) => \(/);
  assert.match(page, />\{v\.name\}<\/div>/);
  assert.match(page, />Inks: \{inksLine\(v\)\}<\/div>/);
  assert.match(page, /\{v\.barcode && <div className="text-sm text-ink-muted">Barcode: \{v\.barcode\}<\/div>\}/);
});

test("the staff file-check screen lists the upload's flavours", () => {
  const page = read("app/staff/file-checks/page.jsx");
  assert.match(page, /import \{ flavourList, inksLine \} from "@\/lib\/job-flavours\.mjs";/);
  assert.match(page, /\{flavourList\(spec\.variants\)\.length > 0 && \(/);
  assert.match(page, /Flavours \(\{flavourList\(spec\.variants\)\.length\}\)/);
  assert.match(page, /<span className="font-medium">\{v\.name\}<\/span>: \{inksLine\(v\)\}/);
  assert.match(page, /\{v\.barcode \? ` · barcode \$\{v\.barcode\}` : ""\}/);
});
