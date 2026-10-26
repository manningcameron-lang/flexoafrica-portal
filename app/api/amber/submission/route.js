import { NextResponse } from "next/server";
import { getAdminDb, verifyRequest } from "@/lib/firebase-admin";
import { COL_SUBMISSIONS } from "@/lib/amber-server";
import { NOT_SURE_ALLOWED, OPTIONAL_FIELDS, REQUIRED_FIELDS, LABEL_ONLY_REQUIRED_FIELDS } from "@/lib/amber-spec.mjs";

/**
 * The customer's AMBER job sheets.
 *
 *   GET    - the ones that belong to the signed-in customer
 *   POST   - start a new one
 *   PATCH  - save the press details, the "Not sure" ticks, or the file list
 *
 * ⚠ WHY THIS EXISTS AT ALL, instead of the browser writing to the database
 * directly: the MIS reads this record and trusts every word of it, so the uid
 * on it has to come from a verified sign-in on a server, never from a browser.
 * It also means the database needs NO new permissions: the deny-everything
 * rule at the bottom still covers these records, and only this server, which
 * uses admin credentials, can touch them. Agreed with the MIS side 26 Oct 2026.
 *
 * Artwork does NOT come through here. Files go straight from the browser to
 * Firebase Storage, because Vercel refuses any request over about 4.5 MB.
 * This route only records where they landed, and checks that each one is
 * inside the customer's own folder.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SPEC_KEYS = new Set([
  ...REQUIRED_FIELDS.map((f) => f.key),
  ...LABEL_ONLY_REQUIRED_FIELDS.map((f) => f.key),
  ...OPTIONAL_FIELDS,
]);

const MAX_FILES = 40;
const MAX_FILE_BYTES = 300 * 1024 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;

async function callerOf(request) {
  const decoded = await verifyRequest(request);
  if (!decoded) return { error: "Unauthorized", status: 401 };
  const db = getAdminDb();
  const snap = await db.collection("users").doc(decoded.uid).get();
  const user = snap.exists ? snap.data() : null;
  if (!user || user.role !== "customer" || user.status !== "active") {
    return { error: "Account not active", status: 403 };
  }
  return { uid: decoded.uid, user, db };
}

// Keep only the boxes we know about, so nothing unexpected can be smuggled
// onto a record the MIS trusts.
function cleanSpec(input) {
  const out = {};
  if (!input || typeof input !== "object") return out;
  for (const [key, value] of Object.entries(input)) {
    if (!SPEC_KEYS.has(key)) continue;
    if (key === "colours") {
      out.colours = (Array.isArray(value) ? value : [])
        .map((v) => String(v ?? "").trim())
        .filter(Boolean)
        .slice(0, 10);
      continue;
    }
    if (value === null || value === undefined) continue;
    out[key] = typeof value === "number" ? value : String(value).slice(0, 2000);
  }
  return out;
}

// Every file must sit inside this customer's own folder for this job sheet.
// A path anywhere else is refused outright rather than quietly dropped.
function cleanFiles(input, uid, submissionId) {
  const prefix = `amber/${uid}/${submissionId}/`;
  const list = Array.isArray(input) ? input : [];
  if (list.length > MAX_FILES) {
    throw new Error(`That is more than ${MAX_FILES} files for one job.`);
  }
  let total = 0;
  return list.map((f) => {
    const path = String(f?.path || "");
    if (!path.startsWith(prefix)) {
      throw new Error("A file was not in this job's own folder.");
    }
    const bytes = Number(f?.bytes) || 0;
    if (bytes > MAX_FILE_BYTES) throw new Error("A file is bigger than 300 MB.");
    total += bytes;
    if (total > MAX_TOTAL_BYTES) throw new Error("That is more than 1 GB for one job.");
    return { path, name: String(f?.name || "file").slice(0, 200), bytes };
  });
}

export async function GET(request) {
  const caller = await callerOf(request);
  if (caller.error) {
    return NextResponse.json({ error: caller.error }, { status: caller.status });
  }
  const { db, uid } = caller;
  const snap = await db
    .collection(COL_SUBMISSIONS)
    .where("uid", "==", uid)
    .limit(50)
    .get();
  const items = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0));
  return NextResponse.json({ items });
}

export async function POST(request) {
  const caller = await callerOf(request);
  if (caller.error) {
    return NextResponse.json({ error: caller.error }, { status: caller.status });
  }
  const { db, uid, user } = caller;
  const body = await request.json().catch(() => ({}));
  const kind = body?.kind === "plates" ? "plates" : "repro";

  const ref = db.collection(COL_SUBMISSIONS).doc();
  await ref.set({
    uid,
    kind,
    company: user.company || "",
    customerEmail: String(user.email || "").toLowerCase(),
    source: "portal",
    spec: {},
    notSure: [],
    files: [],
    jobNumber: null,
    createdAt: new Date(),
    createdAtMs: Date.now(),
    updatedAt: new Date(),
  });
  return NextResponse.json({ id: ref.id, kind });
}

export async function PATCH(request) {
  const caller = await callerOf(request);
  if (caller.error) {
    return NextResponse.json({ error: caller.error }, { status: caller.status });
  }
  const { db, uid } = caller;
  const body = await request.json().catch(() => ({}));
  const id = String(body?.id || "").trim();
  if (!id) return NextResponse.json({ error: "No job sheet given" }, { status: 400 });

  const ref = db.collection(COL_SUBMISSIONS).doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.uid !== uid) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Once the MIS has made the job, the sheet is closed. Nobody edits the
  // specs out from under a workticket that already exists.
  if (snap.data()?.jobNumber) {
    return NextResponse.json(
      { error: "That job has already been made, so it can no longer be changed." },
      { status: 409 },
    );
  }

  const patch = { updatedAt: new Date() };
  if ("kind" in body) patch.kind = body.kind === "plates" ? "plates" : "repro";
  if ("spec" in body) patch.spec = cleanSpec(body.spec);
  if ("notSure" in body) {
    patch.notSure = (Array.isArray(body.notSure) ? body.notSure : []).filter((k) =>
      NOT_SURE_ALLOWED.includes(k),
    );
  }
  if ("files" in body) {
    try {
      patch.files = cleanFiles(body.files, uid, id);
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
  }

  await ref.update(patch);
  const after = await ref.get();
  return NextResponse.json({ id, ...after.data() });
}
