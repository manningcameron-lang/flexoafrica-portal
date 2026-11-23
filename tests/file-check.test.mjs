// Tests for AMBER's file check on customer uploads (Cam, 23 Nov 2026).
//
// Run them with:  npm test     Every test here is mutation-tested by
// tests/mutate.mjs (npm run mutate).
//
// What they prove, in Cam's terms:
//   - a browser can never write or edit a report (only our server can);
//   - a customer reads only their own report, and never one still with Cam;
//   - only Cam's login can send a report to a customer;
//   - a STOP with no answer holds the job; FIX and NOTE never do;
//   - a legal-copy finding can never be saved above NOTE;
//   - answers land on the right report and the right job;
//   - the customer's email is Cam's approved wording, word for word.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  BY_AMBER,
  BY_AUTO,
  LEGAL_LINE,
  SHOWN_FIRST,
  STATUS_ANSWERED,
  STATUS_DRAFT,
  STATUS_REVIEW,
  STATUS_SENT,
  applyAnswers,
  buildAnswersAlert,
  buildReleaseEmail,
  checkReport,
  customerView,
  editReport,
  firstName,
  holdsJob,
  isLegalFinding,
  mayReadSubmission,
  needsAnswer,
  plain,
  readyToSubmit,
  releaseProblems,
  sortFindings,
  splitForShow,
  statusLabel,
} from "../lib/file-check.mjs";
import { FILE_CHECK_RELEASERS, mayReleaseFileCheck, mayUseFileCheckScreen } from "../lib/staff-view.mjs";

const read = (p) => readFileSync(p, "utf8");

const opts3 = [
  { key: "A", text: "Make it 6 pt and tighten the layout", recommended: true },
  { key: "B", text: "Dark text on a pale panel" },
  { key: "C", text: "Leave it and accept the risk" },
];

function sample(extra = {}) {
  // A fresh copy every time, so one test's deliberate fault never leaks into another.
  return JSON.parse(JSON.stringify({
    printer: "Sack Force (Soma)",
    pressClass: "CI bag press",
    limitsAreDefaults: true,
    findings: [
      { stage: "5 Type and lines", level: "FIX", what: "The back panel text is 4 pt white out of the dark green.",
        effect: "White text that small fills in on this press.", options: opts3 },
      { stage: "1 Can the file be used", level: "STOP", what: "This is a photo of the bag, not the design file.",
        effect: "Plates need the working file so each colour can be split.",
        options: [{ key: "A", text: "Send the Illustrator or PDF file", recommended: true }, { key: "B", text: "AMBER rebuilds it from the photo" }] },
      { stage: "10 Legal copy", level: "NOTE", what: "\"Nett 10 KG\" is written in a way the weights rules do not use.",
        effect: "Retailers may ask for it to be changed.", options: [] },
    ],
    tidyList: ["Die lines moved to a layer that does not print"],
    notChecked: ["Colour accuracy cannot be judged from a PDF"],
    ...extra,
  }));
}

function saved(status = STATUS_REVIEW, extra = {}) {
  const r = checkReport(sample()).report;
  return { id: "rep1", ...r, status, submissionId: "sub1", jobNumber: "FA005999", tidyRefused: [], ...extra };
}

const CUSTOMER = { uid: "c1", profile: { role: "customer", status: "active" } };
const OTHER = { uid: "c2", profile: { role: "customer", status: "active" } };
const ADMIN_PROFILE = { role: "admin", status: "active" };
const CAM = "manning.cameron@gmail.com";

// ─── the shape check ────────────────────────────────────────────────────────

test("a good report is accepted and sorted STOP, FIX, NOTE", () => {
  const r = checkReport(sample());
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  assert.deepEqual(r.report.findings.map((f) => f.level), ["STOP", "FIX", "NOTE"]);
  assert.deepEqual(r.report.findings.map((f) => f.id), [1, 2, 3]);
  assert.equal(r.report.createdBy, BY_AMBER);
  assert.equal(r.report.limitsAreDefaults, true);
  assert.equal(r.report.findings[0].answer, null);
});

