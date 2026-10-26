"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { customerPageGate } from "@/lib/staff-view.mjs";

// Shared gate for customer-only pages (/dashboard, /jobs, /profile, /order,
// /amber, /check). Who sees what is decided in lib/staff-view.mjs and nowhere
// else. Staff (admin, operator, designer) see the page READ ONLY; they are no
// longer sent to the job system. Cam 2026-10-26.
export default function CustomerGuard({ children, loadingText = "Loading..." }) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const gate = customerPageGate({ user, profile, loading });

  useEffect(() => {
    if (gate.to) router.replace(gate.to);
  }, [gate.to, router]);

  if (!gate.show) {
    return (
      <div className="max-w-page mx-auto px-4 sm:px-6 py-20 text-center text-ink-muted">
        {loadingText}
      </div>
    );
  }

  return <>{children}</>;
}
