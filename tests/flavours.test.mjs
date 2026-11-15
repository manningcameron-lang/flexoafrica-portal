// Tests for flavours (variants) and trapping on the AMBER form.
//
// Run them with:  npm test
//
// WHAT WAS WRONG (Cam, 13 Nov 2026): a customer with the same bag in
// Chocolate, Strawberry and Banana had to fill the whole AMBER form in three
// times, even though only the inks and the barcode change. And there was
// nowhere to say how much trapping their printer wants.
//
// WHAT IT DOES NOW:
//   - "Add a flavour" works like Variants on the job system's workticket: the
//     spec is typed once, each flavour has only a name, inks and a barcode.
//   - R499 a flavour (Cam's pick); a first free job covers the first flavour.
//   - An optional "Trapping in mm" box (for example 0.2).
//   - Both stay switched OFF until the job system reads them, so nothing a
//     customer types can be lost on the way to the workticket.
//
// Every test here is mutation-tested by tests/mutate.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  FLAVOURS_AND_TRAPPING_LIVE,
  MAX_FLAVOURS,
  addFlavour,
  cleanFlavourFields,
  cleanFlavours,
  flavourCount,
  flavourGaps,
  parseTrappingMm,
  removeFlavour,
  updateFlavour,
} from "../lib/amber-variants.mjs";
import { priceForFlavours, priceReproJob, priceShownToCustomer } from "../lib/amber-pricing.mjs";
import { missingSpecFields } from "../lib/amber-spec.mjs";
import { buildArtworkJobAlert } from "../lib/sales-alert.mjs";

const read = (p) => readFileSync(p, "utf8");
const ok = (cond, msg) => assert.ok(cond, msg);
const eq = (got, want, msg) => assert.deepEqual(got, want, msg);

const SPEC = {
  description: "Sunny Meadow Rusks 500g",
  bagType: "SO Bag", material: "Brown Paper", printSide: "Surface",
  widthMm: "200", pitchMm: "300", across: "1", around: "1",
  cylinder: "660", printDirection: "Left to Right",
  colours: ["Black", "PANTONE 485 U"], barcode: "6001234567890",
};
const SHEET = (spec, notSure = []) => ({ files: [{ path: "a.pdf" }], notSure, spec });

const three = () => ({
  ...SPEC, colours: [], barcode: "",
  variants: [
    { id: "v1", name: "Chocolate", colours: ["Black", "PANTONE 469 U"], barcode: "6001" },
    { id: "v2", name: "Strawberry", colours: ["Black", "PANTONE 192 U"], barcode: "6002" },
    { id: "v3", name: "Banana", colours: ["Black", "PANTONE 116 U"], barcode: "" },
  ],
});

// ─── adding and removing flavours ────────────────────────────────────────────

test("flavours: the first Add moves the inks and barcode into flavour 1 and adds a blank flavour 2", () => {
  const got = addFlavour(SPEC);
  eq(got.variants.length, 2);
  eq(got.variants[0].colours, ["Black", "PANTONE 485 U"]);
  eq(got.variants[0].barcode, "6001234567890");
  eq([got.variants[1].name, got.variants[1].colours, got.variants[1].barcode], ["", [], ""]);
  eq([got.colours, got.barcode], [[], ""], "the normal boxes are emptied");
  ok(got.variants[0].id !== got.variants[1].id);
});

test("flavours: later Adds add one blank flavour, and stop at 10", () => {
  eq(addFlavour(three()).variants.length, 4);
  const full = { ...SPEC, variants: Array.from({ length: MAX_FLAVOURS }, (_, i) => ({ id: `v${i}`, name: `F${i}`, colours: ["Black"] })) };
  eq(addFlavour(full), {});
  eq(MAX_FLAVOURS, 10);
});

test("flavours: changing one flavour leaves the others alone", () => {
  const got = updateFlavour(three(), 1, { barcode: "6009" });
  eq(got.variants.map((v) => v.barcode), ["6001", "6009", ""]);
  eq(updateFlavour(three(), 7, { name: "x" }), {});
});

test("flavours: removing one of three leaves two", () => {
  eq(removeFlavour(three(), 0).variants.map((v) => v.name), ["Strawberry", "Banana"]);
});

test("flavours: going back to one flavour puts its inks and barcode back in the normal boxes", () => {
  const two = { ...SPEC, variants: three().variants.slice(0, 2) };
  eq(removeFlavour(two, 1), { variants: [], colours: ["Black", "PANTONE 469 U"], barcode: "6001" });
});

test("flavours: a normal job counts as 1, three flavours as 3", () => {
  eq(flavourCount(SPEC), 1);
  eq(flavourCount({ ...SPEC, variants: [{ name: "only one" }] }), 1);
  eq(flavourCount(three()), 3);
});

// ─── what is still needed ────────────────────────────────────────────────────

