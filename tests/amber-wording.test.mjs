// Tests for what the AMBER page and emails promise the customer.
//
// Run them with:  npm test
//
// WHAT WAS WRONG (Cam, 13 Nov 2026): the AMBER page and the "your job is with
// AMBER" emails promised "a plate-ready file and a PDF proof". The marketing
// rule (Cam, 27 Oct 2026) is never to say "plate-ready file" for AMBER: what
// AMBER sends back is a PDF proof for the customer to approve, and the plate
// file is made later, when the job goes to plates.
//
// WHAT IT DOES NOW: every AMBER promise says "PDF proof for approval". The one
// "plate-ready file" left on the page is about the CUSTOMER's own file ("Already
// have a plate-ready file and just want the plates? Order Plates instead"),
// which is right.
//
// Every test here is mutation-tested by tests/mutate.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { JOB_MADE, JOB_RECEIVED, buildEmail } from "../lib/amber-emails.mjs";

const read = (p) => readFileSync(p, "utf8");
const ok = (cond, msg) => assert.ok(cond, msg);
const eq = (got, want, msg) => assert.deepEqual(got, want, msg);

const JOB = {
  jobNumber: "FA009999",
  jobName: "Sunny Meadow Potatoes 10kg",
  dueText: "Mon 16 Nov, 16:00",
  link: "https://portal.flexoafrica.com/jobs",
};

test("page: AMBER promises a PDF proof for approval, never a plate-ready file", () => {
  const page = read("app/amber/page.jsx");
  ok(page.includes("you get back a\n        PDF proof for approval."));
  ok(page.includes("<li>You get a PDF proof for approval</li>"));
  ok(page.includes("You will have your PDF proof for approval within 24 working hours of that."));
  ok(page.includes("<> You will have your PDF proof for approval by <strong>"));
  ok(page.includes('" You will have your PDF proof for approval shortly."'));
});

test("page: the only plate-ready file left is the customer's own, pointing to Order Plates", () => {
  const page = read("app/amber/page.jsx");
  const hits = page.match(/plate-ready/g) || [];
  eq(hits.length, 1);
  ok(page.includes("Already have a plate-ready file and just want the plates?"));
});

test("emails: the job-made email promises a PDF proof for approval", () => {
  const made = buildEmail(JOB_MADE, JOB);
  ok(made.text.includes("AMBER is on it, and you will have your PDF proof for approval by Mon 16 Nov, 16:00."));
  eq(made.text.includes("plate-ready"), false);
});

test("emails: the waiting email promises a PDF proof for approval", () => {
  const waiting = buildEmail(JOB_RECEIVED, JOB);
  ok(waiting.text.includes("You will have your PDF proof for approval within 24 working hours of that."));
  eq(waiting.text.includes("plate-ready"), false);
});

test("emails: no AMBER email in the file promises a plate-ready file", () => {
  eq(read("lib/amber-emails.mjs").includes("plate-ready"), false);
});
