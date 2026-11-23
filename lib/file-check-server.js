// Server-side helpers for AMBER's file check. Nothing in here runs in a browser.
//
// WHERE A REPORT LIVES: amberSubmissions/{submissionId}/fileChecks/{reportId}.
// Written by this server only (admin credentials). Both database rules files
// end with a deny-everything rule, which covers this new list too, so a
// browser can never read, write or edit a report directly: customers read
// their own through /api/amber/file-check, staff through /api/staff/file-checks.
//
// The upload's own record (amberSubmissions/{id}) also carries three summary
// fields the MIS can read without opening the reports:
//   fileCheckStatus    staffReview | sent | answered (AMBER's newest report)
//   fileCheckHold      true while a released report has an unanswered STOP
//   fileCheckReportId  which report those two describe

import { getAdminDb, verifyRequest } from "@/lib/firebase-admin";
import { COL_SUBMISSIONS } from "@/lib/amber-server";
import { isStaff, mayUseFileCheckScreen } from "@/lib/staff-view.mjs";
import { BY_AMBER, STATUS_DRAFT, holdsJob, mayReadSubmission } from "@/lib/file-check.mjs";

export { mayReadSubmission };

export const COL_FILE_CHECKS = "fileChecks";
export const PORTAL_JOB_URL = "https://portal.flexoafrica.com/jobs/";

export function checksOf(db, submissionId) {
  return db.collection(COL_SUBMISSIONS).doc(submissionId).collection(COL_FILE_CHECKS);
}

/** Who is calling: a verified sign-in, their profile, and the token's own email. */
export async function callerOf(request) {
  const decoded = await verifyRequest(request);
  if (!decoded) return { error: "Unauthorized", status: 401 };
  const db = getAdminDb();
  const snap = await db.collection("users").doc(decoded.uid).get();
  const profile = snap.exists ? { uid: snap.id, ...snap.data() } : null;
  if (!profile) return { error: "No account", status: 403 };
  return { db, uid: decoded.uid, profile, tokenEmail: decoded.email || "" };
}

/** Staff only (the file check screen). */
export async function staffCallerOf(request) {
  const caller = await callerOf(request);
  if (caller.error) return caller;
  if (!mayUseFileCheckScreen(caller.profile)) return { error: "Staff only", status: 403 };
  return caller;
}

/** All reports on one upload, newest first. */
export async function listReports(db, submissionId) {
  const snap = await checksOf(db, submissionId).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0));
}

/**
 * Keep the summary on the upload's record in step with AMBER's newest report
 * that is not a draft. Called after every save, release and answer.
 */
export async function syncSheetSummary(db, submissionId) {
  const reports = await listReports(db, submissionId);
  const amber = reports.find((r) => r.createdBy === BY_AMBER && r.status !== STATUS_DRAFT) || null;
  const summary = {
    fileCheckStatus: amber ? amber.status : null,
    fileCheckHold: amber ? holdsJob(amber) : false,
    fileCheckReportId: amber ? amber.id : null,
    fileCheckUpdatedAt: new Date(),
  };
  await db.collection(COL_SUBMISSIONS).doc(submissionId).update(summary);
  return summary;
}

/**
 * The MIS job page for an upload, so the email link opens the right job.
 * The MIS writes job.amberIntake.submissionId when it makes the job; the FA
 * number is the fallback.
 */
export async function findJobForSubmission(db, submissionId, jobNumber) {
  try {
    const a = await db.collection("jobs").where("amberIntake.submissionId", "==", submissionId).limit(1).get();
    if (!a.empty) return { id: a.docs[0].id, ...a.docs[0].data() };
    if (jobNumber) {
      const b = await db.collection("jobs").where("jobName", "==", String(jobNumber)).limit(1).get();
      if (!b.empty) return { id: b.docs[0].id, ...b.docs[0].data() };
    }
  } catch (err) {
    console.error("file-check: could not look up the job", err);
  }
  return null;
}

/** Find a customer's upload by its FA number (the job page fallback). */
export async function findSubmissionByJob(db, caller, jobNumber) {
  const fa = String(jobNumber || "").trim().slice(0, 30);
  if (!fa) return null;
  let q = db.collection(COL_SUBMISSIONS).where("jobNumber", "==", fa);
  if (!isStaff(caller.profile)) q = q.where("uid", "==", caller.uid);
  const snap = await q.limit(1).get();
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}
