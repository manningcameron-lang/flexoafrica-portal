// The six automatic replies AMBER sends. Cam approved this wording word for
// word on 26 Oct 2026. Do NOT reword any of it without asking him again.
//
// They all go out from "AMBER at Flexo Africa <amber@flexoafrica.com>" with
// reply-to amber@, through Resend.

import { normaliseAddress } from "./amber-loop-guard.mjs";

export const AMBER_FROM = "AMBER at Flexo Africa <amber@flexoafrica.com>";
export const AMBER_REPLY_TO = "amber@flexoafrica.com";
export const SALES_INBOX = "sales@flexoafrica.com";

export const FOOTER_LINES = [
  "Flexo Africa",
  "sales@flexoafrica.com",
  "WhatsApp +27 64 586 7535",
];

export const PORTAL_BASE = "https://portal.flexoafrica.com";
export const SIGNUP_URL = `${PORTAL_BASE}/signup`;
export const AMBER_URL = `${PORTAL_BASE}/amber`;

function withFooter(body) {
  return `${body}\n\n--\n${FOOTER_LINES.join("\n")}`;
}

function listOf(items) {
  const clean = (items || []).filter(Boolean);
  if (clean.length === 0) return "a few press details";
  if (clean.length === 1) return clean[0];
  return clean.slice(0, -1).join(", ") + " and " + clean[clean.length - 1];
}

export const NOT_SIGNED_UP = "not_signed_up";
export const ACCOUNT_PENDING = "account_pending";
export const DETAILS_NEEDED = "details_needed";
export const JOB_MADE = "job_made";
export const NO_FILE = "no_file";
export const TOO_BIG = "too_big";
export const SUSPENDED = "suspended";

/**
 * Build one of the six approved replies.
 *
 * @param {string} kind one of the constants above
 * @param {object} [data]
 * @returns {{subject: string, text: string, copyTo: string[]}}
 */
export function buildEmail(kind, data = {}) {
  switch (kind) {
    case NOT_SIGNED_UP:
      return {
        subject: "AMBER has your files — one quick step first",
        copyTo: [],
        text: withFooter(
          "Thanks for sending this to AMBER. To start a job we need you to have a " +
            `Flexo Africa portal account. Sign up here: ${SIGNUP_URL} (it takes 2 ` +
            "minutes). We approve new accounts within one working day. We have kept " +
            "your files for 14 days, and they will be waiting in your portal once " +
            "your account is approved, so there is no need to send them again.",
        ),
      };

    case ACCOUNT_PENDING:
      return {
        subject: "AMBER has your files — your account is being approved",
        copyTo: [],
        text: withFooter(
          "Thanks, we have your files. Your portal account is still waiting for " +
            "approval (we approve within one working day). Your files will be " +
            "waiting in your portal as soon as it is approved.",
        ),
      };

    case DETAILS_NEEDED:
      return {
        subject: "AMBER has your files — a few press details needed",
        copyTo: [],
        text: withFooter(
          "Thanks, AMBER has your files. Before she can start we need a few press " +
            `details: ${listOf(data.missing)}. Add them here, it takes a minute: ` +
            `${data.link || AMBER_URL}. The 24 hours starts as soon as they are in.`,
        ),
      };

    case JOB_MADE:
      return {
        subject: `Your job ${data.jobNumber || ""} is with AMBER`.trim(),
        // A copy always goes to sales@ so a person sees every job that is made.
        copyTo: [SALES_INBOX],
        text: withFooter(
          `Got it. Your job is ${data.jobNumber}, ${data.jobName}. AMBER is on it, ` +
            `and you will have your plate-ready file and PDF proof by ${data.dueText}. ` +
            `Track it here: ${data.link || AMBER_URL}.`,
        ),
      };

    case NO_FILE:
      return {
        subject: "AMBER could not find your artwork",
        copyTo: [],
        text: withFooter(
          "We couldn't find artwork attached. Please upload it here instead: " +
            `${data.link || AMBER_URL}.`,
        ),
      };

    case TOO_BIG:
      return {
        subject: "AMBER could not take your file by email",
        copyTo: [],
        text: withFooter(
          "Your file is too big for email. Please upload it here instead: " +
            `${data.link || AMBER_URL}.`,
        ),
      };

    case SUSPENDED:
      return {
        subject: "Thanks for your email",
        copyTo: [],
        text: withFooter(
          "Thanks for your email. Please contact sales@flexoafrica.com and we will " +
            "help you from there.",
        ),
      };

    default:
      throw new Error(`Unknown AMBER email kind: ${kind}`);
  }
}

/** Which reply suits a sender in a given state. */
export function emailKindForSender({ accountStatus, hasFiles, tooBig }) {
  if (accountStatus === "suspended") return SUSPENDED;
  if (tooBig) return TOO_BIG;
  if (!hasFiles) return NO_FILE;
  if (accountStatus === "pending") return ACCOUNT_PENDING;
  if (accountStatus === "none") return NOT_SIGNED_UP;
  return DETAILS_NEEDED;
}

export { normaliseAddress };
