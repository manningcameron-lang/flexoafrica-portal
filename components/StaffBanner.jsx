"use client";

import { useAuth } from "./AuthProvider";
import { JOB_SYSTEM_URL, isStaff } from "@/lib/staff-view.mjs";

// A strip across the top of every page while a staff login is looking at the
// portal, so nobody mistakes the read only view for a customer's account.
export default function StaffBanner() {
  const { user, profile, loading } = useAuth();
  if (loading || !user || !isStaff(profile)) return null;

  return (
    <div
      role="status"
      data-staff-banner
      className="bg-ink text-white text-sm"
    >
      <div className="max-w-page mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2">
        <span>
          <strong>Staff view.</strong> You are seeing the portal as a customer
          sees it, read only. Nothing can be ordered, approved, sent or saved
          from here.
        </span>
        <a
          href={JOB_SYSTEM_URL}
          className="inline-flex items-center rounded-md bg-white px-3 py-1 font-semibold text-ink hover:bg-white/90"
        >
          Go to job system
        </a>
      </div>
    </div>
  );
}
