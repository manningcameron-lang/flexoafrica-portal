// Customer-side approval actions.
//
// Customers cannot write directly to /jobs (Firestore rules forbid it).
// Instead they write to /approvals/{autoId}. Operators receive these in the MIS
// and apply the actual stage transition (PDF Sent -> FA PO for approve, or
// PDF Sent -> Artwork/Repro for reject).

import {
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { assertMayAct } from "./staff-view.mjs";

// The MIS acts on an approval and moves the REAL job on, so a staff login
// looking at the portal must never be able to send one. Cam 2026-10-26.
export async function submitApproval({ jobId, jobName, decision, note, profile }) {
  assertMayAct(profile);
  if (!profile?.uid) throw new Error("Not signed in");
  if (!jobId) throw new Error("Missing jobId");
  if (decision !== "approve" && decision !== "reject")
    throw new Error("Invalid decision");

  await addDoc(collection(db, "approvals"), {
    jobId,
    jobName: jobName || "",
    decision,
    note: note || "",
    customerUid: profile.uid,
    customerCompany: profile.company || "",
    customerContactName: profile.contactName || "",
    customerEmail: profile.email || "",
    submittedAt: serverTimestamp(),
    processed: false,
  });
}