test("only STOP, FIX and NOTE are allowed as levels", () => {
  const s = sample();
  s.findings[0].level = "URGENT";
  const r = checkReport(s);
  assert.equal(r.ok, false);
  assert.match(r.problems.join(" "), /STOP, FIX or NOTE/);
  s.findings[0].level = "fix";
  assert.equal(checkReport(s).ok, true, "lower case is read as the same level");
});

test("a legal finding is ALWAYS saved as a NOTE, even when AMBER or Cam says STOP", () => {
  for (const level of ["STOP", "FIX"]) {
    const s = sample();
    s.findings[2].level = level;
    const r = checkReport(s);
    assert.equal(r.ok, true);
    const legal = r.report.findings.find((f) => f.legal);
    assert.equal(legal.level, "NOTE");
  }
  const s2 = sample();
  s2.findings[0].legal = true; // marked legal, whatever the stage says
  const r2 = checkReport(s2);
  assert.equal(r2.report.findings.find((f) => f.what.startsWith("The back panel")).level, "NOTE");
  assert.equal(isLegalFinding({ stage: "Stage 10. Legal copy" }), true);
  assert.equal(isLegalFinding({ stage: "labelling rules" }), true);
  assert.equal(isLegalFinding({ stage: "5 Type and lines" }), false);
});

test("a legal note can never be pushed back above NOTE by an edit or by the customer view", () => {
  const r = saved();
  const edited = JSON.parse(JSON.stringify(r));
  edited.findings.find((f) => f.legal).level = "STOP";
  const e = editReport(r, edited);
  assert.equal(e.ok, true);
  assert.equal(e.report.findings.find((f) => f.legal).level, "NOTE");
  const sneaky = { ...saved(STATUS_SENT) };
  sneaky.findings = sneaky.findings.map((f) => (f.legal ? { ...f, level: "STOP" } : f));
  assert.equal(customerView(sneaky).findings.find((f) => f.legal).level, "NOTE");
});

test("the word illegal is refused", () => {
  const s = sample();
  s.findings[2].effect = "This is illegal in South Africa.";
  const r = checkReport(s);
  assert.equal(r.ok, false);
  assert.match(r.problems.join(" "), /illegal/);
});

test("every finding with options has exactly one Recommended", () => {
  const none = sample();
  none.findings[0].options = opts3.map((o) => ({ ...o, recommended: false }));
  assert.match(checkReport(none).problems.join(" "), /exactly one option must be Recommended \(it has 0\)/);
  const two = sample();
  two.findings[0].options = opts3.map((o) => ({ ...o, recommended: true }));
  assert.match(checkReport(two).problems.join(" "), /it has 3/);
  const notTrue = sample();
  notTrue.findings[0].options = [{ ...opts3[0], recommended: "yes" }, opts3[1]];
  assert.equal(checkReport(notTrue).ok, false, "only a real true counts as Recommended");
});

test("a STOP or FIX must give the customer at least two options", () => {
  const s = sample();
  s.findings[1].options = [{ key: "A", text: "Send the file", recommended: true }];
  assert.match(checkReport(s).problems.join(" "), /a STOP needs at least two options/);
  const n = sample();
  n.findings[2].options = [];
  assert.equal(checkReport(n).ok, true, "a NOTE needs none");
});

test("option keys are A to D, never twice, never empty, at most 4", () => {
  const bad = sample();
  bad.findings[0].options = [{ key: "Z", text: "x", recommended: true }, { key: "B", text: "y" }];
  assert.match(checkReport(bad).problems.join(" "), /A, B, C or D/);
  const twice = sample();
  twice.findings[0].options = [{ key: "A", text: "x", recommended: true }, { key: "A", text: "y" }];
  assert.match(checkReport(twice).problems.join(" "), /option A is there twice/);
  const empty = sample();
  empty.findings[0].options = [{ key: "A", text: "  ", recommended: true }, { key: "B", text: "y" }];
  assert.match(checkReport(empty).problems.join(" "), /the text is empty/);
  const many = sample();
  many.findings[0].options = ["A", "B", "C", "D", "E"].map((k, i) => ({ key: k, text: k, recommended: i === 0 }));
  assert.match(checkReport(many).problems.join(" "), /more than 4 options/);
});

