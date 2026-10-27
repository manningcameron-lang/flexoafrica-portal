import { NextResponse } from "next/server";
import { getAdminDb, verifyRequest } from "@/lib/firebase-admin";
import { matchCustomer } from "@/lib/company-match";
import { COL_SUBMISSIONS } from "@/lib/amber-server";
import { FREE_JOB_CHECK_LIMIT, firstJobAnswer } from "@/lib/amber-pricing.mjs";

/**
 * GET /api/amber/price
 *
 * What the signed-in customer will pay, so the page can say it before they
 * press Submit:
 *   { poRequired, companyHasHadFreeJob, ratePerCm2 }
 *
 * companyHasHadFreeJob is true, false or null (cannot be sure). The page says
 * "First job free" only when it is exactly false.
 *
 * This is a SERVER route for the same reason /api/account/terms is: the
 * figures live in settings/customers, which also holds every other
 * customer's rate, and must never reach a browser.
 *
 * The MIS is still the authority when the job is actually made. This only
 * tells the customer what to expect. Every AMBER repro job is created through
 * this flow, so the two agree.
 */

export const runtime = "nodejs";
// Never pre-render this at build time. Without it Next tries to run the
// handler while the site is being built, when no secrets are set, and the
// build log fills with alarming Firebase errors that are not real faults.
export const dynamic = "force-dynamic";


export async function GET(request) {
  try {
    const decoded = await verifyRequest(request);
    if (!decoded) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getAdminDb();
    const userSnap = await db.collection("users").doc(decoded.uid).get();
    const user = userSnap.exists ? userSnap.data() : null;
    if (!user || user.status !== "active") {
      return NextResponse.json({ error: "Account not active" }, { status: 403 });
    }

    const company = (user.company || "").trim();
    const settingsSnap = await db.collection("settings").doc("customers").get();
    const list = settingsSnap.exists ? settingsSnap.data()?.list || [] : [];
    const customer = matchCustomer(list, company);

    // "First" means this company has never had an AMBER repro job made.
    // true = it has, false = confirmed never, null = cannot be sure. The page
    // shows "First job free" ONLY on false. Cam 2026-10-27.
    let companyHasHadFreeJob = null;
    if (company && customer) {
      const prior = await db
        .collection(COL_SUBMISSIONS)
        .where("company", "==", company)
        .where("kind", "==", "repro")
        .limit(FREE_JOB_CHECK_LIMIT)
        .get();
      companyHasHadFreeJob = firstJobAnswer({
        company,
        customerFound: true,
        sheetJobNumbers: prior.docs.map((d) => d.data()?.jobNumber || null),
      });
    }

    return NextResponse.json({
      company,
      poRequired: !!customer?.poApproved,
      companyHasHadFreeJob,
      ratePerCm2: Number(customer?.rate) > 0 ? Number(customer.rate) : null,
    });
  } catch (err) {
    console.error("amber/price error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