test("needed: every flavour needs a name and its inks", () => {
  const spec = { ...three(), variants: [three().variants[0], { id: "v9", name: "", colours: [], barcode: "" }] };
  eq(flavourGaps(spec), ["Name of flavour 2", "Inks for flavour 2"]);
});

test("needed: two flavours cannot share a name", () => {
  const spec = { ...three(), variants: [three().variants[0], { ...three().variants[1], name: "chocolate" }] };
  eq(flavourGaps(spec), ["A different name for flavour 2 (chocolate is used twice)"]);
});

test("needed: ticking Not sure for the inks covers every flavour", () => {
  const spec = { ...three(), variants: three().variants.map((v) => ({ ...v, colours: [] })) };
  eq(flavourGaps(spec, { inksNotSure: true }), []);
  eq(missingSpecFields(SHEET(spec, ["colours"])), []);
});

test("needed: with flavours the main inks box is not asked for, the flavours' inks are", () => {
  eq(missingSpecFields(SHEET(three())), []);
  const spec = { ...three(), variants: [...three().variants.slice(0, 2), { id: "v3", name: "Banana", colours: [] }] };
  eq(missingSpecFields(SHEET(spec)), ["Inks for Banana"]);
});

test("needed: a normal job still needs its inks", () => {
  ok(missingSpecFields(SHEET({ ...SPEC, colours: [] })).includes("Inks, in print order"));
  // A lone flavour is not a flavour job: the main inks box is still asked for.
  const lone = { ...SPEC, colours: [], variants: [{ id: "v1", name: "Only", colours: ["Black"] }] };
  ok(missingSpecFields(SHEET(lone)).includes("Inks, in print order"));
});

// ─── trapping ────────────────────────────────────────────────────────────────

test("trapping: read the way people type it", () => {
  eq(parseTrappingMm("0.2"), 0.2);
  eq(parseTrappingMm("0,75"), 0.75);
  eq(parseTrappingMm(" 1.5 mm"), 1.5);
  eq(parseTrappingMm(""), null);
  eq(parseTrappingMm(undefined), null);
});

test("trapping: nonsense, zero, minus or more than 5 mm is not taken", () => {
  for (const bad of ["abc", "0", "-0.2", "6", "0.2.1", "5.01"]) ok(Number.isNaN(parseTrappingMm(bad)), bad);
  eq(parseTrappingMm("5"), 5);
});

test("trapping: optional, but a wrong figure is asked for again", () => {
  eq(missingSpecFields(SHEET({ ...SPEC, trappingMm: "" })), []);
  eq(missingSpecFields(SHEET({ ...SPEC, trappingMm: "0.2" })), []);
  eq(missingSpecFields(SHEET({ ...SPEC, trappingMm: "lots" })), ["Trapping in mm (a number up to 5, for example 0.2)"]);
});

// ─── price: R499 a flavour ───────────────────────────────────────────────────

test("price: one flavour is exactly the old price", () => {
  const one = priceReproJob({ companyHasHadFreeJob: true });
  eq(priceForFlavours(one, 1).customerText, "R499 excl VAT");
  eq(priceForFlavours(one, 1).exclVat, 499);
});

test("price: three flavours are 3 x R499 = R1 497", () => {
  const got = priceForFlavours(priceReproJob({ companyHasHadFreeJob: true }), 3);
  eq([got.exclVat, got.vat, got.inclVat], [1497, 224.55, 1721.55]);
  eq(got.customerText, "3 flavours x R499 = R1 497 excl VAT");
});

test("price: a free first job covers the first flavour only", () => {
  const got = priceForFlavours(priceReproJob({ companyHasHadFreeJob: false }), 3);
  eq(got.exclVat, 998);
  eq(got.free, false);
  eq(got.firstFlavourFree, true);
  eq(got.customerText, "First flavour free, then 2 x R499 = R998 excl VAT");
});

test("price: the page shows the flavour price, and free only once confirmed", () => {
  eq(priceShownToCustomer(null, 2).customerText, "2 flavours x R499 = R998 excl VAT");
  eq(priceShownToCustomer({ companyHasHadFreeJob: false }, 2).customerText, "First flavour free, then 1 x R499 = R499 excl VAT");
  const page = read("app/amber/page.jsx");
  ok(page.includes("return priceShownToCustomer(terms, flavourCount(spec));"));
  ok(page.includes(": price?.firstFlavourFree\n              ? `First flavour free, then R${AMBER_REPRO_PRICE_EXCL_VAT} a flavour, excl VAT`"));
});

// ─── sales@ is told ──────────────────────────────────────────────────────────

const ART = {
  jobNumber: "FA009998", jobName: "Sunny Meadow Rusks 500g", company: "Top Flight Packaging",
  dueSaid: "Mon 16 Nov, 16:00", firstFree: false, waitingOn: [], fileCount: 2, warnings: [],
};

