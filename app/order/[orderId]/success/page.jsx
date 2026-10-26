"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/AuthProvider";
import { READ_ONLY_MESSAGE, isStaff } from "@/lib/staff-view.mjs";

// Next.js 14 requires useSearchParams to be inside a Suspense boundary.
export default function OrderSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-page mx-auto px-4 sm:px-6 py-20 text-center text-brand-600">
          Loading...
        </div>
      }
    >
      <OrderSuccessPageInner />
    </Suspense>
  );
}

function OrderSuccessPageInner() {
  const { orderId } = useParams();
  const searchParams = useSearchParams();
  const returnedFromPayFast = searchParams.get("paid") === "1";

  const { user, profile, loading } = useAuth();
  const [order, setOrder] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loadErr, setLoadErr] = useState(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState(null);
  const payFormRef = useRef(null);

  // LIVE listener on the order (replaces one-shot getDoc so payment status updates live)
  useEffect(() => {
    if (loading || !orderId || !user) return;
    const unsub = onSnapshot(
      doc(db, "orders", orderId),
      (snap) => {
        if (!snap.exists()) {
          setLoadErr("Order not found.");
          return;
        }
        setOrder({ id: snap.id, ...snap.data() });
      },
      (err) => {
        console.error("order listen error", err);
        setLoadErr(err?.message || "Could not load order.");
      }
    );
    return unsub;
  }, [orderId, user, loading]);

  // LIVE listener on the jobs in this order so the analysis status + preview
  // thumbnail update as the Cloud Function writes back.
  useEffect(() => {
    if (loading || !orderId || !user) return;
    const q = query(
      collection(db, "jobs"),
      where("orderId", "==", orderId),
      where("customerUid", "==", user.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const arr = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.jobNumberInt || 0) - (b.jobNumberInt || 0));
        setJobs(arr);
      },
      (err) => {
        console.error("jobs listen error", err);
        setLoadErr(err?.message || "Could not load jobs.");
      }
    );
    return unsub;
  }, [orderId, user, loading]);

  async function handlePayNow() {
    if (!order || paying) return;
    // Staff looking at the portal never start a card payment. The server
    // refuses anyone who did not place the order as well.
    if (isStaff(profile)) {
      setPayError(READ_ONLY_MESSAGE);
      return;
    }
    setPaying(true);
    setPayError(null);

    try {
      // The checkout route is authenticated and derives the amount + payer from
      // the order doc server-side, so we only need to send the order id + token.
      const token = await user.getIdToken();
      const res = await fetch("/api/payfast/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orderId: order.id }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Checkout request failed");
      }

      const { action, fields } = await res.json();

      // Build a hidden form and auto-submit to PayFast
      const form = document.createElement("form");
      form.method = "POST";
      form.action = action;

      Object.entries(fields).forEach(([name, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        form.appendChild(input);
      });

      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      console.error("Pay Now error:", err);
      setPayError(err.message || "Something went wrong. Please try again.");
      setPaying(false);
    }
  }

  if (loading || !user) {
    return (
      <div className="max-w-page mx-auto px-4 sm:px-6 py-20 text-center text-brand-600">
        Loading...
      </div>
    );
  }

  if (loadErr) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-20 text-center">
        <h1 className="text-3xl font-bold text-brand-900">
          Could not load order
        </h1>
        <p className="mt-2 text-brand-700">{loadErr}</p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block px-4 py-2 bg-brand-700 hover:bg-brand-800 text-white font-medium rounded-md"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-page mx-auto px-4 sm:px-6 py-20 text-center text-brand-600">
        Loading order...
      </div>
    );
  }

  // Aggregate analysis status for the summary banner. Only jobs that actually
  // have an uploaded PDF can be analysed — a no-PDF order (e.g. API-created)
  // never triggers the analyser, so it must NOT count as "analysing" or the
  // banner spins forever. Cam 2026-07-28.
  const previewableJobs = jobs.filter(
    (j) => Array.isArray(j.pdfUrls) && j.pdfUrls.length > 0
  );
  const anyAnalyzing = previewableJobs.some(
    (j) =>
      !j.analysisStatus ||
      j.analysisStatus === "received" ||
      j.analysisStatus === "analyzing"
  );
  const allComplete =
    previewableJobs.length > 0 &&
    previewableJobs.every((j) => j.analysisStatus === "complete");
  const anyFailed = previewableJobs.some((j) => j.analysisStatus === "failed");

  const isPaid = order.paymentStatus === "paid";
  // ITN flagged a discrepancy (typically amount mismatch). Don't show
  // the Pay Now button again — we want the customer to talk to us first
  // so we can reconcile before any retry.
  const isUnderReview = order.paymentStatus === "amount_mismatch";
  // Account customers (PO-approved) never pay by card — they supplied a PO
  // number + document at checkout and are invoiced against it. Showing them a
  // Pay Now button would be wrong and would double-charge. Cam 2026-07-14.
  const isOnAccount =
    order.paymentTerms === "po" || order.paymentStatus === "on_account";
  const awaitingConfirmation =
    returnedFromPayFast && !isPaid && !isUnderReview && !isOnAccount;

  return (
    <>
      <section className="bg-gradient-to-br from-brand-50 via-white to-brand-100 border-b border-brand-100">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-50 text-green-600 mb-5 text-2xl">
            ✓
          </div>
          <p className="text-accent-500 font-semibold text-sm uppercase tracking-wider mb-2">
            Order placed
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-brand-900">
            {order.orderNumber}
          </h1>
          <p className="mt-3 text-brand-700">
            Your order is in our queue. We make plates directly from your
            uploaded PDF and ship them to you. Track every stage in your
            dashboard.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/dashboard"
              className="px-5 py-3 bg-brand-700 hover:bg-brand-800 text-white font-medium rounded-md"
            >
              Go to dashboard
            </Link>
            <Link
              href="/order"
              className="px-5 py-3 bg-white border border-brand-200 hover:bg-brand-50 text-brand-800 font-medium rounded-md"
            >
              Place another order
            </Link>
          </div>
        </div>
      </section>

      {/* Payment banner */}
      <section className="border-b border-brand-100">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
          {isOnAccount ? (
            <div className="rounded-xl border border-green-200 bg-green-50 p-5 flex items-start gap-4">
              <span className="text-green-600 text-2xl flex-shrink-0">✓</span>
              <div>
                <p className="font-semibold text-green-900">
                  On account — no payment needed
                </p>
                <p className="text-sm text-green-800 mt-0.5">
                  Your company is approved to order on a purchase order.
                  {order.poNumber ? (
                    <>
                      {" "}
                      We&apos;ve logged this order against PO{" "}
                      <span className="font-semibold">{order.poNumber}</span>
                      {order.poDocument?.fileName ? (
                        <> and received your PO document.</>
                      ) : (
                        <>.</>
                      )}
                    </>
                  ) : null}{" "}
                  We&apos;ll invoice you against it. Order total:{" "}
                  <span className="font-semibold">
                    R{Number(order.orderTotalIncVat || 0).toFixed(2)} incl. VAT
                  </span>
                  .
                </p>
              </div>
            </div>
          ) : isPaid ? (
            <div className="rounded-xl border border-green-200 bg-green-50 p-5 flex items-center gap-4">
              <span className="text-green-600 text-2xl flex-shrink-0">✓</span>
              <div>
                <p className="font-semibold text-green-900">Payment received</p>
                <p className="text-sm text-green-800 mt-0.5">
                  Thank you! Your payment has been confirmed. We will start
                  processing your plates shortly.
                </p>
              </div>
            </div>
          ) : isUnderReview ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-4">
              <span className="text-amber-600 text-2xl flex-shrink-0">!</span>
              <div>
                <p className="font-semibold text-amber-900">
                  Payment under review
                </p>
                <p className="text-sm text-amber-800 mt-0.5">
                  We received a notification from PayFast but the amount
                  doesn&apos;t match this order. Our team is reconciling and
                  will be in touch shortly. No need to retry the payment
                  while this is being checked.
                </p>
              </div>
            </div>
          ) : awaitingConfirmation ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 flex items-center gap-4">
              <Spinner className="text-amber-600" />
              <div>
                <p className="font-semibold text-amber-900">
                  Confirming your payment...
                </p>
                <p className="text-sm text-amber-800 mt-0.5">
                  This usually takes a few seconds. This page will update
                  automatically.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-brand-200 bg-white p-5">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-semibold text-brand-900">
                    Payment outstanding
                  </p>
                  <p className="text-sm text-brand-600 mt-0.5">
                    Order total:{" "}
                    <span className="font-semibold text-brand-900">
                      R{Number(order.orderTotalIncVat || 0).toFixed(2)} incl. VAT
                    </span>
                  </p>
                  {payError && (
                    <p className="text-sm text-red-600 mt-1">{payError}</p>
                  )}
                </div>
                <button
                  onClick={handlePayNow}
                  disabled={paying}
                  className="flex items-center gap-2 px-5 py-3 bg-accent-500 hover:bg-accent-600 disabled:opacity-60 text-white font-semibold rounded-md transition-colors"
                >
                  {paying ? (
                    <>
                      <Spinner />
                      Redirecting...
                    </>
                  ) : (
                    "Pay Now"
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Artwork analysis banner — only when there's a PDF to analyse. */}
      {previewableJobs.length > 0 && (
        <section className="border-b border-brand-100">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
            <div
              className={
                "rounded-xl border p-4 flex items-center gap-3 " +
                (anyFailed
                  ? "bg-red-50 border-red-200"
                  : anyAnalyzing
                  ? "bg-amber-50 border-amber-200"
                  : "bg-green-50 border-green-200")
              }
            >
              {anyAnalyzing ? (
                <Spinner />
              ) : anyFailed ? (
                <span className="text-red-600 text-lg">!</span>
              ) : (
                <span className="text-green-600 text-lg">✓</span>
              )}
              <div className="text-sm">
                {anyAnalyzing && (
                  <>
                    <span className="font-semibold text-amber-900">
                      Analysing your artwork...
                    </span>
                    <span className="text-amber-800 ml-1">
                      Composite previews ready in about a minute. We'll also
                      email you when each plate is ready.
                    </span>
                  </>
                )}
                {allComplete && (
                  <>
                    <span className="font-semibold text-green-900">
                      Artwork analysed.
                    </span>
                    <span className="text-green-800 ml-1">
                      Review your composite previews below. A confirmation
                      email is on its way.
                    </span>
                  </>
                )}
                {anyFailed && !anyAnalyzing && (
                  <>
                    <span className="font-semibold text-red-900">
                      One or more PDFs could not be analysed.
                    </span>
                    <span className="text-red-800 ml-1">
                      The order is still placed. Our team will follow up.
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      <section>
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
          <h2 className="text-xl font-bold text-brand-900">
            Review your artwork
          </h2>
          <p className="mt-1 text-sm text-brand-600">
            One composite preview per plate. This is what your PDF will look
            like when we plate it.
          </p>
          <div className="mt-4 space-y-4">
            {jobs.map((j) => (
              <JobReviewCard key={j.id} job={j} />
            ))}
          </div>

          <div className="mt-8 grid sm:grid-cols-2 gap-4 text-sm">
            <Detail label="PO number" value={order.poNumber || "Not provided"} />
            <Detail
              label="Required by"
              value={order.requiredByDate || "Not specified"}
            />
            <Detail
              label="Turnaround"
              value={order.tier === "express" ? "Express" : "Standard"}
            />
            <Detail label="Plates" value={String(jobs.length)} />
          </div>
        </div>
      </section>
    </>
  );
}

function JobReviewCard({ job }) {
  const status = job.analysisStatus || "received";
  const previewUrl = job.previewUrl;
  // A job can only get a composite preview if a PDF was uploaded for it. A
  // no-PDF order never fires the analyser Cloud Function, so its status stays
  // "received" forever — show a calm empty state, not an endless spinner.
  const hasPdf = Array.isArray(job.pdfUrls) && job.pdfUrls.length > 0;
  const inProgress = hasPdf && status !== "complete" && status !== "failed";

  // Timeout fallback: if the composite hasn't landed in ~90s, stop spinning
  // and reassure the customer (the render may be slow or the function may have
  // hiccuped; they still get an email when it's ready). Cam 2026-07-28.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!inProgress) {
      setTimedOut(false);
      return;
    }
    const t = setTimeout(() => setTimedOut(true), 90000);
    return () => clearTimeout(t);
  }, [inProgress]);

  return (
    <div className="bg-white rounded-xl border border-brand-100 overflow-hidden">
      <div className="p-4 flex items-start justify-between gap-3 border-b border-brand-100">
        <div>
          <div className="font-mono text-brand-800">{job.jobName}</div>
          <div className="text-sm text-brand-600">
            {job.plateTypeName || job.description}
          </div>
          <div className="text-xs text-brand-500 mt-1">
            {job.portalWidthCm} x {job.portalHeightCm} cm, qty {job.portalQty}
          </div>
        </div>
        <StatusChip status={status} stage={job.stage} />
      </div>

      <div className="p-4 bg-brand-50/50">
        {status === "complete" && previewUrl ? (
          <div>
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <img
                src={previewUrl}
                alt={`Composite preview for ${job.jobName}`}
                className="w-full max-h-96 object-contain rounded-md border border-brand-100 bg-white"
              />
            </a>
            <div className="mt-2 text-xs text-brand-500 text-center">
              Click to view full size
            </div>
          </div>
        ) : status === "failed" ? (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
            We couldn't generate a preview from this PDF. Our team will check
            the artwork and follow up.
            {job.analysisError && (
              <div className="mt-1 text-xs text-red-600 font-mono">
                {job.analysisError}
              </div>
            )}
          </div>
        ) : !hasPdf ? (
          <div className="text-sm text-brand-600 bg-white border border-brand-100 rounded-md p-3">
            No artwork preview for this plate — no PDF was uploaded with the
            order. Your order is still placed and our team has the details.
          </div>
        ) : timedOut ? (
          <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3 flex items-start gap-3">
            <span className="text-amber-600 text-lg leading-none">⏳</span>
            <span>
              Still processing your preview. This one is taking a little longer
              than usual — no need to wait here. We'll email you the moment it's
              ready, and it'll appear in your dashboard.
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-sm text-brand-600">
            <Spinner />
            Generating composite preview...
          </div>
        )}
      </div>
    </div>
  );
}

function StatusChip({ status, stage }) {
  const map = {
    received: { label: "Received", color: "bg-brand-100 text-brand-700" },
    analyzing: { label: "Analysing", color: "bg-amber-100 text-amber-800" },
    complete: { label: "Preview ready", color: "bg-green-100 text-green-800" },
    failed: { label: "Needs review", color: "bg-red-100 text-red-800" },
  };
  const chip = map[status] || map.received;
  return (
    <div className="flex flex-col items-end gap-1">
      <span
        className={
          "text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded-md " +
          chip.color
        }
      >
        {chip.label}
      </span>
      {stage && (
        <span className="text-[10px] uppercase tracking-wider text-brand-500">
          Stage: {stage}
        </span>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block h-4 w-4 border-2 border-current border-r-transparent rounded-full animate-spin flex-shrink-0"
      role="status"
      aria-label="Loading"
    />
  );
}

function Detail({ label, value }) {
  return (
    <div className="bg-brand-50 rounded-lg border border-brand-100 p-3">
      <div className="text-xs uppercase tracking-wider text-brand-500">
        {label}
      </div>
      <div className="mt-1 font-medium text-brand-900">{value}</div>
    </div>
  );
}
