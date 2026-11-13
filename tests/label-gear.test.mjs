// Tests for the label boxes on the Order Artwork (AMBER) page.
//
// Run them with:  npm test
//
// WHAT WAS WRONG (Cam, 13 Nov 2026): on a Label the customer typed the
// cylinder, the gear, the teeth and both gaps by hand, and nothing checked
// they agreed. A customer could send 93 teeth CP with a cylinder of 300 and a
// gap round of 0 (on FA005201 the job system once got exactly that kind of
// mix: the 295.27 cylinder typed as the pitch, and a gap round of 0 when it
// was really 13.275 mm). The box was also called "Teeth", sat after the Press
// gear, and the examples under Job name and Printer were a real job (Bordeaux
// Washed Potatoes) and a real printer (Crown Bag). The AMBER price card had no
// AMBER logo.
//
// WHAT IT DOES NOW:
//   - Pick CP or DP and type the tooth size (93), and the Cylinder fills
//     itself in (295.275 mm) and cannot be typed over.
//   - Type the pitch and the number round, and the Gap around fills itself in
//     (295.275 / 1 - 282 = 13.275 mm). If the labels cannot fit round the
//     cylinder it says so in red.
//   - Gap across follows the house rule: 0 for 1 across, 3 mm for more.
//   - The maths is a word-for-word copy of the job system's, so the portal and
//     the workticket always give the same figures. Submit works them out once
//     more, on the page and again on the server, before the job system reads
//     the sheet.
//   - "Teeth" is now "Tooth size", and it has swapped places with Cylinder.
//   - The examples are made up: Sunny Meadow Potatoes 10kg, Bright Bag Printers.
//   - The AMBER logo fills the right of the price card, top to bottom.
//
// Every test here is mutation-tested by tests/mutate.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  CP_MM_PER_TOOTH,
  DP_MM_PER_TOOTH,
  gapAcrossFor,
  gapAroundCheck,
  labelLayoutPatch,
  maxAround,
  parseTeeth,
  repeatFromTeeth,
  settleLabelLayout,
} from "../lib/label-gear.mjs";
import { missingSpecFields } from "../lib/amber-spec.mjs";

const read = (p) => readFileSync(p, "utf8");
const ok = (cond, msg) => assert.ok(cond, msg);
const eq = (got, want, msg) => assert.deepEqual(got, want, msg);

const LABEL = {
  bagType: "Label",
  gearPitch: "CP",
  cylinderTeeth: "93",
  pitchMm: "282",
  across: "1",
  around: "1",
};

// ─── the maths, same as the job system ───────────────────────────────────────

test("maths: a tooth is 3.175 mm on CP and 2.494 mm on DP, as on the workticket", () => {
  eq(CP_MM_PER_TOOTH, 3.175);
  eq(Math.round(DP_MM_PER_TOOTH * 100000) / 100000, 2.49364);
});

test("maths: 93 teeth CP is a 295.275 mm cylinder, 112 teeth DP is 279.288 mm", () => {
  eq(repeatFromTeeth("CP", 93), 295.275);
  eq(repeatFromTeeth("cp", "93T"), 295.275);
  eq(repeatFromTeeth("DP", 112), 279.288);
  eq(repeatFromTeeth("CP", 120), 381);
});

test("maths: no gear, or a tooth size that is not a whole number, works nothing out", () => {
  eq(repeatFromTeeth("", 93), null);
  eq(repeatFromTeeth("CP", "9.5"), null);
  eq(repeatFromTeeth("CP", "-93"), null);
  eq(repeatFromTeeth("CP", "1001"), null);
  eq(parseTeeth(" 93 "), 93);
  eq(parseTeeth("9.5"), null);
});

test("maths: the gap round is cylinder / number round - pitch", () => {
  const one = gapAroundCheck({ cylinder: "295.275", pitchMm: "282", around: "1" });
  eq([one.status, one.gap], ["ok", 13.275]);
  const two = gapAroundCheck({ cylinder: "381", pitchMm: "185", around: "2" });
  eq([two.status, two.gap], ["ok", 5.5]);
});

test("maths: labels that cannot fit round the cylinder are flagged, not given a minus gap", () => {
  const got = gapAroundCheck({ cylinder: "295.275", pitchMm: "200", around: "2" });
  eq(got.status, "nofit");
  ok(got.message.includes("2 x 200 mm needs 400 mm, but the cylinder is only 295.275 mm round."));
});

test("maths: with no pitch yet the gap round is not guessed", () => {
  eq(gapAroundCheck({ cylinder: "295.275", pitchMm: "", around: "1" }).status, "incomplete");
});

