import { NextResponse } from "next/server";
import { getAdminDb, getAdminStorage } from "@/lib/firebase-admin";
import { COL_HOLDS } from "@/lib/amber-server";

/**
 * GET /api/amber/cleanup
 *
 * Throws away files that were emailed in by someone who never signed up,
 * once their 14 days are up. Runs once a night.
 *
 * ⚠ ONCE A DAY IS THE MOST THIS MAY RUN. On Vercel's Hobby plan a schedule
 * that fires more often than once a day makes Vercel silently REFUSE THE
 * WHOLE DEPLOYMENT — no deployment record, no error, the old site just keeps
 * serving. That cost a live deploy on 9 Sep 2026. See vercel.json.
 */

export const runtime = "nodejs";
// Never pre-render this at build time. Without it Next tries to run the
// handler while the site is being built, when no secrets are set, and the
// build log fills with alarming Firebase errors that are not real faults.
export const dynamic = "force-dynamic";

export const maxDuration = 60;

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = request.headers.get("authorization") || "";
    if (header !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const db = getAdminDb();
    const now = new Date();
    const snap = await db
      .collection(COL_HOLDS)
      .where("expiresAt", "<=", now)
      .limit(200)
      .get();

    let files = 0;
    let holds = 0;
    for (const doc of snap.docs) {
      const data = doc.data();
      // A hold the customer has already claimed keeps its files; they live on
      // the submission now.
      if (!data?.claimed) {
        for (const file of data?.files || []) {
          if (!file?.path) continue;
          try {
            await getAdminStorage().file(file.path).delete({ ignoreNotFound: true });
            files += 1;
          } catch (err) {
            console.error("amber/cleanup could not delete", file.path, err);
          }
        }
      }
      await doc.ref.delete();
      holds += 1;
    }

    return NextResponse.json({ ok: true, holds, files });
  } catch (err) {
    console.error("amber/cleanup error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
