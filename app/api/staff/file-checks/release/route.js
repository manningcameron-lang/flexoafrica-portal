import { NextResponse } from "next/server";
import { COL_SUBMISSIONS, getResend } from "@/lib/amber-server";
import {
  PORTAL_JOB_URL,
  callerOf,
  checksOf,
  findJobForSubmission,
  syncSheetSummary,
} from "@/lib/file-check-server";
import { mayReleaseFileCheck } from "@/lib/staff-view.mjs";
import {
  PORTAL_JOBS_URL,
  STATUS_SENT,
  buildReleaseEmail,
  releaseProblems,
} from "@/lib/file-check.mjs";

/**
 * POST /api/staff/file-checks/release   { submissionId, reportId }
 *
 * "Send to customer". CAM ONLY (his pick, 23 Nov 2026): his admin login,
 * recognised by the email on his VERIFIED sign-in token. Checked here on the
 * server; the button is also hidden for everyone else, but hiding a button is
 * not security.
 *
 * Saves who released it and when, marks the report sent (the customer can
 * now see it on their job page), sets the hold on the upload if a STOP is
 * waiting, then sends the customer Cam's approved email. The email is best
 * effort: if it cannot go, the release still stands and the screen says why.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const caller = await callerOf(request);
  if (caller.error) return NextResponse.json({ error: caller.error }, { status: caller.status });
  const { db, uid, profile, tokenEmail } = caller;
  if (!mayReleaseFileCheck(profile, tokenEmail)) {
    return NextResponse.json({ error: "Only Cam can send a file check to a customer." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const sid = String(body?.submissionId || "").trim();
  const rid = String(body?.reportId || "").trim();
  if (!sid || !rid || sid.includes("/") || rid.includes("/")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const subRef = db.collection(COL_SUBMISSIONS).doc(sid);
  const ref = checksOf(db, sid).doc(rid);

  let released;
  try {
    released = await db.runTransaction(async (tx) => {
      const [subSnap, snap] = await Promise.all([tx.get(subRef), tx.get(ref)]);
      const submission = subSnap.exists ? subSnap.data() : null;
      const report = snap.exists ? { id: snap.id, ...snap.data() } : null;
      const problems = releaseProblems(report, submission);
      if (problems.length) return { ok: false, problems };
      const now = Date.now();
      const patch = {
        status: STATUS_SENT,
        jobNumber: submission.jobNumber,
        releasedBy: uid,
        releasedByEmail: String(tokenEmail || "").toLowerCase(),
        releasedAt: new Date(now),
        releasedAtMs: now,
      };
      tx.update(ref, patch);
      return { ok: true, report: { ...report, ...patch }, submission };
    });
  } catch (err) {
    console.error("file-checks/release", err);
    return NextResponse.json({ error: "It was not sent. Please try again." }, { status: 500 });
  }
  if (!released.ok) {
    return NextResponse.json({ error: "It was not sent.", problems: released.problems }, { status: 409 });
  }

  const summary = await syncSheetSummary(db, sid);

  // The customer's email: Cam's approved wording only (lib/file-check.mjs).
  const { report, submission } = released;
  let emailSent = false;
  let emailNote = "";
  try {
    const userSnap = await db.collection("users").doc(String(submission.uid || "x")).get();
    const user = userSnap.exists ? userSnap.data() : {};
    const job = await findJobForSubmission(db, sid, submission.jobNumber);
    const built = buildReleaseEmail({
      report,
      jobNumber: submission.jobNumber,
      jobName: submission.spec?.description || job?.description || "",
      contactName: user.contactName || user.name || "",
      jobUrl: job ? `${PORTAL_JOB_URL}${job.id}` : PORTAL_JOBS_URL,
    });
    const to = String(submission.customerEmail || user.email || "").trim().toLowerCase();
    if (!built.send) {
      emailNote = built.reason;
    } else if (!to) {
      emailNote = "No email sent: the upload has no customer email address.";
    } else {
      const { error } = await getResend().emails.send({
        from: built.from,
        to: [to],
        replyTo: built.replyTo,
        subject: built.subject,
        text: built.text,
      });
      if (error) throw new Error(error.message || "Resend refused it");
      emailSent = true;
      emailNote = `Email sent to ${to}.`;
    }
  } catch (err) {
    console.error("file-checks/release: email", err);
    emailNote = "The check is on the customer's job page, but the email could not be sent.";
  }
  await ref.update({ emailSent, emailNote }).catch(() => {});

  return NextResponse.json({ ok: true, emailSent, emailNote, summary });
}
