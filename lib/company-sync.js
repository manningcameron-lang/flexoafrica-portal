// Server only. Saves our customer list's name on a customer's account when the
// name they typed matches exactly one customer there (Cam, 24 Nov 2026,
// "Portal uses our list's name"). The rule itself is companyNameUpdate() in
// lib/company-match.mjs. What they first typed is kept in companyTyped.
import { companyNameUpdate } from "./company-match.mjs";

/**
 * @returns {Promise<{company: string, changed: boolean}>}
 */
export async function saveRegisterName(adminDb, uid, user, list) {
  const typed = String(user?.company || "").trim();
  const name = companyNameUpdate(list, typed);
  if (!name || !uid) return { company: typed, changed: false };
  await adminDb.collection("users").doc(uid).update({
    company: name,
    companyTyped: typed,
    companySyncedAt: new Date(),
  });
  return { company: name, changed: true };
}
