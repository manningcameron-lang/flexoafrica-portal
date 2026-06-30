// Threaded job comments (customer ↔ operator).
//
// Schema: /jobs/{jobId}/comments/{commentId}
//   {
//     text: string,
//     authorUid: string,           // request.auth.uid of poster
//     authorName: string,          // display name to show in the thread
//     authorRole: "customer" | "operator" | "admin" | "designer",
//     visibility: "customer" | "internal",
//     createdAt: serverTimestamp,
//   }
//
// Customers only see visibility="customer" comments. Operators see both.
// Rules enforce that customers can only create with visibility="customer"
// and their own authorUid — see firestore.rules /jobs/{jobId}/comments.

import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

/**
 * Live-subscribe to comments on a job. Customer-side: only customer-
 * visible comments are returned (Firestore rules filter the rest).
 *
 * @param {string} jobId
 * @param {(items: Array, error?: Error) => void} cb
 * @returns {() => void} unsubscribe
 */
export function subscribeJobComments(jobId, cb) {
  if (!jobId) return () => {};
  const q = query(
    collection(db, "jobs", jobId, "comments"),
    orderBy("createdAt", "asc"),
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      cb(items);
    },
    (err) => cb([], err),
  );
}

/**
 * Post a new comment as the current customer. Always writes
 * visibility="customer" (the only visibility customers are allowed to use).
 *
 * @param {object} args
 * @param {string} args.jobId
 * @param {string} args.text
 * @param {{uid: string, contactName?: string, company?: string, email?: string}} args.author
 * @returns {Promise<string>} newly-created comment id
 */
export async function postCustomerComment({ jobId, text, author }) {
  if (!jobId) throw new Error("Missing jobId");
  if (!text || !text.trim()) throw new Error("Comment can't be empty");
  if (!author?.uid) throw new Error("Not signed in");
  const docRef = await addDoc(collection(db, "jobs", jobId, "comments"), {
    text: text.trim(),
    authorUid: author.uid,
    authorName: author.contactName || author.company || author.email || "Customer",
    authorRole: "customer",
    visibility: "customer",
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}
