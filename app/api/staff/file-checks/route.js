import { NextResponse } from "next/server";
import { getAdminStorage } from "@/lib/firebase-admin";
import { COL_SUBMISSIONS } from "@/lib/amber-server";
import { checksOf, listReports, staffCallerOf, syncSheetSummary } from "@/lib/file-check-server";
import { BY_AMBER, STATUS_REVIEW, checkReport, editReport } from "@/lib/file-check.mjs";

/**
 * The STAFF file check screen's server (Cam, 23 Nov 2026).
 *
 *   GET     list the AMBER uploads (newest first), or one upload with its
 *           files and every report (?submissionId=...)
 *   POST    save AMBER's report     { submissionId, report }
 *   PATCH   Cam's edits             { submissionId, reportId, report }
 *   DELETE  throw away an unsent report { submissionId, reportId }
 *
 * Staff only, checked here on the server (lib/staff-view.mjs decides who is
 * staff). Sending a report to the customer is a separate route that only
 * Cam's login may use. AMBER artwork jobs only: Order Plates uploads are not
 * checked in this first slice.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIST_MAX = 60;

function refuse(caller) {
  return NextResponse.json({ error: caller.error }, { status: caller.status });
}

async function loadSubmission(db, id) {
  const sid = String(id || "").trim();
  if (!sid || sid.includes("/")) return null;
  const snap = await db.collection(COL_SUBMISSIONS).doc(sid).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

export async function GET(request) {
  const caller = await staffCallerOf(request);
  if (caller.error) return refuse(caller);
  const { db } = caller;
  const url = new URL(request.url);
  const sid = url.searchParams.get("submissionId");

  if (!sid) {
    const snap = await db.collection(COL_SUBMISSIONS).orderBy("createdAtMs", "desc").limit(LIST_MAX).get();
    const items = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((s) => (s.kind || "repro") === "repro" && Array.isArray(s.files) && s.files.length > 0)
      .map((s) => ({
        id: s.id,
        jobNumber: s.jobNumber || null,
        company: s.company || "",
        jobName: s.spec?.description || s.emailSubject || "",
        files: s.files.length,
        createdAtMs: s.createdAtMs || null,
        fileCheckStatus: s.fileCheckStatus || null,
        fileCheckHold: s.fileCheckHold === true,
      }));
    return NextResponse.json({ items });
  }

  const submission = await loadSubmission(db, sid);
  if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Staff need to open the customer's files to check them: short-lived links.
  const files = [];
  for (const f of Array.isArray(submission.files) ? submission.files : []) {
    let url = null;
    try {
      [url] = await getAdminStorage().file(f.path).getSignedUrl({
        action: "read",
        expires: Date.now() + 60 * 60 * 1000,
      });
    } catch {
      url = null;
    }
    files.push({ name: f.name, bytes: f.bytes, url });
  }
  const reports = await listReports(db, sid);
  return NextResponse.json({
    submission: {
      id: submission.id,
      kind: submission.kind || "repro",
      jobNumber: submission.jobNumber || null,
      company: submission.company || "",
      customerEmail: submission.customerEmail || "",
      spec: submission.spec || {},
      notSure: submission.notSure || [],
      fileCheckStatus: submission.fileCheckStatus || null,
      fileCheckHold: submission.fileCheckHold === true,
    },
    files,
    reports,
  });
}

export async function POST(request) {
  const caller = await staffCallerOf(request);
  if (caller.error) return refuse(caller);
  const { db, uid, tokenEmail } = caller;
  const body = await request.json().catch(() => ({}));
  const submission = await loadSubmission(db, body?.submissionId);
  if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if ((submission.kind || "repro") !== "repro") {
    return NextResponse.json({ error: "The file check is only for AMBER artwork jobs." }, { status: 400 });
  }

  const checked = checkReport(body?.report, { createdBy: BY_AMBER });
  if (!checked.ok) return NextResponse.json({ error: "The report was not saved.", problems: checked.problems }, { status: 400 });

  const existing = await listReports(db, submission.id);
  if (existing.some((r) => r.createdBy === BY_AMBER && r.status === STATUS_REVIEW)) {
    return NextResponse.json(
      { error: "There is already an unsent check on this upload. Change it or throw it away first." },
      { status: 409 },
    );
  }

  const ref = checksOf(db, submission.id).doc();
  const now = Date.now();
  await ref.set({
    ...checked.report,
    submissionId: submission.id,
    jobNumber: submission.jobNumber || null,
    status: STATUS_REVIEW,
    tidyRefused: [],
    createdAt: new Date(now),
    createdAtMs: now,
    savedBy: uid,
    savedByEmail: String(tokenEmail || "").toLowerCase(),
    releasedBy: null,
    releasedAtMs: null,
    answeredAtMs: null,
  });
  const summary = await syncSheetSummary(db, submission.id);
  return NextResponse.json({ ok: true, id: ref.id, summary });
}

export async function PATCH(request) {
  const caller = await staffCallerOf(request);
  if (caller.error) return refuse(caller);
  const { db, uid } = caller;
  const body = await request.json().catch(() => ({}));
  const submission = await loadSubmission(db, body?.submissionId);
  if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rid = String(body?.reportId || "").trim();
  if (!rid || rid.includes("/")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ref = checksOf(db, submission.id).doc(rid);

  try {
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const saved = snap.exists ? { id: snap.id, ...snap.data() } : null;
      const edited = editReport(saved, body?.report);
      if (!edited.ok) return edited;
      tx.update(ref, { ...edited.report, editedBy: uid, editedAtMs: Date.now() });
      return edited;
    });
    if (!result.ok) {
      return NextResponse.json({ error: "The changes were not saved.", problems: result.problems }, { status: 400 });
    }
  } catch (err) {
    console.error("staff/file-checks PATCH", err);
    return NextResponse.json({ error: "The changes were not saved. Please try again." }, { status: 500 });
  }
  const summary = await syncSheetSummary(db, submission.id);
  return NextResponse.json({ ok: true, summary });
}

export async function DELETE(request) {
  const caller = await staffCallerOf(request);
  if (caller.error) return refuse(caller);
  const { db } = caller;
  const body = await request.json().catch(() => ({}));
  const submission = await loadSubmission(db, body?.submissionId);
  if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rid = String(body?.reportId || "").trim();
  if (!rid || rid.includes("/")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ref = checksOf(db, submission.id).doc(rid);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // A check the customer has seen is never thrown away.
  if (snap.data()?.status !== STATUS_REVIEW) {
    return NextResponse.json({ error: "Only a check that has not been sent can be thrown away." }, { status: 409 });
  }
  await ref.delete();
  const summary = await syncSheetSummary(db, submission.id);
  return NextResponse.json({ ok: true, summary });
}
