// Customers read their jobs through the job system's SAFE-LIST DOOR
// (Cam, 24 Nov 2026, "Safe-list door"; MIS PRs #93 and #94).
//
// WHY: a signed-in customer could read our cost and margin (totalCost,
// margin, sellRate, totalSell, reproTotal) on their own job records straight
// from the database with ordinary browser tools. The job system now hands a
// customer their jobs only through
//   GET https://jobs.flexoafrica.com/api/portal/my-jobs
// with their sign-in token, and that answer carries only a safe list of
// fields. Once the portal reads through it, the job system switches off the
// customer's direct read of job records.
//
// Staff logins still read job records directly (the door is for customers
// only, and staff reads stay allowed).
//
// Pure: no Firebase, no browser. The browser side is in lib/jobs.js.

import { sortJobsNewestFirst } from "./job-order.mjs";

export const DOOR_URL = "https://jobs.flexoafrica.com/api/portal/my-jobs";
export const LIST_POLL_MS = 30000; // job list, dashboard, job page
export const ORDER_POLL_MS = 30000; // order page, nothing still being analysed
export const ORDER_BUSY_POLL_MS = 10000; // order page, a file still being analysed

export const DOOR_MESSAGES = Object.freeze({
  401: "Please sign in again to see your jobs.",
  403: "Your account is not active yet, so your jobs cannot be shown.",
  other: "We could not load your jobs just now. We will try again shortly.",
});

/** The door address: the list, one job (?id=) or one order's jobs (?orderId=). */
export function doorUrl({ id, orderId } = {}) {
  if (id) return `${DOOR_URL}?id=${encodeURIComponent(String(id))}`;
  if (orderId) return `${DOOR_URL}?orderId=${encodeURIComponent(String(orderId))}`;
  return DOOR_URL;
}

/**
 * What the door's answer means for a page.
 * Returns { jobs } for a list, { job } for one job, { notFound: true } for a
 * job that does not exist or is not theirs (the door gives the same answer on
 * purpose), or { error } with words a customer can read.
 */
export function readDoorAnswer(status, json, { id } = {}) {
  if (status === 404) return { notFound: true };
  if (status === 401 || status === 403) return { error: DOOR_MESSAGES[status] };
  if (status !== 200 || !json || json.ok !== true) return { error: DOOR_MESSAGES.other };
  if (id) {
    if (!json.job || typeof json.job !== "object") return { notFound: true };
    return { job: json.job };
  }
  if (!Array.isArray(json.jobs)) return { error: DOOR_MESSAGES.other };
  return { jobs: json.jobs };
}

/** The list pages: newest first (the door sorts too; this keeps it certain). */
export function listFromDoor(answer) {
  return sortJobsNewestFirst(answer?.jobs || []);
}

/** The order page: in job-number order, as before. */
export function orderJobsFromDoor(answer) {
  return [...(answer?.jobs || [])].sort((a, b) => (a.jobNumberInt || 0) - (b.jobNumberInt || 0));
}

/** A job whose file is still being analysed (the order page checks sooner). */
export function stillAnalysing(job) {
  const s = job?.analysisStatus;
  return !s || s === "received" || s === "analyzing";
}

/** How long the order page waits before asking again. */
export function orderPollMs(jobs) {
  return (jobs || []).some(stillAnalysing) ? ORDER_BUSY_POLL_MS : ORDER_POLL_MS;
}

/**
 * Ask now, then again after `nextMs(lastValue)`, and straight away when
 * `onWake` reports the tab came back into view. Never two asks at once, and
 * nothing is delivered after stop. Returns stop().
 *
 * @param {object} o
 * @param {() => Promise<any>} o.load  one ask of the door
 * @param {(value: any) => void} o.deliver
 * @param {(value: any) => number} [o.nextMs]
 * @param {(wake: () => void) => (() => void)} [o.onWake]  registers a wake-up, returns its remover
 * @param {{setTimeout: Function, clearTimeout: Function}} [o.timers]
 */
export function startPolling({ load, deliver, nextMs = () => LIST_POLL_MS, onWake, timers = globalThis }) {
  let stopped = false;
  let running = false;
  let timer = null;

  async function run() {
    if (stopped || running) return;
    running = true;
    if (timer) timers.clearTimeout(timer);
    timer = null;
    let value;
    try {
      value = await load();
    } catch (err) {
      value = { error: err?.message || DOOR_MESSAGES.other };
    }
    running = false;
    if (stopped) return;
    deliver(value);
    const wait = Number(nextMs(value));
    timer = timers.setTimeout(run, Math.max(1000, Number.isFinite(wait) ? wait : LIST_POLL_MS));
  }

  const removeWake = typeof onWake === "function" ? onWake(() => run()) : null;
  run();
  return () => {
    stopped = true;
    if (timer) timers.clearTimeout(timer);
    timer = null;
    if (typeof removeWake === "function") removeWake();
  };
}
