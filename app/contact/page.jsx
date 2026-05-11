"use client";

import { useState } from "react";
import { submitLead } from "@/lib/leads";

const PLATE_OPTIONS = [
  "Not sure yet, need help",
  "Crystal 45 thou",
  "Crystal 67 thou",
  "Surface Engineered 45 thou",
  "Surface Engineered 67 thou",
  "Surface Engineered 100 thou",
  "Surface Engineered 112 thou",
  "Surface Engineered 125 thou",
  "Standard 45 thou",
  "Standard 67 thou",
  "Standard 100 thou",
  "Standard 112 thou",
  "Standard 125 thou",
  "Standard 185 thou",
  "Standard 250 thou",
  "Repro only, no plates",
  "Other (mention in message)",
];

export default function ContactPage() {
  const [form, setForm] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    plateType: "",
    message: "",
  });
  const [status, setStatus] = useState("idle"); // idle | submitting | success | error
  const [errorMsg, setErrorMsg] = useState(null);

  const wa = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
  const waLink = wa
    ? `https://wa.me/${wa}?text=${encodeURIComponent(
        "Hi Flexo Africa, I have a question about plates."
      )}`
    : null;

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg(null);
    try {
      await submitLead({ ...form, source: "portal-contact-form" });
      setStatus("success");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setErrorMsg(
        err?.message ||
          "Could not send your message. Please try WhatsApp or email instead."
      );
    }
  }

  return (
    <>
      {/* Header */}
      <section className="bg-gradient-to-br from-brand-50 via-white to-brand-100 border-b border-brand-100">
        <div className="max-w-page mx-auto px-4 sm:px-6 py-16">
          <p className="text-accent-500 font-semibold text-sm uppercase tracking-wider mb-3">
            Contact
          </p>
          <h1 className="text-4xl md:text-5xl font-bold text-brand-900 leading-tight">
            Talk to us.
          </h1>
          <p className="mt-4 text-lg text-brand-700 max-w-2xl">
            Send a message, or message us on WhatsApp. We reply within one
            business hour during work hours.
          </p>
        </div>
      </section>

      {/* Body: form + sidebar */}
      <section className="border-b border-brand-100">
        <div className="max-w-page mx-auto px-4 sm:px-6 py-16 grid md:grid-cols-3 gap-10">
          {/* Form */}
          <div className="md:col-span-2">
            {status === "success" ? (
              <SuccessCard onReset={() => {
                setForm({ name: "", company: "", email: "", phone: "", plateType: "", message: "" });
                setStatus("idle");
              }} />
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 bg-white rounded-xl border border-brand-100 p-6 shadow-sm">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field
                    label="Your name"
                    autoComplete="name"
                    value={form.name}
                    onChange={update("name")}
                    required
                  />
                  <Field
                    label="Company"
                    placeholder="Your converter or printer name"
                    value={form.company}
                    onChange={update("company")}
                    required
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field
                    label="Email"
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={update("email")}
                    required
                  />
                  <Field
                    label="Phone"
                    type="tel"
                    autoComplete="tel"
                    value={form.phone}
                    onChange={update("phone")}
                  />
                </div>
                <label className="block">
                  <span className="text-sm font-medium text-brand-800">What plate type, if known</span>
                  <select
                    value={form.plateType}
                    onChange={update("plateType")}
                    className="mt-1 block w-full rounded-md border border-brand-200 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">Select an option</option>
                    {PLATE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-brand-800">Your message</span>
                  <textarea
                    required
                    rows={5}
                    value={form.message}
                    onChange={update("message")}
                    className="mt-1 block w-full rounded-md border border-brand-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="Tell us about your job: substrate, dimensions, qty, deadline, anything else useful."
                  />
                </label>

                {status === "error" && (
                  <div className="rounded-md bg-red-50 border border-red-200 text-red-800 px-3 py-2 text-sm">
                    {errorMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={status === "submitting"}
                  className="w-full sm:w-auto px-6 py-3 bg-brand-700 hover:bg-brand-800 disabled:opacity-60 text-white font-medium rounded-md"
                >
                  {status === "submitting" ? "Sending..." : "Send message"}
                </button>

                <p className="text-xs text-brand-500">
                  We reply within one business hour, weekdays 8am to 5pm SAST.
                </p>
              </form>
            )}
          </div>

          {/* Sidebar */}
          <aside className="space-y-6">
            <div className="bg-brand-50 rounded-xl border border-brand-100 p-6">
              <h3 className="font-semibold text-brand-900">Other ways to reach us</h3>
              {waLink && (
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 flex w-full justify-center px-4 py-3 bg-accent-500 hover:bg-accent-600 text-white font-medium rounded-md"
                >
                  Chat on WhatsApp
                </a>
              )}
              {!waLink && (
                <p className="mt-4 text-sm text-brand-600">
                  WhatsApp link will appear here once your business number is set.
                </p>
              )}
              <div className="mt-6 space-y-3 text-sm text-brand-700">
                <Detail label="Address" value="Assagay, KwaZulu-Natal, South Africa" />
                <Detail label="Hours" value="Mon to Fri, 8am to 5pm SAST" />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-brand-100 p-6">
              <h3 className="font-semibold text-brand-900">Faster path</h3>
              <p className="mt-2 text-sm text-brand-700">
                Already a customer with a plate spec in mind? Skip the form,
                use the configurator to get a price in seconds.
              </p>
              <a
                href="/configurator"
                className="mt-4 inline-block text-brand-700 hover:text-brand-900 text-sm font-medium"
              >
                Open the configurator -&gt;
              </a>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}

function Field({ label, hint, ...rest }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-brand-800">{label}</span>
      <input
        {...rest}
        className="mt-1 block w-full rounded-md border border-brand-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      {hint && <span className="text-xs text-brand-500 mt-1 block">{hint}</span>}
    </label>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-brand-500">{label}</dt>
      <dd className="mt-0.5 text-brand-900">{value}</dd>
    </div>
  );
}

function SuccessCard({ onReset }) {
  return (
    <div className="bg-white rounded-xl border border-green-200 p-8 text-center shadow-sm">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-50 text-green-600 text-2xl mb-4">
        v
      </div>
      <h2 className="text-2xl font-bold text-brand-900">Got it. Thanks.</h2>
      <p className="mt-2 text-brand-700">
        Your message is in our inbox. We will reply within one business hour
        during work hours.
      </p>
      <button
        onClick={onReset}
        className="mt-6 px-4 py-2 bg-brand-100 hover:bg-brand-200 text-brand-800 font-medium rounded-md"
      >
        Send another message
      </button>
    </div>
  );
}
