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
    label: "the job-made email stops copying sales@",
    file: "lib/amber-emails.mjs",
    find: "        copyTo: [SALES_INBOX],",
    replace: "        copyTo: [],",
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
