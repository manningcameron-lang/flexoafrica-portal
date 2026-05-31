// Query helpers for customer jobs.
// All queries scoped to /jobs where customerUid == current user uid.
// Firestore rules enforce the same scoping server-side.

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

// Subscribe to all jobs for a customer, ordered by most recent.
// Returns an unsubscribe function.
export function subscribeJobsForCustomer(uid, callback) {
  if (!uid) return () => {};
  const q = query(
    collection(db, JOBS),
    where("customerUid", "==", uid),
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
export async function listJobsForCustomer(uid, max = 100) {
  if (!uid) return [];
  const q = query(
    collection(db, JOBS),
    where("customerUid", "==", uid),
    orderBy("createdAt", "desc"),
    limit(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Get a single job by id. The Firestore rules will reject if it isn't theirs.
export async function getJobForCustomer(jobId, uid) {
  if (!jobId) return null;
  const snap = await getDoc(doc(db, JOBS, jobId));
  if (!snap.exists()) return null;
  const data = { id: snap.id, ...snap.data() };
  if (uid && data.customerUid && data.customerUid !== uid) return null;
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
