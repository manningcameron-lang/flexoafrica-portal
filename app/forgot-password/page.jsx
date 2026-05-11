"use client";

import { useState } from "react";
import Link from "next/link";
import { sendPasswordReset } from "@/lib/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await sendPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err.message || "Could not send reset email.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-16">
      <h1 className="text-3xl font-bold text-brand-900">Reset your password</h1>
      <p className="mt-2 text-brand-700">
        Enter your email and we will send you a link to set a new password.
      </p>

      {sent ? (
        <div className="mt-8 rounded-md bg-green-50 border border-green-200 text-green-800 px-4 py-3 text-sm">
          Check your inbox for a reset link. The email comes from
          noreply@flexo-africa-jobs.firebaseapp.com.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-brand-800">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border border-brand-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>

          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 text-red-800 px-3 py-2 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full px-5 py-3 bg-brand-700 hover:bg-brand-800 disabled:opacity-60 text-white font-medium rounded-md"
          >
            {submitting ? "Sending..." : "Send reset link"}
          </button>
        </form>
      )}

      <div className="mt-6 text-sm">
        <Link href="/login" className="text-brand-700 hover:text-brand-900">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
