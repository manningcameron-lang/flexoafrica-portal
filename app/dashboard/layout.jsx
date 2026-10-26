"use client";

import CustomerGuard from "@/components/CustomerGuard";

// Same gate as every other customer page (lib/staff-view.mjs). This used to
// keep its own copy of the rules, which is how two pages can end up behaving
// differently.
export default function DashboardLayout({ children }) {
  return <CustomerGuard loadingText="Loading your dashboard...">{children}</CustomerGuard>;
}
