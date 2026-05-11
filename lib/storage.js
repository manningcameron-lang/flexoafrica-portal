import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { doc, serverTimestamp, updateDoc, arrayUnion } from "firebase/firestore";
import { db, storage } from "./firebase";

// Upload a single PDF to /jobs/{jobId}/ and return its download URL.
export async function uploadJobPdf({ jobId, file }) {
  if (!file) return null;
  const path = `jobs/${jobId}/${Date.now()}-${sanitize(file.name)}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type || "application/pdf" });
  const url = await getDownloadURL(storageRef);
  return { path, url, fileName: file.name, sizeBytes: file.size };
}

// Append a PDF reference to the job's pdfUrls array.
export async function attachPdfToJob({ jobId, pdfMeta }) {
  if (!pdfMeta) return;
  await updateDoc(doc(db, "jobs", jobId), {
    pdfUrls: arrayUnion(pdfMeta),
    updatedAt: serverTimestamp(),
  });
}

function sanitize(name) {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}
