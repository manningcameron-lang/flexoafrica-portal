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
  { href: "/profile", label: "Profile" },
];

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
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  active
                    ? "text-ink font-semibold"
                    : "text-ink-muted hover:text-ink transition-colors"
                }
              >
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
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm text-ink py-1"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
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
