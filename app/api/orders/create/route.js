import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, verifyRequest } from "@/lib/firebase-admin";
import { PLATE_TYPES, SUBSTRATE_OPTIONS, TURNAROUND_TIERS, tierRateFor } from "@/lib/plate-types";
import { priceLineItems, calcOrderTotals } from "@/lib/pricing";
import { matchCustomer } from "@/lib/company-match";
import { PORTAL_DEMO_MODE, formatOrderNumber, formatJobNumber } from "@/lib/order-format";
import { jobsForOrder } from "@/lib/order-jobs.mjs";

/**
 * POST /api/orders/create
 *
 * AUTHORITATIVE order creation. Everything that decides what the customer pays
 * is computed HERE, server-side, with admin credentials:
 *
 *   - the caller's identity          → from their verified Firebase ID token
 *   - their company                  → from /users/{uid} (not the request body)
 *   - their per-cm² rate             → from settings/customers (never exposed)
 *   - whether they may order on a PO → from settings/customers.poApproved
 *   - the order total                → recomputed from the rate + dimensions
 *
 * Previously all of this happened in the browser, which meant a customer could
 * write their own orderTotalIncVat (pay R1 for a R5,000 order — the PayFast ITN
 * cross-check compared the payment against a figure the customer supplied) or
 * set paymentTerms:"po" to skip payment entirely. Cam 2026-07-14.
 *
 * ONE FA JOB PER PLATE LINE. A four-colour line is one job with four plates,
 * not four jobs. See lib/order-jobs.mjs. Cam 2026-10-26.
 *
 * The client still uploads the artwork PDFs and the PO document to Storage
 * (rules-guarded, and the bytes are the customer's own), and passes us the
 * resulting references.
 */

const MAX_LINE_ITEMS = 25;
const MAX_PLATES_PER_LINE = 12;