test("a finding with no words is refused, and an empty report is refused", () => {
  const s = sample();
  s.findings[0].what = "";
  assert.match(checkReport(s).problems.join(" "), /"what" is empty/);
  assert.match(checkReport({ findings: [] }).problems.join(" "), /The report is empty/);
  assert.equal(checkReport(null).ok, false);
  assert.equal(checkReport([]).ok, false);
  assert.match(checkReport({}).problems.join(" "), /no findings list/);
});

test("no file paths, scripts or skill names reach a customer", () => {
  const leaks = [
    "See /Users/cameron/Dropbox/FA005999/AI Working for the fix.",
    "Ran trap_build.py on it.",
    "Per the flexo-master-prepress rules.",
    "As the sackforce-soma-setup says.",
    "Stored at amber/abc123/sub1/file.pdf",
    "C:\\Jobs\\FA005999",
    "The issue spotter flagged it.",
    "Checked against the Rules Book.",
    "My skill says so.",
  ];
  for (const text of leaks) {
    const s = sample();
    s.findings[0].effect = text;
    assert.equal(checkReport(s).ok, false, `should refuse: ${text}`);
  }
  const it = sample({ printer: "Flexo-It Marketing" });
  it.findings[0].effect = "Flexo-It prints this on a 3 mm Setup gap.";
  assert.equal(checkReport(it).ok, true, "the printer Flexo-It is not a skill name");
  const ok = sample();
  ok.findings[0].effect = "Built from C / M / Y on a 1/2 tone, 10.5 mm high.";
  assert.equal(checkReport(ok).ok, true, "ordinary print words are fine");
  for (const field of ["tidyList", "notChecked"]) {
    const t = sample({ [field]: ["see ~/flexoafrica-tools/_bench/x"] });
    assert.equal(checkReport(t).ok, false, `${field} is checked too`);
  }
  const opt = sample();
  opt.findings[0].options[1].text = "Run fix_holes.py";
  assert.equal(checkReport(opt).ok, false, "options are checked too");
  const pr = sample({ printer: "see the crown-bags-setup" });
  assert.equal(checkReport(pr).ok, false, "the printer line is checked too");
});

test("plain text only: no tags, no em dashes, lengths capped", () => {
  assert.equal(plain("<b>Bold</b> text — here", 100), "Bold text, here");
  assert.equal(plain("a\u2013b", 100), "a, b");
  assert.equal(plain("x".repeat(900), 500).length, 500);
  const s = sample();
  s.findings[0].what = "w".repeat(2000);
  assert.equal(checkReport(s).report.findings.find((f) => f.level === "FIX").what.length, 500);
});

test("at most 40 findings and 30 lines in a list", () => {
  const s = sample();
  s.findings = Array.from({ length: 41 }, () => ({ level: "NOTE", what: "x" }));
  assert.match(checkReport(s).problems.join(" "), /41 findings; the most is 40/);
  const t = sample({ tidyList: Array.from({ length: 31 }, () => "x") });
  assert.match(checkReport(t).problems.join(" "), /more than 30 lines/);
});

test("an engine report is marked automatic; anything else is AMBER's", () => {
  assert.equal(checkReport(sample(), { createdBy: BY_AUTO }).report.createdBy, BY_AUTO);
  assert.equal(checkReport(sample(), { createdBy: "someone" }).report.createdBy, BY_AMBER);
});

// ─── order and what is on show ───────────────────────────────────────────────

test("STOP first, then FIX, then NOTE, keeping AMBER's order inside each", () => {
  const out = sortFindings([
    { level: "NOTE", what: "n1" }, { level: "FIX", what: "f1" }, { level: "STOP", what: "s1" },
    { level: "FIX", what: "f2" }, { level: "STOP", what: "s2" },
  ]);
  assert.deepEqual(out.map((f) => f.what), ["s1", "s2", "f1", "f2", "n1"]);
  assert.deepEqual(out.map((f) => f.id), [1, 2, 3, 4, 5]);
});

