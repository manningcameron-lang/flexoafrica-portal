"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { publicPageRedirect } from "@/lib/staff-view.mjs";

/**
 * On a public page (home, sign in, sign up): an already-signed-in customer is
 * taken to their dashboard. Staff stay on the page so they can see it as a
 * visitor would. The rule lives in lib/staff-view.mjs.
 *
 * Returns null so it has no visual impact.
 */
export default function RedirectIfSignedIn() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const to = publicPageRedirect({ user, profile, loading });

  useEffect(() => {
    if (to) router.replace(to);
  }, [to, router]);

  return null;
}
