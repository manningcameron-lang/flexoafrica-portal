"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { subscribeJobsForCustomer, bucketJobs } from "@/lib/jobs";
import JobCard from "@/components/JobCard";

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user?.uid) return;
    setLoading(true);
    const unsub = subscribeJobsForCustomer(user.uid, (items, err) => {
      if (err) {
        setError(err.message || "Failed to load jobs");
        setLoading(false);
        return;
      }
      setJobs(items || []);
      setLoading(false);
    });
    return unsub;
  }, [user?.uid]);

  const firstName = (profile?.contactName || "").split(" ")[0];
  const buckets = bucketJobs(jobs);
  const hasJobs = jobs.length > 0;

  return (
    <div className="max-w-page mx-auto px-4 sm:px-6 py-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <span className="eyebrow">Dashboard</span>
          <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-ink">
            Welcome{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-1 text-ink-muted">
            {profile?.company ? `${profile.company} · ` : ""}{profile?.email}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/jobs" className="btn-secondary">
            My Jobs
          </Link>
          <Link href="/order/new" className="btn-primary">
            Place new order
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Awaiting your approval"
          value={buckets.awaitingApproval.length}
          tone="orange"
          href="/jobs?filter=awaiting"
        />
        <SummaryCard
          label="In production"
          value={buckets.inProduction.length}
          tone="blue"
          href="/jobs?filter=production"
        />
        <SummaryCard
          label="Recently completed"
          value={buckets.recent.length}
          tone="green"
          href="/jobs?filter=complete"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="mt-8 rounded-xl border border-accent-500/30 bg-accent-50 p-4 text-sm text-accent-700">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="mt-10 rounded-xl border border-ink/10 bg-brand-50 p-10 text-center text-ink-muted">
          Loading your jobs...
        </div>
      )}

      {/* Awaiting approval (priority) */}
      {!loading && buckets.awaitingApproval.length > 0 && (
        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-ink">
              Awaiting your approval
            </h2>
            <span className="text-xs font-semibold uppercase tracking-widest text-logoOrange">
              Action needed
            </span>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {buckets.awaitingApproval.map((j) => (
              <JobCard key={j.id} job={j} />
            ))}
          </div>
        </section>
      )}

      {/* Open jobs (in production) */}
      {!loading && (
        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-ink">Open jobs</h2>
            <Link
              href="/jobs"
              className="text-sm text-ink-muted hover:text-ink"
            >
              See all →
            </Link>
          </div>

          {buckets.inProduction.length > 0 ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {buckets.inProduction.slice(0, 6).map((j) => (
                <JobCard key={j.id} job={j} />
              ))}
            </div>
          ) : hasJobs ? (
            <div className="mt-4 rounded-xl border border-dashed border-ink/15 bg-brand-50 p-8 text-center text-ink-muted text-sm">
              No jobs in production right now. All your active work is shown in the sections above.
            </div>
          ) : (
            <EmptyState />
          )}
        </section>
      )}

      {/* Recent completed */}
      {!loading && buckets.recent.length > 0 && (
        <section className="mt-12">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-ink">
              Recently completed
            </h2>
            <Link
              href="/jobs?filter=complete"
              className="text-sm text-ink-muted hover:text-ink"
            >
              See all →
            </Link>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {buckets.recent.slice(0, 4).map((j) => (
              <JobCard key={j.id} job={j} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone = "blue", href }) {
  const tones = {
    orange: "bg-logoOrange/10 border-logoOrange/30 text-logoOrange",
    blue: "bg-logoBlue/10 border-logoBlue/30 text-logoBlue",
    green: "bg-logoGreen/10 border-logoGreen/30 text-logoGreen",
  };
  return (
    <Link
      href={href || "#"}
      className={`block rounded-xl border p-5 transition-shadow hover:shadow-card ${tones[tone]}`}
    >
      <div className="text-xs font-semibold uppercase tracking-wider opacity-80">
        {label}
      </div>
      <div className="mt-1 text-3xl font-bold">{value}</div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-ink/15 bg-brand-50 p-10 text-center">
      <h3 className="text-lg font-semibold text-ink">No jobs yet</h3>
      <p className="mt-2 text-ink-muted">
        When you place your first order, you'll see live status here for every
        plate, from artwork through to delivery.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/order/new" className="btn-primary">
          Place your first order
        </Link>
        <Link href="/configurator" className="btn-secondary">
          Configure a plate
        </Link>
      </div>
    </div>
  );
}