test("about 8 on show, the rest behind show more", () => {
  const many = Array.from({ length: 11 }, (_, i) => ({ level: i < 3 ? "STOP" : "NOTE", what: `x${i}` }));
  const s = splitForShow(many);
  assert.equal(SHOWN_FIRST, 8);
  assert.equal(s.stop.length + s.fix.length + s.note.length, 8);
  assert.equal(s.hidden, 3);
  assert.equal(s.stop.length, 3, "every STOP is on show first");
  const all = splitForShow(many, true);
  assert.equal(all.hidden, 0);
  assert.equal(all.note.length, 8);
});

test("the staff screen's status words", () => {
  assert.equal(statusLabel(null), "Waiting for check");
  assert.equal(statusLabel(STATUS_REVIEW), "Check ready for review");
  assert.equal(statusLabel(STATUS_SENT), "Sent to customer");
  assert.equal(statusLabel(STATUS_ANSWERED), "Customer answered");
});

// ─── who sees what ───────────────────────────────────────────────────────────

test("a customer reads only their own upload; staff may look; nobody else", () => {
  const sub = { uid: "c1" };
  assert.equal(mayReadSubmission(CUSTOMER, sub), true);
  assert.equal(mayReadSubmission(OTHER, sub), false);
  assert.equal(mayReadSubmission({ uid: "c1", profile: { role: "customer", status: "suspended" } }, sub), false);
  assert.equal(mayReadSubmission({ uid: "c1", profile: { role: "customer", status: "pending" } }, sub), false);
  assert.equal(mayReadSubmission({ uid: "a1", profile: ADMIN_PROFILE }, sub), true);
  assert.equal(mayReadSubmission({ uid: "c1" }, sub), false, "no profile, no access");
  assert.equal(mayReadSubmission(CUSTOMER, { uid: "" }), false, "an upload with no owner is nobody's");
  assert.equal(mayReadSubmission({ uid: undefined, profile: CUSTOMER.profile }, { uid: undefined }), false);
  assert.equal(mayReadSubmission(CUSTOMER, null), false);
});

test("a customer never sees a check that is still with Cam, or a draft", () => {
  assert.equal(customerView(saved(STATUS_REVIEW)), null);
  assert.equal(customerView(saved(STATUS_DRAFT)), null);
  assert.notEqual(customerView(saved(STATUS_SENT)), null);
  assert.notEqual(customerView(saved(STATUS_ANSWERED)), null);
  assert.equal(customerView(null), null);
});

test("the customer's copy carries no staff names, emails or working fields", () => {
  const v = customerView(saved(STATUS_SENT, {
    releasedBy: "uidCam", releasedByEmail: CAM, savedBy: "uidX", savedByEmail: "x@flexoafrica.com",
    emailNote: "Email sent", submissionId: "sub1", pressClass: "secret class",
  }));
  const text = JSON.stringify(v);
  for (const leak of ["uidCam", CAM, "uidX", "x@flexoafrica.com", "Email sent", "secret class", "savedBy", "releasedBy"]) {
    assert.equal(text.includes(leak), false, `customer copy leaks ${leak}`);
  }
  assert.equal(v.id, "rep1");
  assert.equal(v.jobNumber, "FA005999");
  assert.equal(v.findings[0].level, "STOP");
});

// ─── only Cam sends ──────────────────────────────────────────────────────────

test("only Cam's admin login, by its verified email, may send a check", () => {
  assert.deepEqual([...FILE_CHECK_RELEASERS], [CAM]);
  assert.equal(mayReleaseFileCheck(ADMIN_PROFILE, CAM), true);
  assert.equal(mayReleaseFileCheck(ADMIN_PROFILE, "  Manning.Cameron@Gmail.com "), true);
  assert.equal(mayReleaseFileCheck(ADMIN_PROFILE, "sales@flexoafrica.com"), false, "another admin cannot");
  assert.equal(mayReleaseFileCheck({ role: "operator" }, CAM), false, "Cam's email on a non-admin profile cannot");
  assert.equal(mayReleaseFileCheck({ role: "designer" }, CAM), false);
  assert.equal(mayReleaseFileCheck({ role: "customer", status: "active" }, CAM), false);
  assert.equal(mayReleaseFileCheck(ADMIN_PROFILE, ""), false);
  assert.equal(mayReleaseFileCheck(ADMIN_PROFILE, undefined), false);
  assert.equal(mayReleaseFileCheck(null, CAM), false);
});

