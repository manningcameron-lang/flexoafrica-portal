import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { checksOf } from "@/lib/file-check-server";
import { BY_AUTO, STATUS_DRAFT, STATUS_SENT } from "@/lib/file-check.mjs";
import { engineSettings, readEngineAnswer, verifySigned } from "@/lib/upload-check-engine.mjs";

/**
 * POST /api/amber/upload-check/callback
 *
 * The tools engine hands back a slow check here. Server to server only:
 * refused unless signed with the shared key (lib/upload-check-engine.mjs),
 * and the report goes through the same shape check as everything else.
 * It can only fill in a check the portal itself started and is still waiting
 * on; it can never make a new one, touch AMBER's report, or change one already
 * shown to a customer.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const settings = engineSettings(process.env);
  if (!settings.on) return NextResponse.json({ error: "Not set up" }, { status: 503 });

  const raw = await request.text();
  const sig = verifySigned({ body: raw, headers: request.headers, key: settings.key });
  if (!sig.valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let json = null;
  try { json = JSON.parse(raw); } catch { json = null; }
  const sid = String(json?.submissionId || "").trim();
  const cid = String(json?.checkId || "").trim();
  if (!sid || !cid || sid.includes("/") || cid.includes("/")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const db = getAdminDb();
  const ref = checksOf(db, sid).doc(cid);
  const snap = await ref.get();
  const saved = snap.exists ? snap.data() : null;
  if (!saved || saved.createdBy !== BY_AUTO || saved.status !== STATUS_DRAFT) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const answer = readEngineAnswer(200, json, { submissionId: sid });
  if (answer.outcome !== "report") {
    await ref.update({ running: false, failed: true, failNote: answer.message }).catch(() => {});
    return NextResponse.json({ error: answer.message }, { status: 400 });
  }
  await ref.update({ ...answer.report, status: STATUS_SENT, running: false, releasedAtMs: Date.now() });
  return NextResponse.json({ ok: true });
}
