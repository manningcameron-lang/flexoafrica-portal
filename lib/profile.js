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
