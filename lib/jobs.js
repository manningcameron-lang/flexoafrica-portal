// Query helpers for customer jobs.
//
// Isolation policy: per-COMPANY (not per-user). All queries scope by
// the `customer` field matching the signed-in user's profile.company.
// Firestore rules enforce the same on the server. Colleagues at the
// same company share visibility; competitors and other companies are
// blocked. See firestore.rules myCompany() for the matching helper.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
  limit,
} from "firebase/firestore";
import { db } from "./firebase";

const JOBS = "jobs";

// Subscribe to all jobs for a customer's company, ordered by most recent.
// `company` is the profile.company string. Returns an unsubscribe function.
//
// Backwards compat: callers that still pass a uid (32-char alphanumeric)
// instead of a company name are detected and bypassed gracefully so the
// upgrade rollout doesn't crash mid-deploy.
export function subscribeJobsForCustomer(company, callback) {
  if (!company || typeof company !== "string") {
    return () => {};
  }
  // Heuristic: Firebase Auth uids are exactly 28 chars of A-Za-z0-9. If
  // someone hands us one of those by mistake, log + bail. Company strings
  // are typically longer or contain spaces/punctuation.
  if (/^[A-Za-z0-9]{28}$/.test(company)) {
    console.warn("subscribeJobsForCustomer received a uid instead of a company name");
    return () => {};
  }
  const q = query(
    collection(db, JOBS),
    where("customer", "==", company),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(items, null);
    },
    (err) => callback(null, err)
  );
}

// One-shot fetch of recent jobs.
export async function listJobsForCustomer(company, max = 100) {
  if (!company || typeof company !== "string") return [];
  const q = query(
    collection(db, JOBS),
    where("customer", "==", company),
    orderBy("createdAt", "desc"),
    limit(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Get a single job by id. The Firestore rules will reject if it isn't
// the customer's company's job. Client-side double-check on the company
// field is belt-and-braces.
export async function getJobForCustomer(jobId, company) {
  if (!jobId) return null;
  const snap = await getDoc(doc(db, JOBS, jobId));
  if (!snap.exists()) return null;
  const data = { id: snap.id, ...snap.data() };
  if (company && data.customer && data.customer !== company) return null;
  return data;
}

// Subscribe to a single job for real-time status updates on the job detail page.
export function subscribeJob(jobId, callback) {
  if (!jobId) return () => {};
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
