"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";

/**
 * When mounted on a public marketing page (e.g. the home page), this
 * component checks the auth state and redirects an already-signed-in
 * customer to their dashboard. Operators/admins are sent to the MIS.
 *
 * Returns null so it has no visual impact.
 */
export default function RedirectIfSignedIn() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    // Operators/admins live in the MIS, not the portal.
    if (profile?.role === "admin" || profile?.role === "operator") {
      window.location.href = "https://jobs.flexoafrica.com";
      return;
    }
    if (profile?.role !== "customer") return;
    if (profile?.status === "pending") {
      router.replace("/awaiting-approval");
    } else if (profile?.status === "suspended") {
      router.replace("/suspended");
    } else if (profile?.status === "active") {
      router.replace("/dashboard");
    }
  }, [user, profile, loading, router]);

  return null;
}
