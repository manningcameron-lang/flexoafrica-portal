"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signUpCustomer } from "@/lib/auth";

export default function SignupPage() {
  const [form, setForm] = useState({
    company: "",
    contactName: "",
    email: "",
    phone: "",
    password: "",
  });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signUpCustomer(form);
      router.push("/awaiting-approval");
    } catch (err) {
      setError(prettySignupError(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-16">
      <h1 className="text-3xl font-bold text-brand-900">Create your account</h1>
      <p className="mt-2 text-brand-700">
        Sign up takes 30 seconds. We will review your application within one
        business day and email you when your account is active.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <Field
          label="Company name"
          placeholder="Your converter or printer name"
          value={form.company}
          onChange={update("company")}
          required
        />
        <Field
          label="Your name"
          autoComplete="name"
          value={form.contactName}
          onChange={update("contactName")}
          required
        />
        <Field
          label="Work email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={update("email")}
          required
        />
        <Field
          label="Phone"
          type="tel"
          autoComplete="tel"
          value={form.phone}
          onChange={update("phone")}
          required
        />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={update("password")}
          required
          minLength={8}
          hint="At least 8 characters."
        />

        {error && <Banner>{error}</Banner>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full px-5 py-3 bg-brand-700 hover:bg-brand-800 disabled:opacity-60 text-white font-medium rounded-md"
        >
          {submitting ? "Creating account..." : "Create account"}
        </button>

        <p className="text-xs text-brand-500">
          By signing up you agree to the Flexo Africa Terms of Service and
          Privacy Policy.
        </p>
      </form>

      <div className="mt-6 text-sm">
        <span className="text-brand-700">Already have an account? </span>
        <Link href="/login" className="text-brand-700 hover:text-brand-900 font-medium">
          Sign in
        </Link>
      </div>
    </div>
  );
}

function Field({ label, hint, ...rest }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-brand-800">{label}</span>
      <input
        {...rest}
        className="mt-1 block w-full rounded-md border border-brand-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      {hint && <span className="text-xs text-brand-500 mt-1 block">{hint}</span>}
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

function prettySignupError(err) {
  const code = err?.code || "";
  if (code === "auth/email-already-in-use")
    return "An account with that email already exists. Try signing in.";
  if (code === "auth/weak-password")
    return "Password too weak. Use at least 8 characters.";
  if (code === "auth/invalid-email") return "That email looks invalid.";
  return err.message || "Could not create account. Please try again.";
}
