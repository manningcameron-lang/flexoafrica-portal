// Tests for reading customers' jobs through the job system's safe-list door
// (Cam, 24 Nov 2026, "Safe-list door"; MIS PRs #93 and #94).
//
// Run them with:  npm test
//
// WHY: a signed-in customer could read our cost and margin on their own job
// records straight from the database. The job system now gives a customer
// their jobs only through GET https://jobs.flexoafrica.com/api/portal/my-jobs,
// which carries a safe list of fields. These tests prove every customer page
// reads through it, the answers are read right, the pages keep asking, and
// staff logins still read directly. Every test is mutation-tested by
// tests/mutate.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  DOOR_MESSAGES,
  DOOR_URL,
  LIST_POLL_MS,
  ORDER_BUSY_POLL_MS,
  ORDER_POLL_MS,
  doorUrl,
  listFromDoor,
  orderJobsFromDoor,
  orderPollMs,
  readDoorAnswer,
  startPolling,
  stillAnalysing,
} from "../lib/job-door.mjs";

const read = (p) => readFileSync(p, "utf8");

// ─── the address ────────────────────────────────────────────────────────────
test("the door address: the list, one job, one order", () => {
  assert.equal(DOOR_URL, "https://jobs.flexoafrica.com/api/portal/my-jobs");
  assert.equal(doorUrl(), DOOR_URL);
  assert.equal(doorUrl({}), DOOR_URL);
  assert.equal(doorUrl({ id: "a8KQ/x?y" }), `${DOOR_URL}?id=a8KQ%2Fx%3Fy`);
  assert.equal(doorUrl({ orderId: "ord 1&2" }), `${DOOR_URL}?orderId=ord%201%262`);
  assert.equal(doorUrl({ id: "j1", orderId: "o1" }), `${DOOR_URL}?id=j1`, "one job wins");
});

// ─── reading the answer ─────────────────────────────────────────────────────
test("a good list answer gives the jobs; a good single answer gives the job", () => {
  const jobs = [{ id: "a" }, { id: "b" }];
  assert.deepEqual(readDoorAnswer(200, { ok: true, jobs }), { jobs });
  assert.deepEqual(readDoorAnswer(200, { ok: true, job: { id: "a" } }, { id: "a" }), { job: { id: "a" } });
});

test("not found or not theirs: the same quiet answer", () => {
  assert.deepEqual(readDoorAnswer(404, { ok: false }, { id: "x" }), { notFound: true });
  assert.deepEqual(readDoorAnswer(404, null), { notFound: true });
  assert.deepEqual(readDoorAnswer(200, { ok: true }, { id: "x" }), { notFound: true });
});

test("sign-in, inactive account and anything else become plain words", () => {
  assert.deepEqual(readDoorAnswer(401, {}), { error: DOOR_MESSAGES[401] });
  assert.deepEqual(readDoorAnswer(403, {}), { error: DOOR_MESSAGES[403] });
  assert.deepEqual(readDoorAnswer(500, { ok: true, jobs: [] }), { error: DOOR_MESSAGES.other });
  assert.deepEqual(readDoorAnswer(200, { ok: false, jobs: [] }), { error: DOOR_MESSAGES.other });
  assert.deepEqual(readDoorAnswer(200, null), { error: DOOR_MESSAGES.other });
  assert.deepEqual(readDoorAnswer(200, { ok: true }), { error: DOOR_MESSAGES.other });
  for (const m of Object.values(DOOR_MESSAGES)) assert.doesNotMatch(m, /token|401|403|firestore|api/i);
});

test("the list is newest first; the order page is in job-number order", () => {
  const jobs = [
    { jobName: "FA002782", jobNumberInt: 2782, created: "2025-07-02T13:36:00.000Z" },
    { jobName: "FA005545", jobNumberInt: 5545, created: "2026-11-24T08:26:12.033Z" },
    { jobName: "FA004811", jobNumberInt: 4811, createdAt: "2026-07-29T17:34:10.172Z" },
  ];
  assert.deepEqual(listFromDoor({ jobs }).map((j) => j.jobName), ["FA005545", "FA004811", "FA002782"]);
  assert.deepEqual(orderJobsFromDoor({ jobs }).map((j) => j.jobName), ["FA002782", "FA004811", "FA005545"]);
  assert.deepEqual(listFromDoor({}), []);
  assert.deepEqual(orderJobsFromDoor(null), []);
});

test("the order page asks every 10 s while a file is being analysed, else every 30 s", () => {
  assert.equal(stillAnalysing({}), true);
  assert.equal(stillAnalysing({ analysisStatus: "received" }), true);
  assert.equal(stillAnalysing({ analysisStatus: "analyzing" }), true);
  assert.equal(stillAnalysing({ analysisStatus: "complete" }), false);
  assert.equal(stillAnalysing({ analysisStatus: "failed" }), false);
  assert.equal(ORDER_BUSY_POLL_MS, 10000);
  assert.equal(ORDER_POLL_MS, 30000);
  assert.equal(LIST_POLL_MS, 30000);
  assert.equal(orderPollMs([{ analysisStatus: "complete" }, { analysisStatus: "analyzing" }]), 10000);
  assert.equal(orderPollMs([{ analysisStatus: "complete" }]), 30000);
  assert.equal(orderPollMs(undefined), 30000);
});

// ─── asking again ───────────────────────────────────────────────────────────
function fakeTimers() {
  const pending = new Map();
  let next = 1;
  return {
    pending,
    setTimeout(fn, ms) { const id = next++; pending.set(id, { fn, ms }); return id; },
    clearTimeout(id) { pending.delete(id); },
    async fire() { const [[id, t]] = [...pending]; pending.delete(id); await t.fn(); },
  };
}
const tick = () => new Promise((r) => setImmediate(r));

