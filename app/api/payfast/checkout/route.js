import { NextResponse } from "next/server";
import crypto from "crypto";

const MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID;
const MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY;
const PASSPHRASE = process.env.PAYFAST_PASSPHRASE;
const SANDBOX = process.env.PAYFAST_SANDBOX === "true";

const PAYFAST_URL = SANDBOX
  ? "https://sandbox.payfast.co.za/eng/process"
  : "https://www.payfast.co.za/eng/process";

/**
 * URL-encode a value the way PayFast's server does (PHP urlencode).
 * encodeURIComponent leaves !'()*~ unescaped and encodes space as %20;
 * PHP urlencode escapes those chars and uses + for spaces. If the two sides
 * disagree on a single character, the MD5 signatures diverge and PayFast
 * returns "Generated signature does not match submitted signature". Trim
 * first (PayFast trims each value before encoding).
 */
function pfEncode(value) {
  return encodeURIComponent(String(value).trim())
    .replace(/%20/g, "+")
    .replace(/[!'()*~]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

/**
 * Build an MD5 signature from PayFast params for the redirect (custom)
 * integration. CRITICAL: the pairs must be concatenated in the SAME ORDER the
 * fields are POSTed to PayFast (insertion order), NOT alphabetically sorted.
 * Sorting is the API-signature format and makes /eng/process reject the POST.
 * PayFast recomputes over the received fields in received order, so we sign in
 * that order too. Passphrase (if set on the merchant account) is appended last.
 */
function buildSignature(params) {
  const str = Object.keys(params)
    .filter((k) => params[k] !== "" && params[k] !== undefined && params[k] !== null)
    .map((k) => `${k}=${pfEncode(params[k])}`)
    .join("&");

  const withPassphrase = PASSPHRASE ? `${str}&passphrase=${pfEncode(PASSPHRASE)}` : str;

  return crypto.createHash("md5").update(withPassphrase).digest("hex");
}

export async function POST(request) {
  try {
    const { orderId, orderNumber, amount, email, firstName, lastName } =
      await request.json();

    if (!orderId || !amount || !email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const returnUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/order/${orderId}/success?paid=1`;
    const cancelUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/order/${orderId}/success`;
    const notifyUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/api/payfast/itn`;

    const params = {
      merchant_id: MERCHANT_ID,
      merchant_key: MERCHANT_KEY,
      return_url: returnUrl,
      cancel_url: cancelUrl,
      notify_url: notifyUrl,
      name_first: firstName || "",
      name_last: lastName || "",
      email_address: email,
      m_payment_id: orderId,
      amount: Number(amount).toFixed(2),
      item_name: `Flexo Africa Order ${orderNumber || orderId}`,
      item_description: `Flexo Africa print plates order`,
    };

    // Remove empty strings before signing
    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== "" && v !== undefined)
    );

    const signature = buildSignature(cleanParams);

    return NextResponse.json({
      action: PAYFAST_URL,
      fields: { ...cleanParams, signature },
    });
  } catch (err) {
    console.error("PayFast checkout error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
