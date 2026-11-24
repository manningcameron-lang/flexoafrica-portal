import { NextResponse } from "next/server";
import { getAdminDb, verifyRequest } from "@/lib/firebase-admin";
import { saveRegisterName } from "@/lib/company-sync";

/**
 * POST /api/account/company-sync
 *
 * Called once by the portal after a CUSTOMER signs in. If the company name on
 * their account matches exactly one customer on our list (settings/customers)
 * but is written differently ("Top Flight Packaging" vs "Top Flight Packaging
 * cc"), our list's name is saved on the account. Jobs are found by that name,
 * so without this a customer cannot see the AMBER jobs the job system makes
 * for them. Cam, 24 Nov 2026.
 *
 * The caller comes from their verified sign-in, never from the request body.
 * Staff and inactive accounts are left alone. Answers { company, changed }.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const decoded = await verifyRequest(request);
  if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const adminDb = getAdminDb();
    const userSnap = await adminDb.collection("users").doc(decoded.uid).get();
    if (!userSnap.exists) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    const user = userSnap.data();
    if (user.role !== "customer" || user.status !== "active") {
      return NextResponse.json({ company: user.company || "", changed: false });
    }
    const settingsSnap = await adminDb.collection("settings").doc("customers").get();
    const list = settingsSnap.exists ? settingsSnap.data()?.list || [] : [];
    const result = await saveRegisterName(adminDb, decoded.uid, user, list);
    return NextResponse.json(result);
  } catch (err) {
    console.error("account/company-sync:", err?.message || err);
    return NextResponse.json({ error: "Could not check the company name" }, { status: 500 });
  }
}
