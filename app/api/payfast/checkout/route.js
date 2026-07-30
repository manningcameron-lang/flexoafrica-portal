import { NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminDb, verifyRequest } from "@/lib/firebase-admin";

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
    // ── Auth: resolve the caller from their verified Firebase ID token. ──
    const decoded = await verifyRequest(request);
    if (!decoded) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { orderId } = await request.json();
    if (!orderId) {
      return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
    }

    // ── Load the order server-side. NEVER trust a client-supplied amount:
    // the signed amount and the payer must come from the authoritative order
    // doc, or a customer could pay R1 for a R5,000 order. ──
    const adminDb = getAdminDb();
    const orderSnap = await adminDb.collection("orders").doc(orderId).get();
    if (!orderSnap.exists) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    const order = orderSnap.data();

    if (order.customerUid !== decoded.uid) {
      return NextResponse.json({ error: "Not your order" }, { status: 403 });
    }
    if (order.paymentTerms === "po") {
      return NextResponse.json({ error: "This order is on account, not card" }, { status: 400 });
    }
    if (order.paymentStatus === "paid") {
      return NextResponse.json({ error: "This order is already paid" }, { status: 400 });
    }

    const amount = Number(order.orderTotalIncVat);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Order has no payable total" }, { status: 400 });
    }

    const orderNumber = order.orderNumber || orderId;
    const email = order.customerEmail || decoded.email || "";
    const nameParts = String(order.customerName || "").trim().split(" ").filter(Boolean);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

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
