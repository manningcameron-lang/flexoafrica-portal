// AMBER's file check on a customer's artwork upload (Cam, 23 Nov 2026).
//
// WHAT IT IS: when a customer sends artwork through the AMBER page, AMBER
// checks the file against the job details and writes a report: what will not
// print well, what it does on press, and the fix as options with one
// Recommended. Cam reads it on the staff screen, can change the wording or
// delete a finding, and presses "Send to customer". The customer then picks an
// option for each finding on their portal job page and presses "Submit my
// answers".
//
// THIS FILE ONLY STORES THE SHAPE, never the knowledge. What counts as a fault
// and what to say about it lives in AMBER's skills (flexo-portal-issue-spotter
// and the master skills), which keep improving. The code checks that a report
// is well formed and safe to show a customer, nothing more.
//
// The rules it holds, each tested in tests/file-check.test.mjs:
//   - levels are STOP, FIX or NOTE and nothing else;
//   - a legal-copy finding is ALWAYS a NOTE, never a block, and never uses
//     the word "illegal";
//   - a food contact and recycling finding (stage 10A) is a NOTE, except
//     fault 91 (print on the side the food touches), which may be a FIX; and
//     no report ever promises a pack is food safe, food grade, certified
//     recyclable or 100% recyclable (Cam, 24 Nov 2026), and never that it
//     will pass inspection or be defect free (Cam, 24 Nov 2026 evening);
//   - the issue-spotter number of a finding is kept when there is one. ANY
//     number and ANY stage name are accepted: the list keeps growing (105
//     faults on 24 Nov 2026), so a fixed list would refuse whole reports;
//   - every finding with options has exactly one Recommended;
//   - a STOP or FIX must offer at least two options to choose from;
//   - plain text only, with length caps, and no file paths, script names or
//     skill names in front of a customer;
//   - a STOP that has not been answered holds the job; FIX and NOTE never do;
//   - the release email is Cam's approved wording, word for word.
//
// Pure: no Firebase, no browser.

import { isStaff } from "./staff-view.mjs";

export const LEVELS = Object.freeze(["STOP", "FIX", "NOTE"]);
// The order the customer reads them in.
export const LEVEL_ORDER = Object.freeze({ STOP: 0, FIX: 1, NOTE: 2 });

export const STATUS_DRAFT = "draft"; // not ready (an automatic check still running, or failed)
export const STATUS_REVIEW = "staffReview"; // AMBER saved it, waiting on Cam
export const STATUS_SENT = "sent"; // released to the customer
export const STATUS_ANSWERED = "answered"; // the customer submitted their picks
export const STATUSES = Object.freeze([STATUS_DRAFT, STATUS_REVIEW, STATUS_SENT, STATUS_ANSWERED]);

// What a customer may ever see. A draft or a report still with Cam is never shown.
export const CUSTOMER_VISIBLE = Object.freeze([STATUS_SENT, STATUS_ANSWERED]);

export const BY_AMBER = "AMBER";
export const BY_AUTO = "auto";

export const MAX_FINDINGS = 40;
export const MAX_OPTIONS = 4;
export const MAX_LIST = 30;
export const MAX_SHORT = 120;
export const MAX_TEXT = 500;
export const MAX_OPTION_TEXT = 240;
export const MAX_ITEM = 240;
export const MAX_ANSWER_NOTE = 300;
export const SHOWN_FIRST = 8; // about 8 findings on show, the rest behind "show more"
// Pictures from the tools engine: a small JPEG with the spot ringed, as a
// data link (about 20 to 60 KB). Kept small so a report fits in one record.
export const MAX_PICTURES = 8;
export const MAX_PICTURE_CHARS = 90000;
export const MAX_PICTURE_TOTAL = 600000;

export const LEGAL_LINE = "Please check with whoever handles your labelling rules.";
export const DEFAULT_LIMIT_LINE = "to be confirmed by your printer";
export const AUTO_HEADING = "First automatic check. AMBER's full check follows.";

