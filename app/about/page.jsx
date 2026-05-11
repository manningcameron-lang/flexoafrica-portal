import Link from "next/link";

export const metadata = {
  title: "About + FAQ | Flexo Africa",
  description:
    "Flexo Africa is a flexographic plate brokerage based in Assagay, KwaZulu-Natal. Crystal and standard photopolymer plates, plus full repro and QA in-house. We deliver across South Africa and the broader continent. FAQ for new customers.",
};

const FAQS = [
  {
    q: "How does ordering work on the portal?",
    a: "Configure your plate spec and dimensions in the configurator, see live ZAR pricing, then sign up to place the order. Your order enters our workflow at the artwork stage. We prepare the PDF, send you a proof to approve, then push the file to plates. You watch every step in your dashboard.",
  },
  {
    q: "What plate types do you offer?",
    a: "Three tiers, fourteen specs. Crystal HD photopolymer for premium jobs (45, 67 thou). Surface Engineered for cleaner ink lay and fine-line packaging (45, 67, 100, 112, 125 thou). Standard digital photopolymer for daily production (45, 67, 100, 112, 125, 185, 250 thou). Sizes up to 203 x 127 cm.",
  },
  {
    q: "What is your turnaround time?",
    a: "Standard turnaround is 48 to 72 hours from upload and approval. Need it faster? Add Express at checkout for 24 to 36 hour turnaround. Both clocks start the moment we have your file and you have approved the proof.",
  },
  {
    q: "How do payments work?",
    a: "We support both account terms and card payment. Existing customers on account terms get 30 days from invoice. New customers can pay by card via Stripe at order time, or apply for an account when you sign up. We will let you know your terms when your account is activated.",
  },
  {
    q: "What file formats do you accept for artwork?",
    a: "Print-ready PDF is best. Vector based, with all fonts outlined, CMYK or with separate spot channels, bleed marks set, at 100 percent scale. If your file is not press-ready, our repro team will prepare it. Send what you have, we will tell you what we need.",
  },
  {
    q: "Do you do repro, or is that separate?",
    a: "Repro is in-house. Trapping, colour separations, screen ruling, barcode placement, dieline and bleed setup. The repro stage runs as part of every job. You get a press-ready PDF proof to approve before plates are made.",
  },
  {
    q: "How is delivery handled?",
    a: "Plates ship via courier across South Africa and into the broader African continent. You get tracking the moment plates leave the press. Domestic delivery is typically 1 to 2 business days.",
  },
  {
    q: "What if a plate has a quality issue?",
    a: "We catch most issues at our QA stage before plates ship. If something gets through and you find an issue on press, contact us right away. We will investigate, replace if it is a plate issue, and adjust your invoice as needed. Quality is on us.",
  },
  {
    q: "Can I reorder a plate from a previous job?",
    a: "Yes. Every job you place stays in your order history. Hit Reorder and we use the same spec and the same artwork. You only need to confirm the quantity and any small changes.",
  },
  {
    q: "Where are you based?",
    a: "Flexo Africa (Pty) Ltd has teams across several African countries, with delivery extending across the continent. Real people, fast answers, local presence wherever your press is.",
  },
];

export default function AboutPage() {
  return (
    <>
      {/* Header */}
      <section className="bg-gradient-to-br from-brand-50 via-white to-brand-100 border-b border-brand-100">
        <div className="max-w-page mx-auto px-4 sm:px-6 py-16 md:py-20">
          <p className="text-accent-500 font-semibold text-sm uppercase tracking-wider mb-3">
            About + FAQ
          </p>
          <h1 className="text-4xl md:text-5xl font-bold text-brand-900 leading-tight max-w-3xl">
            Africa's flexographic plate partner.
          </h1>
        </div>
      </section>

      {/* About body */}
      <section className="border-b border-brand-100">
        <div className="max-w-page mx-auto px-4 sm:px-6 py-16 grid md:grid-cols-3 gap-10">
          <div className="md:col-span-2">
            <h2 className="text-2xl font-bold text-brand-900">
              Who we are
            </h2>
            <p className="mt-4 text-brand-700 leading-relaxed">
              Flexo Africa (Pty) Ltd is a flexographic plate brokerage with
              teams across several African countries. We broker Crystal,
              Surface Engineered, and Standard digital photopolymer plates,
              and pair every order with full pre-press repro and QA in-house.
            </p>
            <p className="mt-4 text-brand-700 leading-relaxed">
              Our customers are converters and printers across the African
              continent who do not want to chase plates, manage repro
              themselves, or split their business across multiple suppliers.
              They want plates on their press, on time, on spec. That is what
              we deliver.
            </p>
            <p className="mt-4 text-brand-700 leading-relaxed">
              Behind every order is a small, accessible team. Real people, real
              phones, real WhatsApp. We are accountable. We are not the
              biggest, and that is by design.
            </p>
          </div>

          <aside className="bg-brand-50 rounded-xl border border-brand-100 p-6">
            <h3 className="font-semibold text-brand-900">At a glance</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <Row label="Teams in" value="Several African countries" />
              <Row label="We deliver" value="Across Africa" />
              <Row label="We broker" value="Crystal, Surface Engineered, Standard" />
              <Row label="We do" value="Repro, plates, QA, delivery" />
              <Row label="Standard turnaround" value="48 to 72 hours" />
              <Row label="Express turnaround" value="24 to 36 hours" />
            </dl>
          </aside>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-brand-50 border-b border-brand-100">
        <div className="max-w-page mx-auto px-4 sm:px-6 py-16">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold text-brand-900">
              Frequently asked questions
            </h2>
            <p className="mt-3 text-brand-700">
              The questions converters ask us most often. Click any to expand.
            </p>
          </div>

          <div className="mt-10 max-w-3xl divide-y divide-brand-200 border-y border-brand-200 bg-white rounded-xl">
            {FAQS.map((item, i) => (
              <details
                key={i}
                className="group p-5 [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex cursor-pointer items-start justify-between gap-4 text-brand-900 font-medium">
                  <span>{item.q}</span>
                  <span className="mt-0.5 shrink-0 text-brand-500 group-open:rotate-45 transition-transform text-xl leading-none select-none">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-brand-700 leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-brand-800 text-white">
        <div className="max-w-page mx-auto px-4 sm:px-6 py-16 text-center">
          <h2 className="text-3xl md:text-4xl font-bold">
            Still have a question?
          </h2>
          <p className="mt-3 text-brand-100 max-w-xl mx-auto">
            Send us a message or jump on WhatsApp. Real people, fast answers.
          </p>
          <div className="mt-8">
            <Link
              href="/contact"
              className="px-6 py-3 bg-accent-500 hover:bg-accent-600 text-white font-medium rounded-md"
            >
              Get in touch
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-brand-600">{label}</dt>
      <dd className="text-right font-medium text-brand-900">{value}</dd>
    </div>
  );
}
