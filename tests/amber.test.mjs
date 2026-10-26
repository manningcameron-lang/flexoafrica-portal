// Tests for the AMBER intake.
//
// Run them with:  npm test
//
// Every test here is mutation-tested: tests/mutate.mjs deliberately breaks the
// code one change at a time and proves the suite goes red, and proves the
// sabotage actually landed in the file. A test that cannot fail is not a test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { dueAt, formatDue, isPublicHoliday, isWorkingDay } from "../lib/amber-due.mjs";
import {
  MAX_AUTO_REPLIES_PER_SENDER_PER_DAY,
  looksAutomatic,
  mayAutoReply,
  normaliseAddress,
} from "../lib/amber-loop-guard.mjs";
import { expectedSignature, verifyWebhook } from "../lib/amber-signature.mjs";
import {
  GEAR_PITCH_OPTIONS,
  PLATE_THICKNESS_OPTIONS,
  isComplete,
  missingSpecFields,
  notSureFields,
  notSureKeys,
  requiredFieldsFor,
  submissionStatus,
} from "../lib/amber-spec.mjs";
import { priceReproJob, AMBER_REPRO_PRICE_EXCL_VAT } from "../lib/amber-pricing.mjs";
import {
  INBOUND_ACTIONS,
  classifyInbound,
  holdExpiryAt,
  isForAmber,
  isHoldExpired,
  pickCustomerFromUserDocs,
  shouldCopyToSales,
} from "../lib/amber-inbound-rules.mjs";
import { jobCreationDecision, mayCustomerSubmit, readMisAnswer } from "../lib/amber-submit-rules.mjs";
import { buildEmail, emailKindForSender } from "../lib/amber-emails.mjs";

// South African wall-clock time to a real instant (SAST is UTC+2 all year).
function sast(y, m, d, h, mi = 0) {
  return new Date(Date.UTC(y, m - 1, d, h, mi) - 120 * 60000);
}

const FULL_SPEC = {
  description: "Bordeaux Washed Potatoes 10kg",
  printer: "Sack Force",
  press: "Soma",
  bagType: "SO Bag",
  material: "Brown Paper",
  printSide: "Surface",
  widthMm: 640,
  pitchMm: 800,
  across: 1,
  around: 1,
  plateThickness: "112 thou",
  screenRuling: "85#",
  cylinder: "93T",
  plateDistortion: "-19.15mm",
  printDirection: "Left to Right",
  colours: ["Black", "Cyan", "Magenta"],
};
const COMPLETE = { files: [{ path: "a.pdf" }], notSure: [], spec: { ...FULL_SPEC } };

// ─── 1. Matching the sender ─────────────────────────────────────────────────

test("sender matching: finds the customer whatever the case or spacing", () => {
  const docs = [
    { id: "u1", data: { role: "customer", status: "active", email: "Cam@Acme.com", company: "Acme" } },
  ];
  const got = pickCustomerFromUserDocs(docs, "  cam@acme.com ");
  assert.equal(got?.uid, "u1");
  assert.equal(got.status, "active");
  assert.equal(got.email, "cam@acme.com");
});

test("sender matching: a near-miss address is NOT the same person", () => {
  const docs = [{ id: "u1", data: { role: "customer", status: "active", email: "cam@acme.com" } }];
  assert.equal(pickCustomerFromUserDocs(docs, "cam@acme.co"), null);
  assert.equal(pickCustomerFromUserDocs(docs, "cameron@acme.com"), null);
});

test("sender matching: a staff record never matches a customer lookup", () => {
  const docs = [{ id: "a1", data: { role: "admin", status: "active", email: "cam@acme.com" } }];
  assert.equal(pickCustomerFromUserDocs(docs, "cam@acme.com"), null);
});

test("sender matching: an unknown sender gives nothing back", () => {
  assert.equal(pickCustomerFromUserDocs([], "stranger@nowhere.com"), null);
  assert.equal(pickCustomerFromUserDocs(null, ""), null);
});

// ─── 2. The loop guard ──────────────────────────────────────────────────────

