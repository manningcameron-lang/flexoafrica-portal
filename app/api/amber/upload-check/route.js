import { NextResponse } from "next/server";
import { getAdminStorage } from "@/lib/firebase-admin";
import { COL_SUBMISSIONS } from "@/lib/amber-server";
import { callerOf, checksOf, listReports, mayReadSubmission } from "@/lib/file-check-server";
import { assertMayAct } from "@/lib/staff-view.mjs";
import { BY_AUTO, STATUS_DRAFT, STATUS_SENT } from "@/lib/file-check.mjs";
import {
  RUNNING_FOR_MS,
  buildPollCall,
  buildStartCall,
  isAllowedFileUrl,
  loadSigningKey,
  pickCheckableFile,
  readEngineAnswer,
} from "@/lib/upload-check-engine.mjs";

/**
 * POST /api/amber/upload-check   { submissionId }
 *
 * The instant machine check on a customer's own upload, called by their job
 * page. The FIRST call starts it with the tools engine; while a slow file is
 * still being checked, each later call asks the engine once (signed) whether
 * it is done. The finished report is saved as an "auto" report the customer
 * sees straight away under "First automatic check. AMBER's full check
 * follows." Errors are never shown: the page just shows nothing for it.
 *
 * Answers: { off: true } (no signing key set) | { state: "ready" | "running" |
 * "none", pollAfterMs }.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function callEngine(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = null; }
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

async function settle(ref, outcome) {
  if (outcome.outcome === "report") {
    await ref.update({ ...outcome.report, status: STATUS_SENT, running: false, ticket: null, releasedAtMs: Date.now() });
    return NextResponse.json({ state: "ready" });
  }
  if (outcome.outcome === "running") {
    await ref.update({ ticket: outcome.ticket });
    return NextResponse.json({ state: "running", pollAfterMs: outcome.pollAfterMs });
  }
  console.error("amber/upload-check:", outcome.message);
  await ref.update({ running: false, failed: true, failNote: outcome.message }).catch(() => {});
  return NextResponse.json({ state: "none" });
}

export async function POST(request) {
  const key = loadSigningKey(process.env);
  if (!key) return NextResponse.json({ off: true });

  const caller = await callerOf(request);
  if (caller.error) return NextResponse.json({ error: caller.error }, { status: caller.status });
  const { db, profile } = caller;
  try {
    assertMayAct(profile); // the customer's own page only; staff never start it
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const sid = String(body?.submissionId || "").trim();
  if (!sid || sid.includes("/")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const snap = await db.collection(COL_SUBMISSIONS).doc(sid).get();
  const submission = snap.exists ? { id: snap.id, ...snap.data() } : null;
  if (!submission || !mayReadSubmission(caller, submission)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if ((submission.kind || "repro") !== "repro") return NextResponse.json({ state: "none" });

  // Once per upload. A finished check is never repeated; a slow one is asked
  // about again with its ticket.
  const existing = (await listReports(db, sid)).find((r) => r.createdBy === BY_AUTO);
  if (existing) {
    if (existing.status === STATUS_SENT) return NextResponse.json({ state: "ready" });
    const fresh = existing.running === true && Date.now() - Number(existing.createdAtMs || 0) < RUNNING_FOR_MS;
    if (!fresh) return NextResponse.json({ state: "none" });
    const poll = buildPollCall({ ticket: existing.ticket, key });
    if (!poll) return NextResponse.json({ state: "running", pollAfterMs: 3000 });
    const ref = checksOf(db, sid).doc(existing.id);
    try {
      const { status, json } = await callEngine(poll.url, { method: "GET", headers: poll.headers });
      return settle(ref, readEngineAnswer(status, json, { submissionId: sid }));
    } catch (err) {
      return settle(ref, { outcome: "error", message: err?.name === "AbortError" ? "engine timed out" : "engine could not be reached" });
    }
  }

  const file = pickCheckableFile(submission.files);
  if (!file) return NextResponse.json({ state: "none" });

  const ref = checksOf(db, sid).doc();
  const now = Date.now();
  await ref.set({
    createdBy: BY_AUTO,
    status: STATUS_DRAFT,
    running: true,
    ticket: null,
    submissionId: sid,
    jobNumber: submission.jobNumber || null,
    createdAt: new Date(now),
    createdAtMs: now,
  });

  try {
    const [fileUrl] = await getAdminStorage().file(file.path).getSignedUrl({
      action: "read",
      expires: Date.now() + 30 * 60 * 1000,
    });
    if (!isAllowedFileUrl(fileUrl)) {
      return settle(ref, { outcome: "error", message: "file link is not a Firebase Storage link" });
    }
    const call = buildStartCall({
      submissionId: sid,
      fileUrl,
      fileName: file.name,
      spec: submission.spec,
      notSure: submission.notSure,
      key,
    });
    const { status, json } = await callEngine(call.url, { method: "POST", headers: call.headers, body: call.body });
    return settle(ref, readEngineAnswer(status, json, { submissionId: sid }));
  } catch (err) {
    return settle(ref, { outcome: "error", message: err?.name === "AbortError" ? "engine timed out" : "engine could not be reached" });
  }
}
