/**
 * Lazy firebase-admin initialisation — MUST NOT run at module level.
 * Next.js collects page data at build time, so any top-level code that
 * reads FIREBASE_SERVICE_ACCOUNT_JSON will throw (env var not set during build).
 *
 * Call getAdminDb() inside route handler functions only.
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_JSON is not set — admin SDK cannot initialise."
    );
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON — check the Vercel env var."
    );
  }
}

function ensureApp() {
  if (!getApps().length) {
    initializeApp({
      credential: cert(parseServiceAccount()),
    });
  }
}

export function getAdminDb() {
  ensureApp();
  return getFirestore();
}

export function getAdminAuth() {
  ensureApp();
  return getAuth();
}

/**
 * Verify the `Authorization: Bearer <firebase-id-token>` header on a request.
 * Returns the decoded token, or null if missing/invalid.
 *
 * Never trust a uid or company name sent in a request body — resolve the
 * caller from their verified token instead.
 */
export async function verifyRequest(request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  try {
    return await getAdminAuth().verifyIdToken(match[1]);
  } catch {
    return null;
  }
}
