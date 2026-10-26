import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyRequest } from "@/lib/firebase-admin";
import { matchCustomer } from "@/lib/company-match";
import { jobCreationDecision, mayCustomerSubmit } from "@/lib/amber-submit-rules.mjs";
import { dueAt, formatDue } from "@/lib/amber-due.mjs";
import { COL_SUBMISSIONS, sendAmberReply } from "@/lib/amber-server";
import { JOB_MADE } from "@/lib/amber-emails.mjs";

/**
 * POST /api/amber/submit   body: { submissionId }
 *
 * The customer has filled the form in and pressed Submit. This route checks
 * the submission is really theirs and really complete, then asks the MIS to
 * make the job.
 *
 * The portal does NOT build the workticket. The MIS owns job numbers, the
 * Dropbox folder, the print-spec boxes and the pricing, so it makes the job
 * and we only ever pass it the submission id. The MIS reads everything else
 * out of Firestore itself, which means nothing a browser sends can change the
 * customer, the price or the spec.
 *
 * ONE SUBMISSION MAKES ONE JOB. The FA number is written back onto the
 * submission, and a second press of Submit returns that same job instead of
 * making another one.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const MIS_JOB_URL = "https://jobs.flexoafrica.com/api/portal/job";

export async function POST(request) {
  try {
    const decoded = await verifyRequest(request);
    if (!decoded) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const submissionId = String(body?.submissionId || "").trim();
    if (!submissionId) {
      return NextResponse.json({ error: "No submission given" }, { status: 400 });
    }

    const db = getAdminDb();

    const userSnap = await db.collection("users").doc(decoded.uid).get();
    const user = userSnap.exists ? userSnap.data() : null;

    const ref = db.collection(COL_SUBMISSIONS).doc(submissionId);
    const snap = await ref.get();
    const submission = snap.exists ? snap.data() : null;

    // It has to be THEIR submission, and they have to be an active customer.
    // Without this a forged email address, or a guessed id, could put a job
    // on somebody else's account.
    const allowed = mayCustomerSubmit({
      submission,
      caller: user ? { ...user, uid: decoded.uid } : null,
    });
    if (!allowed.allowed) {
      const status = allowed.reason === "account not active" ? 403 : 404;
      return NextResponse.json(
        { error: status === 403 ? "Account not active" : "Not found" },
        { status },
      );
    }

    // PO-approved companies must give a PO number, same as Order Plates.
    const settingsSnap = await db.collection("settings").doc("customers").get();
    const list = settingsSnap.exists ? settingsSnap.data()?.list || [] : [];
    const customer = matchCustomer(list, user.company || "");
    const poRequired = !!customer?.poApproved;

    const decision = jobCreationDecision(submission, { poRequired });

    // Already made. Hand back the same job rather than making a second one.
    if (decision.action === "return_existing") {
      return NextResponse.json({
        ok: true,
        jobNumber: decision.jobNumber,
        dueAt: submission.dueAt || null,
        dueText: submission.dueText || null,
        alreadyMade: true,
      });
    }

    if (decision.action === "ask_for_missing") {
      return NextResponse.json({ ok: false, missing: decision.missing }, { status: 400 });
    }

    // A "Not sure" answer does not refuse the job, it parks it with us. The
    // 24 hours does not start until we have filled the box in on the MIS.
    const notSure = decision.notSure || [];
    if (decision.action === "wait_on_flexo") {
      await ref.update({
        status: "waiting_flexo",
        submittedAt: new Date(),
        updatedAt: new Date(),
      });
      return NextResponse.json({ ok: true, waitingOnFlexo: true, notSure });
    }

    if (!process.env.PORTAL_MIS_KEY) {
      return NextResponse.json(
        { error: "The job system link is not set up yet." },
        { status: 503 },
      );
    }

    let misResponse;
    try {
      const res = await fetch(MIS_JOB_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-portal-key": process.env.PORTAL_MIS_KEY,
        },
        body: JSON.stringify({ submissionId }),
      });
      const text = await res.text();
      try {
        misResponse = JSON.parse(text);
      } catch {
        misResponse = null;
      }
      if (!res.ok || !misResponse) {
        // The MIS said no, or is not there yet. Do NOT retry blindly: show the
        // customer what it said and leave the submission exactly as it was.
        if (misResponse?.missing?.length) {
          return NextResponse.json(
            { ok: false, missing: misResponse.missing },
            { status: 400 },
          );
        }
        console.error("amber/submit: MIS refused", res.status, text.slice(0, 300));
        return NextResponse.json(
          {
            error:
              "We could not open the job just now. Nothing is lost, your files " +
              "and details are saved. Please try again shortly.",
          },
          { status: 502 },
        );
      }
    } catch (err) {
      console.error("amber/submit: MIS unreachable", err);
      return NextResponse.json(
        {
          error:
            "We could not reach the job system just now. Nothing is lost, your " +
            "files and details are saved. Please try again shortly.",
        },
        { status: 502 },
      );
    }

    const completeAt = new Date();
    const due = misResponse.dueAt ? new Date(misResponse.dueAt) : dueAt(completeAt);
    const dueText = formatDue(due);

    await ref.update({
      jobNumber: misResponse.jobNumber,
      status: "with_amber",
      completeAt,
      dueAt: due,
      dueText,
      submittedAt: new Date(),
      updatedAt: new Date(),
    });

    const jobName = submission.spec?.jobName || submission.emailSubject || "your job";
    await sendAmberReply({
      to: user.email,
      kind: JOB_MADE,
      email: { from: user.email },
      data: {
        jobNumber: misResponse.jobNumber,
        jobName,
        dueText,
        link: `https://portal.flexoafrica.com/jobs`,
      },
    });

    return NextResponse.json({
      ok: true,
      jobNumber: misResponse.jobNumber,
      dueAt: due.toISOString(),
      dueText,
    });
  } catch (err) {
    console.error("amber/submit error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