export async function POST(request) {
  try {
    const decoded = await verifyRequest(request);
    if (!decoded) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { header = {}, lineItems = [], poDocument = null } = body;

    if (!Array.isArray(lineItems) || lineItems.length === 0) {
      return NextResponse.json({ error: "Add at least one plate" }, { status: 400 });
    }
    if (lineItems.length > MAX_LINE_ITEMS) {
      return NextResponse.json({ error: "Too many line items" }, { status: 400 });
    }

    const adminDb = getAdminDb();

    // ─── 1. Resolve the caller (never trust the body for identity) ────────
    const userSnap = await adminDb.collection("users").doc(decoded.uid).get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    const profile = userSnap.data();
    if (profile.role !== "customer" || profile.status !== "active") {
      return NextResponse.json({ error: "Account not permitted to order" }, { status: 403 });
    }

    const company = (profile.company || "").trim();

    // ─── 2. Resolve rate + PO terms from the MIS register ────────────────
    const settingsSnap = await adminDb.collection("settings").doc("customers").get();
    const list = settingsSnap.exists ? settingsSnap.data()?.list || [] : [];
    const customer = matchCustomer(list, company);

    // Rate: the customer's negotiated rate, or undefined → priceLineItems falls
    // back to the public anchor. Never taken from the client.
    const ratePerCm2 = Number(customer?.rate) > 0 ? Number(customer.rate) : undefined;

    // Payment terms: derived ONLY from the register.
    const poApproved = !!customer?.poApproved;
    const paymentTerms = poApproved ? "po" : "prepaid";

    if (paymentTerms === "po") {
      if (!String(header.poNumber || "").trim()) {
        return NextResponse.json(
          { error: "A purchase order number is required for account orders" },
          { status: 400 }
        );
      }
      if (!poDocument?.url) {
        return NextResponse.json(
          { error: "A purchase order document is required for account orders" },
          { status: 400 }
        );
      }
    }

    // ─── 3. Validate line items ──────────────────────────────────────────
    for (const li of lineItems) {
      const plateType = PLATE_TYPES.find((p) => p.id === li.plateTypeId);
      if (!plateType) {
        return NextResponse.json({ error: `Invalid plate type: ${li.plateTypeId}` }, { status: 400 });
      }
      const ticked = Object.values(li.selectedColors || {}).filter(Boolean).length;
      if (ticked > MAX_PLATES_PER_LINE) {
        return NextResponse.json({ error: "Too many plates on one line" }, { status: 400 });
      }
      if (!(Number(li.widthCm) > 0) || !(Number(li.heightCm) > 0)) {
        return NextResponse.json({ error: "Every plate needs width and height" }, { status: 400 });
      }
    }

    // ─── 4. Recompute the price. THIS is what the customer pays. ─────────
    const tier = header.tier === "express" ? "express" : "standard";
    const priority = tier === "express" ? "rush" : "normal";
    const tierInfo = TURNAROUND_TIERS.find((t) => t.id === tier) || TURNAROUND_TIERS[0];
    const isExpress = (tierInfo.upliftPct || 0) > 0;

    const deliveryMethod = header.deliveryMethod === "collection" ? "collection" : "delivery";
    const linePrices = priceLineItems({ lineItems, isExpress, ratePerCm2 });
    const totals = calcOrderTotals(linePrices, deliveryMethod);

    // ─── 5. Allocate numbers + write, all with admin credentials ─────────
    const orderCounter = PORTAL_DEMO_MODE ? "demoOrderNumber" : "orderNumber";
    const jobCounter = PORTAL_DEMO_MODE ? "demoJobNumber" : "jobNumber";

    const orderNumberInt = await nextNumber(adminDb, orderCounter);
    const orderNumber = formatOrderNumber(orderNumberInt);

    const orderRef = adminDb.collection("orders").doc();
    await orderRef.set({
      orderNumber,
      orderNumberInt,
      customerUid: decoded.uid,
      customerName: profile.contactName || "",
      customerCompany: company,
      customerEmail: profile.email || decoded.email || "",
      customerPhone: profile.phone || "",
      poNumber: String(header.poNumber || "").trim(),
      deliveryAddress: String(header.deliveryAddress || "").trim(),
      requiredByDate: header.requiredByDate || "",
      tier,
      priority,
      deliveryMethod,
      deliveryFeePct: 0,
      deliveryFeeAmount: totals.deliveryFee,
      // Server-computed. The client's figure is ignored entirely.
      orderSubtotalExVat: totals.beforeVat,
      orderVat: totals.vat,
      orderTotalIncVat: totals.total,
      // Which rate we actually charged, and whether we matched a real customer
      // record. If matchedCustomer is false we billed the public anchor rate —
      // worth an operator eyeballing before invoicing.
      ratePerCm2: ratePerCm2 ?? null,
      matchedCustomer: !!customer,
      status: "submitted",
      paymentTerms,
      paymentStatus: paymentTerms === "po" ? "on_account" : "unpaid",
      poDocument: poDocument || null,
      source: "portal",
      demo: PORTAL_DEMO_MODE,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      jobIds: [],
    });

    // ─── 6. ONE JOB PER PLATE LINE, MIS-compatible schema ────────────────
    // NOT one per colour. A plate line is one piece of artwork, so it is one
    // FA job, and the colours ticked on it are that job's colours and plates.
    // lib/order-jobs.mjs holds the rule and the reason. Cam 2026-10-26.
    const plannedJobs = jobsForOrder(
      lineItems,
      lineItems.map((li) => {
        const plateType = PLATE_TYPES.find((p) => p.id === li.plateTypeId);
        return `${plateType.name} ${li.widthCm}x${li.heightCm}cm`;
      })
    );

    const createdJobs = [];
    for (let lineIdx = 0; lineIdx < lineItems.length; lineIdx++) {
      const li = lineItems[lineIdx];
      const planned = plannedJobs[lineIdx];
      const plateType = PLATE_TYPES.find((p) => p.id === li.plateTypeId);
      // The rate we actually charge for this line's plate type. Crystal is the
      // flat premium rate; everything else is the customer's rate. Stored on
      // the job so MIS shows the real sell rate, not the account base.
      const jobRate = tierRateFor(li.plateTypeId, ratePerCm2);

      // The client already uploaded the PDF under jobs/{preAllocatedJobId}/…
      // Reuse that id so the storage path still matches.
      const pdfMeta = li.pdfMeta || null;
      const preAllocatedJobId = li.preAllocatedJobId || null;

      const jobNumberInt = await nextNumber(adminDb, jobCounter);
      const jobName = formatJobNumber(jobNumberInt);

      let jobRef = preAllocatedJobId
        ? adminDb.collection("jobs").doc(preAllocatedJobId)
        : adminDb.collection("jobs").doc();

      const jobData = {
        jobName,
        jobNumberInt,
        stage: "artwork",
        priority,
        customer: company || profile.contactName || "Portal customer",
        printer: "",
        description: planned.description,
        dueDate: header.requiredByDate || "",
        plateThickness: plateType.thicknessMm.toFixed(2) + " mm",
        screenRuling: li.screenRuling || "",
        material: SUBSTRATE_OPTIONS.find((s) => s.id === li.substrate)?.label || "",
        bagType: "",
        cylinder: li.cylinderSize || "",
        plateDistortion: "",
        printDirection: "",
        printSide: li.printSide
          ? li.printSide.charAt(0).toUpperCase() + li.printSide.slice(1)
          : "",
        inkType: li.inkType || "",
        // The PRINT size, what runs on press. Deliberately NOT the plate
        // size: the plates list below carries the bigger trimmed plate.
        widthMm: String(Number(li.widthCm) * 10),
        pitchMm: String(Number(li.heightCm) * 10),
        across: "",
        around: "",
        barcode: "",
        // Every colour on this line, in printing order.
        colours: planned.colours,
        sellRate: jobRate ?? null,
        totalSell: 0,
        totalCost: 0,
        margin: null,
        invoiceNumber: "",
        invoiced: false,
        paid: false,
        // One plate row per ticked colour.
        plates: planned.plates.map((plate) => ({
          colour: plate.colour,
          width: plate.width,
          length: plate.length,
          active: plate.active,
        })),
        revisions: [],
        reproServices: [],
        legacy: false,
        historical: false,

        source: "portal",
        demo: PORTAL_DEMO_MODE,
        orderId: orderRef.id,
        orderNumber,
        customerUid: decoded.uid,
        customerCompany: company,
        customerContactName: profile.contactName || "",
        customerEmail: profile.email || decoded.email || "",
        plateTier: plateType.tier,
        plateTypeId: plateType.id,
        plateTypeName: plateType.name,
        portalQty: Number(li.qty) || 1,
        portalWidthCm: Number(li.widthCm),
        portalHeightCm: Number(li.heightCm),
        portalSubstrate: li.substrate || "",
        // Lists now, because one job covers every colour on the line. The two
        // older singular fields are kept and filled with the WHOLE list joined
        // up, so anything still reading them shows all the colours instead of
        // only the first one.
        portalColourKeys: planned.colourKeys,
        portalColourLabels: planned.colours,
        portalColourKey: planned.colourKeys.join(","),
        portalColourLabel: planned.colours.join(", "),
        portalPlateCount: planned.plates.length,
        portalCustomerDescription: li.description || "",

        // Delivery / order context denormalised onto the job so MIS operators
        // see it without opening the order. deliveryAddress + deliveryMethod
        // live on the order doc; the job schema has no delivery field of its
        // own (MIS captures "Deliver To" at delivery-note time), so we mirror
        // it here. Collection orders carry an explicit human-readable summary.
        portalDeliveryMethod: deliveryMethod,
        portalDeliveryAddress:
          deliveryMethod === "collection"
            ? ""
            : String(header.deliveryAddress || "").trim(),
        portalDeliverySummary:
          deliveryMethod === "collection"
            ? "Customer to collect"
            : String(header.deliveryAddress || "").trim() ||
              "Delivery — no address supplied",
        portalRequiredByDate: header.requiredByDate || "",
        portalPoNumber: String(header.poNumber || "").trim(),
        portalPaymentTerms: paymentTerms,

        pdfUrls: pdfMeta ? [pdfMeta] : [],

        createdBy: decoded.uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      // Use create() (never set()) so a client-supplied preAllocatedJobId can
      // never OVERWRITE an existing job doc. A freshly pre-allocated id can't
      // collide; if it does, the id was not ours (e.g. someone else's job) —
      // fall back to a new server-generated id instead of clobbering it.
      try {
        await jobRef.create(jobData);
      } catch (e) {
        jobRef = adminDb.collection("jobs").doc();
        await jobRef.create(jobData);
      }

      createdJobs.push({
        jobId: jobRef.id,
        jobName,
        jobNumberInt,
        colourLabel: planned.colours.join(", "),
        colours: planned.colours,
        plateCount: planned.plates.length,
      });
    }

    return NextResponse.json({
      orderId: orderRef.id,
      orderNumber,
      jobs: createdJobs,
      total: totals.total,
      paymentTerms,
    });
  } catch (err) {
    console.error("orders/create error:", err);
    return NextResponse.json({ error: "Could not place order" }, { status: 500 });
  }
}

/** Atomic counter increment using the admin SDK. */
async function nextNumber(adminDb, counterKey) {
  const ref = adminDb.collection("counters").doc(counterKey);
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? snap.data().value || 0 : 0;
    const next = current + 1;
    tx.set(ref, { value: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return next;
  });
}
