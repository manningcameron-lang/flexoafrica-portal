// Tests for the email sales@ gets when a customer orders on the portal.
//
// Run them with:  npm test
//
// WHAT WAS WRONG (Cam, 11 Nov 2026): a plate order on the portal emailed
// Flexo Africa nothing, even a card order not paid yet. An artwork job only
// copied sales@ on the customer's own "job made" email, which is never sent
// for a job waiting on a "Not sure" box, and is blocked once a customer has
// had three automatic emails that day.
//
// WHAT IT DOES NOW: sales@ gets one email for every portal order that makes
// a job, plates or artwork, saying who, which FA numbers, and what to check
// (unpaid card order, customer not on the list, boxes waiting on us).
//
// Every test here is mutation-tested by tests/mutate.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  SALES_ALERT_TO,
  SALES_ALERT_FROM,
  buildArtworkJobAlert,
  buildPlateOrderAlert,
  oneLine,
  rands,
} from "../lib/sales-alert.mjs";

const read = (p) => readFileSync(p, "utf8");

const CARD_ORDER = {
  orderNumber: "ORD-0042",
  customerCompany: "Blaze Braai Products",
  customerName: "Thandi Mokoena",
  customerEmail: "thandi@blazebraai.co.za",
  customerPhone: "082 555 0100",
  paymentTerms: "prepaid",
  poNumber: "",
  orderTotalIncVat: 5123.4,
  deliveryMethod: "delivery",
  deliveryAddress: "12 Main Road, Durban",
  requiredByDate: "2026-11-20",
  tier: "standard",
  matchedCustomer: true,
};
const JOBS = [
  { jobName: "FA005450", description: "Shisa Nyama 5kg 40x60cm", colours: ["Cyan", "Magenta", "Yellow", "Black"], plateCount: 4 },
  { jobName: "FA005451", description: "Shisa Nyama 10kg 50x70cm", colours: ["Black"], plateCount: 1 },
];

// ─── plate orders ────────────────────────────────────────────────────────────

test("plates: the email goes to sales@ only", () => {
  const got = buildPlateOrderAlert({ order: CARD_ORDER, jobs: JOBS });
  assert.equal(got.to, "sales@flexoafrica.com");
  assert.equal(SALES_ALERT_TO, "sales@flexoafrica.com");
  assert.ok(SALES_ALERT_FROM.includes("@flexoafrica.com"));
});

test("plates: the subject names the order, the company and every FA number", () => {
  const got = buildPlateOrderAlert({ order: CARD_ORDER, jobs: JOBS });
  assert.equal(
    got.subject,
    "New portal plate order ORD-0042: Blaze Braai Products (FA005450, FA005451)",
  );
});

test("plates: an unpaid card order is shouted about", () => {
  const got = buildPlateOrderAlert({ order: CARD_ORDER, jobs: JOBS });
  assert.ok(got.text.includes("Payment: CARD, NOT PAID YET."));
  assert.ok(got.text.includes("Check the order is paid before making plates."));
});

test("plates: an account order shows the PO number instead", () => {
  const got = buildPlateOrderAlert({
    order: { ...CARD_ORDER, paymentTerms: "po", poNumber: "PO 7781" },
    jobs: JOBS,
  });
  assert.ok(got.text.includes("Payment: on account, PO PO 7781"));
  assert.ok(!got.text.includes("NOT PAID YET"));
});

test("plates: each job line shows its plates and colours", () => {
  const got = buildPlateOrderAlert({ order: CARD_ORDER, jobs: JOBS });
  assert.ok(got.text.includes("The 2 jobs:"));
  assert.ok(got.text.includes(
    "- FA005450: Shisa Nyama 5kg 40x60cm, 4 plates (Cyan, Magenta, Yellow, Black)",
  ));
  assert.ok(got.text.includes("- FA005451: Shisa Nyama 10kg 50x70cm, 1 plate (Black)"));
});

test("plates: the total, contact, delivery and date are all there", () => {
  const got = buildPlateOrderAlert({ order: CARD_ORDER, jobs: JOBS });
  assert.ok(got.text.includes("Total: R5 123,40 incl VAT"));
  assert.ok(got.text.includes("Customer: Blaze Braai Products"));
  assert.ok(got.text.includes("Contact: Thandi Mokoena, thandi@blazebraai.co.za, 082 555 0100"));
  assert.ok(got.text.includes("Delivery: 12 Main Road, Durban"));
  assert.ok(got.text.includes("Required by: 2026-11-20"));
  assert.ok(got.text.includes("Turnaround: Standard"));
});

test("plates: a collection and an express order say so", () => {
  const got = buildPlateOrderAlert({
    order: { ...CARD_ORDER, deliveryMethod: "collection", tier: "express" },
    jobs: JOBS,
  });
  assert.ok(got.text.includes("Delivery: customer will collect"));
  assert.ok(got.text.includes("Turnaround: EXPRESS"));
});

test("plates: a company not on the customer list is flagged", () => {
  const flagged = buildPlateOrderAlert({
    order: { ...CARD_ORDER, matchedCustomer: false },
    jobs: JOBS,
  });
  assert.ok(flagged.text.includes("CHECK: this company is not on the customer list"));
  const fine = buildPlateOrderAlert({ order: CARD_ORDER, jobs: JOBS });
  assert.ok(!fine.text.includes("CHECK:"));
});

