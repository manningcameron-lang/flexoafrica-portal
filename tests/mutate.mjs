// Mutation testing.
//
// A test suite that passes proves nothing on its own: a test that cannot fail
// is not a test. So this breaks the real code on purpose, one change at a
// time, and checks three things each time:
//
//   1. the sabotage actually landed in the file (the text it looked for was
//      found exactly once and really was replaced);
//   2. the suite then goes RED;
//   3. the file is put back exactly as it was afterwards.
//
// Run with:  npm run mutate

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const MUTATIONS = [
  // ─── flavours and trapping (Cam 2026-11-13) ───────────────────────────────
  { label: "the first Add forgets the inks already typed", file: "lib/amber-variants.mjs",
    find: "        { id: newFlavourId(), name: \"\", colours: inkList(spec?.colours), barcode: str(spec?.barcode) },",
    replace: "        { id: newFlavourId(), name: \"\", colours: [], barcode: \"\" }," },
  { label: "the first Add leaves the old inks in the main box", file: "lib/amber-variants.mjs",
    find: "      colours: [],\n      barcode: \"\",\n    };",
    replace: "    };" },
  { label: "there is no limit of 10 flavours", file: "lib/amber-variants.mjs",
    find: "  if (current.length >= MAX_FLAVOURS) return {};",
    replace: "  // no limit" },
  { label: "changing one flavour changes them all", file: "lib/amber-variants.mjs",
    find: "  return { variants: current.map((v, i) => (i === index ? { ...v, ...patch } : v)) };",
    replace: "  return { variants: current.map((v) => ({ ...v, ...patch })) };" },
  { label: "one flavour left is kept as a flavour list", file: "lib/amber-variants.mjs",
    find: "  if (left.length >= 2) return { variants: left };",
    replace: "  if (left.length >= 1) return { variants: left };" },
  { label: "going back to one flavour loses its barcode", file: "lib/amber-variants.mjs",
    find: "  return { variants: [], colours: inkList(only.colours), barcode: str(only.barcode) };",
    replace: "  return { variants: [], colours: inkList(only.colours), barcode: \"\" };" },
  { label: "a single flavour counts as a flavour job", file: "lib/amber-variants.mjs",
    find: "  return list.length >= 2 ? list : [];\n}\n\n/** How many",
    replace: "  return list;\n}\n\n/** How many" },
  { label: "a flavour with no name is accepted", file: "lib/amber-variants.mjs",
    find: "    if (!name) out.push(`Name of flavour ${i + 1}`);",
    replace: "    if (!name) {}" },
  { label: "two flavours may share a name", file: "lib/amber-variants.mjs",
    find: "      if (seen.has(key)) out.push(`A different name for flavour ${i + 1} (${name} is used twice)`);",
    replace: "      // duplicates allowed" },
  { label: "a flavour with no inks is accepted", file: "lib/amber-variants.mjs",
    find: "    if (!inksNotSure && inkList(v?.colours).length === 0) out.push(`Inks for ${label}`);",
    replace: "    // inks not checked" },
  { label: "Not sure no longer covers the flavours' inks", file: "lib/amber-variants.mjs",
    find: "export function flavourGaps(spec, { inksNotSure = false } = {}) {",
    replace: "export function flavourGaps(spec, { inksNotSureX = false } = {}) {\n  const inksNotSure = false;" },
  { label: "trapping of 0 or minus is accepted", file: "lib/amber-variants.mjs",
    find: "  if (!(n > 0) || n > MAX_TRAPPING_MM) return NaN;",
    replace: "  if (n > MAX_TRAPPING_MM) return NaN;" },
  { label: "trapping takes any size", file: "lib/amber-variants.mjs",
    find: "export const MAX_TRAPPING_MM = 5;",
    replace: "export const MAX_TRAPPING_MM = 500;" },
  { label: "trapping with a comma is refused", file: "lib/amber-variants.mjs",
    find: "  const s = str(v).toLowerCase().replace(/\\s*mm$/, \"\").replace(\",\", \".\");",
    replace: "  const s = str(v).toLowerCase().replace(/\\s*mm$/, \"\");" },
  { label: "flavour names are not cleaned", file: "lib/amber-variants.mjs",
    find: "      name: str(v.name).replace(/\\s+/g, \" \").slice(0, 80),",
    replace: "      name: String(v.name ?? \"\")," },
  { label: "a flavour takes more than 10 inks", file: "lib/amber-variants.mjs",
    find: "    .filter(Boolean)\n    .slice(0, MAX_INKS);",
    replace: "    .filter(Boolean);" },
  { label: "more than 10 flavours are kept", file: "lib/amber-variants.mjs",
    find: "    .slice(0, MAX_FLAVOURS)\n    .map((v) => ({",
    replace: "    .map((v) => ({" },
  { label: "anything is kept as a flavour id", file: "lib/amber-variants.mjs",
    find: "      id: str(v.id).replace(/[^A-Za-z0-9_-]/g, \"\").slice(0, 40) || newFlavourId(),",
    replace: "      id: str(v.id) || newFlavourId()," },
  { label: "the switch is ignored when saving", file: "lib/amber-variants.mjs",
    find: "  if (!live) return {};\n",
    replace: "  // switch ignored\n" },
  { label: "the switch is turned on before the job system is ready", file: "lib/amber-variants.mjs",
    find: "export const FLAVOURS_AND_TRAPPING_LIVE = false;",
    replace: "export const FLAVOURS_AND_TRAPPING_LIVE = true;" },
  { label: "trapping is not kept even when live", file: "lib/amber-variants.mjs",
    find: "  if (input && \"trappingMm\" in input) out.trappingMm = str(input.trappingMm).slice(0, 20);",
    replace: "  // trapping dropped" },
  { label: "the job sheet route skips the flavour cleaner", file: "app/api/amber/submission/route.js",
    find: "  Object.assign(out, cleanFlavourFields(input));\n",
    replace: "  // no flavours\n" },
  { label: "with flavours the main inks are still demanded", file: "lib/amber-spec.mjs",
    find: "    if (field.key === \"colours\" && hasFlavours) continue;\n",
    replace: "\n" },
  { label: "the flavour checks are not run", file: "lib/amber-spec.mjs",
    find: "  out.push(...flavourGaps(spec, { inksNotSure: unsure.includes(\"colours\") }));",
    replace: "  // flavours not checked" },
  { label: "a wrong trapping figure is not asked for", file: "lib/amber-spec.mjs",
    find: "  if (trap) out.push(trap);",
    replace: "  // trapping not checked" },
  { label: "a free first job makes every flavour free", file: "lib/amber-pricing.mjs",
    find: "  const charged = one.free ? n - 1 : n;",
    replace: "  const charged = one.free ? 0 : n;" },
  { label: "flavours are charged once only", file: "lib/amber-pricing.mjs",
    find: "  const exclVat = charged * AMBER_REPRO_PRICE_EXCL_VAT;",
    replace: "  const exclVat = AMBER_REPRO_PRICE_EXCL_VAT;" },
  { label: "the page prices one flavour whatever is typed", file: "app/amber/page.jsx",
    find: "    return priceShownToCustomer(terms, flavourCount(spec));",
    replace: "    return priceShownToCustomer(terms, 1);" },
  { label: "the card hides first flavour free", file: "app/amber/page.jsx",
    find: "            : price?.firstFlavourFree\n",
    replace: "            : false\n" },
  { label: "sales@ is not told the price of the flavours", file: "lib/sales-alert.mjs",
    find: "        : `Price: ${n} flavours x ${rands(AMBER_PRICE_EXCL_VAT)} = ${total}`,",
    replace: "        : `Price: ${rands(AMBER_PRICE_EXCL_VAT)} excl VAT`," },
  { label: "sales@ is not told a free first flavour", file: "lib/sales-alert.mjs",
    find: "        ? `Price: FIRST FLAVOUR FREE, then ${charged} x ${rands(AMBER_PRICE_EXCL_VAT)} = ${total}`",
    replace: "        ? `Price: FIRST JOB FREE`" },
  { label: "sales@ is not told the flavour names", file: "lib/sales-alert.mjs",
    find: "    lines.push(`Flavours (${n}): ${flavours.join(\", \")}`);",
    replace: "    // names not listed" },
  { label: "sales@ is not told the trapping", file: "lib/sales-alert.mjs",
    find: "  if (trap) lines.push(`Trapping: ${trap} mm`);",
    replace: "  // trapping not listed" },
  { label: "Submit does not pass the flavours to sales@", file: "app/api/amber/submit/route.js",
    find: "          flavours: (Array.isArray(submission.spec?.variants) ? submission.spec.variants : []).map((v) => v?.name),\n",
    replace: "" },
  { label: "the main barcode box shows beside the flavours", file: "app/amber/page.jsx",
    find: "          {flavours.length === 0 && (\n            <Text label=\"Barcode number\"",
    replace: "          {true && (\n            <Text label=\"Barcode number\"" },
  { label: "Remove does nothing", file: "app/amber/page.jsx",
    find: "onRemove={(i) => update(removeFlavour(spec, i))}",
    replace: "onRemove={() => {}}" },
  { label: "a flavour's inks are not saved", file: "app/amber/page.jsx",
    find: "onChange={(colours) => onChange(i, { colours })}",
    replace: "onChange={() => {}}" },
  { label: "the trapping box shows before the job system is ready", file: "app/amber/page.jsx",
    find: "          {FLAVOURS_AND_TRAPPING_LIVE && (\n            <Text label=\"Trapping in mm (optional)\"",
    replace: "          {true && (\n            <Text label=\"Trapping in mm (optional)\"" },

  // ─── AMBER promises a PDF proof for approval (Cam 2026-11-13) ─────────────
  { label: "the page intro promises a plate-ready file again", file: "app/amber/page.jsx",
    find: "you get back a\n        PDF proof for approval.",
    replace: "you get back a\n        plate-ready file and a PDF proof to sign off." },
  { label: "the price card promises a plate-ready file again", file: "app/amber/page.jsx",
    find: "          <li>You get a PDF proof for approval</li>",
    replace: "          <li>You get a plate-ready file and a PDF proof</li>" },
  { label: "the waiting thank-you promises a plate-ready file again", file: "app/amber/page.jsx",
    find: "You will have your PDF proof for approval within 24 working hours of that.",
    replace: "You will have your plate-ready file and PDF proof within 24 working hours of that." },
  { label: "the due-time thank-you promises a plate-ready file again", file: "app/amber/page.jsx",
    find: "<> You will have your PDF proof for approval by <strong>",
    replace: "<> You will have your plate-ready file and PDF proof by <strong>" },
  { label: "the no-time thank-you promises a plate-ready file again", file: "app/amber/page.jsx",
    find: '" You will have your PDF proof for approval shortly."',
    replace: '" You will have your plate-ready file and PDF proof shortly."' },
  { label: "the job-made email promises a plate-ready file again", file: "lib/amber-emails.mjs",
    find: "`and you will have your PDF proof for approval by ${data.dueText}. ` +",
    replace: "`and you will have your plate-ready file and PDF proof by ${data.dueText}. ` +" },
  { label: "the waiting email promises a plate-ready file again", file: "lib/amber-emails.mjs",
    find: '"are in. You will have your PDF proof for approval within 24 " +',
    replace: '"are in. You will have your plate-ready file and PDF proof within 24 " +' },

  // ─── label gear, tooth size, logo, made-up examples (Cam 2026-11-13) ──────
  { label: "a CP tooth is the wrong size", file: "lib/label-gear.mjs",
    find: "export const CP_MM_PER_TOOTH = 3.175; // 1/8 inch",
    replace: "export const CP_MM_PER_TOOTH = 3.2; // wrong" },
  { label: "a DP tooth is the wrong size", file: "lib/label-gear.mjs",
    find: "export const DP_DIAMETRAL_PITCH = 32;",
    replace: "export const DP_DIAMETRAL_PITCH = 24;" },
  { label: "the gap round forgets the number round", file: "lib/label-gear.mjs",
    find: "  const raw = repeat / around - pitch;",
    replace: "  const raw = repeat - pitch;" },
  { label: "labels that do not fit get a minus gap", file: "lib/label-gear.mjs",
    find: "  if (gap < 0) {",
    replace: "  if (false) {" },
  { label: "bags get label maths too", file: "lib/label-gear.mjs",
    find: '  if (String(s.bagType || "") !== "Label") return {};',
    replace: "  // every product" },
  { label: "the tooth size no longer fills the cylinder", file: "lib/label-gear.mjs",
    find: '      if (String(s.cylinder ?? "") !== txt) out.cylinder = txt;',
    replace: "      // cylinder left alone" },
  { label: "a no-fit gap is left at its old figure", file: "lib/label-gear.mjs",
    find: '      if (String(s.gapAroundMm ?? "") !== "") out.gapAroundMm = "";',
    replace: "      // stale gap kept" },
  { label: "1 across gets a 3 mm gap across", file: "lib/label-gear.mjs",
    find: '  if (a <= 1) return "0";',
    replace: '  if (a <= 1) return "3";' },
  { label: "a half tooth is accepted", file: "lib/label-gear.mjs",
    find: "  if (!Number.isFinite(n) || n <= 0 || Math.floor(n) !== n) return null;",
    replace: "  if (!Number.isFinite(n) || n <= 0) return null;" },
  { label: "Submit stops working the label figures out", file: "lib/label-gear.mjs",
    find: '  return { ...s, ...labelLayoutPatch(s, ["gearPitch", "cylinderTeeth", "pitchMm", "around"]) };',
    replace: "  return { ...s };" },
  { label: "the around hint uses no gap", file: "lib/label-gear.mjs",
    find: "  const n = Math.floor(repeat / (pitch + minGap));",
    replace: "  const n = Math.floor(repeat / pitch);" },
  { label: "the box is called Teeth again", file: "app/amber/page.jsx",
    find: '<Num label="Tooth size" value={spec.cylinderTeeth}',
    replace: '<Num label="Teeth" value={spec.cylinderTeeth}' },
  { label: "the missing list says Teeth again", file: "lib/amber-spec.mjs",
    find: '  { key: "cylinderTeeth", label: "Tooth size" },',
    replace: '  { key: "cylinderTeeth", label: "Teeth" },' },
  { label: "the pitch no longer re-works the gap", file: "app/amber/page.jsx",
    find: "onChange={(v) => updateLayout({ pitchMm: v })}",
    replace: "onChange={(v) => update({ pitchMm: v })}" },
  { label: "the number round no longer re-works the gap", file: "app/amber/page.jsx",
    find: "onChange={(v) => updateLayout({ around: v })}",
    replace: "onChange={(v) => update({ around: v })}" },
  { label: "the number across no longer sets the gap across", file: "app/amber/page.jsx",
    find: "onChange={(v) => updateLayout({ across: v })}",
    replace: "onChange={(v) => update({ across: v })}" },
  { label: "the tooth size no longer re-works the cylinder", file: "app/amber/page.jsx",
    find: "onChange={(v) => updateLayout({ cylinderTeeth: v })}",
    replace: "onChange={(v) => update({ cylinderTeeth: v })}" },
  { label: "the press gear no longer re-works the cylinder", file: "app/amber/page.jsx",
    find: "onChange={(v) => updateLayout({ gearPitch: v })}",
    replace: "onChange={(v) => update({ gearPitch: v })}" },
  { label: "the product type no longer re-works the label", file: "app/amber/page.jsx",
    find: "onChange={(v) => updateLayout({ bagType: v })}",
    replace: "onChange={(v) => update({ bagType: v })}" },
  { label: "a typed label cylinder no longer re-works the gap", file: "app/amber/page.jsx",
    find: "onChange={(v) => updateLayout({ cylinder: v })}",
    replace: "onChange={(v) => update({ cylinder: v })}" },
  { label: "the page stops working anything out", file: "app/amber/page.jsx",
    find: "      return { ...next, ...labelLayoutPatch(next, keys) };",
    replace: "      return next;" },
  { label: "the page sends the typed figures at Submit", file: "app/amber/page.jsx",
    find: "      setSpecState(settled);\n      await saveSubmission(user, { id, spec: settled, notSure, files });",
    replace: "      await saveSubmission(user, { id, spec, notSure, files });" },
  { label: "a worked-out cylinder stays Not sure", file: "app/amber/page.jsx",
    find: '      setNotSure((prev) => prev.filter((k) => k !== "cylinder"));',
    replace: "      // left as it was" },
  { label: "the worked-out cylinder can be typed over", file: "app/amber/page.jsx",
    find: "  if (fromTeeth != null) {\n    return (",
    replace: "  if (false) {\n    return (" },
  { label: "a no-fit gap is not shown in red", file: "app/amber/page.jsx",
    find: '  if (chk.status === "nofit") {\n    return (',
    replace: '  if (false) {\n    return (' },
  { label: "the gap round shows the stored figure, not the worked-out one", file: "app/amber/page.jsx",
    find: "      <Locked value={formatMm(chk.gap)} />",
    replace: "      <Locked value={spec?.gapAroundMm} />" },
  { label: "tooth size cannot be answered Not sure", file: "app/amber/page.jsx",
    find: '              notSureKey="cylinderTeeth" notSure={notSure} onNotSure={toggleNotSure}\n',
    replace: "" },
  { label: "Cylinder and Tooth size are not swapped on a Label", file: "app/amber/page.jsx",
    find: "          {isLabel ? (",
    replace: "          {false ? (" },
  { label: "the job name example is a real job again", file: "app/amber/page.jsx",
    find: 'hint="For example: Sunny Meadow Potatoes 10kg"',
    replace: 'hint="For example: Bordeaux Washed Potatoes 10kg"' },
  { label: "the AMBER logo is dropped from the price card", file: "app/amber/page.jsx",
    find: '          src="/images/amber-logo.svg"',
    replace: '          src="/hero.jpg"' },
  { label: "the AMBER logo stops filling the card's height", file: "app/amber/page.jsx",
    find: 'className="block shrink-0 self-stretch w-28 object-contain bg-[#FBF6EC] border-l border-accent-500 sm:absolute sm:inset-y-0 sm:right-0 sm:h-full sm:w-auto sm:aspect-square sm:object-cover"',
    replace: 'className="block h-16 w-16 shrink-0"' },
  { label: "the server stops saving the worked-out figures", file: "app/api/amber/submit/route.js",
    find: "      if (layoutChanged) patch.spec = specNow;",
    replace: "      // spec not saved" },
  { label: "the server stops working the figures out", file: "app/api/amber/submit/route.js",
    find: "    const specNow = settleLabelLayout(specBefore);",
    replace: "    const specNow = specBefore;" },

  // ─── due time ─────────────────────────────────────────────────────────────
  {
    label: "due time no longer moves to the next working day",
    file: "lib/amber-due.mjs",
    find: "  const due = nextWorkingDay({ year: s.year, month: s.month, day: s.day });",
    replace: "  const due = { year: s.year, month: s.month, day: s.day };",
  },
  {
    label: "weekends are treated as working days",
    file: "lib/amber-due.mjs",
    find: "  if (dow === 0 || dow === 6) return false;",
    replace: "  if (false) return false;",
  },
  {
    label: "public holidays are treated as working days",
    file: "lib/amber-due.mjs",
    find: "  return !isPublicHoliday(year, month, day);",
    replace: "  return true;",
  },
  {
    label: "Easter holidays are dropped from the holiday table",
    file: "lib/amber-due.mjs",
    find: "  add(shiftDate(easter, -2)); // Good Friday",
    replace: "  // Good Friday removed by mutation",
  },

  // ─── webhook signature ────────────────────────────────────────────────────
  {
    label: "any signature at all is accepted",
    file: "lib/amber-signature.mjs",
    find: "    if (timingSafeEqual(entry.slice(comma + 1), want)) {",
    replace: "    if (true) {",
  },
  {
    label: "an old captured call can be replayed",
    file: "lib/amber-signature.mjs",
    find: "  if (Math.abs(nowSeconds - ts) > toleranceSeconds) {",
    replace: "  if (false) {",
  },
  {
    label: "a missing signing secret no longer stops anything",
    file: "lib/amber-signature.mjs",
    find: '  if (!secret) return { valid: false, reason: "no signing secret configured" };',
    replace: "  if (!secret) return { valid: true, reason: null };",
  },

  // ─── loop guard ───────────────────────────────────────────────────────────
  {
    label: "the daily reply cap is raised to 99",
    file: "lib/amber-loop-guard.mjs",
    find: "export const MAX_AUTO_REPLIES_PER_SENDER_PER_DAY = 3;",
    replace: "export const MAX_AUTO_REPLIES_PER_SENDER_PER_DAY = 99;",
  },
  {
    label: "out-of-office replies are answered",
    file: "lib/amber-loop-guard.mjs",
    find: '  if (autoSubmitted && autoSubmitted.trim().toLowerCase() !== "no") {',
    replace: "  if (false) {",
  },
  {
    label: "we reply to our own domain",
    file: "lib/amber-loop-guard.mjs",
    find: "  if (OUR_DOMAINS.includes(addressDomain(from))) {",
    replace: "  if (false) {",
  },

  // ─── the missing list and "Not sure" ──────────────────────────────────────
  {
    label: "an empty box no longer counts as missing",
    file: "lib/amber-spec.mjs",
    find: "    if (isBlank(value)) out.push(field.label);",
    replace: "    if (false) out.push(field.label);",
  },
  {
    label: '"Not sure" is treated as a missing answer and refuses the job',
    file: "lib/amber-spec.mjs",
    find: "    if (unsure.includes(field.key)) continue;",
    replace: "    // not-sure guard removed by mutation",
  },
  {
    label: "a job with no artwork is allowed through",
    file: "lib/amber-spec.mjs",
    find: '  if (files.length === 0) out.push("Artwork file");',
    replace: "  if (false) out.push(\"Artwork file\");",
  },
  {
    label: "a PO-approved customer no longer has to give a PO number",
    file: "lib/amber-spec.mjs",
    find: "  if (opts.poRequired && isBlank(spec.poNumber ?? s.poNumber)) {",
    replace: "  if (false) {",
  },

  {
    label: '"Not sure" answers are no longer noticed, so the clock starts anyway',
    file: "lib/amber-spec.mjs",
    find: "  const raw = Array.isArray(submission?.notSure) ? submission.notSure : [];",
    replace: "  const raw = [];",
  },
  {
    label: "a customer can shrug at ANY box, including the job name",
    file: "lib/amber-spec.mjs",
    find: "  return raw.filter((k) => NOT_SURE_ALLOWED.includes(k));",
    replace: "  return raw;",
  },
  {
    label: "gear and teeth are no longer asked for on a Label",
    file: "lib/amber-spec.mjs",
    find: "  return spec.bagType === \"Label\"",
    replace: "  return false",
  },
  {
    label: "155 thou drops off the plate list again",
    file: "lib/amber-spec.mjs",
    find: '  "45 thou", "67 thou", "100 thou", "112 thou", "125 thou", "155 thou",',
    replace: '  "45 thou", "67 thou", "100 thou", "112 thou", "125 thou",',
  },
  {
    label: "a job the MIS is still waiting on us for is treated as finished",
    file: "lib/amber-submit-rules.mjs",
    find: "      outcome: waitingOn.length > 0 ? \"made_waiting_on_us\" : \"made\",",
    replace: '      outcome: "made",',
  },
  {
    label: "a malformed yes from the MIS is believed",
    file: "lib/amber-submit-rules.mjs",
    find: "  if (body.ok === true && body.jobNumber) {",
    replace: "  if (body.ok === true) {",
  },
  {
    label: "a refusal on a 4xx loses the missing list again",
    file: "lib/amber-submit-rules.mjs",
    find: "  if (body?.ok === false) {",
    replace: "  if (false) {",
  },
  {
    label: "an Unauthorized is mistaken for a customer-fixable refusal",
    file: "lib/amber-submit-rules.mjs",
    find: "    if (missing.length > 0) {",
    replace: "    if (missing.length >= 0) {",
  },

  // ─── price ────────────────────────────────────────────────────────────────
  {
    label: "the first job is charged instead of being free",
    file: "lib/amber-pricing.mjs",
    find: "  if (!companyHasHadFreeJob) {",
    replace: "  if (false) {",
  },
  {
    label: "the repro price drifts back to the old R400",
    file: "lib/amber-pricing.mjs",
    find: "export const AMBER_REPRO_PRICE_EXCL_VAT = 499;",
    replace: "export const AMBER_REPRO_PRICE_EXCL_VAT = 400;",
  },

  // ─── one submission, one job, and forgery ─────────────────────────────────
  {
    label: "a second Submit makes a SECOND job",
    file: "lib/amber-submit-rules.mjs",
    find: "  if (submission?.jobNumber) {",
    replace: "  if (false) {",
  },
  {
    label: "anyone signed in can submit somebody else's files",
    file: "lib/amber-submit-rules.mjs",
    find: '  if (submission.uid !== caller.uid) return { allowed: false, reason: "not yours" };',
    replace: "  // ownership check removed by mutation",
  },

  // ─── inbound rules ────────────────────────────────────────────────────────
  {
    label: "the other site's mail is no longer ignored",
    file: "lib/amber-inbound-rules.mjs",
    find: "  if (candidates.some((a) => AMBER_ADDRESSES.includes(a))) return true;",
    replace: "  if (true) return true;",
  },
  {
    label: "files are held for 30 days instead of 14",
    file: "lib/amber-inbound-rules.mjs",
    find: "export const HOLD_DAYS = 14;",
    replace: "export const HOLD_DAYS = 30;",
  },
  {
    label: "a suspended account's files are kept",
    file: "lib/amber-inbound-rules.mjs",
    find: '  if (status === "suspended") {',
    replace: "  if (false) {",
  },
  {
    label: "a staff record can be matched as a customer",
    file: "lib/amber-inbound-rules.mjs",
    find: '    if (data.role !== "customer") continue;',
    replace: "    // role check removed by mutation",
  },

  {
    label: "noisy automatic mail is copied to sales@ as well",
    file: "lib/amber-inbound-rules.mjs",
    find: "  return !looksAutomatic(email).automatic;",
    replace: "  return true;",
  },

  // ─── the approved wording ─────────────────────────────────────────────────
  {
    label: "an approved email is reworded",
    file: "lib/amber-emails.mjs",
    find: '          "Thanks for sending this to AMBER. To start a job we need you to have a " +',
    replace: '          "Hi there! To start a job you need a " +',
  },
  {
    label: "the job-made email copies sales@ again, so sales@ gets it twice",
    file: "lib/amber-emails.mjs",
    find: "        // never sent for. A copy here as well would arrive twice. Cam 2026-11-11.\n        copyTo: [],",
    replace: "        // never sent for. A copy here as well would arrive twice. Cam 2026-11-11.\n        copyTo: [SALES_INBOX],",
  },

  // ─── plate order → FA jobs (one job per LINE, never per colour) ───────────
  {
    label: "only the first colour on a line gets a plate",
    file: "lib/order-jobs.mjs",
    find: "  return keys.map((key) => {",
    replace: "  return keys.slice(0, 1).map((key) => {",
  },
  {
    label: "colours are no longer listed in printing order",
    file: "lib/order-jobs.mjs",
    find: "  return [...process, ...spots];",
    replace: "  return ticked;",
  },
  {
    label: "an unticked colour box counts as a colour",
    file: "lib/order-jobs.mjs",
    find: "  const ticked = Object.keys(selected).filter((key) => selected[key]);",
    replace: "  const ticked = Object.keys(selected);",
  },
  {
    label: "the colour list is bolted onto every job name again",
    file: "lib/order-jobs.mjs",
    find: "  if (colours.length > MAX_COLOURS_ON_A_JOB_SHEET) {",
    replace: "  if (colours.length > 0) {",
  },
  {
    label: "a job with no size entered is billed as a 4 x 4 cm plate",
    file: "lib/plate-size.mjs",
    find: "  const billedWidthCm = w > 0 ? w + TRIM_CM : 0;",
    replace: "  const billedWidthCm = w + TRIM_CM;",
  },
  {
    label: "a line with no colours ticked gets no plate row at all",
    file: "lib/order-jobs.mjs",
    find: '    return [\n      { key: "", colour: "", width: page.widthMm, length: page.lengthMm, active: true },\n    ];',
    replace: "    return [];",
  },
  {
    label: "the job sheet is said to hold 99 colours",
    file: "lib/order-jobs.mjs",
    find: "export const MAX_COLOURS_ON_A_JOB_SHEET = 10;",
    replace: "export const MAX_COLOURS_ON_A_JOB_SHEET = 99;",
  },
  {
    label: "a colour name we do not recognise is silently dropped",
    file: "lib/order-jobs.mjs",
    find: '  if (key.startsWith("spot:")) return key.slice(5);\n  return key;',
    replace: '  if (key.startsWith("spot:")) return key.slice(5);\n  return "";',
  },
  {
    label: "yellow and black are swapped",
    file: "lib/order-jobs.mjs",
    find: 'const PROCESS_NAMES = { C: "Cyan", M: "Magenta", Y: "Yellow", K: "Black" };',
    replace: 'const PROCESS_NAMES = { C: "Cyan", M: "Magenta", Y: "Black", K: "Yellow" };',
  },
  {
    label: "every job claims to come from the first line",
    file: "lib/order-jobs.mjs",
    find: "    lineIndex: index,",
    replace: "    lineIndex: 0,",
  },
  {
    label: "plate rows arrive switched off",
    file: "lib/order-jobs.mjs",
    find: "      active: true,\n    };",
    replace: "      active: false,\n    };",
  },
  {
    label: "the customer's own job name is ignored",
    file: "lib/order-jobs.mjs",
    find: '    String(lineItem?.description || "").trim() ||',
    replace: '    "" ||',
  },

  {
    label: "a plate line takes a second FA job number",
    file: "app/api/orders/create/route.js",
    find: "      const jobNumberInt = await nextNumber(adminDb, jobCounter);",
    replace: "      const jobNumberInt = await twiceNextNumber(adminDb, jobCounter);",
  },
  {
    label: "the route stops using the one-job-per-line rule",
    file: "app/api/orders/create/route.js",
    find: "    const plannedJobs = jobsForOrder(",
    replace: "    const plannedJobs = perColourJobs(",
  },

  // ─── the plate size on the job sheet must be the one we BILL ─────────────
  {
    label: "the plate trim drops to zero, so the job sheet is a quarter small again",
    file: "lib/plate-size.mjs",
    find: "export const TRIM_CM = 4;",
    replace: "export const TRIM_CM = 0;",
  },
  {
    label: "the trim stops being added to the plate width",
    file: "lib/plate-size.mjs",
    find: "  const billedWidthCm = w > 0 ? w + TRIM_CM : 0;",
    replace: "  const billedWidthCm = w;",
  },
  {
    label: "the trim stops being added to the plate length",
    file: "lib/plate-size.mjs",
    find: "  const billedHeightCm = h > 0 ? h + TRIM_CM : 0;",
    replace: "  const billedHeightCm = h;",
  },
  {
    label: "each colour's own measured size is ignored",
    file: "lib/plate-size.mjs",
    find: "  const measured = separations.find((s) => s?.key === colourKey);",
    replace: "  const measured = null;",
  },
  {
    label: "a measured size of zero is trusted",
    file: "lib/plate-size.mjs",
    find: "  if (measured && positive(measured.bboxWidthCm) > 0 && positive(measured.bboxHeightCm) > 0) {",
    replace: "  if (measured) {",
  },
  {
    label: "the plate size stops being turned into millimetres",
    file: "lib/plate-size.mjs",
    find: "    widthMm: round2(billed.billedWidthCm * 10),",
    replace: "    widthMm: round2(billed.billedWidthCm),",
  },
  {
    label: "the job sheet goes back to the untrimmed page size",
    file: "lib/order-jobs.mjs",
    find: "    const plate = billedPlateMm(lineItem, key);",
    replace: "    const plate = { widthMm: Number(lineItem?.widthCm) * 10, lengthMm: Number(lineItem?.heightCm) * 10 };",
  },
  {
    label: "the price stops sharing the plate size rule with the job sheet",
    file: "lib/pricing.js",
    find: 'import { TRIM_CM, billedPlateDimensions, inkAreaForColour } from "./plate-size.mjs";',
    replace: "const TRIM_CM = 4;",
  },

  // ─── AMBER does artwork only ────────────────────────────────────────────
  {
    label: "a new AMBER job sheet can be a plates job again",
    file: "lib/amber-pricing.mjs",
    find: "export const NEW_SUBMISSION_KIND = CHOICE_REPRO;",
    replace: "export const NEW_SUBMISSION_KIND = CHOICE_PLATES;",
  },
  {
    label: "the server takes the job kind from the browser again",
    file: "app/api/amber/submission/route.js",
    find: "  const kind = NEW_SUBMISSION_KIND;",
    replace: '  const kind = body?.kind === "plates" ? "plates" : "repro";',
  },
  {
    label: "the kind of an existing job sheet can be switched again",
    file: "app/api/amber/submission/route.js",
    find: "  const patch = { updatedAt: new Date() };",
    replace: "  const patch = { updatedAt: new Date(), kind: body.kind };",
  },
  {
    label: "Submit makes a plates job instead of sending it to Order Plates",
    file: "app/api/amber/submit/route.js",
    find: '    if (submission?.kind && submission.kind !== "repro") {',
    replace: "    if (false) {",
  },
  {
    label: "the page offers plates as a choice again",
    file: "app/amber/page.jsx",
    find: "        <div className=\"font-semibold text-ink\">Artwork by AMBER</div>",
    replace: "        <div className=\"font-semibold text-ink\">Plates from my ready file</div>",
  },

  // ─── staff read only view (Cam 2026-10-26) ────────────────────────────────
  {
    label: "designers stop counting as staff",
    file: "lib/staff-view.mjs",
    find: 'Object.freeze(["admin", "operator", "designer"])',
    replace: 'Object.freeze(["admin", "operator"])',
  },
  {
    label: "nobody counts as staff any more",
    file: "lib/staff-view.mjs",
    find: "  return !!profile && STAFF_ROLES.includes(profile.role);",
    replace: "  return false;",
  },
  {
    label: "a pending customer counts as active",
    file: "lib/staff-view.mjs",
    find: 'profile.role === "customer" && profile.status === "active";',
    replace: 'profile.role === "customer";',
  },
  {
    label: "staff are allowed to save things",
    file: "lib/staff-view.mjs",
    find: "  if (isStaff(profile)) throw new Error(READ_ONLY_MESSAGE);",
    replace: "  if (false) throw new Error(READ_ONLY_MESSAGE);",
  },
  {
    label: "a save with no profile is let through",
    file: "lib/staff-view.mjs",
    find: '  if (!profile) throw new Error("Not signed in");',
    replace: "  if (!profile) return;",
  },
  {
    label: "a save from an unknown kind of account is let through",
    file: "lib/staff-view.mjs",
    find: '  if (profile.role !== "customer") throw new Error("This account cannot do that.");',
    replace: "",
  },
  {
    label: "staff are thrown to the job system after signing in again",
    file: "lib/staff-view.mjs",
    find: '  if (isStaff(profile)) return "/dashboard";',
    replace: "  if (isStaff(profile)) return JOB_SYSTEM_URL;",
  },
  {
    label: "staff see customer pages without being marked read only",
    file: "lib/staff-view.mjs",
    find: "  if (isStaff(profile)) return { show: true, to: null, staff: true };",
    replace: "  if (isStaff(profile)) return { show: true, to: null, staff: false };",
  },
  {
    label: "staff are kept off customer pages again",
    file: "lib/staff-view.mjs",
    find: "  if (isStaff(profile)) return { show: true, to: null, staff: true };",
    replace: '  if (isStaff(profile)) return { show: false, to: "/login?error=role", staff: false };',
  },
  {
    label: "a customer with an unknown status is shown the page",
    file: "lib/staff-view.mjs",
    find: '  if (profile.status !== "active") return { show: false, to: null, staff: false };',
    replace: "",
  },
  {
    label: "staff are thrown off the public pages",
    file: "lib/staff-view.mjs",
    find: "  if (isStaff(profile)) return null;",
    replace: '  if (isStaff(profile)) return "/dashboard";',
  },
  {
    label: "staff lose the signed-in menu",
    file: "lib/staff-view.mjs",
    find: "  return isActiveCustomer(profile) || isStaff(profile);",
    replace: "  return isActiveCustomer(profile);",
  },
  {
    label: "staff see the team's internal notes on a job",
    file: "lib/staff-view.mjs",
    find: '  return (comments || []).filter((c) => c?.visibility === "customer");',
    replace: "  return (comments || []).filter(Boolean);",
  },
  {
    label: "approving a proof no longer checks who is approving",
    file: "lib/approvals.js",
    find: "  assertMayAct(profile);",
    replace: "",
  },
  {
    label: "the approval box shows staff the Approve button",
    file: "components/ApprovalActions.jsx",
    find: "  if (isStaff(profile)) {",
    replace: "  if (false) {",
  },
  {
    label: "posting a job message no longer checks who is posting",
    file: "lib/comments.js",
    find: "  assertMayAct(author?.role ? { role: author.role } : null);",
    replace: "",
  },
  {
    label: "the message box no longer passes the role to the check",
    file: "components/JobCommentsThread.jsx",
    find: "          role: profile?.role,\n",
    replace: "",
  },
  {
    label: "staff can press Send on a job message",
    file: "components/JobCommentsThread.jsx",
    find: "    if (!text || posting || staff) return;",
    replace: "    if (!text || posting) return;",
  },
  {
    label: "staff get the message box instead of the read only note",
    file: "components/JobCommentsThread.jsx",
    find: "      {staff ? (",
    replace: "      {false ? (",
  },
  {
    label: "the conversation shows staff the internal notes",
    file: "components/JobCommentsThread.jsx",
    find: "  const shown = staff ? commentsAsCustomerSees(comments) : comments;",
    replace: "  const shown = comments;",
  },
  {
    label: "saving a profile no longer checks who is saving",
    file: "lib/profile.js",
    find: "export async function updateMyProfile({ uid, patch, profile }) {\n  assertMayAct(profile);",
    replace: "export async function updateMyProfile({ uid, patch, profile }) {",
  },
  {
    label: "saving email settings no longer checks who is saving",
    file: "lib/profile.js",
    find: "export async function updateNotificationPreferences({ uid, prefs, profile }) {\n  assertMayAct(profile);",
    replace: "export async function updateNotificationPreferences({ uid, prefs, profile }) {",
  },
  {
    label: "the profile page stops passing who is saving",
    file: "app/profile/page.jsx",
    find: "patch: form, profile })",
    replace: "patch: form })",
  },
  {
    label: "the profile Save button works for staff",
    file: "app/profile/page.jsx",
    find: 'disabled={staff || state.status === "submitting"}',
    replace: 'disabled={state.status === "submitting"}',
  },
  {
    label: "the email settings switches work for staff",
    file: "app/profile/notifications/page.jsx",
    find: "    if (!prefs || !user?.uid || staff) return;",
    replace: "    if (!prefs || !user?.uid) return;",
  },
  {
    label: "placing a plate order no longer checks who is ordering",
    file: "lib/orders.js",
    find: "  assertMayAct(profile);",
    replace: "",
  },
  {
    label: "the place order button works for staff",
    file: "app/order/new/page.jsx",
    find: "disabled={staff || submitting}",
    replace: "disabled={submitting}",
  },
  {
    label: "the order form sends a staff order on",
    file: "app/order/new/page.jsx",
    find: "    if (staff) {\n      setError(READ_ONLY_MESSAGE);\n      return;\n    }\n    const v = validate();",
    replace: "    const v = validate();",
  },
  {
    label: "the order page stops using the one gate",
    file: "app/order/new/page.jsx",
    find: "  const gate = customerPageGate({ user, profile, loading });",
    replace: "  const gate = { show: true, to: null, staff: false };",
  },
  {
    label: "the AMBER page makes a job sheet for staff",
    file: "app/amber/page.jsx",
    find: "    if (staff) throw new Error(READ_ONLY_MESSAGE);",
    replace: "",
  },
  {
    label: "the AMBER Submit button works for staff",
    file: "app/amber/page.jsx",
    find: "disabled={staff || busy || missing.length > 0}",
    replace: "disabled={busy || missing.length > 0}",
  },
  {
    label: "the AMBER upload box works for staff",
    file: "app/amber/page.jsx",
    find: "          disabled={staff || busy}\n          className=\"mt-3 block text-sm\"",
    replace: "          disabled={busy}\n          className=\"mt-3 block text-sm\"",
  },
  {
    label: "AMBER Submit sends a staff job on",
    file: "app/amber/page.jsx",
    find: "  async function onSubmit() {\n    if (staff) {\n      setError(READ_ONLY_MESSAGE);\n      return;\n    }",
    replace: "  async function onSubmit() {",
  },
  {
    label: "staff can start a card payment",
    file: "app/order/[orderId]/success/page.jsx",
    find: "    if (isStaff(profile)) {",
    replace: "    if (false) {",
  },
  {
    label: "the staff banner never shows",
    file: "components/StaffBanner.jsx",
    find: "  if (loading || !user || !isStaff(profile)) return null;",
    replace: "  if (true) return null;",
  },
  {
    label: "the staff banner is left off the site",
    file: "app/layout.jsx",
    find: "          <StaffBanner />\n",
    replace: "",
  },
  {
    label: "customer pages stop using the one gate",
    file: "components/CustomerGuard.jsx",
    find: "  const gate = customerPageGate({ user, profile, loading });",
    replace: "  const gate = { show: true, to: null };",
  },
  {
    label: "public pages throw signed-in staff to the job system again",
    file: "components/RedirectIfSignedIn.jsx",
    find: "    if (to) router.replace(to);",
    replace: '    if (user) window.location.href = "https://jobs.flexoafrica.com";',
  },
  {
    label: "the sign-in page keeps its own copy of the rule again",
    file: "lib/auth.js",
    find: 'export { postLoginPath } from "./staff-view.mjs";',
    replace: 'export function postLoginPath(profile) { if (profile && profile.role === "admin") return "https://jobs.flexoafrica.com"; return "/dashboard"; }',
  },
  {
    label: "the menu goes back to its own rule",
    file: "components/Nav.jsx",
    find: "  const isSignedIn = showsSignedInMenu({ user, profile, loading });",
    replace: '  const isSignedIn = !!user && !loading && profile?.status === "active";',
  },
  {
    label: "the footer goes back to its own rule",
    file: "components/Footer.jsx",
    find: "  const isSignedIn = showsSignedInMenu({ user, profile, loading });",
    replace: '  const isSignedIn = !!user && !loading && profile?.status === "active";',
  },
  {
    label: "the dashboard keeps its own copy of the gate again",
    file: "app/dashboard/layout.jsx",
    find: '  return <CustomerGuard loadingText="Loading your dashboard...">{children}</CustomerGuard>;',
    replace: "  return <>{children}</>;",
  },
  {
    label: "a staff dashboard with no company spins for ever",
    file: "app/dashboard/page.jsx",
    find: "    if (user?.uid && isStaff(profile) && !profile?.company) {",
    replace: "    if (false) {",
  },
  {
    label: "a staff job list with no company spins for ever",
    file: "app/jobs/page.jsx",
    find: "    if (user?.uid && isStaff(profile) && !profile?.company) {",
    replace: "    if (false) {",
  },
  // ─── button labels ────────────────────────────────────────────────────────
  {
    label: "the menu goes back to Order artwork with a small a",
    file: "components/Nav.jsx",
    find: '  { href: "/amber", label: "Order Artwork" },',
    replace: '  { href: "/amber", label: "Order artwork" },',
  },
  {
    label: "the ordering page artwork card goes back to a small a",
    file: "app/order/page.jsx",
    find: '            title="Order Artwork"',
    replace: '            title="Order artwork"',
  },
  {
    label: "the ordering page artwork button goes back to a small a",
    file: "app/order/page.jsx",
    find: '            cta="Order Artwork"',
    replace: '            cta="Order artwork"',
  },
  {
    label: "the ordering page plates card goes back to a small p",
    file: "app/order/page.jsx",
    find: '            title="Order Plates"',
    replace: '            title="Order plates"',
  },
  {
    label: "the ordering page plates button goes back to a small p",
    file: "app/order/page.jsx",
    find: '            cta="Order Plates"',
    replace: '            cta="Order plates"',
  },
  {
    label: "the AMBER page link goes back to Order plates instead",
    file: "app/amber/page.jsx",
    find: "          Order Plates instead",
    replace: "          Order plates instead",
  },
  // ─── "First job free" shown only once confirmed ──────────────────────────
  {
    label: "the page says free while the check is still loading",
    file: "lib/amber-pricing.mjs",
    find: "  return terms?.companyHasHadFreeJob === false;",
    replace: "  return !terms?.companyHasHadFreeJob;",
  },
  {
    label: "the page ignores the check and goes back to its old reading",
    file: "lib/amber-pricing.mjs",
    find: "    priceReproJob({ companyHasHadFreeJob: !freeJobConfirmed(terms) }),",
    replace: "    priceReproJob({ companyHasHadFreeJob: !!terms?.companyHasHadFreeJob }),",
  },
  {
    label: "a login with no company is told free",
    file: "lib/amber-pricing.mjs",
    find: "  if (!String(company).trim()) return null;",
    replace: "",
  },
  {
    label: "a company not on the customer list is told free",
    file: "lib/amber-pricing.mjs",
    find: "  if (!customerFound) return null;",
    replace: "",
  },
  {
    label: "a company that already had its free job is told free again",
    file: "lib/amber-pricing.mjs",
    find: "  if (sheetJobNumbers.some((n) => !!n)) return true;",
    replace: "",
  },
  {
    label: "a full page of sheets is treated as proof of a free job",
    file: "lib/amber-pricing.mjs",
    find: "  if (sheetJobNumbers.length >= readLimit) return null;",
    replace: "",
  },
  {
    label: "the AMBER page goes back to saying free while loading",
    file: "app/amber/page.jsx",
    find: "    return priceShownToCustomer(terms, flavourCount(spec));",
    replace: "    return priceReproJob({ companyHasHadFreeJob: !!terms?.companyHasHadFreeJob });",
  },
  {
    label: "the price check says free when it cannot find the company",
    file: "app/api/amber/price/route.js",
    find: "    let companyHasHadFreeJob = null;",
    replace: "    let companyHasHadFreeJob = false;",
  },
  {
    label: "the price check only reads 50 sheets again",
    file: "app/api/amber/price/route.js",
    find: "        .limit(FREE_JOB_CHECK_LIMIT)",
    replace: "        .limit(50)",
  },
  {
    label: "the price check runs for a company not on the customer list",
    file: "app/api/amber/price/route.js",
    find: "    if (company && customer) {",
    replace: "    if (company) {",
  },
  // ─── sales@ hears about every portal order (Cam 2026-11-11) ──────────────
  {
    label: "the sales@ email goes to somebody else",
    file: "lib/sales-alert.mjs",
    find: 'export const SALES_ALERT_TO = "sales@flexoafrica.com";',
    replace: 'export const SALES_ALERT_TO = "admin@flexoafrica.com";',
  },
  {
    label: "an unpaid card order is no longer flagged",
    file: "lib/sales-alert.mjs",
    find: '      "Payment: CARD, NOT PAID YET. The jobs are already on the MIS. " +',
    replace: '      "Payment: card. " +',
  },
  {
    label: "a company not on the customer list is no longer flagged",
    file: "lib/sales-alert.mjs",
    find: "  if (order.matchedCustomer === false) {",
    replace: "  if (false) {",
  },
  {
    label: "the plate lines lose their colours",
    file: "lib/sales-alert.mjs",
    find: '        (colours.length ? ` (${colours.join(", ")})` : ""),',
    replace: '        "",',
  },
  {
    label: "a job waiting on a Not sure box is not called out",
    file: "lib/sales-alert.mjs",
    find: "  const waiting = waitingOn.length > 0;",
    replace: "  const waiting = false;",
  },
  {
    label: "a first free job is shown at full price",
    file: "lib/sales-alert.mjs",
    find: '`Price: ${job.firstFree ? "FIRST JOB FREE"',
    replace: '`Price: ${false ? "FIRST JOB FREE"',
  },
  {
    label: "MIS warnings are dropped from the email",
    file: "lib/sales-alert.mjs",
    find: "  if (warnings.length) {",
    replace: "  if (false) {",
  },
  {
    label: "a customer's line break can add a line to the email",
    file: "lib/sales-alert.mjs",
    find: '    .replace(/[\\r\\n\\t]+/g, " ")',
    replace: '    .replace(/[\\t]+/g, " ")',
  },
  {
    label: "rands lose their cents comma",
    file: "lib/sales-alert.mjs",
    find: '  return `${n < 0 ? "-" : ""}R${spaced},${cents}`;',
    replace: '  return `${n < 0 ? "-" : ""}R${spaced}.${cents}`;',
  },
  {
    label: "a plate order stops emailing sales@",
    file: "app/api/orders/create/route.js",
    find: "        await sendSalesAlert({ ...alert, replyTo: profile.email || decoded.email });",
    replace: "        // sales@ email removed",
  },
  {
    label: "an artwork Submit stops emailing sales@",
    file: "app/api/amber/submit/route.js",
    find: "        await sendSalesAlert({ ...alert, replyTo: user?.email });",
    replace: "        // sales@ email removed",
  },
  {
    label: "a job waiting on us no longer emails sales@",
    file: "app/api/amber/submit/route.js",
    find: "    if (!answer.again) {\n      try {\n        const alert = buildArtworkJobAlert({",
    replace: "    if (!answer.again && answer.outcome === \"made\") {\n      try {\n        const alert = buildArtworkJobAlert({",
  },
  {
    label: "the sender writes to the customer as well",
    file: "lib/amber-server.js",
    find: "    to: [SALES_ALERT_TO],",
    replace: "    to: [SALES_ALERT_TO, reply],",
  },
  // ─── the shorter AMBER form (Cam 2026-11-11) ─────────────────────────────
  {
    label: "plate thickness is asked of the customer again",
    file: "lib/amber-spec.mjs",
    find: '  { key: "printDirection",  label: "Print direction" },\n  { key: "colours",         label: "Inks, in print order" },\n];',
    replace: '  { key: "printDirection",  label: "Print direction" },\n  { key: "colours",         label: "Inks, in print order" },\n  { key: "plateThickness",  label: "Plate thickness" },\n];',
  },
  {
    label: "distortion is no longer parked with us",
    file: "lib/amber-spec.mjs",
    find: '  { key: "plateDistortion", label: "Distortion" },\n];\n\n// Gear and teeth are asked for on LABELS only',
    replace: '];\n\n// Gear and teeth are asked for on LABELS only',
  },
  {
    label: "a value already on the sheet is parked anyway",
    file: "lib/amber-spec.mjs",
    find: "    if (isBlank(spec[field.key]) && !out.includes(field.key)) out.push(field.key);",
    replace: "    if (!out.includes(field.key)) out.push(field.key);",
  },
  {
    label: "the parked boxes are added twice",
    file: "lib/amber-spec.mjs",
    find: "    if (isBlank(spec[field.key]) && !out.includes(field.key)) out.push(field.key);",
    replace: "    if (isBlank(spec[field.key])) out.push(field.key);",
  },
  {
    label: "Submit stops telling the job system what waits on us",
    file: "app/api/amber/submit/route.js",
    find: "      const patch = { notSure: notSureNow, updatedAt: new Date() };",
    replace: "      const patch = { updatedAt: new Date() };",
  },
  {
    label: "a job waiting on us gets no email again",
    file: "app/api/amber/submit/route.js",
    find: '    if ((answer.outcome === "made" || answer.outcome === "made_waiting_on_us") && !answer.again) {',
    replace: '    if (answer.outcome === "made" && !answer.again) {',
  },
  {
    label: "a job waiting on us is promised a due time",
    file: "app/api/amber/submit/route.js",
    find: '        kind: answer.outcome === "made" ? JOB_MADE : JOB_RECEIVED,',
    replace: "        kind: JOB_MADE,",
  },
  {
    label: "the waiting email promises a time anyway",
    file: "lib/amber-emails.mjs",
    find: '            "are in. You will have your PDF proof for approval within 24 " +',
    replace: '            "are in. You will have your PDF proof for approval within 24 hours, guaranteed " +',
  },
  {
    label: "the page shows the plate thickness box again",
    file: "app/amber/page.jsx",
    find: '          <Text label="Printer (if you know it)" hint="Who prints it, for example Bright Bag Printers. Leave it blank if you are not sure"',
    replace: '          <Choose label="Plate thickness" value={spec.plateThickness} options={[]} onChange={() => {}} />\n          <Text label="Printer (if you know it)" hint="Who prints it"',
  },
  // ─── Printer optional (Cam 2026-11-11, MIS PR #72) ───────────────────────
  {
    label: "printer is required of the customer again",
    file: "lib/amber-spec.mjs",
    find: '  { key: "description",     label: "Job name" },\n  { key: "bagType",',
    replace: '  { key: "description",     label: "Job name" },\n  { key: "printer",         label: "Printer" },\n  { key: "bagType",',
  },
  {
    label: "the printer box stops saying it is optional",
    file: "app/amber/page.jsx",
    find: '          <Text label="Printer (if you know it)" hint=',
    replace: '          <Text label="Printer" hint=',
  },
  {
    label: "the waiting email forgets the printer may be unknown",
    file: "lib/amber-emails.mjs",
    find: '            "your printer and its plate settings, and AMBER starts as soon as they " +',
    replace: '            "the plate settings for your printer, and AMBER starts as soon as they " +',
  },
];

