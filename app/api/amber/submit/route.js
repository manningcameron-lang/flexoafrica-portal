import { NextResponse } from "next/server";
import { getAdminDb, verifyRequest } from "@/lib/firebase-admin";
import { matchCustomer } from "@/lib/company-match";
import {
  jobCreationDecision,
  mayCustomerSubmit,
  readMisAnswer,
} from "@/lib/amber-submit-rules.mjs";
import { COL_SUBMISSIONS, sendAmberReply } from "@/lib/amber-server";
import { JOB_MADE } from "@/lib/amber-emails.mjs";

/**
 * POST /api/amber/submit   body: { submissionId }
 *
 * The customer has filled the form in and pressed Submit. This route checks
 * the job sheet is really theirs and really complete, then asks the MIS to
 * make the job.
 *
 * The portal does NOT build the workticket. The MIS owns job numbers, the
 * Dropbox folder, the print-spec boxes and the pricing, so it makes the job
 * and we only ever pass it the job sheet's id. It reads everything else out
 * of the database itself, which means nothing a browser sends can change the
 * customer, the price or the spec.
 *
 * ONE JOB SHEET MAKES ONE JOB. The FA number is written back onto the sheet,
 * and a second press of Submit returns that same job instead of making
 * another one. The MIS holds the same line from its side.
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
      return NextResponse.json({ error: "No job sheet given" }, { status: 400 });
    }

    const db = getAdminDb();
    const userSnap = await db.collection("users").doc(decoded.uid).get();
    const user = userSnap.exists ? userSnap.data() : null;

    const ref = db.collection(COL_SUBMISSIONS).doc(submissionId);
    const snap = await ref.get();
    const submission = snap.exists ? snap.data() : null;

    // It has to be THEIR job sheet, and they have to be an active customer.
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

    // AMBER is artwork only. An older sheet that still says "plates" is sent
    // to Order Plates instead of being made here, because nothing on this page
    // takes a payment and Order Plates does.
    if (submission?.kind && submission.kind !== "repro") {
      return NextResponse.json(
        {
          error:
            "Plates are ordered on the Order Plates page, where your price " +
            "and payment are worked out. Open Order Plates and send the file there.",
        },
        { status: 400 },
      );
    }

    // PO-approved companies must give a PO number, same as Order Plates.
    const settingsSnap = await db.collection("settings").doc("customers").get();
    const list = settingsSnap.exists ? settingsSnap.data()?.list || [] : [];
    const customer = matchCustomer(list, user.company || "");
    const poRequired = !!customer?.poApproved;

    const decision = jobCreationDecision(submission, { poRequired });

    if (decision.action === "return_existing") {
      return NextResponse.json({
        ok: true,
        jobNumber: decision.jobNumber,
        dueAt: submission.misDueAt || null,
        dueSaid: submission.dueSaid || null,
        waitingOn: submission.misWaitingOn || [],
        again: true,
      });
    }

    if (decision.action === "ask_for_missing") {
      return NextResponse.json({ ok: false, missing: decision.missing }, { status: 400 });
    }

    if (!process.env.PORTAL_MIS_KEY) {
      return NextResponse.json(
        { error: "The link to the job system is not set up yet." },
        { status: 503 },
      );
    }

    let status = 0;
    let parsed = null;
    try {
      const res = await fetch(MIS_JOB_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-portal-key": process.env.PORTAL_MIS_KEY,
        },
        body: JSON.stringify({ submissionId }),
      });
      status = res.status;
      const text = await res.text();
      try { parsed = JSON.parse(text); } catch { parsed = null; }
    } catch (err) {
      console.error("amber/submit: the job system could not be reached", err);
      return NextResponse.json(
        {
          error:
            "We could not reach the job system just now. Nothing is lost, your " +
            "files and details are saved. Please try again shortly.",
        },
        { status: 502 },
      );
    }

    const answer = readMisAnswer(status, parsed);

    if (answer.outcome === "ask_for_missing") {
      // Do NOT retry blindly. Show the customer what it asked for.
      return NextResponse.json({ ok: false, missing: answer.missing }, { status: 400 });
    }
    if (answer.outcome !== "made" && answer.outcome !== "made_waiting_on_us") {
      console.error("amber/submit: the job system refused", status, answer);
      return NextResponse.json(
        {
          error:
            answer.message ||
            "We could not open the job just now. Nothing is lost, your files " +
              "and details are saved. Please try again shortly.",
        },
        { status: answer.outcome === "try_again" ? 502 : 400 },
      );
    }

    await ref.update({
      jobNumber: answer.jobNumber,
      misDueAt: answer.dueAt,
      dueSaid: answer.dueSaid,
      misWaitingOn: answer.waitingOn,
      misFirstFree: answer.firstFree,
      misWarnings: answer.warnings,
      submittedAt: new Date(),
      updatedAt: new Date(),
    });

    // The "job made" email only goes out once the job is really ready to be
    // worked on. A job still waiting on us would promise a time we cannot keep.
    if (answer.outcome === "made" && !answer.again) {
      const jobName =
        submission.spec?.description || submission.emailSubject || "your job";
      await sendAmberReply({
        to: user.email,
        kind: JOB_MADE,
        email: { from: user.email },
        data: {
          jobNumber: answer.jobNumber,
          jobName,
          dueText: answer.dueSaid || "shortly",
          link: "https://portal.flexoafrica.com/jobs",
        },
      });
    }

    return NextResponse.json({
      ok: true,
      jobNumber: answer.jobNumber,
      dueAt: answer.dueAt,
      dueSaid: answer.dueSaid,
      firstFree: answer.firstFree,
      waitingOn: answer.waitingOn,
      warnings: answer.warnings,
      again: answer.again,
    });
  } catch (err) {
    console.error("amber/submit error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
