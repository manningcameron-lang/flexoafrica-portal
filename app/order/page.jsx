"use client";

import Link from "next/link";
import CustomerGuard from "@/components/CustomerGuard";
import {
  AMBER_REPRO_PRICE_EXCL_VAT,
  AMBER_REPRO_REVISIONS_INCLUDED,
} from "@/lib/amber-pricing.mjs";

// The fork in the road for every order.
//
// Two very different things were both called "placing an order": sending us a
// plate-ready file to make plates from, and asking us to make the artwork in
// the first place. Customers picked the wrong one. So every "place an order"
// button on the site now lands here first and asks which one they want.
// Cam 2026-10-26.

export default function OrderChoicePage() {
  return (
    <CustomerGuard>
      <div className="max-w-page mx-auto px-4 sm:px-6 py-10">
        <span className="eyebrow">Place an order</span>
        <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-ink">
          What do you need from us?
        </h1>
        <p className="mt-2 text-ink-muted max-w-2xl">
          Pick the one that matches where your job is right now. If you are not
          sure, choose artwork and we will tell you what is still needed.
        </p>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <OrderChoiceCard
            href="/order/new"
            eyebrow="I have a plate-ready file"
            title="Order Plates"
            price="Your account plate rate"
            lines={[
              "Your artwork is already separated and plate-ready",
              "Priced per plate as you build the order",
              "Pay by card, or on your purchase order if you have an account",
            ]}
            cta="Order Plates"
          />
          <OrderChoiceCard
            href="/amber"
            eyebrow="I need the artwork made first"
            title="Order Artwork"
            price={`R${AMBER_REPRO_PRICE_EXCL_VAT} a job, excl VAT`}
            lines={[
              "Send your print specifications and your artwork",
              "One zip with everything, or a single PDF",
              `${AMBER_REPRO_REVISIONS_INCLUDED} rounds of changes included, and your first job is free`,
            ]}
            lead
            cta="Order Artwork"
          />
        </div>

        <p className="mt-8 text-sm text-ink-muted">
          Need plates as well once your artwork is signed off? Order the
          artwork now, and we will price the plates for you when the proof is
          approved.
        </p>
      </div>
    </CustomerGuard>
  );
}

function OrderChoiceCard({ href, eyebrow, title, price, lines, cta, lead }) {
  return (
    <Link
      href={href}
      className={`block rounded-xl border bg-white p-6 transition hover:shadow-md ${
        lead ? "border-accent-500" : "border-ink/10 hover:border-ink/25"
      }`}
    >
      <div className="text-xs uppercase tracking-wider font-semibold text-ink-muted">
        {eyebrow}
      </div>
      <h2 className="mt-2 text-2xl font-bold text-ink tracking-tight">{title}</h2>
      <div className="mt-1 text-sm font-semibold text-accent-600">{price}</div>
      <ul className="mt-4 space-y-2 text-sm text-ink">
        {lines.map((line) => (
          <li key={line} className="flex gap-2">
            <span aria-hidden="true" className="text-accent-500">•</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <span className="mt-6 inline-flex items-center gap-2 font-semibold text-ink">
        {cta}
        <span aria-hidden="true">→</span>
      </span>
    </Link>
  );
}
