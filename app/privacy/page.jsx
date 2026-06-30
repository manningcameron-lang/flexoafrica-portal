import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | Flexo Africa",
  description:
    "How Flexo Africa collects, uses and protects your personal information.",
};

// Bump LAST_UPDATED when the substantive policy changes so customers can
// see when it last moved.
const LAST_UPDATED = "29 June 2026";

export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
      <p className="text-accent-500 font-semibold text-sm uppercase tracking-wider mb-3">
        Legal
      </p>
      <h1 className="text-4xl md:text-5xl font-bold text-brand-900 leading-tight">
        Privacy Policy
      </h1>
      <p className="mt-4 text-brand-700">
        Last updated {LAST_UPDATED}. This policy explains how Flexo Africa
        (Pty) Ltd (&ldquo;we&rdquo;, &ldquo;us&rdquo;) collects, uses and
        protects your personal information when you use{" "}
        <a
          href="https://portal.flexoafrica.com"
          className="text-accent-600 hover:text-accent-700"
        >
          portal.flexoafrica.com
        </a>
        . It is written to align with the South African Protection of
        Personal Information Act (POPIA).
      </p>

      <div className="prose prose-brand mt-10 max-w-none">
        <Section title="1. Information we collect">
          When you sign up we collect your name, work email, phone number,
          company name and the password you choose. When you place an
          order we collect the artwork PDFs you upload, the print
          specifications you enter, the delivery address you provide, and
          payment metadata returned by PayFast. We also log basic
          technical information such as IP address and browser type to
          keep the portal secure.
        </Section>

        <Section title="2. How we use it">
          We use your information to operate your account, produce and
          deliver your plates, communicate with you about your orders,
          process payments, send the email notifications you opt into,
          comply with our legal obligations, and improve the service. We
          do not sell your information.
        </Section>

        <Section title="3. Lawful basis">
          We process your information on the basis of the contract
          between us (your portal account and any orders you place), your
          consent where you have given it (for example marketing emails,
          should we ever send them), and our legitimate interests in
          operating and protecting the service.
        </Section>

        <Section title="4. Who we share it with">
          We share information with our service providers only to the
          extent needed to deliver the service: Google (Firebase
          Authentication, Firestore, Cloud Storage), Vercel (hosting),
          Resend (transactional email), PayFast (payments), Cloudflare
          (security and bot mitigation), and the courier networks that
          deliver your plates. These providers process your data on our
          instructions and are bound by their own privacy commitments.
          We may also disclose information where required by law or to
          protect the rights of Flexo Africa or our customers.
        </Section>

        <Section title="5. Cross-border transfer">
          Some of our service providers store data outside South Africa
          (for example Firebase storage in us-east-1). Where this happens,
          we rely on the standard contractual safeguards those providers
          offer for international data transfer. By using the portal you
          consent to your data being processed in those jurisdictions.
        </Section>

        <Section title="6. How long we keep it">
          Account records are kept for as long as your account is active
          and for a reasonable period afterwards. Order records and
          invoices are kept for at least 5 years to meet South African
          tax and accounting requirements. Artwork files are kept while
          they may be needed for repeat orders, and on request can be
          deleted once we have invoiced.
        </Section>

        <Section title="7. Your rights">
          Under POPIA you have the right to know what personal
          information we hold about you, to ask for it to be corrected
          or deleted, to object to processing in certain circumstances,
          and to withdraw consent where we relied on it. To exercise any
          of these rights, email{" "}
          <a
            href="mailto:sales@flexoafrica.com"
            className="text-accent-600 hover:text-accent-700"
          >
            sales@flexoafrica.com
          </a>
          . We respond within a reasonable timeframe, usually within 30
          days.
        </Section>

        <Section title="8. Security">
          We use HTTPS across the portal, Firebase Authentication for
          identity, per-company isolation in Firestore rules so customers
          only see their own data, and Cloudflare Turnstile to keep bots
          out of sign-up. Payments are handled by PayFast under their own
          security regime. No system is perfectly secure; if a personal
          information breach occurs we notify affected users and the
          Information Regulator in line with POPIA.
        </Section>

        <Section title="9. Cookies and tracking">
          We use a small number of strictly-necessary cookies and
          local-storage entries to keep you signed in and remember your
          last filter and sort choices on the portal. We do not use
          third-party advertising or tracking cookies. Cloudflare
          Turnstile sets short-lived cookies during the signup challenge.
        </Section>

        <Section title="10. Children">
          The portal is a B2B service for businesses producing flexo
          plates. It is not intended for anyone under the age of 18 and
          we do not knowingly collect information from minors.
        </Section>

        <Section title="11. Changes to this policy">
          We may update this policy from time to time. The &ldquo;Last
          updated&rdquo; date at the top reflects the latest version.
          Material changes are emailed to account holders before they
          take effect.
        </Section>

        <Section title="12. Contact and information officer">
          Information Officer: Cameron Manning, Director, Flexo Africa
          (Pty) Ltd.{" "}
          <a
            href="mailto:sales@flexoafrica.com"
            className="text-accent-600 hover:text-accent-700"
          >
            sales@flexoafrica.com
          </a>{" "}
          ·{" "}
          <a
            href="tel:+27726652041"
            className="text-accent-600 hover:text-accent-700"
          >
            +27 72 665 2041
          </a>
          . Assagay, KwaZulu-Natal, South Africa.
        </Section>
      </div>

      <div className="mt-12 text-sm text-brand-600">
        See also our{" "}
        <Link
          href="/terms"
          className="text-accent-600 hover:text-accent-700"
        >
          Terms of Service
        </Link>
        .
      </div>
    </main>
  );
}

function Section({ title, children }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-bold text-brand-900">{title}</h2>
      <p className="mt-2 text-brand-700 leading-relaxed">{children}</p>
    </section>
  );
}
