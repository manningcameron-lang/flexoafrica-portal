// The instant machine check: the portal's side of the link to the tools
// engine (Cam's pick "C = both", 23 Nov 2026). The engine is the TOOLS
// thread's, live at tools.flexoafrica.com since 23 Nov 2026; this file follows
// its note claude/tools-upload-check-live-2026-11-23-for-portal.md exactly.
//
// HOW A CHECK RUNS
//   1. The customer's job page asks OUR server to start the check.
//   2. Our server sends the tools engine the upload's first artwork file (a
//      short-lived Firebase Storage link) and the job details, SIGNED.
//   3. The engine answers within 20 s: 200 with the report, or 202 with a
//      ticket for a slow file. With a ticket, the page asks our server again
//      every few seconds and our server asks the engine (also signed) until
//      the report is ready. Results stay with the engine for 1 hour.
//
// SIGNED, server to server only, never from a browser. The portal holds a
// PRIVATE key (PORTAL_TOOLS_SIGNING_KEY on Vercel, set in Cam's browser and
// never read back); the tools site holds only the matching public key, so
// nothing on the tools side can be used to call it.
//   x-portal-time:      unix seconds
//   x-portal-signature: base64 ECDSA P-256 / SHA-256 signature of
//     POST: "<time>.<submissionId>.<sha256 hex of the exact JSON body>"
//     poll: "<time>.<ticket>"
//
// SWITCH: the check only runs when PORTAL_TOOLS_SIGNING_KEY is set and is a
// real private key. Without it the customer's page shows nothing for it.
//
// What comes back goes through exactly the same report check as AMBER's
// (lib/file-check.mjs), so the engine can never put a legal finding above
// NOTE, a file path in front of a customer, or a half report on the page.
//
// Pure apart from node:crypto: no Firebase, no network. Tested in
// tests/upload-check.test.mjs.

import crypto from "node:crypto";
import { BY_AUTO, checkReport } from "./file-check.mjs";
import { repeatFromTeeth } from "./label-gear.mjs";

export const ENGINE_URL = "https://tools.flexoafrica.com/api/upload-check";
// Esko .len / .lenx are finished 1-bit plate files: the engine answers them
// with fault 96 ("this is already a plate file, send the artwork") rather
// than an error (Cam, 24 Nov 2026 evening, pick "1/2/3").
export const CHECKABLE = Object.freeze([".pdf", ".ai", ".tif", ".tiff", ".jpg", ".jpeg", ".png", ".len", ".lenx"]);

// The cylinder repeat round in mm, sent to the engine as spec.repeatMm so its
// fault 98 (file already distorted) also runs on labels, not only on jobs
// whose printer file holds one repeat (TOOLS note faults 87-100, 24 Nov 2026;
// Cam's pick "1/2/3" the same evening). Never guessed:
//   - a Label: the press gear and tooth size (93 teeth CP = 295.275 mm), the
//     same sum the form and the job system use; else the cylinder box;
//   - anything else: the cylinder box, only when it is a plain millimetre
//     figure ("440", "440 mm", "295,275"). "96T" or "see last job" send nothing;
//   - a box the customer ticked "Not sure" on sends nothing;
//   - only 50 to 2000 mm, the range real flexo cylinders sit in.
export const MIN_REPEAT_MM = 50;
export const MAX_REPEAT_MM = 2000;

function plainMm(v) {
  const m = String(v ?? "").match(/^\s*(\d+(?:[.,]\d+)?)\s*(?:mm)?\s*$/i);
  return m ? Number(m[1].replace(",", ".")) : null;
}

/** The cylinder repeat in mm for the engine, or null when it is not known. */
export function repeatMmFor(spec, notSure = []) {
  const unsure = Array.isArray(notSure) ? notSure : [];
  if (!spec || unsure.includes("cylinder")) return null;
  let mm = null;
  if (spec.bagType === "Label" && !unsure.includes("cylinderTeeth") && !unsure.includes("gearPitch")) {
    mm = repeatFromTeeth(spec.gearPitch, spec.cylinderTeeth);
  }
  if (mm == null) mm = plainMm(spec.cylinder);
  // Not known (null) or outside a real cylinder's range: send nothing.
  if (!(mm >= MIN_REPEAT_MM && mm <= MAX_REPEAT_MM)) return null;
  return Math.round(mm * 1000) / 1000;
}
// How long the customer's page keeps waiting on a slow file before it gives
// up quietly (AMBER's full check still follows). The engine keeps results 1 hour.
export const RUNNING_FOR_MS = 5 * 60 * 1000;
// Only tickets the engine could have made: letters, numbers, - and _.
const TICKET_RE = /^[A-Za-z0-9_-]{6,120}$/;

