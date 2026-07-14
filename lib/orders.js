// Order placement from the customer portal — CLIENT SIDE.
//
// This module no longer writes orders or jobs to Firestore. As of 2026-07-14
// all of that happens in POST /api/orders/create, server-side, with admin
// credentials.
//
// WHY: the browser used to compute the order total and write it straight to
// Firestore. Since the PayFast ITN cross-checks the payment against
// `orderTotalIncVat`, and that field came from the client, a customer could
// place a R5,000 order priced at R1.00 and legitimately "pay in full". They
// could also set paymentTerms:"po" and skip payment altogether. The rate card
// itself was being read into the browser too.
//
// The client's only remaining job is to upload the customer's own files
// (artwork PDFs + the PO document) to Storage and hand the references to the
// server. Everything that determines what they pay — company, rate, PO terms,
// totals, order/job numbers — is resolved and recomputed server-side from the
// MIS register, and the client's figures are ignored.

import { collection, doc } from "firebase/firestore";
import { db } from "./firebase";
import { uploadJobPdf, uploadPurchaseOrder } from "./storage";

export {
  PORTAL_DEMO_MODE,
  formatOrderNumber,
  formatJobNumber,
} from "./order-format";

/**
 * Place an order.
 *
 * @param {object}  profile   the signed-in user's profile (needs .uid)
 * @param {object}  header    poNumber, deliveryAddress, requiredByDate, tier,
 *                            deliveryMethod
 * @param {Array}   lineItems the plate line items from the order form
 * @param {File?}   poFile    purchase order document (PO-approved companies)
 * @param {object}  auth      the firebase User (for getIdToken)
 * @returns {{orderId: string, orderNumber: string, jobs: Array, total: number,
 *           paymentTerms: "po"|"prepaid"}}
 */
export async function createOrderFromPortal({
  profile,
  header,
  lineItems,
  poFile,
  user,
}) {
  if (!user) throw new Error("Not signed in");
  if (!lineItems?.length) throw new Error("Add at least one plate");

  // 1) Upload the PO document, if the customer attached one. The server
  //    decides whether it was actually REQUIRED — we just carry it up.
  let poDocument = null;
  if (poFile) {
    poDocument = await uploadPurchaseOrder({ uid: profile.uid, file: poFile });
  }

  // 2) Upload each line item's artwork PDF. We pre-allocate the job id here so
  //    the storage path (jobs/{jobId}/…) matches the id the server will use for
  //    that line item's first plate.
  const payloadLineItems = [];
  for (const li of lineItems) {
    let pdfMeta = null;
    let preAllocatedJobId = null;
    if (li.pdfFile) {
      preAllocatedJobId = doc(collection(db, "jobs")).id;
      pdfMeta = await uploadJobPdf({ jobId: preAllocatedJobId, file: li.pdfFile });
    }
    // Strip the File object — it can't be JSON-serialised and the server
    // doesn't need it now that the bytes are in Storage.
    const { pdfFile, ...rest } = li;
    payloadLineItems.push({ ...rest, pdfMeta, preAllocatedJobId });
  }

  // 3) Hand it to the server, which prices and writes it.
  const token = await user.getIdToken();
  const res = await fetch("/api/orders/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      header,
      lineItems: payloadLineItems,
      poDocument,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not place order. Please try again.");
  }

  return res.json();
}
