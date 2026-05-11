"use client";

import Link from "next/link";
import { STAGE_CHIP, getStage } from "@/lib/stages";
import { formatDate } from "@/lib/jobs";

// Compact job card for dashboard and list views.
// Shows job number, stage chip, description, due date, and a CTA.
export default function JobCard({ job }) {
  const stage = getStage(job.stage);
  const chipClass = STAGE_CHIP[job.stage] || "bg-brand-100 text-ink border-ink/10";
  const isUrgent = job.stage === "pdf_sent";
  const isRush = job.priority === "rush";

  return (
    <Link
      href={`/jobs/${job.id}`}
      className={`group block rounded-xl border bg-white p-5 shadow-card hover:shadow-cardHover transition-shadow ${
        isUrgent ? "border-logoOrange/40 ring-1 ring-logoOrange/20" : "border-ink/10"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-ink">{job.jobName || "—"}</span>
            {isRush && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-600">
                Rush
              </span>
            )}
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${chipClass}`}
            >
              {stage?.short || job.stage}
            </span>
          </div>
          <p className="mt-2 text-sm text-ink-muted line-clamp-2">
            {job.description || job.plateTypeName || "Plate order"}
          </p>
        </div>
        <ArrowRight className="text-ink-muted group-hover:text-accent-500 transition-colors flex-none mt-1" />
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-ink-muted">
        <div>
          {job.dueDate ? (
            <>
              Due <span className="text-ink font-medium">{formatDate(job.dueDate)}</span>
            </>
          ) : (
            <span>Created {formatDate(job.createdAt)}</span>
          )}
        </div>
        {job.plateTypeName && (
          <span className="truncate max-w-[50%]">{job.plateTypeName}</span>
        )}
      </div>

      {isUrgent && (
        <div className="mt-4 -mb-1 text-xs font-semibold text-logoOrange">
          → Review proof and approve
        </div>
      )}
    </Link>
  );
}

function ArrowRight({ className = "" }) {
  return (
    <svg
      className={`h-5 w-5 ${className}`}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 10h12M11 5l5 5-5 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