test("sales@: a three-flavour job shows the flavours and 3 x R499", () => {
  const got = buildArtworkJobAlert({ ...ART, flavours: ["Chocolate", "Strawberry", "Banana"], trappingMm: "0.2" });
  ok(got.text.includes("Price: 3 flavours x R499,00 = R1 497,00 excl VAT"));
  ok(got.text.includes("Flavours (3): Chocolate, Strawberry, Banana"));
  ok(got.text.includes("Trapping: 0.2 mm"));
});

test("sales@: a free first job with flavours charges the other flavours", () => {
  const got = buildArtworkJobAlert({ ...ART, firstFree: true, flavours: ["Chocolate", "Strawberry"] });
  ok(got.text.includes("Price: FIRST FLAVOUR FREE, then 1 x R499,00 = R499,00 excl VAT"));
});

test("sales@: a one-flavour job reads exactly as before", () => {
  const got = buildArtworkJobAlert({ ...ART, flavours: [] });
  ok(got.text.includes("Price: R499,00 excl VAT"));
  eq(got.text.includes("Flavours"), false);
  eq(got.text.includes("Trapping"), false);
});

test("sales@: Submit hands the flavours and trapping to the email", () => {
  const route = read("app/api/amber/submit/route.js");
  ok(route.includes("flavours: (Array.isArray(submission.spec?.variants) ? submission.spec.variants : []).map((v) => v?.name),"));
  ok(route.includes("trappingMm: submission.spec?.trappingMm,"));
});

// ─── kept on the job sheet, and the switch ───────────────────────────────────

test("saving: flavours are cleaned (names, 10 inks, 10 flavours, no rubbish)", () => {
  const messy = [
    { id: "v1<script>", name: "  Choc   olate ", colours: [" Black ", "", "PANTONE 469 U", ...Array(12).fill("X")], barcode: " 6001 " },
    "not a flavour",
    null,
    { name: "x".repeat(200), colours: "Black" },
  ];
  const got = cleanFlavours(messy);
  eq(got.length, 2);
  eq(got[0].id, "v1script");
  eq(got[0].name, "Choc olate");
  eq(got[0].colours.length, 10);
  eq(got[0].colours.slice(0, 2), ["Black", "PANTONE 469 U"]);
  eq(got[0].barcode, "6001");
  eq(got[1].name.length, 80);
  eq(got[1].colours, []);
  ok(got[1].id.startsWith("v"));
  eq(cleanFlavours(Array.from({ length: 15 }, (_, i) => ({ name: `F${i}` }))).length, 10);
});

test("saving: with the switch ON, flavours and trapping are kept", () => {
  const got = cleanFlavourFields({ variants: three().variants, trappingMm: " 0.2 " }, { live: true });
  eq(got.variants.map((v) => v.name), ["Chocolate", "Strawberry", "Banana"]);
  eq(got.trappingMm, "0.2");
  eq(cleanFlavourFields({ variants: [three().variants[0]] }, { live: true }).variants, []);
});

test("saving: with the switch OFF, nothing about flavours or trapping is kept", () => {
  eq(cleanFlavourFields({ variants: three().variants, trappingMm: "0.2" }, { live: false }), {});
});

test("saving: the job sheet route sends every spec through the flavour cleaner", () => {
  const route = read("app/api/amber/submission/route.js");
  ok(route.includes("  Object.assign(out, cleanFlavourFields(input));"));
});

test("switch: OFF until the job system reads flavours and trapping", () => {
  eq(FLAVOURS_AND_TRAPPING_LIVE, false);
  const page = read("app/amber/page.jsx");
  ok(page.includes('          {FLAVOURS_AND_TRAPPING_LIVE && (\n            <Text label="Trapping in mm (optional)"'));
  ok(page.includes("            {FLAVOURS_AND_TRAPPING_LIVE && (\n              <button"));
});

// ─── the page ────────────────────────────────────────────────────────────────

test("page: with flavours, each has its own name, inks and barcode, and the main ones hide", () => {
  const page = read("app/amber/page.jsx");
  ok(page.includes("        {flavours.length === 0 ? ("));
  ok(page.includes("          {flavours.length === 0 && (\n            <Text label=\"Barcode number\""));
  const fn = page.slice(page.indexOf("function Flavours("));
  ok(fn.includes("label={`Flavour ${i + 1} name`}"));
  ok(fn.includes("onChange={(colours) => onChange(i, { colours })}"));
  ok(fn.includes("onChange={(e) => onChange(i, { barcode: e.target.value })}"));
  ok(fn.includes("{flavours.length < MAX_FLAVOURS && ("));
  ok(page.includes("onRemove={(i) => update(removeFlavour(spec, i))}"));
  ok(page.includes("onClick={() => update(addFlavour(spec))}"));
});
