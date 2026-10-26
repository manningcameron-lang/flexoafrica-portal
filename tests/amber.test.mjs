// Tests for the AMBER intake.
//
// Run them with:  npm test
//
// Every test here is mutation-tested: tests/mutate.mjs deliberately breaks the
// code one change at a time and proves the suite goes red, and proves the
// sabotage actually landed in the file. A test that cannot fail is not a test.

import { test } from "node:test";
import assert from "node:assert/strict";

import { dueAt, formatDue, isPublicHoliday, isWorkingDay } from "../lib/amber-due.mjs";
import {
  MAX_AUTO_REPLIES_PER_SENDER_PER_DAY,
  looksAutomatic,
  mayAutoReply,
  normaliseAddress,
} from "../lib/amber-loop-guard.mjs";
import { expectedSignature, verifyWebhook } from "../lib/amber-signature.mjs";
import {
  NOT_SURE,
  isComplete,
  missingSpecFields,
  notSureFields,
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
import { jobCreationDecision, mayCustomerSubmit } from "../lib/amber-submit-rules.mjs";
import { buildEmail, emailKindForSender } from "../lib/amber-emails.mjs";

// South African wall-clock time to a real instant (SAST is UTC+2 all year).
function sast(y, m, d, h, mi = 0) {
  return new Date(Date.UTC(y, m - 1, d, h, mi) - 120 * 60000);
}

const FULL_SPEC = {
  jobName: "Bordeaux Washed Potatoes 10kg",
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
const COMPLETE = { files: [{ path: "a.pdf" }], spec: { ...FULL_SPEC } };

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
  const got = missingSpecFields({ files: [{ path: "a" }], spec: { jobName: "X" } });
  assert.equal(got.includes("Job name"), false);
  assert.equal(got[0], "Printer");
  assert.equal(got.includes("Inks, in print order"), true);
  assert.equal(got.length, 15);
});

test("missing list: no artwork is itself a missing item", () => {
  const got = missingSpecFields({ files: [], spec: { ...FULL_SPEC } });
  assert.deepEqual(got, ["Artwork file"]);
});

test("missing list: a PO-approved customer must give a PO number", () => {
  assert.deepEqual(missingSpecFields(COMPLETE, { poRequired: true }), ["PO number"]);
  assert.deepEqual(missingSpecFields(COMPLETE, { poRequired: false }), []);
});

test("missing list: a blank-looking answer does not count as filled in", () => {
  const spec = { ...FULL_SPEC, cylinder: "   ", colours: ["", "  "] };
  const got = missingSpecFields({ files: [{ path: "a" }], spec });
  assert.deepEqual(got, ["Cylinder or gear teeth", "Inks, in print order"]);
});

// ─── 5. "Not sure" holds the job, it does not refuse it ─────────────────────

test("not sure: is an ANSWER, so it never appears on the missing list", () => {
  const spec = { ...FULL_SPEC, plateDistortion: NOT_SURE };
  assert.deepEqual(missingSpecFields({ files: [{ path: "a" }], spec }), []);
});

test("not sure: parks the job with us instead of starting the clock", () => {
  const spec = { ...FULL_SPEC, plateDistortion: NOT_SURE };
  const sub = { files: [{ path: "a" }], spec };
  assert.deepEqual(notSureFields(sub), ["Distortion"]);
  assert.equal(submissionStatus(sub), "waiting_flexo");
  assert.equal(isComplete(sub), false);
});

test("not sure: on the inks too", () => {
  const spec = { ...FULL_SPEC, colours: [NOT_SURE] };
  const sub = { files: [{ path: "a" }], spec };
  assert.deepEqual(missingSpecFields(sub), []);
  assert.deepEqual(notSureFields(sub), ["Inks, in print order"]);
});

test("not sure: Submit waits on us rather than making the job", () => {
  const sub = { uid: "u1", files: [{ path: "a" }], spec: { ...FULL_SPEC, cylinder: NOT_SURE } };
  assert.equal(jobCreationDecision(sub).action, "wait_on_flexo");
});

test("status: missing details beats not sure in what the customer is shown", () => {
  const sub = { files: [], spec: { ...FULL_SPEC, plateDistortion: NOT_SURE } };
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
