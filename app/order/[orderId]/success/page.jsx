"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/AuthProvider";

export default function OrderSuccessPage() {
  const { orderId } = useParams();
  const { user, profile, loading } = useAuth();
  const [order, setOrder] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loadErr, setLoadErr] = useState(null);

  useEffect(() => {
    if (loading || !orderId || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const orderSnap = await getDoc(doc(db, "orders", orderId));
        if (!orderSnap.exists()) {
          if (!cancelled) setLoadErr("Order not found.");
          return;
        }
        const orderData = { id: orderSnap.id, ...orderSnap.data() };
        // Include customerUid in the query so Firestore rules can statically
        // verify the customer is querying their own jobs only.
        const jobsSnap = await getDocs(
          query(
            collection(db, "jobs"),
            where("orderId", "==", orderId),
            where("customerUid", "==", user.uid)
          )
        );
        const jobsData = jobsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.jobNumberInt || 0) - (b.jobNumberInt || 0));
        if (!cancelled) {
          setOrder(orderData);
          setJobs(jobsData);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setLoadErr(err?.message || "Could not load order.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, user, loading]);

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

  return (
    <>
      <section className="bg-gradient-to-br from-brand-50 via-white to-brand-100 border-b border-brand-100">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-50 text-green-600 mb-5 text-2xl">
            v
          </div>
          <p className="text-accent-500 font-semibold text-sm uppercase tracking-wider mb-2">
            Order placed
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-brand-900">
            {order.orderNumber}
          </h1>
          <p className="mt-3 text-brand-700">
            Your order is in our queue. Our repro team will prepare your
            artwork and email you a proof for approval. You can track every
            stage in your dashboard.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/dashboard"
              className="px-5 py-3 bg-brand-700 hover:bg-brand-800 text-white font-medium rounded-md"
            >
              Go to dashboard
            </Link>
            <Link
              href="/order/new"
              className="px-5 py-3 bg-white border border-brand-200 hover:bg-brand-50 text-brand-800 font-medium rounded-md"
            >
              Place another order
            </Link>
          </div>
        </div>
      </section>

      <section>
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
          <h2 className="text-xl font-bold text-brand-900">
            Plates in this order
          </h2>
          <div className="mt-4 bg-white rounded-xl border border-brand-100 divide-y divide-brand-100">
            {jobs.map((j) => (
              <div key={j.id} className="p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="font-mono text-brand-800">{j.jobName}</div>
                  <div className="text-sm text-brand-600">
                    {j.plateTypeName || j.description}
                  </div>
                  <div className="text-xs text-brand-500 mt-1">
                    {j.portalWidthCm} x {j.portalHeightCm} cm, qty {j.portalQty}
                  </div>
                </div>
                <span className="text-xs uppercase tracking-wider px-2 py-1 rounded-md bg-brand-100 text-brand-700">
                  {j.stage || "artwork"}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-8 grid sm:grid-cols-2 gap-4 text-sm">
            <Detail label="PO number" value={order.poNumber || "Not provided"} />
            <Detail
              label="Required by"
              value={order.requiredByDate || "Not specified"}
            />
            <Detail label="Turnaround" value={order.tier === "express" ? "Express" : "Standard"} />
            <Detail label="Plates" value={String(jobs.length)} />
          </div>
        </div>
      </section>
    </>
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
