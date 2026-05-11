"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn, postLoginPath } from "@/lib/auth";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="max-w-md mx-auto px-4 sm:px-6 py-16 text-brand-600">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const params = useSearchParams();
  const initialError = params.get("error");

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { profile } = await signIn({ email, password });
      const next = postLoginPath(profile);
      if (next.startsWith("http")) {
        window.location.href = next;
      } else {
        router.push(next);
      }
    } catch (err) {
      setError(prettyAuthError(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-16">
      <h1 className="text-3xl font-bold text-brand-900">Sign in</h1>
      <p className="mt-2 text-brand-700">
        Welcome back. Enter your details to access your dashboard.
      </p>

      {initialError === "noprofile" && (
        <Banner>
          We could not find your account profile. Please contact us if this
          persists.
        </Banner>
      )}

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <Banner>{error}</Banner>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full px-5 py-3 bg-brand-700 hover:bg-brand-800 disabled:opacity-60 text-white font-medium rounded-md"
        >
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <div className="mt-6 flex justify-between text-sm">
        <Link
          href="/forgot-password"
          className="text-brand-700 hover:text-brand-900"
        >
          Forgot password?
        </Link>
        <Link href="/signup" className="text-brand-700 hover:text-brand-900">
          Create an account
        </Link>
      </div>
    </div>
  );
}

function Field({ label, ...rest }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-brand-800">{label}</span>
      <input
        {...rest}
        className="mt-1 block w-full rounded-md border border-brand-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </label>
  );
}

function Banner({ children }) {
  return (
    <div className="rounded-md bg-red-50 border border-red-200 text-red-800 px-3 py-2 text-sm">
      {children}
    </div>
  );
}

function prettyAuthError(err) {
  const code = err?.code || "";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password")
    return "Wrong email or password.";
  if (code === "auth/user-not-found") return "No account with that email.";
  if (code === "auth/too-many-requests")
    return "Too many attempts. Try again in a few minutes.";
  return err.message || "Something went wrong. Please try again.";
}
