// The rules the inbound email door applies, kept out of the route so they can
// be tested on their own.
//
// Two things matter most here:
//
// 1. A Resend webhook belongs to the WHOLE ACCOUNT, not to one domain. There
//    is already another site on this Resend account with its own inbound
//    webhook, so this door is handed ITS mail too. Anything not addressed to
//    AMBER is ignored, quietly and with a 200, so Resend does not retry it.
//
// 2. An email can NEVER make a job by itself. The From address only decides
//    whose holding area the files land in. Nothing becomes a workticket until
//    the signed-in customer clicks Submit in the portal. That is what stops
//    someone faking a customer's address to run up jobs on their account.
//    The words in the subject and body are DATA, never instructions: they are
//    never allowed to pick the customer, the price, the recipient or any
//    action.

import { normaliseAddress, addressLocalPart, looksAutomatic } from "./amber-loop-guard.mjs";

export const HOLD_DAYS = 14;

// Every address that counts as "this is for AMBER". The forwarder sends to the
// Resend receiving address; the original To header still says amber@.
export const AMBER_ADDRESSES = [
  "amber@flexoafrica.com",
  "amber@veiwuu.resend.app",
];

function addressList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(normaliseAddress).filter(Boolean);
  return String(value).split(",").map(normaliseAddress).filter(Boolean);
}

/**
 * Is this inbound email ours to handle at all?
 *
 * @param {object} event the email.received payload's `data`
 */
export function isForAmber(event) {
  const candidates = [
    ...addressList(event?.to),
    ...addressList(event?.cc),
    ...addressList(event?.bcc),
    ...addressList(event?.received_for),
  ];
  if (candidates.some((a) => AMBER_ADDRESSES.includes(a))) return true;
  // A forwarder can rewrite the envelope, so also accept any local part
  // "amber" on our own two addresses' domains.
  return candidates.some(
    (a) => addressLocalPart(a) === "amber" &&
      AMBER_ADDRESSES.some((known) => known.endsWith("@" + a.split("@")[1])),
  );
}

/**
 * Decide what to do with an inbound email.
 *
 * @param {object} args
 * @param {object} args.event        the email.received data
 * @param {object|null} args.account the matched portal user, or null
 * @param {number} args.maxBytes     the biggest attachment we accept
 * @returns {{action: string, accountStatus: string, tooBig: boolean, hasFiles: boolean}}
 */
export function classifyInbound({ event, account, maxBytes = 40 * 1024 * 1024 }) {
  const attachments = Array.isArray(event?.attachments) ? event.attachments : [];
  const hasFiles = attachments.length > 0;
  const tooBig = attachments.some((a) => Number(a?.size) > maxBytes);

  const status = account?.status || "none";

  // A suspended account gets a polite note and we keep NOTHING.
  if (status === "suspended") {
    return { action: "reply_only", accountStatus: "suspended", tooBig, hasFiles };
  }
  if (tooBig) {
    return { action: "reply_only", accountStatus: status, tooBig, hasFiles };
  }
  if (!hasFiles) {
    return { action: "reply_only", accountStatus: status, tooBig, hasFiles };
  }
  if (status === "active") {
    return { action: "store_for_customer", accountStatus: status, tooBig, hasFiles };
  }
  // Signed up but not approved yet, or never signed up: hold the files for 14
  // days under the sender's address, so they never have to send them twice.
  return { action: "hold_for_sender", accountStatus: status, tooBig, hasFiles };
}

/** When a held batch of files should be thrown away. */
export function holdExpiryAt(receivedAt, days = HOLD_DAYS) {
  const base = receivedAt instanceof Date ? receivedAt : new Date(receivedAt);
  return new Date(base.getTime() + days * 86400000);
}

export function isHoldExpired(hold, now = new Date()) {
  const expires = hold?.expiresAt
    ? new Date(hold.expiresAt.toDate ? hold.expiresAt.toDate() : hold.expiresAt)
    : null;
  if (!expires || Number.isNaN(expires.getTime())) return false;
  return expires.getTime() <= now.getTime();
}

/**
 * Pick the portal account that owns an address, out of the user records a
 * lookup returned.
 *
 * This is its own function so the rule can be tested without a database. The
 * rules are deliberately strict:
 *   - only a customer record ever matches (never staff);
 *   - the address must match exactly once case and spacing are taken off,
 *     so "Cam@Acme.com " and "cam@acme.com" are the same person but
 *     "cam@acme.co" is not.
 *
 * ⚠ Matching a sender NEVER authorises anything. It only decides whose
 * holding area the files land in.
 */
export function pickCustomerFromUserDocs(docs, address) {
  const want = normaliseAddress(address);
  if (!want) return null;
  for (const doc of docs || []) {
    const data = doc?.data || doc;
    if (!data) continue;
    if (data.role !== "customer") continue;
    if (normaliseAddress(data.email) !== want) continue;
    return {
      uid: doc.id || data.uid || null,
      status: data.status || "pending",
      company: data.company || "",
      email: normaliseAddress(data.email),
    };
  }
  return null;
}

/**
 * Every action classifyInbound is allowed to return. There is deliberately no
 * action here that makes a job: an email can never create a workticket, no
 * matter who it claims to be from.
 */
export const INBOUND_ACTIONS = ["reply_only", "store_for_customer", "hold_for_sender"];

/**
 * Should a copy of this email go to sales@, so a person always sees it?
 *
 * ⚠ WHY THIS IS IN OUR CODE and not a second mail forwarder: Afrihost only
 * allows ONE destination per alias. Adding a second "amber" alias pointing at
 * sales@ reported success but did not stick, and the list still showed only
 * the Resend one (checked 26 Oct 2026). So the copy is made here instead,
 * with Resend forwarding the original email, attachments and all.
 *
 * Out-of-office replies, mailing lists and bounces are NOT copied: they are
 * noise in a sales inbox, and the loop guard already decides what is
 * automatic.
 */
export function shouldCopyToSales(email) {
  return !looksAutomatic(email).automatic;
}
