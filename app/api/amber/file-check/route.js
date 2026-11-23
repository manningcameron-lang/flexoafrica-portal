import { NextResponse } from "next/server";
import { COL_SUBMISSIONS, sendSalesAlert } from "@/lib/amber-server";
import {
  callerOf,
  checksOf,
  findSubmissionByJob,
  listReports,
  mayReadSubmission,
  syncSheetSummary,
} from "@/lib/file-check-server";
import { assertMayAct } from "@/lib/staff-view.mjs";
import {
  BY_AMBER,
  BY_AUTO,
  applyAnswers,
  buildAnswersAlert,
  customerView,
} from "@/lib/file-check.mjs";
import { RUNNING_FOR_MS } from "@/lib/upload-check-engine.mjs";

/**
 * The customer's side of AMBER's file check, shown on their portal job page.
 *
 *   GET   ?submissionId=...  (or ?jobNumber=FA00xxxx)
 *         AMBER's released check and the automatic check, if there is one.
 *         A customer sees only their OWN upload; nothing still with Cam
 *         is ever shown. Staff may look (read only).
 *   POST  { submissionId, reportId, answers, notes, tidyRefused }
 *         "Submit my answers". The customer themselves only: staff are
 *         refused (the portal is read only for staff).
 *
 * The answers are saved on the report by this server, the hold comes off
 * once every STOP has an answer, and sales@ gets a plain email with the picks.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function findSubmission(db, caller, { submissionId, jobNumber }) {
  const sid = String(submissionId || "").trim();
  if (sid && !sid.includes("/")) {
    const snap = await db.collection(COL_SUBMISSIONS).doc(sid).get();
    if (snap.exists) return { id: snap.id, ...snap.data() };
    return null;
  }
  return findSubmissionByJob(db, caller, jobNumber);
}

export async function GET(request) {
  const caller = await callerOf(request);
  if (caller.error) return NextResponse.json({ error: caller.error }, { status: caller.status });
  const { db } = caller;
  const url = new URL(request.url);
  const submission = await findSubmission(db, caller, {
    submissionId: url.searchParams.get("submissionId"),
    jobNumber: url.searchParams.get("jobNumber"),
  });
  // "Not found" either way, so a guessed id tells nobody whether it exists.
  if (!submission || !mayReadSubmission(caller, submission)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const reports = await listReports(db, submission.id);
  const amber = reports.filter((r) => r.createdBy === BY_AMBER).map(customerView).find(Boolean) || null;
  const auto = reports.filter((r) => r.createdBy === BY_AUTO).map(customerView).find(Boolean) || null;
  // The instant check still working: the page shows a short wait line.
  const autoRunning =
    !auto &&
    reports.some(
      (r) => r.createdBy === BY_AUTO && r.running === true && Date.now() - Number(r.createdAtMs || 0) < RUNNING_FOR_MS,
    );
  return NextResponse.json({ submissionId: submission.id, amber, auto, autoRunning });
}

export async function POST(request) {
  const caller = await callerOf(request);
  if (caller.error) return NextResponse.json({ error: caller.error }, { status: caller.status });
  const { db, uid, profile } = caller;
  try {
    assertMayAct(profile);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (profile.status !== "active") {
    return NextResponse.json({ error: "Account not active" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const sid = String(body?.submissionId || "").trim();
  const rid = String(body?.reportId || "").trim();
  if (!sid || !rid || sid.includes("/") || rid.includes("/")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const subRef = db.collection(COL_SUBMISSIONS).doc(sid);
  const ref = checksOf(db, sid).doc(rid);

  let result;
  try {
    result = await db.runTransaction(async (tx) => {
      const [subSnap, snap] = await Promise.all([tx.get(subRef), tx.get(ref)]);
      const submission = subSnap.exists ? subSnap.data() : null;
      // Their own upload only. Same answer as "not there" for anyone else's.
      if (!submission || submission.uid !== uid || !snap.exists) return { ok: false, notFound: true };
      const applied = applyAnswers({ id: snap.id, ...snap.data() }, {
        answers: body?.answers,
        notes: body?.notes,
        tidyRefused: body?.tidyRefused,
      });
      if (!applied.ok) return applied;
      const now = Date.now();
      tx.update(ref, {
        findings: applied.report.findings,
        tidyRefused: applied.report.tidyRefused,
        status: applied.report.status,
        answeredBy: uid,
        answeredAt: new Date(now),
        answeredAtMs: now,
      });
      return { ok: true, report: { ...applied.report, answeredAtMs: now }, submission };
    });
  } catch (err) {
    console.error("amber/file-check POST", err);
    return NextResponse.json({ error: "Your answers were not saved. Please try again." }, { status: 500 });
  }
  if (result.notFound) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!result.ok) {
    return NextResponse.json({ error: result.problems[0], problems: result.problems }, { status: 400 });
  }

  const summary = await syncSheetSummary(db, sid);

  // sales@ hears about it. Best effort: never undoes the answers.
  try {
    const alert = buildAnswersAlert({
      report: result.report,
      jobNumber: result.submission.jobNumber,
      jobName: result.submission.spec?.description || "",
      company: result.submission.company || profile.company || "",
      customerEmail: result.submission.customerEmail || profile.email || "",
    });
    await sendSalesAlert({ subject: alert.subject, text: alert.text, replyTo: result.submission.customerEmail || profile.email });
  } catch (err) {
    console.error("amber/file-check: sales@ email", err);
  }

  return NextResponse.json({ ok: true, report: customerView(result.report), hold: summary.fileCheckHold });
}