test("loop guard: never answers an out of office", () => {
  assert.equal(looksAutomatic({ from: "cam@acme.com", headers: { "Auto-Submitted": "auto-replied" } }).automatic, true);
  assert.equal(looksAutomatic({ from: "cam@acme.com", headers: { "auto-submitted": "AUTO-GENERATED" } }).automatic, true);
});

test("loop guard: 'Auto-Submitted: no' is a normal email", () => {
  assert.equal(looksAutomatic({ from: "cam@acme.com", headers: { "Auto-Submitted": "no" } }).automatic, false);
});

test("loop guard: never answers a mailing list or a bulk send", () => {
  assert.equal(looksAutomatic({ from: "a@b.com", headers: { Precedence: "bulk" } }).automatic, true);
  assert.equal(looksAutomatic({ from: "a@b.com", headers: { "List-Id": "<x.lists.b.com>" } }).automatic, true);
});

test("loop guard: never answers a robot address or a bounce", () => {
  assert.equal(looksAutomatic({ from: "noreply@acme.com" }).automatic, true);
  assert.equal(looksAutomatic({ from: "MAILER-DAEMON@acme.com" }).automatic, true);
  assert.equal(looksAutomatic({ from: "" }).automatic, true);
});

test("loop guard: never answers our own domain", () => {
  assert.equal(looksAutomatic({ from: "sales@flexoafrica.com" }).automatic, true);
  assert.equal(looksAutomatic({ from: "amber@flexoafrica.com" }).automatic, true);
});

test("loop guard: at most three automatic replies to one sender a day", () => {
  assert.equal(MAX_AUTO_REPLIES_PER_SENDER_PER_DAY, 3);
  assert.equal(mayAutoReply({ from: "cam@acme.com" }, 0).allowed, true);
  assert.equal(mayAutoReply({ from: "cam@acme.com" }, 2).allowed, true);
  assert.equal(mayAutoReply({ from: "cam@acme.com" }, 3).allowed, false);
  assert.equal(mayAutoReply({ from: "cam@acme.com" }, 9).allowed, false);
});

// ─── 3. Holding files, and letting them go after 14 days ────────────────────

test("holding: a stranger's files are held, a customer's are not", () => {
  const event = { attachments: [{ id: "a", size: 1000 }] };
  assert.equal(classifyInbound({ event, account: null }).action, "hold_for_sender");
  assert.equal(
    classifyInbound({ event, account: { status: "pending" } }).action,
    "hold_for_sender",
  );
  assert.equal(
    classifyInbound({ event, account: { status: "active", uid: "u1" } }).action,
    "store_for_customer",
  );
});

test("holding: a suspended account keeps nothing", () => {
  const event = { attachments: [{ id: "a", size: 1000 }] };
  const got = classifyInbound({ event, account: { status: "suspended" } });
  assert.equal(got.action, "reply_only");
  assert.equal(got.accountStatus, "suspended");
});

test("holding: files are kept for exactly 14 days", () => {
  const received = new Date("2026-10-26T10:00:00.000Z");
  const expires = holdExpiryAt(received);
  assert.equal(expires.getTime() - received.getTime(), 14 * 86400000);
});

test("holding: a hold expires on day 14 and not on day 13", () => {
  const received = new Date("2026-10-26T10:00:00.000Z");
  const hold = { expiresAt: holdExpiryAt(received) };
  const day13 = new Date(received.getTime() + 13 * 86400000);
  const day14 = new Date(received.getTime() + 14 * 86400000);
  assert.equal(isHoldExpired(hold, day13), false);
  assert.equal(isHoldExpired(hold, day14), true);
});

// ─── 4. The missing-specs list ──────────────────────────────────────────────

test("missing list: a complete job is missing nothing", () => {
  assert.deepEqual(missingSpecFields(COMPLETE), []);
  assert.equal(isComplete(COMPLETE), true);
});

