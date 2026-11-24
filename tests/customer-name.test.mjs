// Tests for the customer-name, job-list and job-message fixes (Cam, 24 Nov 2026).
//
// Run them with:  npm test
//
// WHAT WENT WRONG (found in the live Top Flight test, FA005545):
//   1. The job system made the AMBER job under our customer list's name
//      ("Top Flight Packaging cc") but the account said "Top Flight Packaging",
//      so the customer could not see the job or answer AMBER's file check.
//   2. My Jobs sorted in the database by createdAt, which silently dropped
//      every job the job system makes (they store `created`): 1 of 4 shown.
//   3. Job messages asked for every message, internal notes included, so the
//      database refused and every customer saw "Missing or insufficient
//      permissions".
// Every test here is mutation-tested by tests/mutate.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { companyNameUpdate, matchCustomer, registerNameFor } from "../lib/company-match.mjs";
import {
  CUSTOMER_VISIBILITY,
  jobCreatedMs,
  sortCommentsOldestFirst,
  sortJobsNewestFirst,
  toMillis,
} from "../lib/job-order.mjs";
import { LEGAL_LINE, showLegalLine } from "../lib/file-check.mjs";

const read = (p) => readFileSync(p, "utf8");
const LIST = [
  { name: "Top Flight Packaging cc" },
  { name: "Crown Bag (Pty) Ltd." },
  { name: "Twin Co" },
  { name: "Twin Co (Pty) Ltd" },
];

// ─── 1. our list's name ─────────────────────────────────────────────────────
test("the Top Flight case: the typed name becomes our list's name", () => {
  assert.equal(registerNameFor(LIST, "Top Flight Packaging"), "Top Flight Packaging cc");
  assert.equal(companyNameUpdate(LIST, "Top Flight Packaging"), "Top Flight Packaging cc");
  assert.equal(companyNameUpdate(LIST, "  top flight packaging  "), "Top Flight Packaging cc");
  assert.equal(companyNameUpdate(LIST, "Crown Bag"), "Crown Bag (Pty) Ltd.");
});

test("an account already on our list's name is left alone", () => {
  assert.equal(registerNameFor(LIST, "Top Flight Packaging cc"), "Top Flight Packaging cc");
  assert.equal(companyNameUpdate(LIST, "Top Flight Packaging cc"), null);
});

test("no match, a blank name or two possible customers change nothing", () => {
  assert.equal(companyNameUpdate(LIST, "Somebody Else Bags"), null);
  assert.equal(registerNameFor(LIST, "Somebody Else Bags"), null);
  assert.equal(companyNameUpdate(LIST, ""), null);
  assert.equal(companyNameUpdate(LIST, "   "), null);
  assert.equal(companyNameUpdate([], "Top Flight Packaging"), null);
  assert.equal(companyNameUpdate(null, "Top Flight Packaging"), null);
  // "Twin Co" typed as "twin co" matches two customers once "(Pty) Ltd" is
  // dropped: never guess.
  assert.equal(matchCustomer(LIST, "twin co"), null);
  assert.equal(companyNameUpdate(LIST, "twin co"), null);
  // A customer on the list with no name gives nothing to save.
  assert.equal(companyNameUpdate([{ name: "  " }], "x"), null);
});

test("the matching rule lives in one place and the old import still works", () => {
  const shim = read("lib/company-match.js");
  assert.match(shim, /export \{ normalizeCompany, matchCustomer, registerNameFor \} from "\.\/company-match\.mjs";/);
  assert.doesNotMatch(shim, /function /, "no second copy of the rule");
});

