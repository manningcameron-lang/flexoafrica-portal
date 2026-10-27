// Tests for when the AMBER page says "First job free".
//
// Run them with:  npm test
//
// WHAT WAS WRONG (Cam, 27 Oct 2026): the page said "First job free" unless
// the price check came back and said otherwise. While the page was loading,
// or when the check failed, a customer who had already used their free job
// was told this one was free too, and the job system then billed them R499.
//
// WHAT IT DOES NOW: "free" shows ONLY when the price check came back and
// confirmed this company has never had an AMBER job. Anything else (still
// loading, a failed check, no company, a company not on the customer list,
// too many sheets to be sure) shows the normal R499.
//
// Every test here is mutation-tested by tests/mutate.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  FREE_JOB_CHECK_LIMIT,
  firstJobAnswer,
  freeJobConfirmed,
  priceShownToCustomer,
} from "../lib/amber-pricing.mjs";

const read = (p) => readFileSync(p, "utf8");

// ─── what the page shows ─────────────────────────────────────────────────────

test("free job: shown when the check confirms the company never had one", () => {
  const got = priceShownToCustomer({ companyHasHadFreeJob: false });
  assert.equal(got.free, true);
  assert.equal(got.exclVat, 0);
});

test("free job: NOT shown while the page is still loading the check", () => {
  const got = priceShownToCustomer(null);
  assert.equal(got.free, false);
  assert.equal(got.exclVat, 499);
});

test("free job: NOT shown when the check failed and gave nothing back", () => {
  assert.equal(priceShownToCustomer(undefined).free, false);
  assert.equal(priceShownToCustomer({}).free, false);
  assert.equal(priceShownToCustomer({ error: "Internal server error" }).free, false);
});

test("free job: NOT shown when the check says it cannot be sure", () => {
  assert.equal(priceShownToCustomer({ companyHasHadFreeJob: null }).free, false);
});

test("free job: NOT shown once the company has had its free job", () => {
  assert.equal(priceShownToCustomer({ companyHasHadFreeJob: true }).free, false);
});

test("free job: only a real false counts, not something that merely looks empty", () => {
  assert.equal(freeJobConfirmed({ companyHasHadFreeJob: false }), true);
  assert.equal(freeJobConfirmed({ companyHasHadFreeJob: 0 }), false);
  assert.equal(freeJobConfirmed({ companyHasHadFreeJob: "" }), false);
  assert.equal(freeJobConfirmed({ companyHasHadFreeJob: "false" }), false);
});

// ─── what the price check answers ────────────────────────────────────────────

const OK = { company: "Blaze Braai Products", customerFound: true };

test("check: a company with no AMBER job yet is confirmed free", () => {
  assert.equal(firstJobAnswer({ ...OK, sheetJobNumbers: [] }), false);
  assert.equal(firstJobAnswer({ ...OK, sheetJobNumbers: [null, null] }), false);
});

test("check: a company whose sheet already has an FA number has had its free job", () => {
  assert.equal(firstJobAnswer({ ...OK, sheetJobNumbers: [null, "FA005340"] }), true);
});

test("check: a login with no company cannot be confirmed free", () => {
  assert.equal(firstJobAnswer({ ...OK, company: "" }), null);
  assert.equal(firstJobAnswer({ ...OK, company: "   " }), null);
});

test("check: a company not on the customer list cannot be confirmed free", () => {
  assert.equal(firstJobAnswer({ ...OK, customerFound: false }), null);
});

test("check: too many sheets with no job number yet cannot be confirmed free", () => {
  const full = Array.from({ length: FREE_JOB_CHECK_LIMIT }, () => null);
  assert.equal(firstJobAnswer({ ...OK, sheetJobNumbers: full }), null);
  assert.equal(firstJobAnswer({ ...OK, sheetJobNumbers: full.slice(1) }), false);
});

// ─── the page and the server really use these rules ─────────────────────────

test("page: the AMBER page prices from the confirmed answer only", () => {
  const page = read("app/amber/page.jsx");
  assert.ok(page.includes("return priceShownToCustomer(terms);"));
  assert.ok(!page.includes("!!terms?.companyHasHadFreeJob"));
});

test("server: the price check reads up to the limit and answers through the rule", () => {
  const route = read("app/api/amber/price/route.js");
  assert.ok(route.includes("let companyHasHadFreeJob = null;"));
  assert.ok(route.includes("if (company && customer) {"));
  assert.ok(route.includes(".limit(FREE_JOB_CHECK_LIMIT)"));
  assert.ok(route.includes("companyHasHadFreeJob = firstJobAnswer({"));
});
