"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { signOut, sendPasswordReset } from "@/lib/auth";
import { updateMyProfile } from "@/lib/profile";
import { formatDate } from "@/lib/jobs";

export default function ProfilePage() {
  const { user, profile } = useAuth();
  const [form, setForm] = useState({
    company: "",
    contactName: "",
    phone: "",
  });
  const [state, setState] = useState({ status: "idle", message: "" });
  const [pwState, setPwState] = useState({ status: "idle", message: "" });

  useEffect(() => {
    if (profile) {
      setForm({
        company: profile.company || "",
        contactName: profile.contactName || "",
        phone: profile.phone || "",
      });
    }
  }, [profile]);

  async function handleSave(e) {
    e.preventDefault();
    setState({ status: "submitting", message: "" });
    try {
      await updateMyProfile({ uid: user.uid, patch: form });
      setState({ status: "success", message: "Profile updated." });
    } catch (err) {
      setState({ status: "error", message: err.message || "Failed to update." });
    }
  }

  async function handlePasswordReset() {
    setPwState({ status: "submitting", message: "" });
    try {
      await sendPasswordReset(user.email);
      setPwState({
        status: "success",
        message: `Password reset link sent to ${user.email}.`,
      });
    } catch (err) {
      setPwState({ status: "error", message: err.message || "Failed to send." });
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <span className="eyebrow">Profile</span>
      <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-ink">
        Account settings
      </h1>
      <p className="mt-1 text-ink-muted">
        Manage your contact details and login.
      </p>

      {/* Account info */}
      <section className="mt-10 card p-6">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-ink-muted">
          Account
        </h2>
        <div className="mt-4 space-y-3 text-sm">
          <Row label="Email" value={user?.email} />
          <Row
            label="Status"
            value={
              <span className="inline-flex items-center gap-2 rounded-full bg-logoGreen/15 px-2 py-0.5 text-xs font-semibold text-logoGreen">
                <span className="h-1.5 w-1.5 rounded-full bg-logoGreen" />
                Active
              </span>
            }
          />
          <Row label="Member since" value={formatDate(profile?.createdAt)} />
        </div>
      </section>

      {/* Editable contact details */}
      <section className="mt-6 card p-6">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-ink-muted">
          Contact details
        </h2>
        <form onSubmit={handleSave} className="mt-4 space-y-4">
          <Field
            label="Company"
            name="company"
            value={form.company}
            onChange={(v) => setForm({ ...form, company: v })}
          />
          <Field
            label="Contact name"
            name="contactName"
            value={form.contactName}
            onChange={(v) => setForm({ ...form, contactName: v })}
          />
          <Field
            label="Phone"
            name="phone"
            type="tel"
            value={form.phone}
            onChange={(v) => setForm({ ...form, phone: v })}
          />
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={state.status === "submitting"}
              className="btn-primary disabled:opacity-60"
            >
              {state.status === "submitting" ? "Saving..." : "Save changes"}
            </button>
            {state.status === "success" && (
              <span className="text-sm text-logoGreen font-medium">{state.message}</span>
            )}
            {state.status === "error" && (
              <span className="text-sm text-accent-600">{state.message}</span>
            )}
          </div>
        </form>
      </section>

      {/* Password reset */}
      <section className="mt-6 card p-6">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-ink-muted">
          Password
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          We'll email you a secure link to set a new password.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={handlePasswordReset}
            disabled={pwState.status === "submitting"}
            className="btn-secondary disabled:opacity-60"
          >
            {pwState.status === "submitting" ? "Sending..." : "Send password reset link"}
          </button>
          {pwState.status === "success" && (
            <span className="text-sm text-logoGreen font-medium">{pwState.message}</span>
          )}
          {pwState.status === "error" && (
            <span className="text-sm text-accent-600">{pwState.message}</span>
          )}
        </div>
      </section>

      {/* Sign out */}
      <section className="mt-6 card p-6">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-ink-muted">
          Sign out
        </h2>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button
            onClick={() => signOut()}
            className="inline-flex items-center justify-center rounded-md border border-accent-500/30 bg-white px-4 py-2 text-sm font-semibold text-accent-600 hover:bg-accent-50"
          >
            Sign out
          </button>
          <Link href="/dashboard" className="text-sm text-ink-muted hover:text-ink">
            Back to dashboard
          </Link>
        </div>
      </section>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="grid grid-cols-3 gap-4 py-2 border-b border-ink/5 last:border-0">
      <div className="text-ink-muted">{label}</div>
      <div className="col-span-2 text-ink">{value || "—"}</div>
    </div>
  );
}

function Field({ label, name, type = "text", value, onChange }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">{label}</span>
      <input
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-md border border-ink/15 bg-white px-4 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
      />
    </label>
  );
}
