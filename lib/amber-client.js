// Browser-side helpers for the "Send a job to AMBER" page.
//
// ⚠ Files go STRAIGHT from the browser to Firebase Storage, never through our
// own server. Vercel refuses any request bigger than about 4.5 MB, so a
// 300 MB artwork file posted to a route of ours would simply fail. Uploading
// to Storage from the browser has no such ceiling.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { db, storage } from "./firebase";

export const COL_SUBMISSIONS = "amberSubmissions";
export const COL_HOLDS = "amberHolds";

export const MAX_FILE_BYTES = 300 * 1024 * 1024;      // 300 MB a file
export const MAX_SUBMISSION_BYTES = 1024 * 1024 * 1024; // 1 GB a job

export const ACCEPTED_EXTENSIONS = [
  ".pdf", ".ai", ".eps", ".psd", ".tif", ".tiff", ".zip",
  ".otf", ".ttf", ".woff", ".woff2",
];

export function isAcceptedFile(name) {
  const lower = String(name || "").toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function safeName(name) {
  return String(name || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}

/** Start a new, empty submission for this customer. */
export async function createSubmission({ uid, company, email, choice }) {
  const ref = doc(collection(db, COL_SUBMISSIONS));
  await setDoc(ref, {
    uid,
    company: company || "",
    customerEmail: (email || "").toLowerCase(),
    source: "portal",
    choice: choice || "repro",
    spec: {},
    files: [],
    status: "waiting_details",
    jobNumber: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export function watchSubmission(submissionId, callback) {
  return onSnapshot(
    doc(db, COL_SUBMISSIONS, submissionId),
    (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null, null),
    (err) => callback(null, err),
  );
}

export async function readSubmission(submissionId) {
  const snap = await getDoc(doc(db, COL_SUBMISSIONS, submissionId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function saveSpec(submissionId, spec) {
  await updateDoc(doc(db, COL_SUBMISSIONS, submissionId), {
    spec,
    updatedAt: serverTimestamp(),
  });
}

export async function setChoice(submissionId, choice) {
  await updateDoc(doc(db, COL_SUBMISSIONS, submissionId), {
    choice,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Upload one file and add it to the submission.
 *
 * @param {function} onProgress called with 0-100
 */
export async function uploadSubmissionFile({ uid, submissionId, file, existingFiles = [], onProgress }) {
  if (!isAcceptedFile(file.name)) {
    throw new Error(
      `We can't take ${file.name}. Please send a PDF, AI, EPS, PSD, TIFF, ZIP or a font file.`,
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`${file.name} is bigger than 300 MB. Please split it or zip it.`);
  }
  const already = existingFiles.reduce((sum, f) => sum + Number(f.sizeBytes || 0), 0);
  if (already + file.size > MAX_SUBMISSION_BYTES) {
    throw new Error("That would take this job over 1 GB. Please start another job for the rest.");
  }

  const path = `amber/${uid}/${submissionId}/${Date.now()}-${safeName(file.name)}`;
  const task = uploadBytesResumable(ref(storage, path), file, {
    contentType: file.type || "application/octet-stream",
  });

  await new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => {
        if (onProgress && snap.totalBytes) {
          onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
        }
      },
      reject,
      resolve,
    );
  });

  const url = await getDownloadURL(task.snapshot.ref);
  const meta = {
    path,
    url,
    fileName: file.name,
    sizeBytes: file.size,
    contentType: file.type || "application/octet-stream",
    source: "portal",
  };
  await updateDoc(doc(db, COL_SUBMISSIONS, submissionId), {
    files: [...existingFiles, meta],
    updatedAt: serverTimestamp(),
  });
  return meta;
}

export async function removeSubmissionFile({ submissionId, existingFiles, path }) {
  await updateDoc(doc(db, COL_SUBMISSIONS, submissionId), {
    files: existingFiles.filter((f) => f.path !== path),
    updatedAt: serverTimestamp(),
  });
}

/** Every submission this customer has on the go, newest first. */
export function watchMySubmissions(uid, callback) {
  const q = query(
    collection(db, COL_SUBMISSIONS),
    where("uid", "==", uid),
    orderBy("createdAt", "desc"),
    limit(25),
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })), null),
    (err) => callback(null, err),
  );
}

/**
 * "Same as last time" — the press details from this customer's most recent
 * submission for a given printer, so they do not type it all again.
 */
export async function lastSpecForPrinter(uid, printer) {
  const q = query(
    collection(db, COL_SUBMISSIONS),
    where("uid", "==", uid),
    orderBy("createdAt", "desc"),
    limit(25),
  );
  const snap = await getDocs(q);
  for (const d of snap.docs) {
    const spec = d.data()?.spec || {};
    if (!printer || spec.printer === printer) {
      if (Object.keys(spec).length > 0) return spec;
    }
  }
  return null;
}
