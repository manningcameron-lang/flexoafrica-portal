import { NextResponse } from "next/server";
import { getAdminDb, verifyRequest } from "@/lib/firebase-admin";

/**
 * GET /api/account/terms
 *
 * Resolves the SIGNED-IN customer's payment terms:
 *   { poApproved: boolean, company: string, companyDeliveryAddress: string }
 *
 * Why this is a server route and not a client Firestore read:
 * the approved-company register lives at settings/customers, and that same
 * document holds every customer's sell rate + repeat rate. Customers must
 * never be able to read it. So we resolve it with firebase-admin and return
 * ONLY the boolean (plus the company's own delivery address).
 *
 * The caller is identified from their verified Firebase ID token — never
 * from a company name passed in by the client, which would let anyone
 * claim to be an approved account.
 */
export async function GET(request) {
  try {
    const decoded = await verifyRequest(request);
    if (!decoded) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminDb = getAdminDb();

    // 1. Resolve the caller's company from their own /users doc (server-side,
    //    so a tampered client can't claim a different company).
    const userSnap = await adminDb.collection("users").doc(decoded.uid).get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    const user = userSnap.data();

    // Only active customers get terms resolved.
    if (user.status !== "active") {
      return NextResponse.json({ poApproved: false, company: user.company || "" });
    }

    const company = (user.company || "").trim();
    if (!company) {
      return NextResponse.json({ poApproved: false, company: "" });
    }

    // 2. Look up the company in the MIS customer register.
    const settingsSnap = await adminDb
      .collection("settings")
      .doc("customers")
      .get();
    const list = settingsSnap.exists ? settingsSnap.data()?.list || [] : [];

    // Match on name, case-insensitive + whitespace-tolerant. The portal
    // captures `company` as free text at signup, so exact matching is brittle.
    const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
    const match = list.find((c) => norm(c.name) === norm(company));

    return NextResponse.json({
      company,
      matched: !!match,
      poApproved: !!match?.poApproved,
      companyDeliveryAddress: match?.deliveryAddress || "",
    });
  } catch (err) {
    console.error("account/terms error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
