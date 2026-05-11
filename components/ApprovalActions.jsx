"use client";

import { useState } from "react";
import { submitApproval } from "@/lib/approvals";
import { useAuth } from "./AuthProvider";

// Shown only when job.stage === "pdf_sent".
// Customer can Approve (continues to FA PO) or Reject (loops back to Artwork).
export default function ApprovalActions({ job }) {
  const { profile } = useAuth();
  const [state, setState] = useState({ status: "idle", message: "" });
  const [note, setNote] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);

  async function handleApprove() {
    if (!confirm("Approve this proof? We'll proceed to plate ordering.")) return;
    setState({ status: "submitting", message: "" });
    try {
      await submitApproval({
        jobId: job.id,
        jobName: job.jobName,
        decision: "approve",
        note: "",
        profile,
      });
      setState({
        status: "success",
        message: "Approved. We've notified the team and will proceed to plate ordering.",
      });
    } catch (err) {
      setState({ status: "error", message: err.message || "Failed to submit." });
    }
  }

  async function handleReject() {
    if (!note.trim()) {
      setState({ status: "error", message: "Please tell us what to change." });
      return;
    }
    setState({ status: "submitting", message: "" });
    try {
      await submitApproval({
        jobId: job.id,
        jobName: job.jobName,
        decision: "reject",
        note: note.trim(),
        profile,
      });
      setState({
        status: "success",
        message: "Sent back to our team for revision. We'll send you a new proof shortly.",
      });
      setNote("");
      setShowRejectForm(false);
    } catch (err) {
      setState({ status: "error", message: err.message || "Failed to submit." });
    }
  }

  if (state.status === "success") {
    return (
      <div className="rounded-xl border border-logoGreen/30 bg-logoGreen/10 p-5">
        <div className="flex items-start gap-3">
          <CheckIcon />
          <div>
            <div className="font-semibold text-ink">Thanks. Submission received.</div>
            <p className="mt-1 text-sm text-ink-muted">{state.message}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-logoOrange/30 bg-logoOrange/5 p-6">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full bg-logoOrange/20 text-logoOrange">
          <BellIcon />
        </span>
        <div className="flex-1">
          <h3 className="font-semibold text-ink">Awaiting your approval</h3>
          <p className="mt-1 text-sm text-ink-muted">
            We've sent a proof. Please review the PDF(s) attached below, then approve or
            request changes.
          </p>

          {!showRejectForm && (
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={handleApprove}
                disabled={state.status === "submitting"}
                className="inline-flex items-center justify-center rounded-md bg-logoGreen px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
              >
                {state.status === "submitting" ? "Submitting..." : "Approve proof"}
              </button>
              <button
                onClick={() => setShowRejectForm(true)}
                className="inline-flex items-center justify-center rounded-md border border-ink/15 bg-white px-5 py-2.5 text-sm font-semibold text-ink hover:bg-brand-50"
              >
                Request changes
              </button>
            </div>
          )}

          {showRejectForm && (
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-sm font-medium text-ink">
                  What needs to change?
                </span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  placeholder="Tell us what to revise (e.g. colour adjustment, text correction, layout change)"
                  className="mt-2 w-full rounded-md border border-ink/15 bg-white px-4 py-3 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                />
              </label>
              <div className="flex gap-3">
                <button
                  onClick={handleReject}
                  disabled={state.status === "submitting"}
                  className="inline-flex items-center justify-center rounded-md bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-60"
                >
                  {state.status === "submitting" ? "Submitting..." : "Send back for changes"}
                </button>
                <button
                  onClick={() => {
                    setShowRejectForm(false);
                    setNote("");
                    setState({ status: "idle", message: "" });
                  }}
                  className="inline-flex items-center justify-center rounded-md px-5 py-2.5 text-sm font-medium text-ink-muted hover:text-ink"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {state.status === "error" && (
            <p className="mt-3 text-sm text-accent-600">{state.message}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      className="h-6 w-6 flex-none text-logoGreen"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 010 1.4l-7.4 7.4a1 1 0 01-1.4 0L3.3 9.5a1 1 0 011.4-1.4l3.9 3.9 6.7-6.7a1 1 0 011.4 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM7 16a3 3 0 006 0H7z" />
    </svg>
  );
}
