/**
 * Lazy firebase-admin initialisation — MUST NOT run at module level.
 * Next.js collects page data at build time, so any top-level code that
 * reads FIREBASE_SERVICE_ACCOUNT_JSON will throw (env var not set during build).
 *
 * Call getAdminDb() inside route handler functions only.
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export function getAdminDb() {
  if (!getApps().length) {
    initializeApp({
      credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)),
    });
  }
  return getFirestore();
}
