"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import {
  NOTIFICATION_KEYS,
  NOTIFICATION_LABELS,
  resolvePrefs,
  updateNotificationPreferences,
} from "@/lib/profile";

/**
 * Notification preferences page.
 *
 * Reads /users/{uid}.notificationPreferences (defaulting to all-on for new
 * customers) and lets the customer mute individual email triggers. Writes
 * back via lib/profile.updateNotificationPreferences which patches the
 * single map atomically.
 *
 * Mirrors the gating logic in functions/src/email/sendCustomerEmail.js — if
 * a key is `false` here, the corresponding Cloud Function skips the send.
 *
 * Save model: per-toggle. Each switch flips local state immediately + fires
 * a save in the background. Customers see "Saved" feedback inline rather
 * than a single "Save" button at the bottom (less ambiguity about whether
 * a toggle has been remembered).
 */
export default function NotificationsPage() {
  const { user, profile } = useAuth();
  const [prefs, setPrefs] = useState(null);
  const [saveStatus, setSaveStatus] = useState({}); // { [key]: "saving" | "saved" | "error" }

  useEffect(() => {
    if (profile) setPrefs(resolvePrefs(profile));
  }, [profile]);

  async function handleToggle(key, nextValue) {
    if (!prefs || !user?.uid) return;
    const optimistic = { ...prefs, [key]: nextValue };
    setPrefs(optimistic);
    setSaveStatus((s) => ({ ...s, [key]: "saving" }));
    try {
      await updateNotificationPreferences({ uid: user.uid, prefs: optimistic });
      setSaveStatus((s) => ({ ...s, [key]: "saved" }));
      // Clear the "Saved" indicator after a moment so the row settles.
      setTimeout(() => {
        setSaveStatus((s) => {
          const next = { ...s };
          if (next[key] === "saved") delete next[key];
          return next;
        });
      }, 1800);
    } catch (err) {
      // Roll back the optimistic update so the UI matches what's stored.
      setPrefs(prefs);
      setSaveStatus((s) => ({ ...s, [key]: "error" }));
      console.error("Failed to save notification preference:", err);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <span className="eyebrow">Profile</span>
      <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-ink">
        Email notifications
      </h1>
      <p className="mt-1 text-ink-muted">
        Choose which emails Flexo Africa sends you. Account-level emails (sign-in,
        password reset) are always sent — these toggles cover job activity.
      </p>

      <section className="mt-10 card p-2 sm:p-2 divide-y divide-ink/5">
        {prefs == null ? (
          <div className="px-4 py-8 text-center text-ink-muted">
            Loading your preferences...
          </div>
        ) : (
          NOTIFICATION_KEYS.map((key) => (
            <NotificationRow
              key={key}
              label={NOTIFICATION_LABELS[key]?.title}
              description={NOTIFICATION_LABELS[key]?.description}
              enabled={prefs[key]}
              onChange={(next) => handleToggle(key, next)}
              status={saveStatus[key]}
            />
          ))
        )}
      </section>

      <section className="mt-6 card p-6 bg-brand-50/40">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-ink-muted">
          What about urgent stuff?
        </h2>
        <p className="mt-2 text-sm text-ink">
          Even with everything off, we'll still email you for the proof
          approval step. Production won't move without your sign-off, so it
          would be a bad idea to mute it.
        </p>
        <p className="mt-3 text-sm text-ink-muted">
          Account-level emails (sign-in, password reset, account approved)
          are always delivered and cannot be muted.
        </p>
      </section>

      <div className="mt-8">
        <Link
          href="/profile"
          className="text-sm text-ink-muted hover:text-ink"
        >
          &larr; Back to account settings
        </Link>
      </div>
    </div>
  );
}

function NotificationRow({ label, description, enabled, onChange, status }) {
  return (
    <div className="flex items-start justify-between gap-4 p-4 sm:p-5">
      <div className="flex-1">
        <div className="font-semibold text-ink">{label}</div>
        <div className="mt-1 text-sm text-ink-muted leading-relaxed">
          {description}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <Toggle enabled={enabled} onChange={onChange} ariaLabel={label} />
        {status === "saving" && (
          <span className="text-xs text-ink-muted">Saving...</span>
        )}
        {status === "saved" && (
          <span className="text-xs text-logoGreen font-medium">Saved</span>
        )}
        {status === "error" && (
          <span className="text-xs text-accent-600">Failed</span>
        )}
      </div>
    </div>
  );
}

function Toggle({ enabled, onChange, ariaLabel }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={ariaLabel}
      onClick={() => onChange(!enabled)}
      className={
        "relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors " +
        (enabled
          ? "bg-accent-500"
          : "bg-ink/20 hover:bg-ink/30")
      }
    >
      <span
        className={
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5 " +
          (enabled ? "translate-x-5" : "translate-x-0.5")
        }
      />
    </button>
  );
}
