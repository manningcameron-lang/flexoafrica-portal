// Customer profile updates (limited to safe fields).

import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

// Allowed fields a customer may update on their own /users/{uid} doc.
// Firestore rules should enforce this server-side too.
const ALLOWED = ["contactName", "phone", "company"];

export async function updateMyProfile({ uid, patch }) {
  if (!uid) throw new Error("Not signed in");
  const clean = {};
  for (const k of ALLOWED) {
    if (patch[k] !== undefined) clean[k] = patch[k];
  }
  clean.updatedAt = serverTimestamp();
  await updateDoc(doc(db, "users", uid), clean);
}

// Notification preferences keys must match
// functions/src/email/sendCustomerEmail.js PREF_KEYS. Defaults are all true
// (new customers opt-in to everything; they can mute on the
// /profile/notifications page).
export const NOTIFICATION_KEYS = [
  "pdfReadyForApproval",
  "stageChange",
  "commentAdded",
  "invoiceRaised",
  "delivered",
];

export const NOTIFICATION_LABELS = {
  pdfReadyForApproval: {
    title: "Proof ready for approval",
    description:
      "When we send a PDF proof for you to sign off, before we go to plate. Recommended on — this is your last chance to catch issues before plating.",
  },
  stageChange: {
    title: "Job status updates",
    description:
      "When your job moves between production stages — in production, in QA, ready to dispatch. One email per stage.",
  },
  commentAdded: {
    title: "Replies on a job conversation",
    description:
      "When our team posts a reply to a job conversation on the portal. Mute this if you'd rather just check the portal yourself.",
  },
  invoiceRaised: {
    title: "Invoice raised",
    description:
      "When we raise an invoice against your job. Useful for procurement to keep an eye on the paperwork.",
  },
  delivered: {
    title: "Plates delivered",
    description:
      "When we mark your job complete after delivery. Also useful for triggering repeat orders.",
  },
};

export function defaultPrefs() {
  const out = {};
  for (const k of NOTIFICATION_KEYS) out[k] = true;
  return out;
}

/**
 * Merge stored preferences with defaults so the UI can render a complete
 * set even when the user has no preferences doc yet.
 */
export function resolvePrefs(profile) {
  const stored = profile?.notificationPreferences || {};
  const out = {};
  for (const k of NOTIFICATION_KEYS) {
    out[k] = stored[k] !== false; // default true
  }
  return out;
}

/**
 * Persist the customer's notification preferences. Writes a single
 * `notificationPreferences` map on /users/{uid} (not a subcollection — keeps
 * everything atomic and rule-friendly).
 */
export async function updateNotificationPreferences({ uid, prefs }) {
  if (!uid) throw new Error("Not signed in");
  const clean = {};
  for (const k of NOTIFICATION_KEYS) {
    if (typeof prefs?.[k] === "boolean") clean[k] = prefs[k];
  }
  await updateDoc(doc(db, "users", uid), {
    notificationPreferences: clean,
    updatedAt: serverTimestamp(),
  });
}
