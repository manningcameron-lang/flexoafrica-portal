// Readers for a customer's jobs.
//
// CUSTOMERS read through the job system's safe-list door (Cam, 24 Nov 2026,
// "Safe-list door"): GET https://jobs.flexoafrica.com/api/portal/my-jobs with
// their sign-in token. The door checks the company itself and hands back only
// safe fields, never our cost or margin. The rules and the field list live in
// lib/job-door.mjs. The pages ask again every 30 seconds and when the tab
// comes back into view, so a job moving on still shows without a reload.
//
// STAFF logins (the read-only staff view) still read job records directly:
// the door is for customers only, and staff reads stay allowed.

import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase";
import {
  DOOR_MESSAGES,
  doorUrl,
  listFromDoor,
  readDoorAnswer,
  startPolling,
} from "./job-door.mjs";

const JOBS = "jobs";

/** One ask of the door with the signed-in person's token. Never throws. */
export async function askDoor(params = {}) {
  const user = auth.currentUser;
  if (!user) return { error: DOOR_MESSAGES[401] };
  try {
    const token = await user.getIdToken();
    const res = await fetch(doorUrl(params), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return readDoorAnswer(res.status, json, params);
  } catch {
    return { error: DOOR_MESSAGES.other };
  }
}

/** Ask again when the tab comes back into view. Returns the remover. */
export function onTabBack(wake) {
  if (typeof window === "undefined") return () => {};
  const onVisible = () => {
    if (document.visibilityState === "visible") wake();
  };
  window.addEventListener("focus", wake);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.removeEventListener("focus", wake);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

// All the jobs of the customer's company, newest first, kept up to date.
// `company` is the profile.company string; a staff login with no company gets
// nothing, as before. Returns an unsubscribe function.
export function subscribeJobsForCustomer(company, callback) {
  if (!company || typeof company !== "string") {
    return () => {};
  }
  // Heuristic: Firebase Auth uids are exactly 28 chars of A-Za-z0-9. If
  // someone hands us one of those by mistake, log + bail.
  if (/^[A-Za-z0-9]{28}$/.test(company)) {
    console.warn("subscribeJobsForCustomer received a uid instead of a company name");
    return () => {};
  }
  return startPolling({
    load: () => askDoor({}),
    deliver: (answer) => {
      if (answer?.error) callback(null, new Error(answer.error));
      else callback(listFromDoor(answer), null);
    },
    onWake: onTabBack,
  });
}

// One-shot fetch of the company's jobs, newest first.
export async function listJobsForCustomer(company, max = 100) {
  if (!company || typeof company !== "string") return [];
  const answer = await askDoor({});
  if (answer.error) throw new Error(answer.error);
  return listFromDoor(answer).slice(0, max);
}

// One job. The door has already checked it is theirs: a job that is not
// theirs answers exactly like one that does not exist (null).
export async function getJobForCustomer(jobId) {
  if (!jobId) return null;
  const answer = await askDoor({ id: jobId });
  if (answer.notFound) return null;
  if (answer.error) throw new Error(answer.error);
  return answer.job;
}

// One job for the job page, kept up to date. Customers: through the door.
// Staff (read-only view): the job record directly, as before.
export function subscribeJob(jobId, callback, { staff = false } = {}) {
  if (!jobId) return () => {};
  if (!staff) {
    return startPolling({
      load: () => askDoor({ id: jobId }),
      deliver: (answer) => {
        if (answer?.notFound) callback(null, null);
        else if (answer?.error) callback(null, new Error(answer.error));
        else callback(answer.job, null);
      },
      onWake: onTabBack,
    });
  }
  return onSnapshot(
    doc(db, JOBS, jobId),
    (snap) => {
      if (!snap.exists()) {
        callback(null, null);
        return;
      }
      callback({ id: snap.id, ...snap.data() }, null);
    },
    (err) => callback(null, err)
  );
}

// Partition jobs into the buckets the dashboard cares about.
export function bucketJobs(jobs) {
  const awaitingApproval = [];
  const inProduction = [];
  const recent = [];
  const overdueInvoices = [];

  for (const j of jobs) {
    if (j.stage === "pdf_sent") awaitingApproval.push(j);
    else if (
      ["artwork", "fa_po", "for_checking", "plates", "shipping"].includes(j.stage)
    ) {
      inProduction.push(j);
    }
    if (j.stage === "complete") recent.push(j);
    if (j.stage === "invoicing" && j.invoiced && !j.paid) {
      overdueInvoices.push(j); // proxy until we add invoice due dates
    }
  }
  return { awaitingApproval, inProduction, recent, overdueInvoices };
}

// Convenience: format a Firestore Timestamp or date-like into a short string.
export function formatDate(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
