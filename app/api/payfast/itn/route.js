import { NextResponse } from "next/server";
import crypto from "crypto";
import { adminDb } from "@/lib/firebase-admin";

const MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID;
const PASSPHRASE = process.env.PAYFAST_PASSPHRASE;
const SANDBOX = process.env.PAYFAST_SANDBOX === "true";

const PAYFAST_VALID_HOSTS = [
  "sandbox.payfast.co.za",
  "www.payfast.co.za",
  "w1w.payfast.co.za",
  "w2w.payfast.co.za",
];

/**
 * Verify the ITN MD5 signature.
 * PayFast signs all posted params (excluding 'signature') in the order they were sent.
 * We rebuild the string, append the passphrase, and compare MD5 hashes.
 */
function verifySignature(params) {
  const { signature, ...rest } = params;

  const str = Object.keys(rest)
    .map((k) => `${k}=${encodeURIComponent(rest[k] ?? "").replace(/%20/g, "+")}`)
    .join("&");

  const withPassphrase = PASSPHRASE
    ? `${str}&passphrase=${encodeURIComponent(PASSPHRASE).replace(/%20/g, "+")}`
    : str;

  const expected = crypto.createHash("md5").update(withPassphrase).digest("hex");
  return expected === signature;
}

/**
 * Validate with PayFast's server-side validation endpoint.
 * PayFast will return "VALID" or "INVALID".
 */
async function validateWithPayFast(rawBody) {
  const host = SANDBOX ? "sandbox.payfast.co.za" : "www.payfast.co.za";
  const url = `https://${host}/eng/query/validate`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: rawBody,
  });

  const text = await res.text();
  return text.trim() === "VALID";
}

export async function POST(request) {
  try {
    // Read raw body as text for validation relay
    const rawBody = await request.text();

    // Parse URL-encoded body
    const params = Object.fromEntries(new URLSearchParams(rawBody));

    console.log("PayFast ITN received:", JSON.stringify(params));

    // 1. Verify signature
    if (!verifySignature(params)) {
      console.error("PayFast ITN: signature verification failed");
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    // 2. Verify merchant ID matches ours
    if (params.merchant_id !== MERCHANT_ID) {
      console.error("PayFast ITN: merchant_id mismatch", params.merchant_id);
      return NextResponse.json({ error: "Invalid merchant" }, { status: 400 });
    }

    // 3. Validate with PayFast server
    const valid = await validateWithPayFast(rawBody);
    if (!valid) {
      console.error("PayFast ITN: server-side validation failed");
      return NextResponse.json({ error: "PayFast validation failed" }, { status: 400 });
    }

    // 4. Only process COMPLETE payments
    if (params.payment_status !== "COMPLETE") {
      console.log("PayFast ITN: non-COMPLETE status:", params.payment_status);
      // Acknowledge without updating — ITN may fire for pending/failed states too
      return NextResponse.json({ ok: true });
    }

    // 5. Update Firestore
    const orderId = params.m_payment_id;
    if (!orderId) {
      console.error("PayFast ITN: no m_payment_id in params");
      return NextResponse.json({ error: "Missing order ID" }, { status: 400 });
    }

    await adminDb.collection("orders").doc(orderId).update({
      paymentStatus: "paid",
      pfPaymentId: params.pf_payment_id || null,
      paidAt: new Date().toISOString(),
      pfAmount: params.amount_gross || null,
    });

    console.log(`PayFast ITN: order ${orderId} marked paid (pf_payment_id: ${params.pf_payment_id})`);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PayFast ITN error:", err);
    // Always return 200 to PayFast so it doesn't retry indefinitely
    // Log the error internally for investigation
    return NextResponse.json({ ok: true });
  }
}