function hash(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

// Run EVERY test file, found on disk, exactly as `npm test` does.
//
// This used to name tests/amber.test.mjs on its own. That meant a new test
// file was invisible here, so mutation testing silently stopped covering it
// and every break in the new code looked like it survived. Found 26 Oct 2026
// while adding the plate-order tests. Never hard-code the list again.
const TEST_FILES = readdirSync("tests")
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => `tests/${name}`);

if (TEST_FILES.length === 0) {
  console.error("FAILED: no test files found in tests/ — nothing to mutate against.");
  process.exit(1);
}

function suitePasses() {
  try {
    execFileSync("node", ["--test", ...TEST_FILES], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

console.log("Checking the suite is green before we start...");
if (!suitePasses()) {
  console.error("FAILED: the suite is already red. Fix that first.");
  process.exit(1);
}
console.log("Green.\n");

let survivors = 0;
// A mutation whose text no longer exists in the file tests NOTHING, and the
// line saying so scrolls past in the middle of a long run. Counted here so it
// lands in the summary at the bottom where it cannot be missed.
let brokenSetups = 0;
for (const m of MUTATIONS) {
  const original = readFileSync(m.file, "utf8");
  const before = hash(original);

  const count = original.split(m.find).length - 1;
  if (count !== 1) {
    brokenSetups += 1;
    console.error(`SETUP ERROR  ${m.label}`);
    console.error(`  "${m.find.slice(0, 60)}..." appears ${count} times in ${m.file}, expected 1`);
    process.exitCode = 1;
    continue;
  }

  const mutated = original.replace(m.find, m.replace);
  writeFileSync(m.file, mutated);

  // Prove the sabotage really landed: the file changed, and the original text
  // is gone. Without this check a typo'd mutation would "pass" by doing
  // nothing at all.
  const onDisk = readFileSync(m.file, "utf8");
  const landed = hash(onDisk) !== before && !onDisk.includes(m.find);

  let red = false;
  try {
    red = !suitePasses();
  } finally {
    writeFileSync(m.file, original);
    if (hash(readFileSync(m.file, "utf8")) !== before) {
      console.error(`COULD NOT RESTORE ${m.file} — stop and check it by hand`);
      process.exit(1);
    }
  }

  if (!landed) {
    console.error(`SABOTAGE DID NOT LAND  ${m.label}`);
    brokenSetups += 1;
    process.exitCode = 1;
  } else if (!red) {
    console.error(`SURVIVED (no test caught it)  ${m.label}  [${m.file}]`);
    survivors += 1;
    process.exitCode = 1;
  } else {
    console.log(`caught  ${m.label}`);
  }
}

console.log(
  `\n${MUTATIONS.length} mutations, ${survivors} survived, ` +
    `${brokenSetups} could not be set up.`,
);
if (brokenSetups > 0) {
  console.error(
    `${brokenSetups} mutation(s) no longer match the code, so they tested nothing. ` +
      "Point them at the real text and run again.",
  );
}
if (survivors === 0 && brokenSetups === 0 && !process.exitCode) {
  console.log("Every deliberate break was caught, and every file was restored.");
}
