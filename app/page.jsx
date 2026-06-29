import Link from "next/link";
import RedirectIfSignedIn from "@/components/RedirectIfSignedIn";

export default function HomePage() {
  return (
    <>
      {/* Bounce signed-in customers straight to their dashboard. Operators
          and admins land in the MIS. No effect on signed-out visitors. */}
      <RedirectIfSignedIn />

      {/* Hero */}
      <section className="bg-gradient-to-br from-brand-50 via-white to-brand-100 border-b border-brand-100">
        <div className="max-w-page mx-auto px-4 sm:px-6 py-16 md:py-24 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-accent-500 font-semibold text-sm uppercase tracking-wider mb-3">
              Flexographic plates, brokered and delivered
            </p>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-brand-900 leading-tight">
              Flexographic plates, delivered with certainty.
            </h1>
            <p className="mt-5 text-lg text-brand-700 max-w-lg">
              Live order tracking from order to delivery. Three plate tiers,
              fourteen specs. Standard turnaround 48 to 72 hours, Express in
              24 to 36.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/configurator"
                className="px-5 py-3 bg-accent-500 hover:bg-accent-600 text-white font-medium rounded-md shadow-sm"
              >
                Configure your plate
              </Link>
            </div>
          </div>

          {/* Hero visual: Cam-supplied flexo press photo at /public/hero.jpg */}
          <div className="relative aspect-[4/3] rounded-2xl overflow-hidden shadow-xl border border-brand-100 bg-brand-100">
            <img
              src="/hero.jpg"
              alt="Flexographic press with photopolymer plates mounted"
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* Value props */}
      <section className="border-b border-brand-100">
        <div className="max-w-page mx-auto px-4 sm:px-6 py-12 grid gap-6 md:grid-cols-4">
          <ValueProp
            title="Live order tracking"
            body="Watch every stage from order to delivery in real time. Stop chasing your plates."
            primary
          />
          <ValueProp
            title="Crystal, Surface Engineered, Standard"
            body="Three tiers, fourteen specs. Crystal for fine detail. Surface Engineered for cleaner ink lay. Standard for daily production."
          />
          <ValueProp
            title="Across several African countries"
            body="Teams in multiple African countries. Real people, fast answers, broad delivery network."
          />
          <ValueProp
            title="Repro plus plates"
            body="Artwork to press-ready in one place. No handoffs, no surprises."
          />
        </div>
      </section>

      {/* Plate tiers */}
      <section className="bg-brand-50 border-b border-brand-100">
        <div className="max-w-page mx-auto px-4 sm:px-6 py-16">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold text-brand-900">
              Three plate tiers, fourteen specs.
            </h2>
            <p className="mt-3 text-brand-700">
              Crystal for premium HD work. Surface Engineered for cleaner ink
              lay and fine-line packaging. Standard for daily production.
              Pick by tier and thickness in our configurator.
            </p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <TierCard
              tier="Crystal"
              tagline="Premium HD photopolymer"
              note="Highest resolution. Fine detail labels and premium flexible packaging."
              thicknesses="45, 67 thou"
            />
            <TierCard
              tier="Surface Engineered"
              tagline="Cleaner ink lay, mid-tier"
              note="Engineered surface for consistent transfer. Fine-line packaging through to corrugated."
              thicknesses="45, 67, 100, 112, 125 thou"
            />
            <TierCard
              tier="Standard"
              tagline="Everyday digital photopolymer"
              note="Reliable daily production across packaging, labels, and corrugated."
              thicknesses="45, 67, 100, 112, 125, 185, 250 thou"
            />
          </div>

          <div className="mt-10">
            <Link
              href="/services"
              className="text-brand-700 hover:text-brand-900 font-medium"
            >
              See plate tier details &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* Turnaround */}
      <section className="border-b border-brand-100">
        <div className="max-w-page mx-auto px-4 sm:px-6 py-16 grid gap-10 md:grid-cols-2 items-center">
          <div>
            <p className="text-accent-500 font-semibold text-sm uppercase tracking-wider mb-3">
              Turnaround
            </p>
            <h2 className="text-3xl font-bold text-brand-900">
              Standard 48 to 72 hours. Express 24 to 36 hours.
            </h2>
            <p className="mt-4 text-brand-700">
              Both clocks start the moment we receive your file and you approve
              the proof. Standard orders ship in 48 to 72 hours from upload and
              approval. Need it now? Add Express at checkout for 24 to 36 hour
              turnaround.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Stat label="Standard" value="48 to 72" unit="hours" />
            <Stat label="Express" value="24 to 36" unit="hours" highlight />
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-b border-brand-100 bg-white">
        <div className="max-w-page mx-auto px-4 sm:px-6 py-12">
          <p className="text-center text-sm text-brand-600 uppercase tracking-wider mb-6">
            Trusted by Africa's leading converters
          </p>
          {/* Logo strip placeholder. Replace with real customer logos once permissions in. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 opacity-60">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-12 rounded-md bg-brand-100 grid place-items-center text-brand-400 text-xs"
              >
                Logo {i}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-brand-800 text-white">
        <div className="max-w-page mx-auto px-4 sm:px-6 py-16 text-center">
          <h2 className="text-3xl md:text-4xl font-bold">
            Get a price for your next plate, in seconds.
          </h2>
          <p className="mt-3 text-brand-100 max-w-xl mx-auto">
            Use the configurator to see live ZAR pricing for your plate spec.
            No login required to get a quote.
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

function ValueProp({ title, body, primary = false }) {
  return (
    <div
      className={
        "p-5 rounded-lg " +
        (primary
          ? "bg-accent-500/10 border border-accent-500/30"
          : "bg-white border border-brand-100")
      }
    >
      <h3
        className={
          "font-semibold text-lg " +
          (primary ? "text-accent-600" : "text-brand-900")
        }
      >
        {title}
      </h3>
      <p className="mt-1 text-sm text-brand-700">{body}</p>
    </div>
  );
}

function TierCard({ tier, tagline, note, thicknesses }) {
  return (
    <div className="bg-white rounded-xl border border-brand-100 p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-md bg-accent-500/10 grid place-items-center text-accent-600 font-semibold">
          {tier[0]}
        </div>
        <div>
          <div className="font-bold text-brand-900">{tier}</div>
          <div className="text-xs text-brand-500">Plate tier</div>
        </div>
      </div>
      <p className="mt-4 text-brand-800 font-medium">{tagline}</p>
      <p className="mt-2 text-sm text-brand-600">{note}</p>
      <p className="mt-3 text-xs text-brand-500">
        <span className="font-medium text-brand-700">Thicknesses: </span>
        {thicknesses}
      </p>
    </div>
  );
}

function Stat({ label, value, unit, highlight = false }) {
  return (
    <div
      className={
        "rounded-xl p-6 border " +
        (highlight
          ? "bg-accent-500 border-accent-500 text-white"
          : "bg-brand-50 border-brand-100 text-brand-900")
      }
    >
      <div
        className={
          "text-xs uppercase tracking-wider " +
          (highlight ? "text-white/80" : "text-brand-600")
        }
      >
        {label}
      </div>
      <div className="mt-2 text-4xl font-bold">{value}</div>
      <div
        className={
          "text-sm mt-1 " + (highlight ? "text-white/90" : "text-brand-600")
        }
      >
        {unit}
      </div>
    </div>
  );
}
