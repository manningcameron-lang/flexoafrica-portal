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

// Convert a selectedColors map key into a human-readable plate colour label.
// "cmyk:C" -> "Cyan", "cmyk:K" -> "Black", "spot:PANTONE 156 C" -> "PANTONE 156 C".
function labelForColorKey(key) {
  if (!key) return "";
  if (key.startsWith("cmyk:")) {
    const ch = key.slice(5);
    return (
      { C: "Cyan", M: "Magenta", Y: "Yellow", K: "Black" }[ch] || ch
    );
  }
  if (key.startsWith("spot:")) return key.slice(5);
  return key;
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
    // Delivery vs collection. Stored so the MIS knows how to fulfil and so
    // we can re-display the breakdown on the order detail page.
    deliveryMethod: header.deliveryMethod || "delivery",
    deliveryFeePct: header.deliveryFeePct || 0,
    deliveryFeeAmount: header.deliveryFeeAmount || 0,
    orderTotalIncVat: header.orderTotalIncVat || 0,
    status: "submitted",
    paymentStatus: "unpaid",
    source: "portal",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    jobIds: [],
  });

  // 2) Create one Job per line item, MIS-compatible schema.
  // We pre-allocate the job docId so we can upload the PDF to /jobs/{jobId}/
  // BEFORE the doc is created, then setDoc once with pdfUrls already populated.
  // Firestore rules forbid customers from updating /jobs after creation.
  //
  // A single line item may produce MULTIPLE jobs — one per selected colour
  // from the customer's PDF analysis. All jobs from one line item share the
  // same PDF reference and dimensions; the colour name goes on each plate.
  const createdJobs = [];
  for (const li of lineItems) {
    const plateType = PLATE_TYPES.find((p) => p.id === li.plateTypeId);
    if (!plateType) throw new Error("Invalid plate type: " + li.plateTypeId);

    // Resolve the list of colours we'll create plates for.
    // Each ticked colour in selectedColors = one job.
    // If no colours selected (legacy / fallback), produce 1 plate with no colour.
    const sel = li.selectedColors || {};
    const colourKeys = Object.keys(sel).filter((k) => sel[k]);
    const platesToCreate = colourKeys.length > 0
      ? colourKeys.map((key) => ({ key, label: labelForColorKey(key) }))
      : [{ key: "", label: "" }];

    // Upload the PDF ONCE (per line item) to a fresh storage path. All plates
    // in this line item share this same PDF reference.
    let pdfMeta = null;
    let firstJobId = null;
    if (li.pdfFile) {
      // Use a pre-allocated job id as the "owner" of the PDF path so it
      // matches the storage rules. We use this id for the first plate below.
      firstJobId = doc(collection(db, "jobs")).id;
      pdfMeta = await uploadJobPdf({ jobId: firstJobId, file: li.pdfFile });
    }

    for (let plateIdx = 0; plateIdx < platesToCreate.length; plateIdx++) {
      const plate = platesToCreate[plateIdx];
      const jobNumberInt = await nextNumber("jobNumber");
      const jobName = formatJobNumber(jobNumberInt);

      // First job re-uses the pre-allocated id (so the PDF path matches).
      let jobRef;
      if (plateIdx === 0 && firstJobId) {
        jobRef = doc(collection(db, "jobs"), firstJobId);
      } else {
        jobRef = doc(collection(db, "jobs"));
      }

      const baseDesc =
        li.description ||
        li.specialInstructions ||
        `${plateType.name} ${li.widthCm}x${li.heightCm}cm`;
      const fullDesc = plate.label
        ? `${baseDesc} - ${plate.label}`
        : baseDesc;

      await setDoc(jobRef, {
        // ----- MIS-shared schema -----
        jobName,
        jobNumberInt,
        stage: "artwork",
        priority,
        customer: profile.company || profile.contactName || "Portal customer",
        printer: "",
        description: fullDesc,
        dueDate: header.requiredByDate || "",
        plateThickness: plateType.thicknessMm.toFixed(2) + " mm",
        screenRuling: li.screenRuling || "",
        material:
          SUBSTRATE_OPTIONS.find((s) => s.id === li.substrate)?.label || "",
        bagType: "",
        cylinder: li.cylinderSize || "",
        plateDistortion: "",
        printDirection: "",
        printSide: li.printSide
          ? li.printSide.charAt(0).toUpperCase() + li.printSide.slice(1)
          : "",
        inkType: li.inkType || "",
        widthMm: String(Number(li.widthCm) * 10),
        pitchMm: String(Number(li.heightCm) * 10),
        across: "",
        around: "",
        barcode: "",
        colours: plate.label ? [plate.label] : [],
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
            colour: plate.label || "",
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
        portalColourKey: plate.key,
        portalColourLabel: plate.label,
        portalCustomerDescription: li.description || "",

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
        colourLabel: plate.label,
      });
    }
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
