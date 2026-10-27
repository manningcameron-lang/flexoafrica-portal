// Tests for how the two ordering buttons are written.
//
// Run them with:  npm test
//
// WHAT WAS WRONG (Cam, 26 Oct 2026): the menu and the ordering page said
// "Order artwork" and "Order plates", with a small a and a small p, while the
// messages the portal sends customers already said "Order Plates".
//
// WHAT IT DOES NOW: every button, card and link says "Order Artwork" and
// "Order Plates", capital letters, everywhere a customer can see it. The last
// test reads every page and fails if the small-letter spelling comes back.
//
// Every test here is mutation-tested by tests/mutate.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const read = (p) => readFileSync(p, "utf8");

function filesUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...filesUnder(p));
    else if (/\.(jsx?|mjs|tsx?)$/.test(name)) out.push(p);
  }
  return out;
}

test("labels: the menu says Order Artwork", () => {
  assert.ok(read("components/Nav.jsx").includes('label: "Order Artwork"'));
});

test("labels: the ordering page card and button say Order Artwork", () => {
  const page = read("app/order/page.jsx");
  assert.ok(page.includes('title="Order Artwork"'));
  assert.ok(page.includes('cta="Order Artwork"'));
});

test("labels: the ordering page card and button say Order Plates", () => {
  const page = read("app/order/page.jsx");
  assert.ok(page.includes('title="Order Plates"'));
  assert.ok(page.includes('cta="Order Plates"'));
});

test("labels: the AMBER page link says Order Plates instead", () => {
  assert.ok(read("app/amber/page.jsx").includes("Order Plates instead"));
});

test("labels: no page or component spells them with a small letter", () => {
  const offenders = [];
  for (const f of [...filesUnder("app"), ...filesUnder("components"), ...filesUnder("lib")]) {
    const src = read(f);
    if (/Order artwork|Order plates/.test(src)) offenders.push(f);
  }
  assert.deepEqual(offenders, []);
});
