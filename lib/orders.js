// Order and job creation for the customer portal.
// Mirrors the MIS schema so portal-created jobs slot into the existing dashboard.

import {
  addDoc,
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { PLATE_TYPES, SUBSTRATE_OPTIONS } from "./plate-types";
import { uploadJobPdf } from "./storage";

// Atomic increment of /counters/{key}, returns the new value.
export async function nextNumber(counterKey) {
  const ref = doc(db, "counters", counterKey);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists() ? snap.data().value || 0 : 0;
    const next = current + 1;
    tx.set(
      ref,
      { value: next, updatedAt: serverTimestamp() },
      { merge: true }
    );
    return next;
  });
}

export function formatJobNumber(n) {
  return "FA" + String(n).padStart(6, "0");
}

export function formatOrderNumber(n) {
  return "FAO" + String(n).padStart(6, "0");
}

// Create an order from the portal Place Order form.
// One Order doc plus N Job docs (one per line item).
// Jobs use the MIS schema so they appear correctly in jobs.flexoafrica.com.
export async function createOrderFromPortal({ profile, header, lineItems }) {
  if (!profile?.uid) throw new Error("Not signed in");
  if (!lineItems?.length) throw new Error("Add at least one plate");

  // Allocate a human-friendly order number.
  const orderNumberInt = await nextNumber("orderNumber");
  const orderNumber = formatOrderNumber(orderNumberInt);
  const tier = header.tier === "express" ? "express" : "standard";
  const priority = tier === "express" ? "rush" : "normal";

  // 1) Create the order header.
  const orderRef = await addDoc(collection(db, "orders"), {
    orderNumber,
    orderNumberInt,
    customerUid: profile.uid,
    customerName: profile.contactName || "",
    customerCompany: profile.company || "",
    customerEmail: profile.email || "",
    customerPhone: profile.phone || "",
    poNumber: header.poNumber || "",
    deliveryAddress: header.deliveryAddress || "",
    requiredByDate: header.requiredByDate || "",
    tier,
    priority,
    status: "submitted",
    source: "portal",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    jobIds: [],
  });

  // 2) Create one Job per line item, MIS-compatible schema.
  // We pre-allocate the job docId so we can upload the PDF to /jobs/{jobId}/
  // BEFORE the doc is created, then setDoc once with pdfUrls already populated.
  // Firestore rules forbid customers from updating /jobs after creation.
  const createdJobs = [];
  for (const li of lineItems) {
    const plateType = PLATE_TYPES.find((p) => p.id === li.plateTypeId);
    if (!plateType) throw new Error("Invalid plate type: " + li.plateTypeId);

    const jobNumberInt = await nextNumber("jobNumber");
    const jobName = formatJobNumber(jobNumberInt);

    // Pre-allocate the job doc reference (no write yet).
    const jobRef = doc(collection(db, "jobs"));

    // Upload PDF first if provided. Storage path scoped to the future jobId.
    let pdfMeta = null;
    if (li.pdfFile) {
      pdfMeta = await uploadJobPdf({ jobId: jobRef.id, file: li.pdfFile });
    }

    // Create the job doc with pdfUrls pre-filled.
    await setDoc(jobRef, {
      // ----- MIS-shared schema -----
      jobName,
      jobNumberInt,
      stage: "artwork",
      priority,
      customer: profile.company || profile.contactName || "Portal customer",
      printer: "",
      description:
        li.specialInstructions ||
        `${plateType.name} ${li.widthCm}x${li.heightCm}cm x ${li.qty}`,
      dueDate: header.requiredByDate || "",
      // print spec
      plateThickness: plateType.thicknessMm.toFixed(2) + " mm",
      screenRuling: "",
      material:
        SUBSTRATE_OPTIONS.find((s) => s.id === li.substrate)?.label || "",
      bagType: "",
      cylinder: "",
      plateDistortion: "",
      printDirection: "",
      printSide: "",
      widthMm: String(Number(li.widthCm) * 10),
      pitchMm: String(Number(li.heightCm) * 10),
      across: "",
      around: "",
      barcode: "",
      colours: [],
      // money
      sellRate: null,
      totalSell: 0,
      totalCost: 0,
      margin: null,
      invoiceNumber: "",
      invoiced: false,
      paid: false,
      // collections
      plates: [
        {
          colour: "",
          width: Number(li.widthCm) * 10,
          length: Number(li.heightCm) * 10,
          active: true,
        },
      ],
      revisions: [],
      reproServices: [],
      legacy: false,
      historical: false,

      // ----- Portal extension fields -----
      source: "portal",
      orderId: orderRef.id,
      orderNumber,
      customerUid: profile.uid,
      customerCompany: profile.company || "",
      customerContactName: profile.contactName || "",
      customerEmail: profile.email || "",
      plateTier: plateType.tier,
      plateTypeId: plateType.id,
      plateTypeName: plateType.name,
      portalQty: Number(li.qty),
      portalWidthCm: Number(li.widthCm),
      portalHeightCm: Number(li.heightCm),
      portalSubstrate: li.substrate || "",

      // PDF URLs (pre-uploaded above, attached at create time)
      pdfUrls: pdfMeta ? [pdfMeta] : [],

      createdBy: profile.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    createdJobs.push({
      jobId: jobRef.id,
      jobName,
      jobNumberInt,
    });
  }

  // We do NOT backfill jobIds onto the order. Firestore rules forbid
  // customers from updating orders (operator-only). The success page and any
  // operator query can find the jobs via /jobs where orderId == orderRef.id.

  return {
    orderId: orderRef.id,
    orderNumber,
    jobs: createdJobs,
  };
}
