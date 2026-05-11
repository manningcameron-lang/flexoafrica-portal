"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";

// Shared auth gate for customer-only routes (/dashboard, /jobs, /profile).
// Mirrors the logic in /app/dashboard/layout.jsx.
export default function CustomerGuard({ children }) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!profile) return;
    if (profile.role === "admin" || profile.role === "operator") {
      window.location.href = "https://jobs.flexoafrica.com";
      return;
    }
    if (profile.role !== "customer") {
      router.replace("/login?error=role");
      return;
    }
    if (profile.status === "pending") {
      router.replace("/awaiting-approval");
      return;
    }
    if (profile.status === "suspended") {
      router.replace("/suspended");
      return;
    }
  }, [user, profile, loading, router]);

  const ready =
    !loading &&
    !!user &&
    !!profile &&
    profile.role === "customer" &&
    profile.status === "active";

  if (!ready) {
    return (
      <div className="max-w-page mx-auto px-4 sm:px-6 py-20 text-center text-ink-muted">
        Loading...
      </div>
    );
  }

  return <>{children}</>;
}
