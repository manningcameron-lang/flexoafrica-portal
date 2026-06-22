/**
 * Singleton firebase-admin initialisation using the modular v12 API.
 * Reads the full service account JSON from FIREBASE_SERVICE_ACCOUNT_JSON env var
 * (stored as a single-line string in Vercel).
 *
 * Import pattern required for firebase-admin v12 + Next.js 14 App Router.
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];

  const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  );

  return initializeApp({ credential: cert(serviceAccount) });
}

getAdminApp();

export const adminDb = getFirestore();
