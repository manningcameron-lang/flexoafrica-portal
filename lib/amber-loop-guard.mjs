// Stops AMBER from writing to a robot, or from writing to the same person
// over and over.
//
// Two separate guards:
//   1. Never auto-reply to something that is itself automatic (an out of
//      office, a mailing list, a bounce, a noreply address) or to our own
//      domain. Two robots can otherwise talk to each other all night.
//   2. Never send the same sender more than 3 automatic replies in one day.

export const MAX_AUTO_REPLIES_PER_SENDER_PER_DAY = 3;

export const OUR_DOMAINS = ["flexoafrica.com"];

const ROBOT_LOCAL_PARTS = [
  "noreply", "no-reply", "no_reply", "donotreply", "do-not-reply",
  "mailer-daemon", "mailerdaemon", "postmaster", "bounce", "bounces",
  "notifications", "notification", "automated", "autoreply", "auto-reply",
];

/** Lower-case and trim an address, and strip any "Name <addr>" wrapper. */
export function normaliseAddress(value) {
  if (typeof value !== "string") return "";
  const angled = value.match(/<([^>]+)>/);
  const raw = angled ? angled[1] : value;
  return raw.trim().toLowerCase();
}

export function addressDomain(value) {
  const addr = normaliseAddress(value);
  const at = addr.lastIndexOf("@");
  return at === -1 ? "" : addr.slice(at + 1);
}

export function addressLocalPart(value) {
  const addr = normaliseAddress(value);
  const at = addr.lastIndexOf("@");
  return at === -1 ? addr : addr.slice(0, at);
}

// Header lookup that does not care about capitalisation, because mail servers
// do not agree on it ("Auto-Submitted" vs "auto-submitted").
function header(headers, name) {
  if (!headers) return null;
  const want = name.toLowerCase();
  if (Array.isArray(headers)) {
    for (const h of headers) {
      if (String(h?.name || "").toLowerCase() === want) return String(h?.value ?? "");
    }
    return null;
  }
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === want) return String(headers[k] ?? "");
  }
  return null;
}

/**
 * Is this email itself automatic, or from us? If so we never reply to it.
 *
 * @param {{from?: string, headers?: object|Array}} email
 * @returns {{automatic: boolean, reason: string|null}}
 */
export function looksAutomatic(email) {
  const from = normaliseAddress(email?.from);
  const headers = email?.headers;

  const autoSubmitted = header(headers, "auto-submitted");
  if (autoSubmitted && autoSubmitted.trim().toLowerCase() !== "no") {
    return { automatic: true, reason: "auto-submitted header" };
  }

  const precedence = (header(headers, "precedence") || "").trim().toLowerCase();
  if (["bulk", "list", "junk", "auto_reply"].includes(precedence)) {
    return { automatic: true, reason: "precedence " + precedence };
  }

  if (header(headers, "x-auto-response-suppress")) {
    return { automatic: true, reason: "x-auto-response-suppress header" };
  }
  if (header(headers, "list-id") || header(headers, "list-unsubscribe")) {
    return { automatic: true, reason: "mailing list header" };
  }

  // A bounce comes back with an empty envelope sender.
  if (!from) return { automatic: true, reason: "no sender address" };

  const local = addressLocalPart(from);
  if (ROBOT_LOCAL_PARTS.some((p) => local === p || local.startsWith(p + "+") || local.startsWith(p + "."))) {
    return { automatic: true, reason: "robot address " + local };
  }

  if (OUR_DOMAINS.includes(addressDomain(from))) {
    return { automatic: true, reason: "our own domain" };
  }

  return { automatic: false, reason: null };
}

/**
 * May we send this sender another automatic reply today?
 *
 * @param {{from: string, headers?: object|Array}} email
 * @param {number} repliesSentToday how many we have already sent this sender
 * @returns {{allowed: boolean, reason: string|null}}
 */
export function mayAutoReply(email, repliesSentToday = 0) {
  const auto = looksAutomatic(email);
  if (auto.automatic) return { allowed: false, reason: auto.reason };
  if (repliesSentToday >= MAX_AUTO_REPLIES_PER_SENDER_PER_DAY) {
    return { allowed: false, reason: "daily reply cap reached" };
  }
  return { allowed: true, reason: null };
}