test("missing list: names every box that is still empty, in form order", () => {
  const got = missingSpecFields({ files: [{ path: "a" }], notSure: [], spec: { description: "X" } });
  assert.equal(got.includes("Job name"), false);
  assert.equal(got[0], "Printer");
  assert.equal(got.includes("Inks, in print order"), true);
  assert.equal(got.length, 15);
});

test("missing list: no artwork is itself a missing item", () => {
  const got = missingSpecFields({ files: [], notSure: [], spec: { ...FULL_SPEC } });
  assert.deepEqual(got, ["Artwork file"]);
});

test("missing list: a PO-approved customer must give a PO number", () => {
  assert.deepEqual(missingSpecFields(COMPLETE, { poRequired: true }), ["PO number"]);
  assert.deepEqual(missingSpecFields(COMPLETE, { poRequired: false }), []);
});

test("missing list: a blank-looking answer does not count as filled in", () => {
  const spec = { ...FULL_SPEC, cylinder: "   ", colours: ["", "  "] };
  const got = missingSpecFields({ files: [{ path: "a" }], notSure: [], spec });
  assert.deepEqual(got, ["Cylinder or gear teeth", "Inks, in print order"]);
});

// ─── The live MIS boxes, which an out-of-date copy got wrong ────────────────

test("the plate thickness list matches the live MIS, 155 thou included", () => {
  // 155 thou was missing because the copy of the MIS it was read from was
  // about eighteen changes out of date. Read off the live job screen since.
  assert.equal(PLATE_THICKNESS_OPTIONS.includes("155 thou"), true);
  assert.equal(PLATE_THICKNESS_OPTIONS.includes("Gold A"), true);
  assert.equal(PLATE_THICKNESS_OPTIONS.length, 10);
});

test("press gear is CP or DP, the two the live MIS offers", () => {
  assert.deepEqual(GEAR_PITCH_OPTIONS.map((o) => o.value), ["CP", "DP"]);
  assert.ok(GEAR_PITCH_OPTIONS[0].label.includes("3.175 mm"));
});

test("gear and teeth are asked for on a Label, and never on a bag", () => {
  const bag = { files: [{ path: "a" }], notSure: [], spec: { ...FULL_SPEC, bagType: "SO Bag" } };
  const label = { files: [{ path: "a" }], notSure: [], spec: { ...FULL_SPEC, bagType: "Label" } };
  assert.deepEqual(missingSpecFields(bag), []);
  assert.deepEqual(missingSpecFields(label), ["Press gear", "Teeth"]);
  assert.equal(requiredFieldsFor(label).length, requiredFieldsFor(bag).length + 2);
});

test("a Label with gear and teeth filled in is complete", () => {
  const label = {
    files: [{ path: "a" }],
    notSure: [],
    spec: { ...FULL_SPEC, bagType: "Label", gearPitch: "CP", cylinderTeeth: 93 },
  };
  assert.deepEqual(missingSpecFields(label), []);
});

// ─── 5. "Not sure" holds the box, it does not refuse the job ────────────────

test("not sure: is an ANSWER, so it never appears on the missing list", () => {
  const sub = { files: [{ path: "a" }], notSure: ["plateDistortion"], spec: { ...FULL_SPEC, plateDistortion: "" } };
  assert.deepEqual(missingSpecFields(sub), []);
});

test("not sure: parks that box with us instead of starting the clock", () => {
  const sub = { files: [{ path: "a" }], notSure: ["plateDistortion"], spec: { ...FULL_SPEC, plateDistortion: "" } };
  assert.deepEqual(notSureFields(sub), ["Distortion"]);
  assert.equal(submissionStatus(sub), "waiting_flexo");
  assert.equal(isComplete(sub), false);
});

test("not sure: on the inks too", () => {
  const sub = { files: [{ path: "a" }], notSure: ["colours"], spec: { ...FULL_SPEC, colours: [] } };
  assert.deepEqual(missingSpecFields(sub), []);
  assert.deepEqual(notSureFields(sub), ["Inks, in print order"]);
});