test("any staff login may use the file check screen; customers may not", () => {
  assert.equal(mayUseFileCheckScreen({ role: "admin" }), true);
  assert.equal(mayUseFileCheckScreen({ role: "operator" }), true);
  assert.equal(mayUseFileCheckScreen({ role: "designer" }), true);
  assert.equal(mayUseFileCheckScreen({ role: "customer", status: "active" }), false);
  assert.equal(mayUseFileCheckScreen(null), false);
});

test("a check can be sent only once, only AMBER's, only on an AMBER job with an FA number", () => {
  const sub = { kind: "repro", jobNumber: "FA005999" };
  assert.deepEqual(releaseProblems(saved(STATUS_REVIEW), sub), []);
  assert.match(releaseProblems(saved(STATUS_SENT), sub).join(" "), /already been sent/);
  assert.match(releaseProblems(saved(STATUS_ANSWERED), sub).join(" "), /already been sent/);
  assert.match(releaseProblems({ ...saved(STATUS_REVIEW), createdBy: BY_AUTO }, sub).join(" "), /Only AMBER's full check/);
  assert.match(releaseProblems(saved(STATUS_REVIEW), { kind: "plates", jobNumber: "FA1" }).join(" "), /only for AMBER artwork jobs/);
  assert.match(releaseProblems(saved(STATUS_REVIEW), { kind: "repro" }).join(" "), /not been made on the MIS/);
  assert.match(releaseProblems(saved(STATUS_REVIEW), null).join(" "), /upload was not found/);
  assert.match(releaseProblems(null, sub).join(" "), /not found/);
  assert.deepEqual(releaseProblems(saved(STATUS_REVIEW), { jobNumber: "FA1" }), [], "an older sheet with no kind is artwork");
});

test("Cam's edits go through the same check, and only before sending", () => {
  const r = saved(STATUS_REVIEW);
  const edited = JSON.parse(JSON.stringify(r));
  edited.findings = edited.findings.filter((f) => f.level !== "FIX");
  edited.findings[0].what = "Reworded by Cam.";
  const e = editReport(r, edited);
  assert.equal(e.ok, true);
  assert.equal(e.report.findings.length, 2);
  assert.equal(e.report.findings[0].what, "Reworded by Cam.");
  const broken = JSON.parse(JSON.stringify(r));
  broken.findings[0].options = [];
  assert.equal(editReport(r, broken).ok, false, "an edit cannot leave a STOP with no options");
  assert.equal(editReport(saved(STATUS_SENT), edited).ok, false, "a sent check cannot be changed");
  assert.equal(editReport(null, edited).ok, false);
});

// ─── the hold ────────────────────────────────────────────────────────────────

test("a released STOP with no answer holds the job", () => {
  assert.equal(holdsJob(saved(STATUS_SENT)), true);
});

test("FIX and NOTE never hold the job", () => {
  const s = sample();
  s.findings = s.findings.filter((f) => f.level !== "STOP");
  const r = { ...checkReport(s).report, status: STATUS_SENT };
  assert.equal(holdsJob(r), false);
});

test("nothing holds until the check is sent, and an answered STOP lets go", () => {
  assert.equal(holdsJob(saved(STATUS_REVIEW)), false, "the customer has not seen it yet");
  assert.equal(holdsJob(saved(STATUS_DRAFT)), false);
  const a = applyAnswers(saved(STATUS_SENT), { answers: { 1: "A", 2: "B" } });
  assert.equal(a.ok, true);
  assert.equal(holdsJob(a.report), false);
  assert.equal(holdsJob(null), false);
});

// ─── answers ─────────────────────────────────────────────────────────────────

test("answers land on the right findings, with notes and tidy refusals", () => {
  const a = applyAnswers(saved(STATUS_SENT), {
    answers: { 1: "b", 2: "A", 3: "" },
    notes: { 2: "Please keep the font." },
    tidyRefused: [0, 0, 7, -1, "x"],
  });
  assert.equal(a.ok, true, JSON.stringify(a.problems));
  assert.equal(a.report.status, STATUS_ANSWERED);
  assert.equal(a.report.findings[0].answer, "B");
  assert.equal(a.report.findings[1].answer, "A");
  assert.equal(a.report.findings[1].answerNote, "Please keep the font.");
  assert.equal(a.report.findings[2].answer, null);
  assert.deepEqual(a.report.tidyRefused, [0], "only real tidy lines, once each");
  assert.equal(a.report.id, "rep1");
  assert.equal(a.report.jobNumber, "FA005999");
});

test("every STOP and FIX must be answered, with one of its own options", () => {
  const missing = applyAnswers(saved(STATUS_SENT), { answers: { 1: "A" } });
  assert.equal(missing.ok, false);
  assert.match(missing.problems.join(" "), /pick an option for point 2/);
  const wrong = applyAnswers(saved(STATUS_SENT), { answers: { 1: "A", 2: "D" } });
  assert.match(wrong.problems.join(" "), /not one of the options/);
  assert.equal(readyToSubmit(saved().findings, { 1: "A" }), false);
  assert.equal(readyToSubmit(saved().findings, { 1: "A", 2: "Z" }), false);
  assert.equal(readyToSubmit(saved().findings, { 1: "A", 2: "C" }), true);
  assert.equal(needsAnswer(saved().findings).length, 2);
});

test("answers only once, only on a sent check, never on the automatic one", () => {
  assert.match(applyAnswers(saved(STATUS_ANSWERED), { answers: { 1: "A", 2: "A" } }).problems[0], /already sent your answers/);
  assert.match(applyAnswers(saved(STATUS_REVIEW), { answers: { 1: "A", 2: "A" } }).problems[0], /not open for answers/);
  assert.match(applyAnswers({ ...saved(STATUS_SENT), createdBy: BY_AUTO }, {}).problems[0], /automatic check does not take answers/);
  assert.equal(applyAnswers(null, {}).ok, false);
});

// ─── Cam's approved email ────────────────────────────────────────────────────

const flat = (s) => s.replace(/\s+/g, " ").trim();

test("the release email is Cam's approved wording, word for word", () => {
  const e = buildReleaseEmail({
    report: saved(STATUS_SENT), jobNumber: "FA005999", jobName: "Sunny Meadow Potatoes 10kg",
    contactName: "Thandi Mokoena", jobUrl: "https://portal.flexoafrica.com/jobs/abc123",
  });
  assert.equal(e.send, true);
  assert.equal(e.from, "Flexo Africa Portal <amber@flexoafrica.com>");
  assert.equal(e.replyTo, "sales@flexoafrica.com");
  assert.equal(e.subject, "AMBER has checked your file for FA005999");
  assert.equal(
    flat(e.text),
    "Hi Thandi, AMBER has checked the artwork you sent for Sunny Meadow Potatoes 10kg (FA005999). " +
      "There are 2 things to look at before we start. Please open your job on the portal, pick an option " +
      "for each one and press Submit my answers: https://portal.flexoafrica.com/jobs/abc123. " +
      "Nothing is changed until you answer. Flexo Africa",
  );
  assert.equal(e.text.includes("\u2014"), false);
});

test("one thing to answer says 'There is 1 thing'", () => {
  const s = sample();
  s.findings = s.findings.filter((f) => f.level !== "FIX");
  const e = buildReleaseEmail({ report: checkReport(s).report, jobNumber: "FA1", jobName: "Job", contactName: "Sam", jobUrl: "https://x" });
  assert.match(flat(e.text), /\(FA1\)\. There is 1 thing to look at before we start\./);
});

test("no email when nothing needs an answer, or no name, or no FA number", () => {
  const s = sample();
  s.findings = s.findings.filter((f) => f.level === "NOTE");
  const notes = buildReleaseEmail({ report: checkReport(s).report, jobNumber: "FA1", jobName: "J", contactName: "Sam" });
  assert.equal(notes.send, false);
  assert.match(notes.reason, /nothing in this check needs an answer/);
  assert.equal(buildReleaseEmail({ report: saved(), jobNumber: "FA1", jobName: "J", contactName: "" }).send, false);
  assert.equal(buildReleaseEmail({ report: saved(), jobNumber: "", jobName: "J", contactName: "Sam" }).send, false);
});

test("the email uses the customer's first name only, and the FA number when the job has no name", () => {
  assert.equal(firstName("  Thandi  Mokoena "), "Thandi");
  assert.equal(firstName("<b>Jo"), "Jo");
  assert.equal(firstName("O'Neil"), "O'Neil");
  const e = buildReleaseEmail({ report: saved(), jobNumber: "FA7", jobName: "", contactName: "Lee\nBcc: x@y", jobUrl: "https://x" });
  assert.match(e.text, /^Hi Lee,/);
  assert.match(flat(e.text), /sent for FA7 \(FA7\)/);
  assert.equal(e.subject.includes("\n"), false);
  const noLink = buildReleaseEmail({ report: saved(), jobNumber: "FA7", jobName: "J", contactName: "Lee" });
  assert.match(noLink.text, /https:\/\/portal\.flexoafrica\.com\/jobs\./);
});

test("sales@ gets the job number and every pick", () => {
  const a = applyAnswers(saved(STATUS_SENT), { answers: { 1: "B", 2: "A" }, notes: { 1: "Will send it tomorrow" }, tidyRefused: [0] }).report;
  const m = buildAnswersAlert({ report: a, jobNumber: "FA005999", jobName: "Sunny Meadow", company: "Top Flight Packaging", customerEmail: "c@x.com" });
  assert.equal(m.subject, "File check answered FA005999: Top Flight Packaging");
  assert.match(m.text, /Job: FA005999, Sunny Meadow/);
  assert.match(m.text, /1\. STOP: This is a photo of the bag/);
  assert.match(m.text, /picked B: AMBER rebuilds it from the photo/);
  assert.match(m.text, /picked A: Make it 6 pt and tighten the layout \(Recommended\)/);
  assert.match(m.text, /Their note: Will send it tomorrow/);
  assert.match(m.text, /Do NOT tidy these \(the customer said no\):\n- Die lines moved/);
  assert.match(m.text, /3\. NOTE: .*\n {3}no pick/);
});

// ─── the code around the rules ───────────────────────────────────────────────

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(js|jsx|mjs)$/.test(name)) out.push(p);
  }
  return out;
}
const SOURCE = [...walk("app"), ...walk("components"), ...walk("lib")];