// Things that must never reach a customer: file and folder paths, scripts,
// AMBER's skill names and working notes. AMBER writes the report from her
// skills, so a stray path or skill name is a real risk.
const FORBIDDEN = [
  { re: /(^|[\s(])~?\/[A-Za-z0-9._-][A-Za-z0-9._ -]*\//, why: "a folder path" },
  { re: /[A-Za-z]:\\/, why: "a folder path" },
  { re: /\b[\w-]+\.(py|mjs|js|sh|command|md)\b/i, why: "a script or notes file name" },
  { re: /\bAI Working\b|\bTeam Folder\b|\bDropbox\b|\bRules Book\b/i, why: "a working folder or note" },
  { re: /\bSKILL\b|\bskill\b/, why: "a skill name" },
  // Skill names are written in small letters (flexo-master-prepress,
  // sackforce-soma-setup), so the printer "Flexo-It" is not one of them.
  { re: /\bflexo-[a-z][a-z-]+\b|\b[a-z0-9]+-setup\b/, why: "a skill name" },
  { re: /\bissue[- ]spotter\b/i, why: "a skill name" },
  { re: /\bamber\/[A-Za-z0-9]+\//, why: "a storage path" },
  { re: /\billegal\b/i, why: "the word \"illegal\" (legal notes are advice only)" },
  // AMBER never certifies a pack: the ink maker and printer own food contact,
  // the brand owner owns its recycling claim (Cam, 24 Nov 2026).
  { re: /\bfood[\s-]?safe\b|\bfood[\s-]?grade\b/i, why: "a promise that the pack is food safe (AMBER never certifies that)" },
  { re: /\bcertified[\s-]+recyclable\b|\b100\s?(%|per\s?cent)\s*recyclable\b/i, why: "a promise that the pack is recyclable (AMBER never certifies that)" },
  // Print inspection belongs to the printer: AMBER never promises a job will
  // pass it or come out without faults (Cam, 24 Nov 2026 evening). "May not
  // pass inspection" is a warning and stays allowed.
  { re: /\bwill\s+pass\s+(?:[\w'’]+\s+){0,3}inspection\b|\bguaranteed\s+to\s+pass\b|\bdefect[\s-]?free\b/i, why: "a promise that the print will pass inspection or be defect free (inspection belongs to the printer)" },
];

/** Plain text: no tags, no control characters, no em or en dashes. */
export function plain(value, max) {
  let s = String(value ?? "");
  s = s.replace(/<[^>]*>/g, "");
  s = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  s = s.replace(/\s*[\u2014\u2013]\s*/g, ", ");
  s = s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return s.slice(0, max);
}

function forbiddenIn(text) {
  for (const f of FORBIDDEN) if (f.re.test(text)) return f.why;
  return null;
}

/** A small JPEG picture as a data link, or null. Nothing else is ever shown. */
export function safePicture(value) {
  const s = String(value || "");
  if (s.length > MAX_PICTURE_CHARS) return null;
  return /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(s) ? s : null;
}

/**
 * Whether the page should add the "check with whoever handles your labelling
 * rules" line under a legal note. Not when AMBER's own words already say it,
 * or the customer reads it twice (seen in the 24 Nov 2026 live test).
 */
export function showLegalLine(f) {
  if (!f?.legal) return false;
  const said = `${f.what || ""}\n${f.effect || ""}`.toLowerCase();
  return !said.includes(LEGAL_LINE.toLowerCase());
}

/** A legal-copy finding: said so, or its stage is the legal stage. */
export function isLegalFinding(f) {
  if (f?.legal === true) return true;
  return /legal|labelling rules|labeling rules/i.test(String(f?.stage || ""));
}

// ─── stage 10A, food contact and recycling (Cam, 24 Nov 2026) ───────────────
export const FOOD_STAGE_NAME = "Food contact and recycling";
// The one food finding that may ask the customer to choose before plates:
// print on the side the food touches.
export const FOOD_FIX_FAULT = 91;
export const MAX_FAULT = 999;

/** A food contact and recycling finding: said so, or its stage is 10A. */
export function isFoodFinding(f) {
  if (f?.food === true) return true;
  return /\b10A\b|food contact and recycling/i.test(String(f?.stage || ""));
}

/** The issue-spotter number (1 to 999), or null. Never refuses a report. */
export function faultNumber(value) {
  const ok = typeof value === "number" || (typeof value === "string" && /^\s*\d+\s*$/.test(value));
  if (!ok) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= MAX_FAULT ? n : null;
}

/**
 * The level a food finding is kept at: a NOTE, except fault 91, which is at
 * most a FIX (never a STOP: a food finding never holds a job).
 */
export function foodLevel(f, level) {
  if (faultNumber(f?.fault) === FOOD_FIX_FAULT && (level === "FIX" || level === "STOP")) return "FIX";
  return "NOTE";
}

/**
 * Check a report and return a clean copy, or a list of plain-words problems.
 *
 * @param {object} input the report AMBER (or the tools engine) wrote
 * @param {{createdBy?: string}} [opts]
 * @returns {{ok: true, report: object} | {ok: false, problems: string[]}}
 */
export function checkReport(input, { createdBy = BY_AMBER } = {}) {
  const problems = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, problems: ["The report is not in the right shape (it must be one { ... } block)."] };
  }
  const say = (where, text) => {
    const why = forbiddenIn(text);
    if (why) problems.push(`${where} has ${why} in it, which a customer must not see.`);
  };

  const rawFindings = Array.isArray(input.findings) ? input.findings : [];
  if (!Array.isArray(input.findings)) problems.push("The report has no findings list.");
  if (rawFindings.length > MAX_FINDINGS) {
    problems.push(`The report has ${rawFindings.length} findings; the most is ${MAX_FINDINGS}.`);
  }

  const findings = rawFindings.slice(0, MAX_FINDINGS).map((raw, i) => {
    const n = i + 1;
    const f = raw && typeof raw === "object" ? raw : {};
    const legal = isLegalFinding(f);
    const food = isFoodFinding(f);
    let level = String(f.level || "").trim().toUpperCase();
    if (!LEVELS.includes(level)) {
      problems.push(`Finding ${n}: the level must be STOP, FIX or NOTE (it says "${plain(f.level, 20)}").`);
    }
    // A legal-copy finding is advice only: it can never hold a job.
    if (legal) level = "NOTE";
    // A food contact or recycling finding is advice too, except fault 91.
    if (food) level = foodLevel(f, level);

    const what = plain(f.what, MAX_TEXT);
    const effect = plain(f.effect, MAX_TEXT);
    const stage = plain(f.stage, MAX_SHORT);
    if (!what) problems.push(`Finding ${n}: "what" is empty.`);
    say(`Finding ${n}`, `${stage}\n${what}\n${effect}`);

    const rawOptions = Array.isArray(f.options) ? f.options : [];
    if (rawOptions.length > MAX_OPTIONS) problems.push(`Finding ${n}: more than ${MAX_OPTIONS} options.`);
    const seen = new Set();
    const options = rawOptions.slice(0, MAX_OPTIONS).map((o, j) => {
      const key = String(o?.key || "").trim().toUpperCase();
      if (!/^[A-D]$/.test(key)) problems.push(`Finding ${n}, option ${j + 1}: the key must be A, B, C or D.`);
      if (seen.has(key)) problems.push(`Finding ${n}: option ${key} is there twice.`);
      seen.add(key);
      const text = plain(o?.text, MAX_OPTION_TEXT);
      if (!text) problems.push(`Finding ${n}, option ${key || j + 1}: the text is empty.`);
      say(`Finding ${n}, option ${key || j + 1}`, text);
      return { key, text, recommended: o?.recommended === true };
    });
    const recommended = options.filter((o) => o.recommended).length;
    if (options.length > 0 && recommended !== 1) {
      problems.push(`Finding ${n}: exactly one option must be Recommended (it has ${recommended}).`);
    }
    if ((level === "STOP" || level === "FIX") && options.length < 2) {
      problems.push(`Finding ${n}: a ${level} needs at least two options for the customer to pick from.`);
    }

    return {
      id: n,
      stage,
      level,
      legal,
      food,
      fault: faultNumber(f.fault),
      limitIsDefault: f.limitIsDefault === true,
      what,
      effect,
      options,
      picture: safePicture(f.picture),
      answer: null,
      answerNote: "",
    };
  });
  // At most 8 pictures, and not too much in all, so the report stays small.
  let pictures = 0;
  let pictureChars = 0;
  for (const f of findings) {
    if (!f.picture) continue;
    if (pictures >= MAX_PICTURES || pictureChars + f.picture.length > MAX_PICTURE_TOTAL) {
      f.picture = null;
      continue;
    }
    pictures += 1;
    pictureChars += f.picture.length;
  }

  const list = (value, label) => {
    const arr = Array.isArray(value) ? value : [];
    if (arr.length > MAX_LIST) problems.push(`The ${label} list has more than ${MAX_LIST} lines.`);
    return arr.slice(0, MAX_LIST).map((v) => plain(v, MAX_ITEM)).filter(Boolean);
  };
  const tidyList = list(input.tidyList, "tidy");
  const notChecked = list(input.notChecked, "not checked");
  tidyList.forEach((t, i) => say(`Tidy line ${i + 1}`, t));
  notChecked.forEach((t, i) => say(`Not checked line ${i + 1}`, t));

  const printer = plain(input.printer, MAX_SHORT);
  const pressClass = plain(input.pressClass, MAX_SHORT);
  say("The printer line", `${printer}\n${pressClass}`);

  if (findings.length === 0 && tidyList.length === 0 && notChecked.length === 0) {
    problems.push("The report is empty: nothing found, nothing to tidy and nothing listed as not checked.");
  }

  if (problems.length) return { ok: false, problems };
  return {
    ok: true,
    report: {
      createdBy: createdBy === BY_AUTO ? BY_AUTO : BY_AMBER,
      printer,
      pressClass,
      limitsAreDefaults: input.limitsAreDefaults === true,
      findings: sortFindings(findings),
      tidyList,
      notChecked,
    },
  };
}

/** The words on the staff screen for where an upload's check is up to. */
export function statusLabel(status) {
  if (status === STATUS_REVIEW) return "Check ready for review";
  if (status === STATUS_SENT) return "Sent to customer";
  if (status === STATUS_ANSWERED) return "Customer answered";
  return "Waiting for check";
}

/** STOP first, then FIX, then NOTE; the order AMBER gave is kept inside each. */
export function sortFindings(findings) {
  return [...(findings || [])]
    .map((f, i) => ({ f, i }))
    .sort((a, b) => (LEVEL_ORDER[a.f.level] - LEVEL_ORDER[b.f.level]) || (a.i - b.i))
    .map(({ f }, i) => ({ ...f, id: i + 1 }));
}

/**
 * What the customer's page shows: STOP first, then FIX, then NOTE, about 8 on
 * show and the rest behind "show more".
 */
export function splitForShow(findings, showAll = false) {
  const sorted = sortFindings(findings);
  const shown = showAll ? sorted : sorted.slice(0, SHOWN_FIRST);
  return {
    stop: shown.filter((f) => f.level === "STOP"),
    fix: shown.filter((f) => f.level === "FIX"),
    note: shown.filter((f) => f.level === "NOTE"),
    hidden: sorted.length - shown.length,
  };
}

/** Every STOP and FIX has one of its own options picked. */
export function readyToSubmit(findings, picks = {}) {
  return needsAnswer(findings).every((f) =>
    (f.options || []).some((o) => o.key === String(picks?.[String(f.id)] || "")),
  );
}

/** The findings the customer must answer before we start: every STOP and FIX. */
export function needsAnswer(findings) {
  return (findings || []).filter((f) => f.level === "STOP" || f.level === "FIX");
}

/**
 * A customer may read only their OWN upload's checks (the upload's uid is
 * their verified sign-in); staff may look at any, read only.
 * @param {{uid: string, profile: object}} caller
 */
export function mayReadSubmission(caller, submission) {
  if (!caller?.profile || !submission) return false;
  if (isStaff(caller.profile)) return true;
  return (
    caller.profile.role === "customer" &&
    caller.profile.status === "active" &&
    !!submission.uid &&
    submission.uid === caller.uid
  );
}

/** A STOP with no answer holds the job. FIX and NOTE never do. */
export function holdsJob(report) {
  if (!report || !CUSTOMER_VISIBLE.includes(report.status)) return false;
  return (report.findings || []).some((f) => f.level === "STOP" && !f.answer);
}

/**
 * What a customer is allowed to see of a report. Staff names, emails, AMBER's
 * own working fields and anything not released are left out.
 */
export function customerView(report) {
  if (!report || !CUSTOMER_VISIBLE.includes(report.status)) return null;
  return {
    id: String(report.id || ""),
    createdBy: report.createdBy === BY_AUTO ? BY_AUTO : BY_AMBER,
    status: report.status,
    jobNumber: report.jobNumber || null,
    printer: report.printer || "",
    limitsAreDefaults: report.limitsAreDefaults === true,
    findings: sortFindings(report.findings || []).map((f) => ({
      id: f.id,
      level: f.legal ? "NOTE" : f.food ? foodLevel(f, f.level) : f.level,
      legal: f.legal === true,
      food: f.food === true,
      limitIsDefault: f.limitIsDefault === true,
      what: f.what,
      effect: f.effect,
      options: (f.options || []).map((o) => ({ key: o.key, text: o.text, recommended: o.recommended === true })),
      picture: safePicture(f.picture),
      answer: f.answer || null,
      answerNote: f.answerNote || "",
    })),
    tidyList: report.tidyList || [],
    tidyRefused: report.tidyRefused || [],
    notChecked: report.notChecked || [],
    releasedAtMs: report.releasedAtMs || null,
    answeredAtMs: report.answeredAtMs || null,
  };
}

/**
 * Check the customer's answers against the report and return the report as it
 * will be saved, or the problems.
 *
 * @param {object} report  the saved report (status must be "sent")
 * @param {{answers?: object, notes?: object, tidyRefused?: number[]}} input
 *   answers: { "<finding id>": "A" }, notes: { "<finding id>": "text" }
 */
export function applyAnswers(report, input = {}) {
  if (!report) return { ok: false, problems: ["That check was not found."] };
  if (report.status === STATUS_ANSWERED) return { ok: false, problems: ["You have already sent your answers for this check."] };
  if (report.status !== STATUS_SENT) return { ok: false, problems: ["That check is not open for answers."] };
  if (report.createdBy === BY_AUTO) return { ok: false, problems: ["The automatic check does not take answers."] };

  const answers = input.answers && typeof input.answers === "object" ? input.answers : {};
  const notes = input.notes && typeof input.notes === "object" ? input.notes : {};
  const problems = [];
  const findings = (report.findings || []).map((f) => {
    const raw = answers[String(f.id)];
    const pick = raw == null ? "" : String(raw).trim().toUpperCase();
    const keys = (f.options || []).map((o) => o.key);
    const mustAnswer = f.level === "STOP" || f.level === "FIX";
    if (pick && !keys.includes(pick)) {
      problems.push(`Point ${f.id}: "${plain(raw, 5)}" is not one of the options.`);
    }
    if (mustAnswer && !pick) problems.push(`Please pick an option for point ${f.id}.`);
    return {
      ...f,
      answer: pick && keys.includes(pick) ? pick : null,
      answerNote: plain(notes[String(f.id)], MAX_ANSWER_NOTE),
    };
  });
  const tidyCount = (report.tidyList || []).length;
  const tidyRefused = [...new Set((Array.isArray(input.tidyRefused) ? input.tidyRefused : [])
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 0 && n < tidyCount))].sort((a, b) => a - b);

  if (problems.length) return { ok: false, problems };
  return { ok: true, report: { ...report, findings, tidyRefused, status: STATUS_ANSWERED } };
}

/**
 * Cam's edits on the staff screen: wording changed, a finding deleted, a
 * level changed. The edited report goes through exactly the same check as
 * AMBER's, so an edit can never break a rule (a legal note stays a note).
 */
export function editReport(saved, edited) {
  if (!saved) return { ok: false, problems: ["That check was not found."] };
  if (saved.status !== STATUS_REVIEW) {
    return { ok: false, problems: ["Only a check that has not been sent yet can be changed."] };
  }
  return checkReport(edited, { createdBy: saved.createdBy });
}

/** May this report be sent to the customer now? */
export function releaseProblems(report, submission) {
  const out = [];
  if (!report) return ["That check was not found."];
  if (report.createdBy !== BY_AMBER) out.push("Only AMBER's full check is sent this way.");
  if (report.status !== STATUS_REVIEW) out.push("This check has already been sent, or is not ready.");
  if (!submission) out.push("The customer's upload was not found.");
  else {
    if (submission.kind && submission.kind !== "repro") out.push("This check is only for AMBER artwork jobs.");
    if (!submission.jobNumber) out.push("The job has not been made on the MIS yet, so there is no job page to send the customer to.");
  }
  return out;
}

// ─── the email to the customer on release (Cam approved, 23 Nov 2026) ─────────
//
// ⚠ Cam approved this wording word for word. Only the job details are filled
// in. Do NOT reword it without asking him again.

export const RELEASE_FROM = "Flexo Africa Portal <amber@flexoafrica.com>";
export const RELEASE_REPLY_TO = "sales@flexoafrica.com";
export const PORTAL_JOBS_URL = "https://portal.flexoafrica.com/jobs";

/** "Hi Thandi": the first word of the account's contact name. */
export function firstName(name) {
  const first = plain(name, 80).split(/\s+/)[0] || "";
  return first.replace(/[^\p{L}'-]/gu, "");
}

function oneLine(v, max) {
  return plain(v, max).replace(/\s+/g, " ");
}

/**
 * @returns {{send: true, subject, text, from, replyTo} | {send: false, reason: string}}
 */
export function buildReleaseEmail({ report, jobNumber, jobName, contactName, jobUrl }) {
  const n = needsAnswer(report?.findings).length;
  if (n === 0) {
    return {
      send: false,
      reason:
        "No email sent: nothing in this check needs an answer (only tidy lines and notes), " +
        "and the approved wording only fits a check with things to answer.",
    };
  }
  const name = firstName(contactName);
  if (!name) return { send: false, reason: "No email sent: the customer's account has no contact name for \"Hi <first name>\"." };
  const fa = oneLine(jobNumber, 20);
  if (!fa) return { send: false, reason: "No email sent: the job has no FA number yet." };
  const job = oneLine(jobName, 120) || fa;
  const link = String(jobUrl || PORTAL_JOBS_URL);
  const things = n === 1 ? "There is 1 thing" : `There are ${n} things`;
  return {
    send: true,
    from: RELEASE_FROM,
    replyTo: RELEASE_REPLY_TO,
    subject: `AMBER has checked your file for ${fa}`,
    text:
      `Hi ${name},\n\n` +
      `AMBER has checked the artwork you sent for ${job} (${fa}). ` +
      `${things} to look at before we start. ` +
      `Please open your job on the portal, pick an option for each one and press Submit my answers: ${link}.\n\n` +
      `Nothing is changed until you answer.\n\n` +
      `Flexo Africa`,
  };
}

// ─── the email to sales@ when the customer answers ───────────────────────────

/**
 * Plain email to sales@ with the job number and the customer's picks, in the
 * style of lib/sales-alert.mjs. Everything the customer typed is data only.
 */
export function buildAnswersAlert({ report, jobNumber, jobName, company, customerEmail }) {
  const fa = oneLine(jobNumber, 20) || "(no FA number)";
  const who = oneLine(company, 120) || "Portal customer";
  const lines = [];
  lines.push("A customer has answered AMBER's file check on the portal.");
  lines.push("");
  lines.push(`Customer: ${who}${customerEmail ? `, ${oneLine(customerEmail, 120)}` : ""}`);
  lines.push(`Job: ${fa}, ${oneLine(jobName, 160) || "(no job name)"}`);
  lines.push("");
  lines.push("Their picks:");
  for (const f of report?.findings || []) {
    const opt = (f.options || []).find((o) => o.key === f.answer);
    const pick = opt ? `picked ${opt.key}: ${oneLine(opt.text, 200)}${opt.recommended ? " (Recommended)" : ""}` : "no pick";
    lines.push(`${f.id}. ${f.level}: ${oneLine(f.what, 200)}`);
    lines.push(`   ${pick}`);
    if (f.answerNote) lines.push(`   Their note: ${oneLine(f.answerNote, 300)}`);
  }
  const refused = (report?.tidyRefused || []).map((i) => report.tidyList?.[i]).filter(Boolean);
  if (refused.length) {
    lines.push("");
    lines.push("Do NOT tidy these (the customer said no):");
    for (const t of refused) lines.push(`- ${oneLine(t, 200)}`);
  }
  lines.push("");
  lines.push("The answers are saved on the job's file check, so the artwork starts from these picks.");
  lines.push("Open the MIS: https://jobs.flexoafrica.com");
  return {
    subject: oneLine(`File check answered ${fa}: ${who}`, 200),
    text: lines.join("\n"),
  };
}