test("not sure: a customer cannot shrug at the job name or the artwork", () => {
  // Only the boxes on the allowed list may be answered "Not sure". Anything
  // else in that list is ignored, so it cannot be used to skip a required box.
  const sub = { files: [{ path: "a" }], notSure: ["description", "printer"], spec: { ...FULL_SPEC, description: "", printer: "" } };
  assert.deepEqual(notSureKeys(sub), []);
  assert.deepEqual(missingSpecFields(sub), ["Job name", "Printer"]);
});

test("not sure: Submit now hands it to the job system rather than parking it", () => {
  // Changed 26 Oct 2026 to match the MIS: it makes the job anyway and tells
  // us what it is waiting on, so the customer gets a job number straight away.
  const sub = { uid: "u1", files: [{ path: "a" }], notSure: ["cylinder"], spec: { ...FULL_SPEC, cylinder: "" } };
  assert.equal(jobCreationDecision(sub).action, "create");
});

test("status: missing details beats not sure in what the customer is shown", () => {
  const sub = { files: [], notSure: ["plateDistortion"], spec: { ...FULL_SPEC } };
  assert.equal(submissionStatus(sub), "waiting_details");
});

// ─── 6. The price shown ─────────────────────────────────────────────────────

test("price: the first AMBER repro job for a company is free", () => {
  const got = priceReproJob({ companyHasHadFreeJob: false });
  assert.equal(got.exclVat, 0);
  assert.equal(got.inclVat, 0);
  assert.equal(got.free, true);
  assert.equal(got.customerText, "This one is on us: your first AMBER job is free");
  assert.equal(got.note, "AMBER repro, first job free");
});

test("price: every job after the first is R499 excl VAT", () => {
  const got = priceReproJob({ companyHasHadFreeJob: true });
  assert.equal(AMBER_REPRO_PRICE_EXCL_VAT, 499);
  assert.equal(got.exclVat, 499);
  assert.equal(got.vat, 74.85);
  assert.equal(got.inclVat, 573.85);
  assert.equal(got.free, false);
  assert.equal(got.customerText, "R499 excl VAT");
});

// ─── 7. The due time, with Cam's three worked examples ──────────────────────

test("due time: Friday 16:00 is due Monday 16:00", () => {
  assert.equal(formatDue(dueAt(sast(2026, 10, 23, 16, 0))), "Mon 26 Oct, 16:00");
});

test("due time: Saturday 10:00 is due Tuesday 08:00", () => {
  assert.equal(formatDue(dueAt(sast(2026, 10, 24, 10, 0))), "Tue 27 Oct, 08:00");
});

test("due time: Tuesday 09:30 before a Wednesday holiday is due Thursday 09:30", () => {
  // 16 December 2026 is a Wednesday, the Day of Reconciliation.
  assert.equal(isPublicHoliday(2026, 12, 16), true);
  assert.equal(isWorkingDay(2026, 12, 16), false);
  assert.equal(formatDue(dueAt(sast(2026, 12, 15, 9, 30))), "Thu 17 Dec, 09:30");
});

test("due time: Sunday is treated the same as Saturday", () => {
  assert.equal(formatDue(dueAt(sast(2026, 10, 25, 14, 0))), "Tue 27 Oct, 08:00");
});

test("due time: Easter is handled, not just the fixed-date holidays", () => {
  // Good Friday 2026 is 3 April, Family Day is 6 April.
  assert.equal(isPublicHoliday(2026, 4, 3), true);
  assert.equal(isPublicHoliday(2026, 4, 6), true);
  // Thursday 2 April before the long weekend lands on Tuesday 7 April.
  assert.equal(formatDue(dueAt(sast(2026, 4, 2, 11, 0))), "Tue 7 Apr, 11:00");
});

test("due time: a holiday on a Sunday makes the Monday a holiday too", () => {
  // 1 January 2034 falls on a Sunday, so Monday 2 January is a holiday.
  assert.equal(new Date(Date.UTC(2034, 0, 1)).getUTCDay(), 0);
  assert.equal(isPublicHoliday(2034, 1, 2), true);
});

// ─── 8. One submission makes one job ────────────────────────────────────────