test("a browser can never write a report: only the server file touches the reports", () => {
  for (const file of SOURCE) {
    const text = read(file);
    if (!text.includes('"fileChecks"')) continue;
    assert.equal(file, join("lib", "file-check-server.js"), `${file} names the reports list`);
  }
  const server = read("lib/file-check-server.js");
  assert.match(server, /from "@\/lib\/firebase-admin"/, "the reports are written with admin credentials");
  assert.doesNotMatch(server, /"use client"|from "firebase\/firestore"/);
  const client = read("lib/file-check-client.js");
  assert.doesNotMatch(client, /firebase\/firestore|setDoc|updateDoc|addDoc/);
  for (const m of client.matchAll(/send\(user, [`"]([^`"?]+)/g)) {
    assert.match(m[1], /^\/api\//, "the browser only ever calls our server");
  }
});

test("every staff screen call is checked on the server", () => {
  const route = read("app/api/staff/file-checks/route.js");
  for (const verb of ["GET", "POST", "PATCH", "DELETE"]) {
    const body = route.split(`export async function ${verb}(request) {`)[1] || "";
    assert.match(body.slice(0, 120), /const caller = await staffCallerOf\(request\);\n {2}if \(caller\.error\) return refuse\(caller\);/, `${verb} is not checked`);
  }
  assert.match(read("lib/file-check-server.js"), /if \(!mayUseFileCheckScreen\(caller\.profile\)\) return \{ error: "Staff only", status: 403 \};/);
});

test("Send to customer is checked on the server against the verified sign-in", () => {
  const route = read("app/api/staff/file-checks/release/route.js");
  const gate = route.indexOf("if (!mayReleaseFileCheck(profile, tokenEmail))");
  assert.ok(gate > 0, "the release route does not check for Cam");
  assert.ok(gate < route.indexOf("runTransaction"), "the check must come before anything is saved");
  assert.match(read("lib/file-check-server.js"), /tokenEmail: decoded\.email \|\| ""/, "the email comes from the verified token");
  assert.match(route, /const problems = releaseProblems\(report, submission\);\n\s+if \(problems\.length\) return \{ ok: false, problems \};/);
});

test("the customer's routes: own upload only, and staff cannot answer", () => {
  const route = read("app/api/amber/file-check/route.js");
  assert.match(route, /if \(!submission \|\| !mayReadSubmission\(caller, submission\)\) \{\n\s+return NextResponse\.json\(\{ error: "Not found" \}, \{ status: 404 \}\);/);
  assert.match(route, /if \(!submission \|\| submission\.uid !== uid \|\| !snap\.exists\) return \{ ok: false, notFound: true \};/);
  const post = route.split("export async function POST(request) {")[1];
  const gate = post.indexOf("  try {\n    assertMayAct(profile);\n  } catch (err) {\n    return NextResponse.json({ error: err.message }, { status: 403 });\n  }");
  assert.ok(gate > 0, "staff are not refused");
  assert.ok(gate < post.indexOf("runTransaction"), "staff are refused before anything is saved");
  assert.match(route, /\.map\(customerView\)/, "only the customer copy is ever sent back");
});

test("answers are saved, then the upload's hold is worked out again", () => {
  const route = read("app/api/amber/file-check/route.js");
  assert.match(route, /const summary = await syncSheetSummary\(db, sid\);/);
  const server = read("lib/file-check-server.js");
  assert.match(server, /fileCheckHold: amber \? holdsJob\(amber\) : false,/);
  assert.match(read("app/api/staff/file-checks/release/route.js"), /const summary = await syncSheetSummary\(db, sid\);/);
});

test("the release email is best effort and never undoes the release", () => {
  const route = read("app/api/staff/file-checks/release/route.js");
  assert.ok(route.indexOf("syncSheetSummary(db, sid)") < route.indexOf("buildReleaseEmail("), "released before the email");
  assert.match(route, /emailNote = "The check is on the customer's job page, but the email could not be sent\.";/);
  assert.match(route, /if \(!built\.send\) \{\n\s+emailNote = built\.reason;/);
});

test("the customer's job page shows the check, and the staff banner links to the screen", () => {
  assert.match(read("app/jobs/[id]/page.jsx"), /<FileCheckPanel job=\{job\} \/>/);
  assert.match(read("components/StaffBanner.jsx"), /href="\/staff\/file-checks"/);
  assert.match(read("app/staff/layout.jsx"), /if \(!mayUseFileCheckScreen\(profile\)\) \{/);
  assert.match(read("app/staff/file-checks/page.jsx"), /const mayRelease = mayReleaseFileCheck\(profile, user\?\.email\);/);
  const panel = read("components/FileCheckPanel.jsx");
  assert.match(panel, /\{f\.legal && <p className="mt-1 text-xs italic text-ink-muted" data-legal-line>\{LEGAL_LINE\}<\/p>\}/);
  assert.equal(LEGAL_LINE, "Please check with whoever handles your labelling rules.");
  assert.match(panel, /disabled=\{busy \|\| staff\}/, "staff cannot press Submit my answers");
});

test("Order Plates uploads are not checked in this slice", () => {
  assert.match(read("app/api/staff/file-checks/route.js"), /if \(\(submission\.kind \|\| "repro"\) !== "repro"\) \{\n\s+return NextResponse\.json\(\{ error: "The file check is only for AMBER artwork jobs\." \}/);
  assert.match(read("app/api/staff/file-checks/route.js"), /\.filter\(\(s\) => \(s\.kind \|\| "repro"\) === "repro"/);
});
