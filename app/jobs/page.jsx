"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { subscribeJobsForCustomer } from "@/lib/jobs";
import JobCard from "@/components/JobCard";
import { STAGES } from "@/lib/stages";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "awaiting", label: "Awaiting approval", stages: ["pdf_sent"] },
  {
    id: "production",
    label: "In production",
    stages: ["artwork", "fa_po", "for_checking", "plates"],
  },
  { id: "invoiced", label: "Invoiced", stages: ["invoicing"] },
  { id: "complete", label: "Complete", stages: ["complete"] },
];

export default function MyJobsPage() {
  const { user, profile } = useAuth();
  const params = useSearchParams();
  const initial = params.get("filter") || "all";
  const [filter, setFilter] = useState(initial);
  const [search, setSearch] = useState("");
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Per-company isolation: subscribe by user.company.
    if (!user?.uid || !profile?.company) return;
    setLoading(true);
    const unsub = subscribeJobsForCustomer(profile.company, (items, err) => {
      if (err) {
        setError(err.message || "Failed to load jobs");
        setLoading(false);
        return;
      }
      setJobs(items || []);
      setLoading(false);
    });
    return unsub;
  }, [user?.uid, profile?.company]);

  const filtered = useMemo(() => {
    let out = jobs;
    const f = FILTERS.find((x) => x.id === filter);
    if (f?.stages) {
      out = out.filter((j) => f.stages.includes(j.stage));
    }
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      out = out.filter(
        (j) =>
          j.jobName?.toLowerCase().includes(s) ||
          j.description?.toLowerCase().includes(s) ||
          j.plateTypeName?.toLowerCase().includes(s) ||
          j.orderNumber?.toLowerCase().includes(s)
      );
    }
    return out;
  }, [jobs, filter, search]);

  const counts = useMemo(() => {
    const c = { all: jobs.length };
    for (const f of FILTERS) {
      if (f.stages) {
        c[f.id] = jobs.filter((j) => f.stages.includes(j.stage)).length;
      }
    }
    return c;
  }, [jobs]);

  return (
    <div className="max-w-page mx-auto px-4 sm:px-6 py-10">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <span className="eyebrow">My Jobs</span>
          <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-ink">
            All your plate jobs
          </h1>
          <p className="mt-1 text-ink-muted">
            {jobs.length} {jobs.length === 1 ? "job" : "jobs"} on your account
          </p>
        </div>
        <Link href="/order/new" className="btn-primary">
          Place new order
        </Link>
      </div>

      {/* Filters */}
      <div className="mt-8 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          const count = counts[f.id] ?? 0;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${
                active
                  ? "bg-ink border-ink text-white"
                  : "bg-white border-ink/15 text-ink hover:border-ink/30"
              }`}
            >
              {f.label}
              <span
                className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-bold rounded-full ${
                  active ? "bg-white/20 text-white" : "bg-brand-100 text-ink-muted"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="mt-4">
        <input
          type="search"
          placeholder="Search by job number, order number, or description..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-lg rounded-md border border-ink/15 bg-white px-4 py-2.5 text-sm placeholder:text-ink-muted/60 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
        />
      </div>

      {/* Results */}
      {error && (
        <div className="mt-8 rounded-xl border border-accent-500/30 bg-accent-50 p-4 text-sm text-accent-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-10 rounded-xl border border-ink/10 bg-brand-50 p-10 text-center text-ink-muted">
          Loading your jobs...
        </div>
      ) : filtered.length > 0 ? (
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((j) => (
            <JobCard key={j.id} job={j} />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="mt-10 rounded-xl border border-dashed border-ink/15 bg-brand-50 p-10 text-center text-ink-muted">
          No jobs match this filter.
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-10 rounded-xl border border-dashed border-ink/15 bg-brand-50 p-12 text-center">
      <h3 className="text-lg font-semibold text-ink">No jobs yet</h3>
      <p className="mt-2 text-ink-muted">
        When you place your first order, you'll see live status here for every plate.
      </p>
      <Link href="/order/new" className="btn-primary mt-6 inline-flex">
        Place your first order
      </Link>
    </div>
  );
}
