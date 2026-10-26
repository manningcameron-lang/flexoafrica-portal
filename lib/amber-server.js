// Server-side helpers shared by the AMBER routes. Nothing in here ever runs
// in a browser.
//
// Collections this uses, all new:
//   amberSubmissions   one per job a customer is putting together
//   amberHolds         files emailed in by someone who is not an approved
//                      customer yet, kept for 14 days
//   amberInboundSeen   email ids already handled, so a webhook retry cannot
//                      double up
//   amberReplyCounts   how many automatic replies each sender got today

import { Resend } from "resend";
import { getAdminDb, getAdminStorage } from "@/lib/firebase-admin";
import { buildEmail, AMBER_FROM, AMBER_REPLY_TO, SALES_INBOX } from "@/lib/amber-emails.mjs";
import { mayAutoReply, normaliseAddress } from "@/lib/amber-loop-guard.mjs";
import { pickCustomerFromUserDocs } from "@/lib/amber-inbound-rules.mjs";

export const COL_SUBMISSIONS = "amberSubmissions";
export const COL_HOLDS = "amberHolds";
export const COL_SEEN = "amberInboundSeen";
export const COL_REPLY_COUNTS = "amberReplyCounts";

let resendClient = null;
export function getResend() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not set — AMBER cannot send or read mail.");
  }
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

/**
 * Find the portal account that owns an email address.
 *
 * ⚠ This only decides WHOSE HOLDING AREA the files land in. It never makes a
 * job. A From address is trivially forged, so the job itself is only ever
 * made when that customer is signed in and clicks Submit.
 *
 * @returns {{uid: string, status: string, company: string, email: string}|null}
 */
export async function findPortalAccount(address) {
  const email = normaliseAddress(address);
  if (!email) return null;
  const db = getAdminDb();

  // Portal signups store the address as the customer typed it, so try the
  // exact value and the lower-cased one.
  for (const value of [email, address]) {
    if (!value) continue;
    const snap = await db
      .collection("users")
      .where("email", "==", value)
      .limit(5)
      .get();
    const match = pickCustomerFromUserDocs(
      snap.docs.map((doc) => ({ id: doc.id, data: doc.data() })),
      email,
    );
    if (match) return match;
  }
  return null;
}

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function senderKey(address) {
  return normaliseAddress(address).replace(/[^a-z0-9]/g, "_").slice(0, 120);
}

/** How many automatic replies this sender has already had today. */
export async function repliesSentToday(address, date = new Date()) {
  const db = getAdminDb();
  const id = `${senderKey(address)}_${dayKey(date)}`;
  const snap = await db.collection(COL_REPLY_COUNTS).doc(id).get();
  return snap.exists ? Number(snap.data()?.count || 0) : 0;
}

async function bumpReplyCount(address, date = new Date()) {
  const db = getAdminDb();
  const id = `${senderKey(address)}_${dayKey(date)}`;
  const ref = db.collection(COL_REPLY_COUNTS).doc(id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = snap.exists ? Number(snap.data()?.count || 0) : 0;
    tx.set(ref, {
      count: count + 1,
      sender: normaliseAddress(address),
      day: dayKey(date),
      updatedAt: new Date(),
    });
  });
}

/**
 * Send one of the six approved replies, unless a guard says not to.
 *
 * @returns {{sent: boolean, reason: string|null}}
 */
export async function sendAmberReply({ to, kind, data = {}, email = null }) {
  const address = normaliseAddress(to);
  if (!address) return { sent: false, reason: "no address" };

  const already = await repliesSentToday(address);
  const guard = mayAutoReply(email || { from: address }, already);
  if (!guard.allowed) return { sent: false, reason: guard.reason };

  const built = buildEmail(kind, data);
  const resend = getResend();
  await resend.emails.send({
    from: AMBER_FROM,
    to: [address, ...built.copyTo],
    replyTo: AMBER_REPLY_TO,
    subject: built.subject,
    text: built.text,
  });
  await bumpReplyCount(address);
  return { sent: true, reason: null };
}

function safeName(name) {
  return String(name || "file")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80);
}

/**
 * Pull one attachment off Resend and write it into Firebase Storage.
 *
 * The download URL Resend gives back is signed and only lives an hour, so the
 * bytes are copied across straight away rather than the link being stored.
 */
export async function storeAttachment({ attachment, storagePath }) {
  const url = attachment?.download_url;
  if (!url) throw new Error("attachment has no download_url");
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`could not download attachment: HTTP ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const path = `${storagePath}/${Date.now()}-${safeName(attachment.filename)}`;
  const file = getAdminStorage().file(path);
  await file.save(buffer, {
    contentType: attachment.content_type || "application/octet-stream",
    resumable: false,
  });
  // The shape the MIS reads off the submission: path, name, bytes.
  return {
    path,
    name: attachment.filename || "file",
    bytes: buffer.length,
  };
}

/** Attachment metadata for a received email, straight from Resend. */
export async function listInboundAttachments(emailId) {
  const resend = getResend();
  const { data, error } = await resend.emails.receiving.attachments.list({
    emailId,
  });
  if (error) throw new Error(error.message || "could not list attachments");
  return Array.isArray(data?.data) ? data.data : [];
}

/**
 * Send sales@ a true copy of an email that reached AMBER, so a person always
 * sees what came in. Resend forwards the original message with its
 * attachments, rather than us re-writing a summary of it.
 */
export async function forwardToSales(emailId) {
  const resend = getResend();
  const { error } = await resend.emails.receiving.forward({
    emailId,
    to: SALES_INBOX,
    from: AMBER_FROM,
    passthrough: true,
  });
  if (error) throw new Error(error.message || "could not forward to sales");
}
