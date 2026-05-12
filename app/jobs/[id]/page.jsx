"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { subscribeJob, formatDate, formatDateTime } from "@/lib/jobs";
import { getStage, STAGE_CHIP } from "@/lib/stages";
import StatusTimeline from "@/components/StatusTimeline";
import ApprovalActions from "@/components/ApprovalActions";

export default function JobDetailPage() {
  const params = useParams();
  const jobId = params.id;
  const { user } = useAuth();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!jobId) return;
    setLoading(true);
    const unsub = subscribeJob(jobId, (j, err) => {
      if (err) {
        setError(err.message || "Failed to load job");
        setLoading(false);
        return;
      }
      // Belt-and-braces: even though Firestore rules scope this, double-check.
      if (j && user?.uid && j.customerUid && j.customerUid !== user.uid) {
        setError("This job belongs to another account.");
        setJob(null);
      } else {
        setJob(j);
      }
      setLoading(false);
    });
    return unsub;
  }, [jobId, user?.uid]);

  if (loading) {
    return (
      <div className="max-w-page mx-auto px-4 sm:px-6 py-10">
        <div className="rounded-xl border border-ink/10 bg-brand-50 p-10 text-center text-ink-muted">
          Loading job...
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="max-w-page mx-auto px-4 sm:px-6 py-10">
        <div className="rounded-xl border border-accent-500/30 bg-accent-50 p-6">
          <h2 className="text-lg font-semibold text-ink">Job not found</h2>
          <p className="mt-2 text-sm text-ink-muted">
            {error || "We couldn't find this job."}{" "}
            <Link href="/jobs" className="text-accent-600 font-semibold underline-offset-4 hover:underline">
              Back to My Jobs
            </Link>
          </p>
        </div>
      </div>
    );
  }

  const stage = getStage(job.stage);
  const chipClass = STAGE_CHIP[job.stage] || "";
  const isRush = job.priority === "rush";

  return (
    <div className="max-w-page mx-auto px-4 sm:px-6 py-10">
      {/* Breadcrumb */}
      <div className="text-sm text-ink-muted">
        <Link href="/dashboard" className="hover:text-ink">Dashboard</Link>
        <span className="mx-2">/</span>
        <Link href="/jobs" className="hover:text-ink">My Jobs</Link>
        <span className="mx-2">/</span>
        <span className="text-ink">{job.jobName}</span>
      </div>

      {/* Header */}
      <div className="mt-4 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight text-ink">
              {job.jobName}
            </h1>
            {isRush && (
              <span className="inline-flex items-center rounded-full bg-accent-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-accent-600">
                Rush
              </span>
            )}
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${chipClass}`}
            >
              {stage?.short || job.stage}
            </span>
          </div>
          <p className="mt-2 text-ink-muted">
            {job.description || job.plateTypeName || "Flexographic plate order"}
          </p>
        </div>

        <div className="text-sm text-ink-muted text-right">
          {job.orderNumber && (
            <div>
              Order <span className="font-semibold text-ink">{job.orderNumber}</span>
            </div>
          )}
          <div>Created {formatDate(job.createdAt)}</div>
          {job.updatedAt && <div>Updated {formatDate(job.updatedAt)}</div>}
        </div>
      </div>

      {/* Approval prompt at top if needed */}
      {job.stage === "pdf_sent" && (
        <div className="mt-8">
          <ApprovalActions job={job} />
        </div>
      )}

      {/* Two column layout */}
      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        {/* Status timeline */}
        <div className="lg:col-span-1">
          <div className="card p-6 sticky top-24">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-ink-muted mb-6">
              Status
            </h2>
            <StatusTimeline stage={job.stage} />
          </div>
        </div>

        {/* Right column: details, files, etc. */}
        <div className="lg:col-span-2 space-y-6">
          {/* Artwork preview (from the Cloud Function PDF analysis) */}
          <ArtworkPreviewCard job={job} />

          {/* Plate spec */}
          <DetailCard title="Plate spec">
            <DetailGrid>
              <DetailRow label="Plate type" value={job.plateTypeName} />
              <DetailRow label="Thickness" value={job.plateThickness} />
              <DetailRow
                label="Dimensions"
                value={
                  job.portalWidthCm && job.portalHeightCm
                    ? `${job.portalWidthCm} cm × ${job.portalHeightCm} cm`
                    : null
                }
              />
              <DetailRow label="Quantity" value={job.portalQty} />
              <DetailRow label="Substrate" value={job.portalSubstrate || job.material} />
              <DetailRow label="Due date" value={formatDate(job.dueDate)} />
            </DetailGrid>
          </DetailCard>

          {/* Files */}
          <DetailCard title="Files">
            {job.pdfUrls && job.pdfUrls.length > 0 ? (
              <ul className="divide-y divide-ink/10">
                {job.pdfUrls.map((f, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileIcon />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-ink truncate">
                          {f.name || `Document ${i + 1}`}
                        </div>
                        {f.uploadedAt && (
                          <div className="text-xs text-ink-muted">
                            Uploaded {formatDateTime(f.uploadedAt)}
                          </div>
                        )}
                      </div>
                    </div>
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-accent-600 hover:underline whitespace-nowrap"
                    >
                      Download
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">No files attached yet.</p>
            )}
          </DetailCard>

          {/* Invoicing */}
          {(job.invoiceNumber || job.invoiced) && (
            <DetailCard title="Invoice">
              <DetailGrid>
                <DetailRow label="Invoice number" value={job.invoiceNumber} />
                <DetailRow
                  label="Status"
                  value={
                    job.paid ? "Paid" : job.invoiced ? "Invoiced, awaiting payment" : ""
                  }
                  valueClass={job.paid ? "text-logoGreen font-semibold" : "text-logoOrange font-semibold"}
                />
              </DetailGrid>
            </DetailCard>
          )}

          {/* Revisions log */}
          {job.revisions && job.revisions.length > 0 && (
            <DetailCard title="Revisions">
              <ul className="space-y-3">
                {job.revisions.map((r, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 rounded-md bg-brand-50 px-4 py-3"
                  >
                    <div className="text-xs font-bold text-accent-500 mt-0.5">
                      v{i + 1}
                    </div>
                    <div className="flex-1 text-sm text-ink-muted">
                      {r.note || r.description || "Revision logged"}
                      {r.at && (
                        <div className="text-xs text-ink-muted/70 mt-1">
                          {formatDateTime(r.at)}
                          {r.artist && ` · ${r.artist}`}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </DetailCard>
          )}

          {/* Need help */}
          <div className="rounded-2xl bg-ink p-8 text-white">
            <h3 className="text-lg font-semibold">Question about this job?</h3>
            <p className="mt-1 text-sm text-white/80">
              The fastest way to reach us is WhatsApp. Quote job number{" "}
              <span className="font-semibold text-white">{job.jobName}</span>.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href={`https://wa.me/27645867535?text=${encodeURIComponent(
                  `Hi, I have a question about ${job.jobName}.`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-md bg-logoGreen px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
              >
                WhatsApp us
              </a>
              <a
                href={`mailto:sales@flexoafrica.com?subject=${encodeURIComponent(
                  `Query about ${job.jobName}`
                )}`}
                className="inline-flex items-center rounded-md border border-white/20 bg-transparent px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                Email us
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ArtworkPreviewCard({ job }) {
  // Only render the card if a PDF was uploaded — no point showing an empty
  // preview slot when the customer didn't supply artwork.
  const hasPdf = job.pdfUrls && job.pdfUrls.length > 0;
  if (!hasPdf) return null;

  const status = job.analysisStatus || "received";
  const previewUrl = job.previewUrl;

  return (
    <DetailCard title="Artwork preview">
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
              className="w-full max-h-[480px] object-contain rounded-md border border-ink/10 bg-white"
            />
          </a>
          <p className="mt-2 text-xs text-ink-muted text-center">
            Composite preview from your uploaded PDF. Click to view full size.
          </p>
        </div>
      ) : status === "failed" ? (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
          We couldn't generate a preview from this PDF. Our team will check
          the artwork and follow up.
          {job.analysisError && (
            <div className="mt-1 text-xs text-red-600 font-mono break-all">
              {job.analysisError}
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3 text-sm text-ink-muted py-4">
          <span
            className="inline-block h-4 w-4 border-2 border-current border-r-transparent rounded-full animate-spin"
            role="status"
          />
          Generating composite preview...
        </div>
      )}
    </DetailCard>
  );
}

function DetailCard({ title, children }) {
  return (
    <div className="card p-6">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-ink-muted mb-4">
        {title}
      </h2>
      {children}
    </div>
  );
}

function DetailGrid({ children }) {
  return <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">{children}</div>;
}

function DetailRow({ label, value, valueClass = "" }) {
  if (!value && value !== 0) return null;
  return (
    <div>
      <div className="text-xs text-ink-muted">{label}</div>
      <div className={`text-sm text-ink mt-0.5 ${valueClass}`}>{value}</div>
    </div>
  );
}

function FileIcon() {
  return (
    <svg
      className="h-5 w-5 flex-none text-accent-500"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 3v6h6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
