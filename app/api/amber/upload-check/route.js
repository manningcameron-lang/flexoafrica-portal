import { NextResponse } from "next/server";
import { getAdminStorage } from "@/lib/firebase-admin";
import { COL_SUBMISSIONS } from "@/lib/amber-server";
import { callerOf, checksOf, listReports, mayReadSubmission } from "@/lib/file-check-server";
import { assertMayAct } from "@/lib/staff-view.mjs";
import { BY_AUTO, STATUS_DRAFT, STATUS_SENT } from "@/lib/file-check.mjs";
import {
  RUNNING_FOR_MS,
  buildEngineRequest,
  engineSettings,
  pickCheckableFiles,
  readEngineAnswer,
  signedHeaders,
} from "@/lib/upload-check-engine.mjs";

/**
 * POST /api/amber/upload-check   { submissionId }
 *
 * Starts the instant machine check on a customer's own upload, once. Called
 * by their job page. Asks the tools engine (server to server, signed) and
 * saves what comes back as an "auto" report the customer sees straight away,
 * headed "First automatic check. AMBER's full check follows."
 *
 * OFF until the engine is live (lib/upload-check-engine.mjs): answers
 * { off: true } and the page shows nothing.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request) {
  const settings = engineSettings(process.env);
  if (!settings.on) return NextResponse.json({ off: true });

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

  // Once per upload. A check already done, or still running, is not repeated.
  const existing = (await listReports(db, sid)).find((r) => r.createdBy === BY_AUTO);
  if (existing) {
    if (existing.status === STATUS_SENT) return NextResponse.json({ state: "ready" });
    const fresh = existing.running && Date.now() - Number(existing.createdAtMs || 0) < RUNNING_FOR_MS;
    return NextResponse.json({ state: fresh ? "running" : "none" });
  }

  const files = pickCheckableFiles(submission.files);
  if (files.length === 0) return NextResponse.json({ state: "none" });

  const ref = checksOf(db, sid).doc();
  const now = Date.now();
  await ref.set({
    createdBy: BY_AUTO,
    status: STATUS_DRAFT,
    running: true,
    submissionId: sid,
    jobNumber: submission.jobNumber || null,
    createdAt: new Date(now),
    createdAtMs: now,
  });

  let outcome;
  try {
    const withUrls = [];
    for (const f of files) {
      const [url] = await getAdminStorage().file(f.path).getSignedUrl({
        action: "read",
        expires: Date.now() + 30 * 60 * 1000,
      });
      withUrls.push({ name: f.name, bytes: f.bytes, url });
    }
    const payload = JSON.stringify(
      buildEngineRequest({ submissionId: sid, checkId: ref.id, files: withUrls, spec: submission.spec, notSure: submission.notSure }),
    );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    let res;
    try {
      res = await fetch(`${settings.url}/upload-check`, {
        method: "POST",
        headers: signedHeaders({ body: payload, key: settings.key }),
        body: payload,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = null; }
    outcome = readEngineAnswer(res.status, json, { submissionId: sid });
  } catch (err) {
    outcome = { outcome: "error", message: err?.name === "AbortError" ? "engine timed out" : "engine could not be reached" };
  }

  if (outcome.outcome === "report") {
    await ref.update({ ...outcome.report, status: STATUS_SENT, running: false, releasedAtMs: Date.now() });
    return NextResponse.json({ state: "ready" });
  }
  if (outcome.outcome === "running") return NextResponse.json({ state: "running" });
  console.error("amber/upload-check:", outcome.message);
  await ref.update({ running: false, failed: true, failNote: outcome.message }).catch(() => {});
  return NextResponse.json({ state: "none" });
}