test("asks at once, then again after the wait, and passes each answer on", async () => {
  const timers = fakeTimers();
  let calls = 0;
  const got = [];
  const stop = startPolling({ load: async () => ({ n: ++calls }), deliver: (v) => got.push(v.n), nextMs: () => 30000, timers });
  await tick();
  assert.deepEqual(got, [1]);
  assert.equal(timers.pending.size, 1);
  assert.equal([...timers.pending.values()][0].ms, 30000);
  await timers.fire(); await tick();
  assert.deepEqual(got, [1, 2]);
  stop();
  assert.equal(timers.pending.size, 0, "stop clears the waiting ask");
});

test("the wait follows the answer (order page: 10 s while analysing)", async () => {
  const timers = fakeTimers();
  startPolling({ load: async () => ({ jobs: [{ analysisStatus: "analyzing" }] }), deliver: () => {}, nextMs: (v) => orderPollMs(v.jobs), timers });
  await tick();
  assert.equal([...timers.pending.values()][0].ms, 10000);
});

test("coming back to the tab asks straight away, never two asks at once", async () => {
  const timers = fakeTimers();
  let wake = null;
  let removed = false;
  let calls = 0;
  let release;
  const load = () => { calls += 1; return new Promise((r) => { release = r; }); };
  const stop = startPolling({ load, deliver: () => {}, timers, onWake: (w) => { wake = w; return () => { removed = true; }; } });
  assert.equal(calls, 1);
  wake(); // still waiting for the first answer
  assert.equal(calls, 1, "no second ask while one is running");
  release({}); await tick();
  wake(); await tick();
  assert.equal(calls, 2, "tab back: asked again at once");
  assert.equal(timers.pending.size, 0, "the waiting ask was replaced, not doubled");
  release({}); await tick();
  assert.equal(timers.pending.size, 1);
  stop();
  assert.equal(removed, true, "stop removes the tab listener");
});

test("nothing is passed on after stop, and a failed ask becomes plain words", async () => {
  const timers = fakeTimers();
  const got = [];
  let release;
  const stop = startPolling({ load: () => new Promise((r) => { release = r; }), deliver: (v) => got.push(v), timers });
  stop();
  release({ jobs: [] }); await tick();
  assert.deepEqual(got, []);
  assert.equal(timers.pending.size, 0);

  const got2 = [];
  startPolling({ load: async () => { throw new Error("network down"); }, deliver: (v) => got2.push(v), timers: fakeTimers() });
  await tick();
  assert.deepEqual(got2, [{ error: "network down" }]);
});

test("never asks more often than once a second", async () => {
  const timers = fakeTimers();
  startPolling({ load: async () => ({}), deliver: () => {}, nextMs: () => 0, timers });
  await tick();
  assert.equal([...timers.pending.values()][0].ms, 1000);
  const t2 = fakeTimers();
  startPolling({ load: async () => ({}), deliver: () => {}, nextMs: () => undefined, timers: t2 });
  await tick();
  assert.equal([...t2.pending.values()][0].ms, LIST_POLL_MS, "no wait given: 30 s");
});

// ─── every customer page reads through the door ─────────────────────────────
test("lib/jobs.js: customers through the door with their sign-in, staff directly", () => {
  const src = read("lib/jobs.js");
  assert.match(src, /headers: \{ Authorization: `Bearer \$\{token\}` \},/);
  assert.match(src, /const res = await fetch\(doorUrl\(params\), \{/);
  assert.doesNotMatch(src, /collection\(|where\(|getDocs\(|getDoc\(/, "no direct query of job records left");
  assert.doesNotMatch(src, /data\.customer/, "the door checks ownership; no company double-check");
  assert.match(src, /load: \(\) => askDoor\(\{\}\),/);
  assert.match(src, /const answer = await askDoor\(\{ id: jobId \}\);/);
  assert.match(src, /if \(!staff\) \{\n\s+return startPolling\(\{\n\s+load: \(\) => askDoor\(\{ id: jobId \}\),/);
  assert.match(src, /if \(answer\?\.notFound\) callback\(null, null\);/);
  assert.equal((src.match(/onWake: onTabBack,/g) || []).length, 2, "the list and the job page both ask again when the tab comes back");
});

test("the job page passes staff and waits for the sign-in; the order page asks the door", () => {
  const page = read("app/jobs/[id]/page.jsx");
  assert.match(page, /const staff = isStaff\(profile\);/);
  assert.match(page, /if \(!jobId \|\| authLoading \|\| !user\) return;/);
  assert.match(page, /\}, \{ staff \}\);/);
  assert.match(page, /if \(!shown\.current\) setError\(err\.message \|\| "Failed to load job"\);/);

  const order = read("app/order/[orderId]/success/page.jsx");
  assert.match(order, /load: \(\) => askDoor\(\{ orderId \}\),/);
  assert.match(order, /nextMs: \(answer\) => orderPollMs\(answer\?\.jobs\),/);
  assert.match(order, /if \(staffView\) \{\n\s+setJobs\(\[\]\);\n\s+return;/);
  assert.doesNotMatch(order, /collection\(db, "jobs"\)/);

  for (const p of ["app/jobs/page.jsx", "app/dashboard/page.jsx"]) {
    assert.match(read(p), /setError\(null\); \/\/ a later good answer clears an earlier hiccup/);
  }
});