// ─── artwork jobs ────────────────────────────────────────────────────────────

const ART = {
  jobNumber: "FA005452",
  jobName: "Klipdrif Charcoal 4kg",
  company: "Crown Bag (Pty) Ltd",
  customerName: "Darren",
  customerEmail: "darren@crownbag.co.za",
  dueSaid: "Thu 12 Nov, 16:00",
  firstFree: false,
  waitingOn: [],
  fileCount: 3,
  warnings: [],
};

test("artwork: a normal job names the FA number, price, files and due time", () => {
  const got = buildArtworkJobAlert(ART);
  assert.equal(got.to, "sales@flexoafrica.com");
  assert.equal(got.subject, "New AMBER artwork job FA005452: Crown Bag (Pty) Ltd");
  assert.ok(got.text.includes("Job: FA005452, Klipdrif Charcoal 4kg"));
  assert.ok(got.text.includes("Price: R499,00 excl VAT"));
  assert.ok(got.text.includes("Files: 3 files, copied to the job's Supplied folder"));
  assert.ok(got.text.includes("Due: Thu 12 Nov, 16:00"));
});

test("artwork: a first free job says FREE", () => {
  const got = buildArtworkJobAlert({ ...ART, firstFree: true });
  assert.ok(got.text.includes("Price: FIRST JOB FREE"));
});

test("artwork: a job waiting on a Not sure box says what to fill in", () => {
  const got = buildArtworkJobAlert({ ...ART, waitingOn: ["Press gear", "Teeth"] });
  assert.equal(got.subject, "New AMBER artwork job FA005452: Crown Bag (Pty) Ltd (waiting on us)");
  assert.ok(got.text.includes("WAITING ON US: the customer was not sure about Press gear, Teeth."));
  assert.ok(!got.text.includes("Due: "));
});

test("artwork: anything the MIS warned about is passed on", () => {
  const got = buildArtworkJobAlert({ ...ART, warnings: ["Supplied folder not made yet"] });
  assert.ok(got.text.includes("The MIS said:\n- Supplied folder not made yet"));
});

// ─── customer text stays on one line ─────────────────────────────────────────

test("safety: a line break typed by a customer cannot add lines or headers", () => {
  assert.equal(oneLine("Bad\r\nBcc: someone@else.com"), "Bad Bcc: someone@else.com");
  const got = buildPlateOrderAlert({
    order: { ...CARD_ORDER, customerCompany: "Evil Co\nBcc: x@y.com" },
    jobs: JOBS,
  });
  assert.ok(!got.subject.includes("\n"));
  assert.ok(got.text.includes("Customer: Evil Co Bcc: x@y.com"));
});

test("safety: rands are written the MIS way", () => {
  assert.equal(rands(230.49), "R230,49");
  assert.equal(rands(1234567.8), "R1 234 567,80");
  assert.equal(rands("nonsense"), "R0,00");
});

// ─── the routes really send it ───────────────────────────────────────────────

test("wiring: a plate order emails sales@ after the jobs are made, and never fails the order", () => {
  const route = read("app/api/orders/create/route.js");
  assert.ok(route.includes("const alert = buildPlateOrderAlert({"));
  assert.ok(route.includes("await sendSalesAlert({ ...alert, replyTo: profile.email || decoded.email });"));
  assert.ok(route.includes('console.error("orders/create: sales@ new-order email failed", err);'));
  // After the job loop, before the answer to the customer.
  assert.ok(route.indexOf("createdJobs.push(") < route.indexOf("buildPlateOrderAlert({"));
  assert.ok(route.indexOf("buildPlateOrderAlert({") < route.indexOf("orderId: orderRef.id,\n      orderNumber,\n      jobs: createdJobs"));
});

test("wiring: an artwork Submit emails sales@ for every new job, waiting or not", () => {
  const route = read("app/api/amber/submit/route.js");
  assert.ok(route.includes("const alert = buildArtworkJobAlert({"));
  assert.ok(route.includes("await sendSalesAlert({ ...alert, replyTo: user?.email });"));
  // Only skipped when Submit was pressed twice, NOT when the job waits on us.
  const block = route.slice(route.indexOf("if (!answer.again) {"), route.indexOf("buildArtworkJobAlert({"));
  assert.ok(block.length > 0 && block.length < 80);
  // Sent before the customer's own email, so that cannot block it.
  assert.ok(route.indexOf("buildArtworkJobAlert({") < route.indexOf('kind: answer.outcome === "made" ? JOB_MADE : JOB_RECEIVED,'));
});

test("wiring: the sender only ever writes to sales@ and reports a failure", () => {
  const server = read("lib/amber-server.js");
  const fn = server.slice(server.indexOf("export async function sendSalesAlert"));
  assert.ok(fn.includes("to: [SALES_ALERT_TO],"));
  assert.ok(fn.includes('if (error) throw new Error(error.message || "could not email sales@");'));
  assert.ok(!fn.includes("bumpReplyCount"));
});
