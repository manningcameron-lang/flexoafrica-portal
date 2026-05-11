import Link from "next/link";

export const metadata = {
  title: "Services and plate types | Flexo Africa",
  description:
    "Flexographic plates brokered by Flexo Africa. Crystal and standard photopolymer plate tiers, eight thickness specs covering flexible packaging, labels, corrugated. Repro and QA in-house. Express turnaround in 24 to 36 hours.",
};

export default function ServicesPage() {
  return (
    <>
      {/* Header */}
      <section className="bg-gradient-to-br from-brand-50 via-white to-brand-100 border-b border-brand-100">
        <div className="max-w-page mx-auto px-4 sm:px-6 py-16 md:py-20">
          <p className="text-accent-500 font-semibold text-sm uppercase tracking-wider mb-3">
            Services
          </p>
          <h1 className="text-4xl md:text-5xl font-bold text-brand-900 leading-tight max-w-3xl">
            Plates, repro, and certainty for African flexo printers.
          </h1>
          <p className="mt-5 text-lg text-brand-700 max-w-2xl">
            We broker the full range of digital photopolymer plates across
            three quality tiers, plus full pre-press repro and QA, all in
            one place.
          </p>
        </div>
      </section>

      {/* Tiers */}
      <section className="border-b border-brand-100">
        <div className="max-w-page mx-auto px-4 sm:px-6 py-16">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold text-brand-900">
              Three plate tiers
            </h2>
            <p className="mt-3 text-brand-700">
              Pick by quality tier and thickness in our configurator.
              Fourteen specs cover the vast majority of flexo jobs.
            </p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <TierCard
              tier="Crystal"
              tagline="Premium HD photopolymer plates"
              types="2 thickness options"
              highlights={[
                "Highest resolution and dot fidelity",
                "Fine detail labels",
                "Premium flexible packaging",
                "Available in 45 and 67 thou",
              ]}
            />
            <TierCard
              tier="Surface Engineered"
              tagline="Cleaner ink lay, engineered surface"
              types="5 thickness options"
              highlights={[
                "Consistent ink transfer",
                "Fine-line packaging",
                "Up through corrugated",
                "Available in 45, 67, 100, 112, 125 thou",
              ]}
            />
            <TierCard
              tier="Standard"
              tagline="Reliable digital photopolymer"
              types="7 thickness options"
              highlights={[
                "Cost-effective daily production",
                "Flexible packaging, labels, corrugated",
                "Heavy corrugated up to 250 thou",
                "Available 45, 67, 100, 112, 125, 185, 250 thou",
              ]}
            />
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section className="bg-brand-50 border-b border-brand-100">
        <div className="max-w-page mx-auto px-4 sm:px-6 py-16">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold text-brand-900">
              What we do, end to end
            </h2>
            <p className="mt-3 text-brand-700">
              From the artwork your designer hands over, to the plates on your
              press. No handoffs, no delays.
            </p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <Capability
              title="Repro and artwork preparation in-house"
              body="Our pre-press team prepares your artwork for print. Trapping, colour separations, screens, barcode placement. We catch issues before they hit the plate."
              highlight
            />
            <Capability
              title="QA on every plate"
              body="A QA checklist runs on every job before plates ship. Resolution, registration, trim, dot structure. If something is off, we catch it. You never get a bad plate."
              highlight
            />
            <Capability
              title="Plate sizes up to 203 x 127 cm"
              body="We broker plates up to 203 x 127 cm. Any thickness from 1.14 mm to 5.71 mm. If your press uses it, we have a plate spec for it."
            />
            <Capability
              title="Express turnaround when you need it"
              body="Standard plates ship in 48 to 72 hours from upload and approval. Need it now? Add Express for 24 to 36 hour turnaround on approved artwork."
            />
            <Capability
              title="Legacy job records on file"
              body="Repeat orders are easy. We keep your historical jobs on file, so reordering a label or pack you ran two years ago takes one click."
            />
            <Capability
              title="Live order status, never chase a plate"
              body="From artwork through to dispatch, every job is tracked in your dashboard. PDF approvals, status updates, delivery confirmations."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-brand-800 text-white">
        <div className="max-w-page mx-auto px-4 sm:px-6 py-16 text-center">
          <h2 className="text-3xl md:text-4xl font-bold">
            Ready to price your next plate?
          </h2>
          <p className="mt-3 text-brand-100 max-w-xl mx-auto">
            Use our configurator to see live ZAR pricing for your spec, or get
            in touch and we will do the legwork.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <Link
              href="/configurator"
              className="px-6 py-3 bg-accent-500 hover:bg-accent-600 text-white font-medium rounded-md"
            >
              Configure your plate
            </Link>
            <Link
              href="/contact"
              className="px-6 py-3 bg-white text-brand-800 hover:bg-brand-50 font-medium rounded-md"
            >
              Talk to us
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function TierCard({ tier, tagline, types, highlights }) {
  return (
    <div className="bg-white rounded-xl border border-brand-100 p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-md bg-accent-500/10 grid place-items-center text-accent-600 font-semibold">
          {tier[0]}
        </div>
        <div>
          <div className="font-bold text-brand-900 text-lg">{tier}</div>
          <div className="text-xs text-brand-500">{types}</div>
        </div>
      </div>
      <p className="mt-4 text-brand-800 font-medium">{tagline}</p>
      <ul className="mt-4 space-y-2 text-sm text-brand-700">
        {highlights.map((h) => (
          <li key={h} className="flex items-start gap-2">
            <span className="text-accent-500 mt-1">+</span>
            <span>{h}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Capability({ title, body, highlight = false }) {
  return (
    <div
      className={
        "p-5 rounded-lg " +
        (highlight
          ? "bg-accent-500/10 border border-accent-500/30"
          : "bg-white border border-brand-100")
      }
    >
      <h3
        className={
          "font-semibold text-lg " +
          (highlight ? "text-accent-600" : "text-brand-900")
        }
      >
        {title}
      </h3>
      <p className="mt-1 text-sm text-brand-700 leading-relaxed">{body}</p>
    </div>
  );
}