test("maths: gap across is 0 for 1 across and 3 mm for more, keeping a gap set on purpose", () => {
  eq(gapAcrossFor("1", "3"), "0");
  eq(gapAcrossFor("3", ""), "3");
  eq(gapAcrossFor("3", "2.5"), "2.5");
});

test("maths: the around hint says how many fit with a 2 mm gap", () => {
  eq(maxAround({ cylinder: "381", pitchMm: "120" }), 3);
  // 3 x 126 = 378 fits 381, but not with a 2 mm gap after each
  eq(maxAround({ cylinder: "381", pitchMm: "126" }), 2);
  const page = read("app/amber/page.jsx");
  ok(page.includes("hint={isLabel ? aroundHint(spec) : undefined}"));
});

// ─── typing in the boxes ─────────────────────────────────────────────────────

test("typing: the tooth size fills the cylinder and the gap round", () => {
  eq(labelLayoutPatch(LABEL, ["cylinderTeeth"]), { cylinder: "295.275", gapAroundMm: "13.275" });
});

test("typing: the pitch and the number round fill the gap round", () => {
  const before = { ...LABEL, cylinder: "381", gearPitch: "", cylinderTeeth: "" };
  eq(labelLayoutPatch({ ...before, pitchMm: "185", around: "2" }, ["around"]), { gapAroundMm: "5.5" });
});

test("typing: a gap round that no longer fits is cleared, not left wrong", () => {
  const state = { ...LABEL, cylinder: "295.275", gapAroundMm: "13.275", around: "2" };
  eq(labelLayoutPatch(state, ["around"]), { gapAroundMm: "" });
});

test("typing: the number across sets the gap across by the house rule", () => {
  eq(labelLayoutPatch({ ...LABEL, cylinder: "295.275", gapAroundMm: "13.275", across: "3" }, ["across"]),
    { gapAcrossMm: "3" });
});

test("typing: clearing the tooth size leaves the cylinder to be typed by hand", () => {
  const state = { ...LABEL, cylinderTeeth: "", cylinder: "295.275", gapAroundMm: "13.275" };
  eq(labelLayoutPatch(state, ["cylinderTeeth"]), {});
});

test("typing: a bag, box or sleeve is never touched", () => {
  eq(labelLayoutPatch({ ...LABEL, bagType: "SO Bag" }, ["cylinderTeeth", "around", "across"]), {});
});

// ─── Submit works it out once more ───────────────────────────────────────────

test("submit: a stale typed cylinder and gap are put right from the tooth size", () => {
  const got = settleLabelLayout({ ...LABEL, cylinder: "300", gapAroundMm: "0", gapAcrossMm: "2" });
  eq(got.cylinder, "295.275");
  eq(got.gapAroundMm, "13.275");
  eq(got.gapAcrossMm, "2", "the gap across is left as typed");
});

test("submit: a bag's spec goes through exactly as typed", () => {
  const bag = { bagType: "SO Bag", cylinder: "660", pitchMm: "500", around: "1", gapAroundMm: "" };
  eq(settleLabelLayout(bag), bag);
});

test("submit: the page saves the worked-out figures, not the typed ones", () => {
  const page = read("app/amber/page.jsx");
  ok(page.includes("const settled = settleLabelLayout(spec);"));
  ok(page.includes("      setSpecState(settled);\n      await saveSubmission(user, { id, spec: settled, notSure, files });"));
});

test("submit: the server works them out again before the job system reads the sheet", () => {
  const route = read("app/api/amber/submit/route.js");
  ok(route.includes('import { settleLabelLayout } from "@/lib/label-gear.mjs";'));
  ok(route.includes("const specNow = settleLabelLayout(specBefore);"));
  ok(route.includes("      if (layoutChanged) patch.spec = specNow;"));
  ok(route.indexOf("settleLabelLayout(specBefore)") < route.indexOf("await fetch(MIS_JOB_URL"));
});

// ─── the form ────────────────────────────────────────────────────────────────

test("form: the box is called Tooth size, everywhere the customer sees it", () => {
  const page = read("app/amber/page.jsx");
  ok(page.includes('<Num label="Tooth size" value={spec.cylinderTeeth}'));
  eq(page.includes('label="Teeth"'), false);
  const label = { files: [{ path: "a" }], notSure: [], spec: { ...LABEL, gearPitch: "", cylinderTeeth: "" } };
  ok(missingSpecFields(label).includes("Tooth size"));
});

