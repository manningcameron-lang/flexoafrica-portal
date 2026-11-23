"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { mayUseFileCheckScreen } from "@/lib/staff-view.mjs";

// Staff-only pages. Who counts as staff is decided in lib/staff-view.mjs and
// nowhere else. Hiding the page is only manners: every save on it is checked
// again on the server.
export default function StaffLayout({ children }) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return <div className="max-w-page mx-auto px-4 sm:px-6 py-20 text-center text-ink-muted">Loading...</div>;
  }
  if (!mayUseFileCheckScreen(profile)) {
    return (
      <div className="max-w-page mx-auto px-4 sm:px-6 py-20 text-center text-ink-muted">
        This page is for Flexo Africa staff.
      </div>
    );
  }
  return <>{children}</>;
}