test("the account is moved onto our list's name: on sign-in, on AMBER Submit and on plate orders", () => {
  const sync = read("lib/company-sync.js");
  assert.match(sync, /const name = companyNameUpdate\(list, typed\);/);
  assert.match(sync, /await adminDb\.collection\("users"\)\.doc\(uid\)\.update\(\{\n\s+company: name,\n\s+companyTyped: typed,/);

  const route = read("app/api/account/company-sync/route.js");
  assert.match(route, /if \(!decoded\) return NextResponse\.json\(\{ error: "Unauthorized" \}, \{ status: 401 \}\);/);
  assert.match(route, /if \(user\.role !== "customer" \|\| user\.status !== "active"\) \{\n\s+return NextResponse\.json\(\{ company: user\.company \|\| "", changed: false \}\);/);
  assert.match(route, /const result = await saveRegisterName\(adminDb, decoded\.uid, user, list\);/);

  const auth = read("components/AuthProvider.jsx");
  assert.match(auth, /fetch\("\/api\/account\/company-sync", \{\n\s+method: "POST",\n\s+headers: \{ Authorization: `Bearer \$\{token\}` \},/);
  assert.match(auth, /if \(profile\.role !== "customer" \|\| profile\.status !== "active"\) return;/);

  assert.match(read("app/api/amber/submit/route.js"), /await saveRegisterName\(db, decoded\.uid, user, list\)\.catch\(\(\) => \{\}\);/);

  const orders = read("app/api/orders/create/route.js");
  assert.match(orders, /const customerName = registerNameFor\(list, company\) \|\| company;/);
  assert.match(orders, /await saveRegisterName\(adminDb, decoded\.uid, profile, list\)\.catch\(\(\) => \{\}\);/);
  assert.match(orders, /customer: customerName \|\| profile\.contactName \|\| "Portal customer",/);
  assert.doesNotMatch(orders, /customer: company \|\|/);
});

// ─── 2. every job of theirs in My Jobs ──────────────────────────────────────
const ts = (ms) => ({ toMillis: () => ms });

test("dates in every form the two systems store", () => {
  assert.equal(toMillis(ts(1000)), 1000);
  assert.equal(toMillis(new Date(2000)), 2000);
  assert.equal(toMillis({ seconds: 3, nanoseconds: 500000000 }), 3500);
  assert.equal(toMillis(4000), 4000);
  assert.equal(toMillis("2026-11-24T08:00:00Z"), Date.parse("2026-11-24T08:00:00Z"));
  assert.equal(toMillis("not a date"), null);
  assert.equal(toMillis(null), null);
  assert.equal(toMillis(undefined), null);
  assert.equal(toMillis(""), null);
  assert.equal(jobCreatedMs({ created: ts(10) }), 10, "a job-system job (created)");
  assert.equal(jobCreatedMs({ createdAt: ts(20), created: ts(10) }), 20, "a portal order (createdAt) wins");
  assert.equal(jobCreatedMs({ updated: ts(5) }), 5);
  assert.equal(jobCreatedMs({}), null);
});

test("the Top Flight case: all 4 jobs, newest first, whichever date they carry", () => {
  const jobs = [
    { jobName: "FA004811", createdAt: ts(300) },          // portal plate order
    { jobName: "FA002782", created: ts(100) },            // job system
    { jobName: "FA005545", created: ts(400) },            // AMBER (job system)
    { jobName: "FA002933", created: { seconds: 0.2 } },   // job system, seconds form
  ];
  assert.deepEqual(sortJobsNewestFirst(jobs).map((j) => j.jobName), ["FA005545", "FA004811", "FA002933", "FA002782"]);
});

test("jobs with no date go last and nothing is lost", () => {
  const jobs = [{ jobName: "A" }, { jobName: "B", created: ts(5) }, { jobName: "C" }, { jobName: "D", created: ts(9) }];
  assert.deepEqual(sortJobsNewestFirst(jobs).map((j) => j.jobName), ["D", "B", "A", "C"]);
  assert.deepEqual(sortJobsNewestFirst(null), []);
  assert.equal(sortJobsNewestFirst(jobs).length, 4);
});

test("the job list no longer sorts in the database (it reads through the door, sorted in the browser)", () => {
  const src = read("lib/jobs.js");
  assert.doesNotMatch(src, /orderBy\(/, "an orderBy drops every job without createdAt");
  assert.match(src, /else callback\(listFromDoor\(answer\), null\);/);
  assert.match(src, /return listFromDoor\(answer\)\.slice\(0, max\);/);
});

// ─── 3. job messages ────────────────────────────────────────────────────────
test("job messages ask only for the customer's messages, and read oldest first", () => {
  assert.equal(CUSTOMER_VISIBILITY, "customer");
  const src = read("lib/comments.js");
  assert.match(src, /where\("visibility", "==", CUSTOMER_VISIBILITY\),/);
  assert.doesNotMatch(src, /orderBy\(/, "sorting in the database needs an index that does not exist");
  assert.match(src, /const items = sortCommentsOldestFirst\(snap\.docs\.map\(\(d\) => \(\{ id: d\.id, \.\.\.d\.data\(\) \}\)\)\);/);
  const c = [{ t: "b", createdAt: ts(2) }, { t: "pending" }, { t: "a", createdAt: ts(1) }];
  assert.deepEqual(sortCommentsOldestFirst(c).map((x) => x.t), ["a", "b", "pending"]);
  assert.deepEqual(sortCommentsOldestFirst(undefined), []);
});

// ─── cosmetic: the legal line once ──────────────────────────────────────────
test("the labelling-rules line is shown once", () => {
  assert.equal(showLegalLine({ legal: true, effect: "Net quantity should be bigger." }), true);
  assert.equal(showLegalLine({ legal: true, effect: `Net quantity should be bigger. ${LEGAL_LINE}` }), false);
  assert.equal(showLegalLine({ legal: true, what: LEGAL_LINE.toUpperCase(), effect: "" }), false);
  assert.equal(showLegalLine({ legal: false, effect: "x" }), false);
  assert.equal(showLegalLine(null), false);
});
