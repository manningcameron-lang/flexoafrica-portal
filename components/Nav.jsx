"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { signOut } from "@/lib/auth";

const customerNav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/jobs", label: "My Jobs" },
  { href: "/order/new", label: "Place Order" },
  // External: prepress tools sub-app at tools.flexoafrica.com.
  // `sso: true` flips the renderer into "fetch Firebase ID token, redirect
  // to /sso-login.html#firebaseToken=..." mode so the user lands signed in.
  {
    href: "https://tools.flexoafrica.com",
    label: "Tools",
    external: true,
    sso: true,
  },
  { href: "/profile", label: "Profile" },
];

// Open tools.flexoafrica.com signed in.
//
// IMPORTANT: tokens MUST NOT appear in the URL. Chrome Safe Browsing flags
// any URL with a long base64 payload that looks like a credential — even
// in the hash fragment that browsers don't send to the server. Lesson
// learned 2026-06-01.
//
// The handshake is:
//   1. Portal opens tools.flexoafrica.com/sso-login.html (clean URL)
//   2. Bridge page sends `window.opener.postMessage({ type: 'request-sso' })`
//      back to the portal origin
//   3. Portal listener verifies the message origin === tools.flexoafrica.com,
//      fetches user.getIdToken(), and posts back the token via
//      event.source.postMessage to the tools origin
//   4. Bridge page POSTs the token to /api/auth/sso-portal, stores fa_token,
//      redirects to /
//
// We DO use the "noopener" attribute despite needing window.opener — that
// attribute would set opener to null and break the handshake. We rely on
// strict origin checks on every postMessage instead. The new tab can't read
// anything from the opener without an explicit response, and the response
// only flows to the verified tools origin.
async function openToolsWithSso(user) {
  const TOOLS_ORIGIN = "https://tools.flexoafrica.com";

  // Open with no token in URL. Use a temporary message listener that lives
  // only until the handshake is done (or 30s timeout).
  const bridge = window.open(
    `${TOOLS_ORIGIN}/sso-login.html`,
    "_blank",
    "noreferrer",
  );
  if (!bridge) {
    // Popup blocked — fall back to plain navigation.
    window.location.href = TOOLS_ORIGIN;
    return;
  }

  let handled = false;
  function handle(event) {
    if (event.origin !== TOOLS_ORIGIN) return;
    if (handled) return;
    if (event.data?.type !== "request-sso") return;
    handled = true;
    (async () => {
      let payload;
      try {
        if (!user) throw new Error("no user");
        const idToken = await user.getIdToken();
        payload = { type: "sso-token", token: idToken };
      } catch (err) {
        payload = { type: "sso-error", message: String(err?.message || err) };
      }
      try {
        event.source.postMessage(payload, TOOLS_ORIGIN);
      } catch {}
      window.removeEventListener("message", handle);
    })();
  }
  window.addEventListener("message", handle);
  // Safety net — if the bridge never asks, clean up after 30s.
  setTimeout(() => {
    if (!handled) window.removeEventListener("message", handle);
  }, 30000);
}

const publicNav = [
  { href: "/services", label: "Services" },
  { href: "/configurator", label: "Configurator" },
  { href: "/about", label: "About" },
];

export default function Nav() {
  const { user, profile, loading } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isSignedIn = !!user && !loading && profile?.status === "active";
  const nav = isSignedIn ? customerNav : publicNav;

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-ink/10">
      <div className="max-w-page mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link
          href={isSignedIn ? "/dashboard" : "/"}
          className="flex items-center"
          aria-label="Flexo Africa"
        >
          <img
            src="/images/logo.png"
            alt="Flexo Africa"
            className="h-10 w-auto"
          />
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm">
          {nav.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + "/");
            const baseCls = active
              ? "text-ink font-semibold"
              : "text-ink-muted hover:text-ink transition-colors";
            if (item.external && item.sso) {
              // SSO flow — preventDefault and fetch the Firebase ID token
              // before opening tools. href is kept as a graceful fallback
              // for keyboard / "open in new tab" middle-clicks.
              return (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={baseCls}
                  onClick={(e) => {
                    e.preventDefault();
                    openToolsWithSso(user);
                  }}
                >
                  {item.label}
                </a>
              );
            }
            if (item.external) {
              return (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={baseCls}
                >
                  {item.label}
                </a>
              );
            }
            return (
              <Link key={item.href} href={item.href} className={baseCls}>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          {isSignedIn ? (
            <>
              <span className="hidden lg:inline text-sm text-ink-muted">
                {profile?.contactName || user.email}
              </span>
              <button
                onClick={() => signOut()}
                className="px-3 py-1.5 text-sm font-medium border border-ink/15 text-ink hover:bg-brand-50 rounded-md"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="px-3 py-1.5 text-sm font-medium text-ink-muted hover:text-ink"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="px-4 py-2 text-sm font-semibold bg-accent-500 text-white rounded-md hover:bg-accent-600"
              >
                Sign up
              </Link>
            </>
          )}
        </div>

        <button
          className="md:hidden p-2 text-ink"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            {open ? (
              <path d="M6 6l12 12M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-ink/10 bg-white">
          <div className="max-w-page mx-auto px-4 sm:px-6 py-4 flex flex-col gap-3">
            {nav.map((item) => {
              if (item.external && item.sso) {
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-ink py-1"
                    onClick={(e) => {
                      e.preventDefault();
                      setOpen(false);
                      openToolsWithSso(user);
                    }}
                  >
                    {item.label}
                  </a>
                );
              }
              if (item.external) {
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-ink py-1"
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </a>
                );
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-sm text-ink py-1"
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              );
            })}
            <div className="border-t border-ink/10 pt-3 flex flex-col gap-2">
              {isSignedIn ? (
                <button
                  onClick={() => {
                    signOut();
                    setOpen(false);
                  }}
                  className="self-start px-3 py-1.5 text-sm font-medium border border-ink/15 rounded-md"
                >
                  Sign out
                </button>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="self-start text-sm text-ink"
                    onClick={() => setOpen(false)}
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/signup"
                    className="self-start px-4 py-2 text-sm font-semibold bg-accent-500 text-white rounded-md"
                    onClick={() => setOpen(false)}
                  >
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