test("one job: once an FA number exists, Submit hands back the same one", () => {
  const sub = { uid: "u1", jobNumber: "FA005341", ...COMPLETE };
  const got = jobCreationDecision(sub);
  assert.equal(got.action, "return_existing");
  assert.equal(got.jobNumber, "FA005341");
});

test("one job: a complete submission with no FA number yet asks for one", () => {
  assert.equal(jobCreationDecision({ uid: "u1", ...COMPLETE }).action, "create");
});

test("one job: an incomplete submission never reaches the job system", () => {
  const got = jobCreationDecision({ uid: "u1", files: [], spec: {} });
  assert.equal(got.action, "ask_for_missing");
  assert.ok(got.missing.length > 0);
});

// ─── 9. An unsigned webhook is refused ──────────────────────────────────────

const SECRET = "whsec_" + Buffer.from("amber-test-signing-key").toString("base64");

function signed(body, { secret = SECRET, nowSeconds } = {}) {
  const id = "msg_test";
  const timestamp = String(nowSeconds ?? Math.floor(Date.now() / 1000));
  return {
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": "v1," + expectedSignature({ id, timestamp, body, secret }),
  };
}

test("webhook: a correctly signed call is accepted", () => {
  const body = JSON.stringify({ type: "email.received" });
  assert.equal(verifyWebhook({ body, headers: signed(body), secret: SECRET }).valid, true);
});

test("webhook: no signature at all is refused", () => {
  const body = JSON.stringify({ type: "email.received" });
  const got = verifyWebhook({ body, headers: {}, secret: SECRET });
  assert.equal(got.valid, false);
  assert.equal(got.reason, "missing svix headers");
});

test("webhook: a wrong signature is refused", () => {
  const body = JSON.stringify({ type: "email.received" });
  const headers = { ...signed(body), "svix-signature": "v1,bm90LXRoZS1yaWdodC1vbmU=" };
  assert.equal(verifyWebhook({ body, headers, secret: SECRET }).valid, false);
});

test("webhook: a signature for a DIFFERENT body is refused", () => {
  const real = JSON.stringify({ type: "email.received", data: { from: "cam@acme.com" } });
  const headers = signed(real);
  const tampered = JSON.stringify({ type: "email.received", data: { from: "thief@evil.com" } });
  assert.equal(verifyWebhook({ body: tampered, headers, secret: SECRET }).valid, false);
});

test("webhook: an old call is refused, so a captured one cannot be replayed", () => {
  const body = JSON.stringify({ type: "email.received" });
  const old = Math.floor(Date.now() / 1000) - 3600;
  const got = verifyWebhook({ body, headers: signed(body, { nowSeconds: old }), secret: SECRET });
  assert.equal(got.valid, false);
  assert.equal(got.reason, "timestamp outside tolerance");
});

test("webhook: with no secret configured, nothing is accepted", () => {
  const body = JSON.stringify({ type: "email.received" });
  assert.equal(verifyWebhook({ body, headers: signed(body), secret: "" }).valid, false);
});

// ─── 10. A forged From address cannot make a job ────────────────────────────

test("forgery: an inbound email can never produce a 'make a job' action", () => {
  assert.deepEqual(INBOUND_ACTIONS, ["reply_only", "store_for_customer", "hold_for_sender"]);
  const pretending = {
    from: "cameron@topflightpackaging.com",
    attachments: [{ id: "a", size: 10 }],
  };
  for (const account of [null, { status: "active", uid: "u1" }, { status: "pending" }]) {
    const got = classifyInbound({ event: pretending, account });
    assert.ok(INBOUND_ACTIONS.includes(got.action));
    assert.notEqual(got.action, "create_job");
  }
});

test("forgery: somebody else's submission cannot be submitted", () => {
  const submission = { uid: "victim", ...COMPLETE };
  const thief = { uid: "thief", role: "customer", status: "active" };
  const got = mayCustomerSubmit({ submission, caller: thief });
  assert.equal(got.allowed, false);
  assert.equal(got.reason, "not yours");
});

