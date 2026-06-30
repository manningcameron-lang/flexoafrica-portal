"use client";

import Link from "next/link";
import { useAuth } from "./AuthProvider";

const PHONE = "+27 72 665 2041";
const PHONE_TEL = "+27726652041";
const WHATSAPP = "+27 64 586 7535";
const WHATSAPP_LINK = "https://wa.me/27645867535";
const EMAIL = "sales@flexoafrica.com";

export default function Footer() {
  const year = new Date().getFullYear();
  // Match Nav's gating: only show authenticated links when the customer is
  // actually active. Pending/suspended users should still see the public
  // links so they have somewhere to land.
  const { user, profile, loading } = useAuth();
  const isSignedIn = !!user && !loading && profile?.status === "active";

  return (
    <footer className="bg-ink text-white mt-24">
      <div className="max-w-page mx-auto px-4 sm:px-6 py-12 grid gap-10 md:grid-cols-4">
        <div className="md:col-span-1">
          <div className="bg-white rounded-lg p-3 inline-block">
            <img
              src="/images/logo.png"
              alt="Flexo Africa"
              className="h-10 w-auto"
            />
          </div>
          <p className="mt-4 text-sm text-white/70 max-w-xs leading-relaxed">
            Track your flexographic plate jobs in real time, from artwork
            through to delivery.
          </p>
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-white/60 mb-3">
            {isSignedIn ? "Account" : "Get started"}
          </div>
          <ul className="space-y-2 text-sm">
            {isSignedIn ? (
              <>
                <li>
                  <Link href="/dashboard" className="text-white/80 hover:text-white">
                    Dashboard
                  </Link>
                </li>
                <li>
                  <Link href="/jobs" className="text-white/80 hover:text-white">
                    My Jobs
                  </Link>
                </li>
                <li>
                  <Link href="/order/new" className="text-white/80 hover:text-white">
                    Place Order
                  </Link>
                </li>
                <li>
                  <Link href="/profile" className="text-white/80 hover:text-white">
                    Profile
                  </Link>
                </li>
              </>
            ) : (
              <>
                <li>
                  <Link href="/services" className="text-white/80 hover:text-white">
                    Services
                  </Link>
                </li>
                <li>
                  <Link href="/configurator" className="text-white/80 hover:text-white">
                    Configurator
                  </Link>
                </li>
                <li>
                  <Link href="/about" className="text-white/80 hover:text-white">
                    About + FAQ
                  </Link>
                </li>
                <li>
                  <Link href="/login" className="text-white/80 hover:text-white">
                    Sign in
                  </Link>
                </li>
                <li>
                  <Link href="/signup" className="text-white/80 hover:text-white">
                    Sign up
                  </Link>
                </li>
              </>
            )}
          </ul>
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-white/60 mb-3">
            Contact
          </div>
          <ul className="space-y-2 text-sm text-white/80">
            <li>
              <a href={`tel:${PHONE_TEL}`} className="hover:text-white">
                {PHONE}
              </a>
            </li>
            <li>
              <a
                href={WHATSAPP_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white"
              >
                WhatsApp: {WHATSAPP}
              </a>
            </li>
            <li>
              <a href={`mailto:${EMAIL}`} className="hover:text-white">
                {EMAIL}
              </a>
            </li>
            <li className="text-white/70 pt-2">Mon to Fri, 08:00 to 17:00</li>
            <li className="text-white/70 pt-2">Durban, KZN, South Africa</li>
          </ul>
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-white/60 mb-3">
            Marketing
          </div>
          <p className="text-sm text-white/80">
            Learn more about Flexo Africa.
          </p>
          <a
            href="https://flexoafrica.com"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary mt-4"
          >
            flexoafrica.com
          </a>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-page mx-auto px-4 sm:px-6 py-4 text-xs text-white/60 flex flex-col sm:flex-row justify-between gap-2">
          <div>© {year} Flexo Africa (Pty) Ltd. Established 2024.</div>
          <div className="flex items-center gap-4 text-white/60">
            <Link href="/terms" className="hover:text-white">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-white">
              Privacy
            </Link>
            <span className="text-white/50">Built with care in Durban, KZN.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