test("form: on a Label, Tooth size sits where Cylinder was, and Cylinder sits where Teeth was", () => {
  const page = read("app/amber/page.jsx");
  const grid = page.slice(page.indexOf('<Num label="Around"'), page.indexOf("<Inks"));
  const tooth = grid.indexOf('<Num label="Tooth size"');
  const direction = grid.indexOf('<Choose label="Print direction"');
  const gear = grid.indexOf('<ChooseValued label="Press gear"');
  const cylinder = grid.indexOf("<LabelCylinder ");
  const gapAcross = grid.indexOf('<Num label="Gap across"');
  ok(tooth > 0 && tooth < direction && direction < gear && gear < cylinder && cylinder < gapAcross);
  ok(grid.includes("{isLabel ? ("), "the swap only happens on a Label");
});

test("form: on a bag the Cylinder box stays where it was and is typed by hand", () => {
  const page = read("app/amber/page.jsx");
  const grid = page.slice(page.indexOf('<Num label="Around"'), page.indexOf('<Choose label="Print direction"'));
  ok(grid.includes(') : (\n            <Text label="Cylinder" hint="The cylinder this prints on"'));
});

test("form: every box the cylinder and gaps hang on re-works them", () => {
  const page = read("app/amber/page.jsx");
  for (const key of ["bagType", "pitchMm", "across", "around", "cylinderTeeth", "gearPitch", "cylinder"]) {
    ok(page.includes(`onChange={(v) => updateLayout({ ${key}: v })}`), key);
  }
  ok(page.includes("      return { ...next, ...labelLayoutPatch(next, keys) };"));
});

test("form: a worked-out cylinder is locked, and is no longer Not sure", () => {
  const page = read("app/amber/page.jsx");
  const fn = page.slice(page.indexOf("function LabelCylinder"), page.indexOf("function LabelGapAround"));
  ok(fn.includes("  if (fromTeeth != null) {"));
  ok(fn.includes("<Locked value={formatMm(fromTeeth)} />"));
  ok(fn.includes("Worked out: {teeth} teeth x {formatMm(mmPerTooth(gear))} mm"));
  ok(page.includes('      setNotSure((prev) => prev.filter((k) => k !== "cylinder"));'));
});

test("form: the gap round is shown worked out, and a no-fit is shown in red", () => {
  const page = read("app/amber/page.jsx");
  const fn = page.slice(page.indexOf("function LabelGapAround"));
  ok(fn.includes('  if (chk.status === "nofit") {'));
  ok(fn.includes("Does not fit. {chk.message}"));
  ok(fn.includes("<Locked value={formatMm(chk.gap)} />"));
});

test("form: the tooth size can be answered Not sure", () => {
  const page = read("app/amber/page.jsx");
  ok(page.includes('notSureKey="cylinderTeeth" notSure={notSure} onNotSure={toggleNotSure}'));
});

// ─── made-up examples, AMBER logo ────────────────────────────────────────────

test("examples: the Job name and Printer examples are made up, not real jobs", () => {
  const page = read("app/amber/page.jsx");
  ok(page.includes('hint="For example: Sunny Meadow Potatoes 10kg"'));
  ok(page.includes('hint="Who prints it, for example Bright Bag Printers. Leave it blank if you are not sure"'));
  eq(page.includes("Bordeaux"), false);
  eq(page.includes("Crown Bag"), false);
});

test("logo: the AMBER logo fills the right of the price card, top to bottom", () => {
  const page = read("app/amber/page.jsx");
  const card = page.slice(page.indexOf("Artwork by AMBER</div>"), page.indexOf("Order Plates instead"));
  ok(card.includes('src="/images/amber-logo.svg"'));
  ok(card.includes('className="block shrink-0 self-stretch w-28 object-contain bg-[#FBF6EC] border-l border-accent-500 sm:absolute sm:inset-y-0 sm:right-0 sm:h-full sm:w-auto sm:aspect-square sm:object-cover"'));
  ok(page.includes('<div className="relative mt-8 border border-accent-500 rounded-lg overflow-hidden flex items-stretch">'));
});

test("logo: the file is the AMBER logo, small and clean", () => {
  ok(existsSync("public/images/amber-logo.svg"));
  const svg = read("public/images/amber-logo.svg");
  ok(svg.includes('viewBox="0 0 1024 1024"'));
  ok(svg.includes('<circle cx="512.5" cy="715.5" r="74" fill="#F97316"/>'));
  eq(svg.includes("<metadata>"), false);
  ok(svg.length < 2000);
});
