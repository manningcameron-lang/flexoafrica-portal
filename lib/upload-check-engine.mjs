// The instant machine check: the portal's side of the link to the tools
// engine (Cam's pick "C = both", 23 Nov 2026; the engine itself is built by
// the TOOLS thread from claude/tools-brief-upload-check-engine-2026-11-23.md,
// "THE CONTRACT").
//
// SWITCHED OFF UNTIL THE ENGINE IS LIVE. It only runs when BOTH settings are
// set on the portal's host: UPLOAD_CHECK_URL (the engine's https address) and
// UPLOAD_CHECK_KEY (the shared key). Until then the customer's job page shows
// NOTHING for it: no placeholder, no "coming soon".
//
// SIGNED BOTH WAYS, server to server only, never from a browser:
//   x-flexo-timestamp: <unix seconds>
//   x-flexo-signature: v1=<hex HMAC-SHA256(key, "<timestamp>.<raw body>")>
// A call older or newer than 5 minutes, unsigned, or wrongly signed is refused.
// The raw body is signed byte for byte (parsing and re-writing it would
// change it).
//
// What comes back goes through exactly the same report check as AMBER's
// (lib/file-check.mjs), so the engine can never put a legal finding above
// NOTE, a file path in front of a customer, or a half report on the page.
//
// Pure: no Firebase, no network. Tested in tests/upload-check.test.mjs.

import crypto from "node:crypto";
import { BY_AUTO, checkReport } from "./file-check.mjs";

export const TOLERANCE_SECONDS = 300;
export const CALLBACK_URL = "https://portal.flexoafrica.com/api/amber/upload-check/callback";
export const MAX_FILES_SENT = 5;
export const CHECKABLE = Object.freeze([".pdf", ".ai", ".tif", ".tiff", ".jpg", ".jpeg", ".png"]);
// How long the customer's page waits for a slow engine before it gives up
// quietly (AMBER's full check still follows).
export const RUNNING_FOR_MS = 5 * 60 * 1000;

/** The switch: both settings present and the address is https. */
export function engineSettings(env = {}) {
  const url = String(env.UPLOAD_CHECK_URL || "").trim();
  const key = String(env.UPLOAD_CHECK_KEY || "").trim();
  const on = url.startsWith("https://") && key.length >= 16;
  return { on, url: on ? url.replace(/\/+$/, "") : "", key: on ? key : "" };
}

export function signBody({ body, key, timestamp }) {
  return "v1=" + crypto.createHmac("sha256", String(key)).update(`${timestamp}.${body}`, "utf8").digest("hex");
}

export function signedHeaders({ body, key, nowSeconds = Math.floor(Date.now() / 1000) }) {
  return {
    "Content-Type": "application/json",
    "x-flexo-timestamp": String(nowSeconds),
    "x-flexo-signature": signBody({ body, key, timestamp: nowSeconds }),
  };
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** @returns {{valid: boolean, reason: string|null}} */
export function verifySigned({ body, headers, key, nowSeconds = Math.floor(Date.now() / 1000) }) {
  if (!key) return { valid: false, reason: "not set up" };
  const get = (name) => (typeof headers?.get === "function" ? headers.get(name) : headers?.[name]);
  const ts = get("x-flexo-timestamp");
  const sig = get("x-flexo-signature");
  if (!ts || !sig) return { valid: false, reason: "not signed" };
  const t = Number(ts);
  if (!Number.isInteger(t)) return { valid: false, reason: "bad timestamp" };
  if (Math.abs(nowSeconds - t) > TOLERANCE_SECONDS) return { valid: false, reason: "too old or too new" };
  const want = signBody({ body, key, timestamp: t });
  if (!safeEqual(sig, want)) return { valid: false, reason: "signature does not match" };
  return { valid: true, reason: null };
}

/** The customer files worth sending to the engine (fonts and zips are not). */
export function pickCheckableFiles(files) {
  return (Array.isArray(files) ? files : [])
    .filter((f) => CHECKABLE.some((ext) => String(f?.name || f?.path || "").toLowerCase().endsWith(ext)))
    .slice(0, MAX_FILES_SENT);
}

/** What the portal sends the engine (THE CONTRACT "in"). */
export function buildEngineRequest({ submissionId, checkId, files, spec, notSure }) {
  const list = (files || []).map((f) => ({ name: String(f.name || "file"), bytes: Number(f.bytes) || 0, url: f.url }));
  return {
    submissionId: String(submissionId),
    checkId: String(checkId),
    fileUrl: list[0]?.url || null,
    files: list,
    spec: spec && typeof spec === "object" ? spec : {},
    notSure: Array.isArray(notSure) ? notSure : [],
    callbackUrl: CALLBACK_URL,
  };
}

/**
 * Read the engine's answer.
 *   200 + a report  -> { outcome: "report", report }
 *   202             -> { outcome: "running" }  (it will call back)
 *   anything else   -> { outcome: "error", message }   never a half report
 */
export function readEngineAnswer(status, json, { submissionId } = {}) {
  if (status === 202) return { outcome: "running" };
  if (status !== 200 || !json || typeof json !== "object") {
    const code = json && typeof json === "object" ? String(json.code || json.error || "") : "";
    return { outcome: "error", message: `engine answered ${status}${code ? ` (${code.slice(0, 60)})` : ""}` };
  }
  if (submissionId && String(json.submissionId || "") !== String(submissionId)) {
    return { outcome: "error", message: "engine answered for a different upload" };
  }
  const checked = checkReport(json, { createdBy: BY_AUTO });
  if (!checked.ok) return { outcome: "error", message: `engine report refused: ${checked.problems[0]}` };
  return { outcome: "report", report: checked.report };
}
