// Browser-side helpers for the "Send a job to AMBER" page.
//
// ⚠ TWO RULES SHAPE THIS FILE.
//
// 1. The job sheet is written by OUR SERVER, never from here. The MIS reads
//    that record and trusts every word of it, so the customer's uid on it has
//    to come from a verified sign-in on a server. It also means the database
//    needs no new permissions at all. Everything here therefore goes through
//    /api/amber/submission.
//
// 2. Files go STRAIGHT from the browser to Firebase Storage, and never
//    through a route of ours, because Vercel refuses any request bigger than
//    about 4.5 MB and artwork is routinely far bigger. We upload, then tell
//    the server where the file landed.

import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { storage } from "./firebase";

export const MAX_FILE_BYTES = 300 * 1024 * 1024;        // 300 MB a file
export const MAX_SUBMISSION_BYTES = 1024 * 1024 * 1024; // 1 GB a job
export const MAX_FILES = 40;

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

async function call(user, method, body) {
  const token = await user.getIdToken();
  const res = await fetch("/api/amber/submission", {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "That did not work. Please try again.");
  return data;
}

export async function listSubmissions(user) {
  const token = await user.getIdToken();
  const res = await fetch("/api/amber/submission", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Could not load your jobs.");
  return data.items || [];
}

export async function createSubmission(user, kind) {
  const data = await call(user, "POST", { kind });
  return data.id;
}

export async function saveSubmission(user, { id, kind, spec, notSure, files }) {
  const patch = { id };
  if (kind !== undefined) patch.kind = kind;
  if (spec !== undefined) patch.spec = spec;
  if (notSure !== undefined) patch.notSure = notSure;
  if (files !== undefined) patch.files = files;
  return call(user, "PATCH", patch);
}

/**
 * Upload one file, then record it on the job sheet.
 *
 * The path has to be `amber/<uid>/<submissionId>/...` or the server refuses
 * it, which is what stops a file being attached to somebody else's job.
 *
 * @param {function} onProgress called with 0-100
 */
export async function uploadSubmissionFile({
  user, uid, submissionId, file, existingFiles = [], onProgress,
}) {
  if (!isAcceptedFile(file.name)) {
    throw new Error(
      `We can't take ${file.name}. Please send a PDF, AI, EPS, PSD, TIFF, ZIP or a font file.`,
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`${file.name} is bigger than 300 MB. Please split it or zip it.`);
  }
  if (existingFiles.length >= MAX_FILES) {
    throw new Error(`That is more than ${MAX_FILES} files for one job.`);
  }
  const already = existingFiles.reduce((sum, f) => sum + Number(f.bytes || 0), 0);
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
  // Not used by the server, but it proves the upload really finished.
  await getDownloadURL(task.snapshot.ref);

  const meta = { path, name: file.name, bytes: file.size };
  const after = await saveSubmission(user, {
    id: submissionId,
    files: [...existingFiles, meta],
  });
  return { meta, submission: after };
}

export async function removeSubmissionFile({ user, submissionId, existingFiles, path }) {
  return saveSubmission(user, {
    id: submissionId,
    files: existingFiles.filter((f) => f.path !== path),
  });
}

/**
 * "Same as last time" — the press details from this customer's most recent
 * job sheet for a given printer, so they do not type it all again.
 */
export function lastSpecForPrinter(submissions, printer) {
  for (const s of submissions || []) {
    const spec = s?.spec || {};
    if (!Object.keys(spec).length) continue;
    if (!printer || spec.printer === printer) return spec;
  }
  return null;
}
