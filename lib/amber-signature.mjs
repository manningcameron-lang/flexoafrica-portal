// Checks that a webhook really came from Resend and not from someone else
// pretending to be Resend.
//
// Resend signs webhooks with Svix. The scheme is:
//   signed content = "<svix-id>.<svix-timestamp>.<raw body>"
//   key            = base64-decode(secret without its "whsec_" prefix)
//   signature      = base64( HMAC-SHA256(key, signed content) )
// The svix-signature header may carry several space-separated entries, each
// "v1,<signature>". A match on ANY v1 entry is valid.
//
// The raw body must be used byte for byte. Parsing it to JSON and
// re-stringifying it changes the bytes and the signature will never match.

import crypto from "node:crypto";

export const DEFAULT_TOLERANCE_SECONDS = 300;

function timingSafeEqual(a, b) {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function expectedSignature({ id, timestamp, body, secret }) {
  const key = Buffer.from(String(secret).replace(/^whsec_/, ""), "base64");
  return crypto
    .createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`, "utf8")
    .digest("base64");
}

/**
 * @param {object} args
 * @param {string} args.body        the RAW request body, untouched
 * @param {object} args.headers     a map or Headers-like with a .get()
 * @param {string} args.secret      the whsec_... signing secret
 * @param {number} [args.nowSeconds]
 * @param {number} [args.toleranceSeconds]
 * @returns {{valid: boolean, reason: string|null}}
 */
export function verifyWebhook({
  body,
  headers,
  secret,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
}) {
  if (!secret) return { valid: false, reason: "no signing secret configured" };

  const get = (name) => {
    if (!headers) return null;
    if (typeof headers.get === "function") return headers.get(name);
    const want = name.toLowerCase();
    for (const k of Object.keys(headers)) {
      if (k.toLowerCase() === want) return headers[k];
    }
    return null;
  };

  const id = get("svix-id");
  const timestamp = get("svix-timestamp");
  const signature = get("svix-signature");
  if (!id || !timestamp || !signature) {
    return { valid: false, reason: "missing svix headers" };
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { valid: false, reason: "bad timestamp" };
  if (Math.abs(nowSeconds - ts) > toleranceSeconds) {
    return { valid: false, reason: "timestamp outside tolerance" };
  }

  const want = expectedSignature({ id, timestamp, body, secret });
  const entries = String(signature).split(" ").filter(Boolean);
  for (const entry of entries) {
    const comma = entry.indexOf(",");
    if (comma === -1) continue;
    if (entry.slice(0, comma) !== "v1") continue;
    if (timingSafeEqual(entry.slice(comma + 1), want)) {
      return { valid: true, reason: null };
    }
  }
  return { valid: false, reason: "signature does not match" };
}