test("forgery: the real owner can submit their own", () => {
  const submission = { uid: "victim", ...COMPLETE };
  const owner = { uid: "victim", role: "customer", status: "active" };
  assert.equal(mayCustomerSubmit({ submission, caller: owner }).allowed, true);
});

test("forgery: a signed-out or inactive caller cannot submit", () => {
  const submission = { uid: "u1", ...COMPLETE };
  assert.equal(mayCustomerSubmit({ submission, caller: null }).allowed, false);
  assert.equal(
    mayCustomerSubmit({ submission, caller: { uid: "u1", role: "customer", status: "pending" } }).allowed,
    false,
  );
  assert.equal(
    mayCustomerSubmit({ submission, caller: { uid: "u1", role: "customer", status: "suspended" } }).allowed,
    false,
  );
});

// ─── The cross-over guard, and the approved wording ─────────────────────────

test("cross-over: mail for the other site on this Resend account is ignored", () => {
  assert.equal(isForAmber({ to: "hello@sarahbooks.co.za" }), false);
  assert.equal(isForAmber({ to: "proof-216@veiwuu.resend.app" }), false);
  assert.equal(isForAmber({ to: "amber@flexoafrica.com" }), true);
  assert.equal(isForAmber({ received_for: "amber@veiwuu.resend.app" }), true);
  assert.equal(isForAmber({ to: ["someone@else.com", "AMBER@FlexoAfrica.com"] }), true);
});

test("emails: the six approved texts are word for word what Cam approved", () => {
  assert.ok(buildEmail("not_signed_up").text.includes(
    "Thanks for sending this to AMBER. To start a job we need you to have a Flexo Africa portal account.",
  ));
  assert.ok(buildEmail("not_signed_up").text.includes("We have kept your files for 14 days"));
  assert.ok(buildEmail("account_pending").text.includes(
    "Your portal account is still waiting for approval (we approve within one working day).",
  ));
  assert.ok(buildEmail("details_needed", { missing: ["Printer", "Press"] }).text.includes(
    "Before she can start we need a few press details: Printer and Press.",
  ));
  assert.ok(buildEmail("details_needed", { missing: [] }).text.includes(
    "The 24 hours starts as soon as they are in.",
  ));
  const made = buildEmail("job_made", {
    jobNumber: "FA005341",
    jobName: "Bordeaux Washed Potatoes 10kg",
    dueText: "Tue 28 Oct, 16:00",
    link: "https://portal.flexoafrica.com/jobs",
  });
  assert.ok(made.text.includes(
    "Got it. Your job is FA005341, Bordeaux Washed Potatoes 10kg. AMBER is on it, and you will have your plate-ready file and PDF proof by Tue 28 Oct, 16:00.",
  ));
  assert.deepEqual(made.copyTo, ["sales@flexoafrica.com"]);
  assert.ok(buildEmail("no_file").text.includes("We couldn't find artwork attached."));
  assert.ok(buildEmail("too_big").text.includes("Your file is too big for email."));
  assert.ok(buildEmail("suspended").text.includes(
    "Thanks for your email. Please contact sales@flexoafrica.com and we will help you from there.",
  ));
  // Every one of them carries the Flexo Africa sign-off.
  for (const kind of ["not_signed_up", "account_pending", "details_needed", "no_file", "too_big", "suspended"]) {
    assert.ok(buildEmail(kind, { missing: [] }).text.includes("WhatsApp +27 64 586 7535"));
  }
});

test("emails: the right one is picked for each kind of sender", () => {
  assert.equal(emailKindForSender({ accountStatus: "suspended", hasFiles: true }), "suspended");
  assert.equal(emailKindForSender({ accountStatus: "active", hasFiles: true, tooBig: true }), "too_big");
  assert.equal(emailKindForSender({ accountStatus: "active", hasFiles: false }), "no_file");
  assert.equal(emailKindForSender({ accountStatus: "pending", hasFiles: true }), "account_pending");
  assert.equal(emailKindForSender({ accountStatus: "none", hasFiles: true }), "not_signed_up");
  assert.equal(emailKindForSender({ accountStatus: "active", hasFiles: true }), "details_needed");
});