/** The private key from the setting, or null (switched off). Never logged. */
export function loadSigningKey(env = {}) {
  const raw = String(env.PORTAL_TOOLS_SIGNING_KEY || "").trim();
  if (!raw) return null;
  try {
    const key = crypto.createPrivateKey({ key: Buffer.from(raw, "base64"), format: "der", type: "pkcs8" });
    return key.asymmetricKeyType === "ec" ? key : null;
  } catch {
    return null;
  }
}

export const sha256Hex = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

/** The two signing headers for `text` (without the time, which is added here). */
export function signHeaders(text, key, nowSeconds = Math.floor(Date.now() / 1000)) {
  const t = String(nowSeconds);
  const sig = crypto.sign("sha256", Buffer.from(`${t}.${text}`, "utf8"), key).toString("base64");
  return { "x-portal-time": t, "x-portal-signature": sig };
}

/** The customer file worth sending: the first artwork file (fonts and zips are not). */
export function pickCheckableFile(files) {
  return (Array.isArray(files) ? files : []).find((f) =>
    CHECKABLE.some((ext) => String(f?.name || f?.path || "").toLowerCase().endsWith(ext)),
  ) || null;
}

/** The engine only fetches Firebase Storage links over https. */
export function isAllowedFileUrl(url) {
  try {
    const u = new URL(String(url));
    if (u.protocol !== "https:") return false;
    return (
      u.hostname === "firebasestorage.googleapis.com" ||
      u.hostname === "storage.googleapis.com" ||
      u.hostname.endsWith(".firebasestorage.app")
    );
  } catch {
    return false;
  }
}

/**
 * The start call: the exact body and its signed headers. The signature
 * covers the body byte for byte, so the body string is built once here and
 * sent unchanged.
 */
export function buildStartCall({ submissionId, fileUrl, fileName, spec, notSure, key, nowSeconds }) {
  const cleanSpec = spec && typeof spec === "object" ? spec : {};
  const repeatMm = repeatMmFor(cleanSpec, notSure);
  const body = JSON.stringify({
    submissionId: String(submissionId),
    fileUrl: String(fileUrl),
    fileName: String(fileName || "file"),
    spec: repeatMm == null ? cleanSpec : { ...cleanSpec, repeatMm },
    notSure: Array.isArray(notSure) ? notSure : [],
  });
  const headers = {
    "content-type": "application/json",
    ...signHeaders(`${submissionId}.${sha256Hex(Buffer.from(body, "utf8"))}`, key, nowSeconds),
  };
  return { url: ENGINE_URL, body, headers };
}

/** The poll call for a slow file's ticket, or null for a ticket that is not one. */
export function buildPollCall({ ticket, key, nowSeconds }) {
  const t = String(ticket || "");
  if (!TICKET_RE.test(t)) return null;
  return { url: `${ENGINE_URL}/${t}`, headers: signHeaders(t, key, nowSeconds) };
}

/**
 * Read the engine's answer.
 *   200 + a report  -> { outcome: "report", report }
 *   202 + a ticket  -> { outcome: "running", ticket, pollAfterMs }
 *   anything else   -> { outcome: "error", message }   never a half report
 */
export function readEngineAnswer(status, json, { submissionId } = {}) {
  if (status === 202) {
    const ticket = String(json?.ticket || "");
    if (!TICKET_RE.test(ticket)) return { outcome: "error", message: "engine gave no usable ticket" };
    const wait = Number(json?.pollAfterMs);
    return { outcome: "running", ticket, pollAfterMs: Number.isFinite(wait) ? Math.min(Math.max(wait, 1000), 15000) : 3000 };
  }
  if (status !== 200 || !json || typeof json !== "object") {
    const code = json && typeof json === "object" ? String(json.error?.code || json.code || "") : "";
    return { outcome: "error", message: `engine answered ${status}${code ? ` (${code.slice(0, 60)})` : ""}` };
  }
  if (json.error) return { outcome: "error", message: `engine error (${String(json.error.code || "").slice(0, 60)})` };
  if (submissionId && String(json.submissionId || "") !== String(submissionId)) {
    return { outcome: "error", message: "engine answered for a different upload" };
  }
  const checked = checkReport(json, { createdBy: BY_AUTO });
  if (!checked.ok) return { outcome: "error", message: `engine report refused: ${checked.problems[0]}` };
  return { outcome: "report", report: checked.report };
}
