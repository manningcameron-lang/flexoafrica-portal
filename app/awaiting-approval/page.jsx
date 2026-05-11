"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { signOut } from "@/lib/auth";

export default function AwaitingApprovalPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  // If status changes (admin approves), bounce them to dashboard.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    } else if (profile?.status === "active") {
      router.replace("/dashboard");
    } else if (profile?.status === "suspended") {
      router.replace("/suspended");
    }
  }, [user, profile, loading, router]);

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-20 text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-accent-500/10 text-accent-600 mb-5 text-2xl">
        ...
      </div>
      <h1 className="text-3xl font-bold text-brand-900">
        Thanks for signing up
      </h1>
      <p className="mt-3 text-brand-700">
        Your account is awaiting approval. We review new accounts within one
        business day. You will receive an email at{" "}
        <span className="font-medium text-brand-900">{profile?.email || user?.email}</span>{" "}
        as soon as your account is active.
      </p>
      <p className="mt-3 text-sm text-brand-500">
        While you wait, feel free to explore the public site or get in touch.
      </p>

      <div className="mt-8 flex justify-center gap-3">
        <a
          href="/"
          className="px-4 py-2 bg-brand-700 hover:bg-brand-800 text-white font-medium rounded-md"
        >
          Back to home
        </a>
        <button
          onClick={() => signOut().then(() => router.push("/"))}
          className="px-4 py-2 bg-brand-100 hover:bg-brand-200 text-brand-800 font-medium rounded-md"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