test("addresses are compared with case and spacing taken off", () => {
  assert.equal(normaliseAddress("  Cam@Acme.COM "), "cam@acme.com");
  assert.equal(normaliseAddress("Cam Manning <Cam@Acme.com>"), "cam@acme.com");
});

// ─── The copy to sales@ ─────────────────────────────────────────────────────

test("sales copy: a real customer email is copied to sales@", () => {
  assert.equal(shouldCopyToSales({ from: "cam@acme.com" }), true);
});

test("sales copy: out of office, lists and bounces are NOT copied", () => {
  assert.equal(shouldCopyToSales({ from: "a@b.com", headers: { "Auto-Submitted": "auto-replied" } }), false);
  assert.equal(shouldCopyToSales({ from: "a@b.com", headers: { Precedence: "bulk" } }), false);
  assert.equal(shouldCopyToSales({ from: "mailer-daemon@b.com" }), false);
  assert.equal(shouldCopyToSales({ from: "" }), false);
});

// ─── Reading what the job system answered ───────────────────────────────────
// The MIS answers in more ways than yes or no. Getting these wrong is how a
// customer ends up with two jobs, or with a lost file nobody chases.

test("MIS answer: a made job is read as made", () => {
  const got = readMisAnswer(200, {
    ok: true, jobNumber: "FA005341", dueAt: "2026-10-28T16:00:00+02:00",
    dueSaid: "Tue 28 Oct, 16:00", firstFree: true, kind: "repro",
  });
  assert.equal(got.outcome, "made");
  assert.equal(got.jobNumber, "FA005341");
  assert.equal(got.dueSaid, "Tue 28 Oct, 16:00");
  assert.equal(got.firstFree, true);
});

test("MIS answer: a job it is waiting on us for is NOT treated as finished", () => {
  const got = readMisAnswer(200, {
    ok: true, jobNumber: "FA005342", dueAt: null, waitingOn: ["plateDistortion"],
  });
  assert.equal(got.outcome, "made_waiting_on_us");
  assert.equal(got.jobNumber, "FA005342");
  assert.deepEqual(got.waitingOn, ["plateDistortion"]);
  assert.equal(got.dueAt, null);
});

test("MIS answer: a refusal gives the customer the missing list", () => {
  const got = readMisAnswer(200, { ok: false, missing: ["Printer"], why: "no printer" });
  assert.equal(got.outcome, "ask_for_missing");
  assert.deepEqual(got.missing, ["Printer"]);
});

test("MIS answer: asking twice is flagged, so no second job is made", () => {
  const got = readMisAnswer(200, { ok: true, jobNumber: "FA005341", again: true });
  assert.equal(got.again, true);
  assert.equal(got.jobNumber, "FA005341");
});

test("MIS answer: a job made with leftover steps keeps its warnings", () => {
  const got = readMisAnswer(200, {
    ok: true, jobNumber: "FA005343", warnings: ["Dropbox folder not made yet"],
  });
  assert.equal(got.outcome, "made");
  assert.deepEqual(got.warnings, ["Dropbox folder not made yet"]);
});

test("MIS answer: every error status is read as its own thing", () => {
  assert.equal(readMisAnswer(401, null).outcome, "config_error");
  assert.equal(readMisAnswer(403, { why: "suspended" }).outcome, "not_allowed");
  assert.equal(readMisAnswer(403, { why: "suspended" }).message, "suspended");
  assert.equal(readMisAnswer(404, null).outcome, "bad_request");
  assert.equal(readMisAnswer(400, null).outcome, "bad_request");
  assert.equal(readMisAnswer(500, null).outcome, "try_again");
  assert.equal(readMisAnswer(200, null).outcome, "try_again");
});

test("MIS answer: a yes with no job number is not believed", () => {
  // Without this, a malformed answer would look like success and the job
  // sheet would be stamped with "undefined" as its job number.
  assert.equal(readMisAnswer(200, { ok: true }).outcome, "try_again");
});

