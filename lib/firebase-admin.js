import admin from "firebase-admin";

/**
 * Singleton firebase-admin initialisation.
 * Reads the full service account JSON from FIREBASE_SERVICE_ACCOUNT_JSON env var
 * (stored as a single-line string in Vercel).
 */
function getAdminApp() {
  if (admin.apps.length) return admin.apps[0];

  const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  );

  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const app = getAdminApp();
export const adminDb = admin.firestore(app);
