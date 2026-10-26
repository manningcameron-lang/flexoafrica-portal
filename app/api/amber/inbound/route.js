import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyWebhook } from "@/lib/amber-signature.mjs";
import { normaliseAddress } from "@/lib/amber-loop-guard.mjs";
import {
  isForAmber,
  classifyInbound,
  holdExpiryAt,
  shouldCopyToSales,
} from "@/lib/amber-inbound-rules.mjs";
import { emailKindForSender } from "@/lib/amber-emails.mjs";
import { missingSpecFields } from "@/lib/amber-spec.mjs";
import {
  COL_HOLDS,
  COL_SEEN,
  COL_SUBMISSIONS,
  findPortalAccount,
  forwardToSales,
  listInboundAttachments,
  sendAmberReply,
  storeAttachment,
} from "@/lib/amber-server";

/**
 * POST /api/amber/inbound
 *
 * Resend hands us every email that reaches amber@flexoafrica.com, by way of a
 * forwarder on the Afrihost mail server. This route puts the files somewhere
 * useful and sends the right reply.
 *
 * THREE THINGS THIS ROUTE WILL NOT DO, by design:
 *
 * 1. It will not trust an unsigned call. A Resend webhook is signed; anything
 *    without a matching signature is refused outright. Without this, anyone
 *    who learned the URL could post fake emails at us all day.
 *
 * 2. It will not make a job. The From address only decides whose holding area
 *    the files land in. A workticket is only ever made when that customer is
 *    signed in and clicks Submit, which is what stops someone forging a
 *    customer's address to run up jobs on their account.
 *
 * 3. It will not take instructions from the email. The subject and the body
 *    are DATA. Nothing written in them may choose the customer, the price,
 *    the recipient or any action.
 *
 * It also quietly ignores mail that is not for AMBER. A Resend webhook belongs
 * to the whole account, not to one domain, and this account has another site
 * receiving mail on it, so this door is handed that site's email too.
 */

export const runtime = "nodejs";
// Downloading attachments and writing them to Storage can take a while on a
// big artwork file.
export const maxDuration = 60;

export async function POST(request) {
  // 1. The raw body, byte for byte. Parsing it to JSON and stringifying it
  //    again would change the bytes and the signature would never match.
  const raw = await request.text();

  const check = verifyWebhook({
    body: raw,
    headers: request.headers,
    secret: process.env.RESEND_WEBHOOK_SECRET,
  });
  if (!check.valid) {
    console.warn("amber/inbound refused:", check.reason);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  if (payload?.type !== "email.received") {
    return NextResponse.json({ ok: true, ignored: "not an inbound email" });
  }

  const event = payload.data || {};

  // 2. Not addressed to AMBER? Not ours. Answer 200 so Resend stops retrying.
  if (!isForAmber(event)) {
    return NextResponse.json({ ok: true, ignored: "not addressed to amber" });
  }

  const emailId = event.email_id;
  if (!emailId) {
    return NextResponse.json({ ok: true, ignored: "no email id" });
  }

  try {
    const db = getAdminDb();

    // 3. Resend retries a webhook it thinks failed. Handle each email once.
    const seenRef = db.collection(COL_SEEN).doc(String(emailId));
    const seen = await seenRef.get();
    if (seen.exists) {
      return NextResponse.json({ ok: true, ignored: "already handled" });
    }

    const from = normaliseAddress(event.from);
    const account = await findPortalAccount(from);

    const attachments = await listInboundAttachments(emailId);
    const eventWithFiles = { ...event, attachments };
    const verdict = classifyInbound({ event: eventWithFiles, account });

    let submissionId = null;
    let holdId = null;
    const stored = [];

    if (verdict.action === "store_for_customer") {
      // An approved customer emailed us. Open a submission in their name and
      // put the files on it. It is NOT a job yet: they still have to fill in
      // the press details and press Submit.
      const ref = db.collection(COL_SUBMISSIONS).doc();
      submissionId = ref.id;
      for (const attachment of attachments) {
        stored.push(
          await storeAttachment({
            attachment,
            storagePath: `amber/${account.uid}/${submissionId}`,
          }),
        );
      }
      await ref.set({
        uid: account.uid,
        kind: "repro",
        company: account.company,
        customerEmail: account.email,
        source: "email",
        // The email's words are kept only so the customer can see what they
        // sent. They are never read as instructions.
        emailSubject: String(event.subject || "").slice(0, 300),
        spec: {},
        notSure: [],
        files: stored,
        jobNumber: null,
        createdAt: new Date(),
        createdAtMs: Date.now(),
        updatedAt: new Date(),
      });
    } else if (verdict.action === "hold_for_sender") {
      // Not an approved customer (yet). Keep the files for 14 days so they
      // never have to send them twice, and point them at signup.
      const ref = db.collection(COL_HOLDS).doc();
      holdId = ref.id;
      for (const attachment of attachments) {
        stored.push(
          await storeAttachment({
            attachment,
            storagePath: `amber-holds/${holdId}`,
          }),
        );
      }
      await ref.set({
        senderEmail: from,
        uid: account?.uid || null,
        accountStatus: verdict.accountStatus,
        emailSubject: String(event.subject || "").slice(0, 300),
        files: stored,
        claimed: false,
        receivedAt: new Date(),
        expiresAt: holdExpiryAt(new Date()),
      });
    }

    // 4. The reply. The loop guard inside sendAmberReply refuses to answer an
    //    out of office, a mailing list, a bounce or our own domain, and caps
    //    each sender at three automatic replies a day.
    const kind = emailKindForSender({
      accountStatus: verdict.accountStatus,
      hasFiles: verdict.hasFiles,
      tooBig: verdict.tooBig,
    });
    const missing = submissionId
      ? missingSpecFields({ files: stored, spec: {}, notSure: [] })
      : [];
    const reply = await sendAmberReply({
      to: from,
      kind,
      email: { from: event.from, headers: event.headers },
      data: {
        missing,
        link: submissionId
          ? `https://portal.flexoafrica.com/amber?id=${submissionId}`
          : undefined,
      },
    });

    // 5. A person always sees a copy. Afrihost only allows one destination
    //    per alias, so the copy is made here rather than by a second
    //    forwarder. If it fails, that must never cost us the files, so it is
    //    logged and the email is still treated as handled.
    let copiedToSales = false;
    if (shouldCopyToSales({ from: event.from, headers: event.headers })) {
      try {
        await forwardToSales(emailId);
        copiedToSales = true;
      } catch (err) {
        console.error("amber/inbound: could not copy to sales@", err);
      }
    }

    await seenRef.set({
      copiedToSales,
      emailId: String(emailId),
      from,
      action: verdict.action,
      submissionId,
      holdId,
      fileCount: stored.length,
      replySent: reply.sent,
      replyKind: kind,
      replySkippedBecause: reply.reason,
      handledAt: new Date(),
    });

    return NextResponse.json({
      ok: true,
      action: verdict.action,
      submissionId,
      holdId,
      files: stored.length,
      replySent: reply.sent,
    });
  } catch (err) {
    console.error("amber/inbound error:", err);
    // A 500 tells Resend to retry, which is what we want for a transient
    // failure. The seen-record is only written on success, so a retry picks
    // up where this left off.
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