test("MIS answer: a refusal on a 4xx still gives the customer the missing list", () => {
  // The live door answers a refusal with a 4xx AND the list in the body
  // (checked against it on 26 Oct 2026). Reading the status first would tell
  // the customer "not found" instead of what is actually missing.
  const got = readMisAnswer(400, { ok: false, missing: ["Printer", "Inks"], why: "incomplete" });
  assert.equal(got.outcome, "ask_for_missing");
  assert.deepEqual(got.missing, ["Printer", "Inks"]);
  assert.equal(got.message, "incomplete");
});

test("MIS answer: an Unauthorized with an EMPTY list is not mistaken for a refusal", () => {
  // The door answers 401 with {ok:false, missing:[]}. That is a setup problem
  // on our side, not something the customer can fix, so it must not turn into
  // an empty "still needed:" message.
  const got = readMisAnswer(401, { ok: false, missing: [], why: "Unauthorized" });
  assert.equal(got.outcome, "config_error");
});

test("MIS answer: a 403 and a 404 pass the door's own words through", () => {
  assert.equal(readMisAnswer(403, { ok: false, missing: [], why: "account suspended" }).message, "account suspended");
  assert.equal(readMisAnswer(404, { ok: false, missing: [], why: "no such sheet" }).message, "no such sheet");
});

test("MIS answer: a refusal with no reason does not become an empty 'still needed'", () => {
  // If the door says no but names nothing, the customer cannot act on it, so
  // they must not be shown a blank list. They get "try again" instead.
  const got = readMisAnswer(200, { ok: false, missing: [] });
  assert.equal(got.outcome, "try_again");
  assert.notEqual(got.outcome, "ask_for_missing");
});

// ─── AMBER DOES ARTWORK ONLY ───────────────────────────────────────────────
// The page used to offer "Plates from my ready file" next to the R499 artwork
// job. It showed no price and took no payment, so a customer who is not on
// account could get plates made for nothing, while the same customer going
// through Order Plates had to pay by card before we started. Plates now go
// through Order Plates. Cam 2026-10-26.

const SUBMISSION_ROUTE = readFileSync("app/api/amber/submission/route.js", "utf8");
const SUBMIT_ROUTE = readFileSync("app/api/amber/submit/route.js", "utf8");
const AMBER_PAGE = readFileSync("app/amber/page.jsx", "utf8");

test("plates: a new AMBER job sheet is always an artwork job", async () => {
  const { NEW_SUBMISSION_KIND, CHOICE_REPRO } = await import("../lib/amber-pricing.mjs");
  assert.equal(NEW_SUBMISSION_KIND, CHOICE_REPRO);
  assert.equal(NEW_SUBMISSION_KIND, "repro");
});

test("plates: the server never takes the kind from the browser", () => {
  assert.ok(SUBMISSION_ROUTE.includes("const kind = NEW_SUBMISSION_KIND;"));
  assert.ok(!SUBMISSION_ROUTE.includes('body?.kind === "plates"'));
});

test("plates: the kind of an existing sheet can never be switched", () => {
  // Everything from PATCH onwards must not write a kind, in any shape.
  const patchBlock = SUBMISSION_ROUTE.slice(
    SUBMISSION_ROUTE.indexOf("export async function PATCH"),
  );
  assert.ok(patchBlock.length > 0);
  assert.ok(!patchBlock.includes("patch.kind"));
  assert.ok(!/kind\s*:/.test(patchBlock));
});

test("plates: Submit sends a plates sheet to Order Plates instead of making it", () => {
  assert.ok(SUBMIT_ROUTE.includes('submission.kind !== "repro"'));
  assert.ok(SUBMIT_ROUTE.includes("Order Plates"));
});

test("plates: the page no longer offers plates as a choice", () => {
  assert.ok(!AMBER_PAGE.includes("Plates from my ready file"));
  assert.ok(!AMBER_PAGE.includes("onKind"));
});

test("plates: the page points a ready file at Order Plates", () => {
  assert.ok(AMBER_PAGE.includes('href="/order/new"'));
});
