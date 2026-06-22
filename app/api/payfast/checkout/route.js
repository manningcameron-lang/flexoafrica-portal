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
 * Build an MD5 signature from PayFast params.
 * Spec: alphabetically sort keys, URL-encode values, join as query string,
 * append &passphrase=..., then MD5 hash the whole string.
 */
function buildSignature(params) {
  const sorted = Object.keys(params)
    .sort()
    .filter((k) => params[k] !== "" && params[k] !== undefined)
    .map((k) => `${k}=${encodeURIComponent(params[k]).replace(/%20/g, "+")}`)
    .join("&");

  const withPassphrase = PASSPHRASE
    ? `${sorted}&passphrase=${encodeURIComponent(PASSPHRASE).replace(/%20/g, "+")}`
    : sorted;

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
