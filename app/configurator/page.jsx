"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PLATE_TYPES, SUBSTRATE_OPTIONS, TIERS } from "@/lib/plate-types";
import { calcPrice, formatZAR } from "@/lib/pricing";
import { saveQuote } from "@/lib/quotes";

export default function ConfiguratorPage() {
  const [substrate, setSubstrate] = useState("");
  const [plateTier, setPlateTier] = useState("");
  const [plateTypeId, setPlateTypeId] = useState("");
  const [widthCm, setWidthCm] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [qty, setQty] = useState(1);
  const [tier, setTier] = useState("standard"); // turnaround tier: standard | express
  const [showSaveModal, setShowSaveModal] = useState(false);

  const filteredTypes = useMemo(
    () => PLATE_TYPES.filter((t) => !plateTier || t.tier === plateTier),
    [plateTier]
  );
  const selectedType = PLATE_TYPES.find((t) => t.id === plateTypeId);

  const price = useMemo(
    () =>
      calcPrice({
        widthCm,
        heightCm,
        qty,
        isExpress: tier === "express",
      }),
    [widthCm, heightCm, qty, tier]
  );

  const isComplete =
    !!substrate &&
    !!plateTier &&
    !!plateTypeId &&
    Number(widthCm) > 0 &&
    Number(heightCm) > 0 &&
    Number(qty) > 0;

  function buildSpec() {
    return {
      substrate,
      plateTier,
      plateTypeId,
      plateTypeName: selectedType?.name || null,
      thicknessMm: selectedType?.thicknessMm || null,
      widthCm: Number(widthCm) || 0,
      heightCm: Number(heightCm) || 0,
      qty: Number(qty) || 0,
      tier,
    };
  }

  const orderHref = isComplete
    ? `/signup?spec=${encodeURIComponent(JSON.stringify(buildSpec()))}`
    : "#";

  return (
    <>
      {/* Header */}
      <section className="bg-gradient-to-br from-brand-50 via-white to-brand-100 border-b border-brand-100">
        <div className="max-w-page mx-auto px-4 sm:px-6 py-12 md:py-16">
          <p className="text-accent-500 font-semibold text-sm uppercase tracking-wider mb-3">
            Configurator
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-brand-900 leading-tight max-w-3xl">
            Price your plate. Live ZAR, no signup needed.
          </h1>
          <p className="mt-3 text-brand-700 max-w-2xl">
            Tell us your spec and dimensions. We calculate a price using our
            list rates. Sign up when you are ready to place the order, or save
            the quote for later.
          </p>
        </div>
      </section>

      {/* Body */}
      <section className="border-b border-brand-100">
        <div className="max-w-page mx-auto px-4 sm:px-6 py-10 md:py-12 grid md:grid-cols-3 gap-8 items-start">
          {/* Form */}
          <div className="md:col-span-2 space-y-6">
            <Card title="Substrate">
              <Select
                value={substrate}
                onChange={(e) => setSubstrate(e.target.value)}
              >
                <option value="">What are you printing on?</option>
                {SUBSTRATE_OPTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Card>

            <Card title="Plate tier">
              <div className="grid sm:grid-cols-3 gap-3">
                {TIERS.map((t) => (
                  <TierPickerButton
                    key={t}
                    label={t}
                    sub={
                      t === "Crystal"
                        ? "Premium HD"
                        : t === "Surface Engineered"
                        ? "Cleaner ink lay"
                        : "Standard digital"
                    }
                    active={plateTier === t}
                    onClick={() => {
                      setPlateTier(t);
                      // reset plate type when switching tier
                      setPlateTypeId("");
                    }}
                  />
                ))}
              </div>
            </Card>

            <Card title="Plate thickness" disabled={!plateTier} disabledHint="Choose a tier first">
              <Select
                value={plateTypeId}
                onChange={(e) => setPlateTypeId(e.target.value)}
                disabled={!plateTier}
              >
                <option value="">Select a plate thickness</option>
                {filteredTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.thicknessMm.toFixed(2)} mm)
                  </option>
                ))}
              </Select>
              {selectedType && (
                <p className="mt-2 text-sm text-brand-600">
                  Use case: {selectedType.useCase}
                </p>
              )}
            </Card>

            <Card title="Plate dimensions">
              <div className="grid sm:grid-cols-3 gap-4">
                <NumberField
                  label="Width (cm)"
                  value={widthCm}
                  onChange={setWidthCm}
                  max={203}
                  hint="Max 203 cm"
                />
                <NumberField
                  label="Height (cm)"
                  value={heightCm}
                  onChange={setHeightCm}
                  max={127}
                  hint="Max 127 cm"
                />
                <NumberField
                  label="Quantity"
                  value={qty}
                  onChange={setQty}
                  min={1}
                  hint="Plates"
                />
              </div>
            </Card>

            <Card title="Turnaround">
              <div className="grid sm:grid-cols-2 gap-3">
                <TierToggle
                  label="Standard"
                  sub="48 to 72 hours from upload + approval"
                  active={tier === "standard"}
                  onClick={() => setTier("standard")}
                />
                <TierToggle
                  label="Express"
                  sub="24 to 36 hours after upload + approval, +25%"
                  active={tier === "express"}
                  onClick={() => setTier("express")}
                  accent
                />
              </div>
            </Card>
          </div>

          {/* Sticky price card */}
          <aside className="md:sticky md:top-20 space-y-4">
            <PriceCard
              price={price}
              tier={tier}
              isComplete={isComplete}
              orderHref={orderHref}
              onSave={() => setShowSaveModal(true)}
            />
            <p className="text-xs text-brand-500 text-center px-4">
              Prices are estimates based on our standard list rates and your
              dimensions. Final price confirmed at order placement.
            </p>
          </aside>
        </div>
      </section>

      {showSaveModal && (
        <SaveQuoteModal
          spec={buildSpec()}
          price={price}
          onClose={() => setShowSaveModal(false)}
        />
      )}
    </>
  );
}

// ----- presentational components -----

function Card({ title, children, disabled, disabledHint }) {
  return (
    <div className="bg-white rounded-xl border border-brand-100 p-5 shadow-sm">
      <h3 className="font-semibold text-brand-900 text-sm uppercase tracking-wider">
        {title}
      </h3>
      <div className="mt-3">{children}</div>
      {disabled && disabledHint && (
        <p className="mt-2 text-xs text-brand-500">{disabledHint}</p>
      )}
    </div>
  );
}

function Select({ children, ...rest }) {
  return (
    <select
      {...rest}
      className="block w-full rounded-md border border-brand-200 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
    >
      {children}
    </select>
  );
}

function NumberField({ label, value, onChange, min = 0, max, hint }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-brand-800">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step="0.1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-md border border-brand-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      {hint && (
        <span className="text-xs text-brand-500 mt-1 block">{hint}</span>
      )}
    </label>
  );
}

function TierPickerButton({ label, sub, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-md border px-4 py-3 text-left transition " +
        (active
          ? "border-brand-700 bg-brand-700 text-white"
          : "border-brand-200 bg-white text-brand-800 hover:bg-brand-50")
      }
    >
      <div className="font-semibold">{label}</div>
      <div className={"text-xs mt-0.5 " + (active ? "text-white/85" : "text-brand-600")}>
        {sub}
      </div>
    </button>
  );
}

function TierToggle({ label, sub, active, onClick, accent = false }) {
  const activeStyle = accent
    ? "border-accent-500 bg-accent-500 text-white"
    : "border-brand-700 bg-brand-700 text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-md border px-4 py-3 text-left transition " +
        (active
          ? activeStyle
          : "border-brand-200 bg-white text-brand-800 hover:bg-brand-50")
      }
    >
      <div className="font-semibold">{label}</div>
      <div
        className={
          "text-xs mt-0.5 " +
          (active ? "text-white/85" : "text-brand-600")
        }
      >
        {sub}
      </div>
    </button>
  );
}

function PriceCard({ price, tier, isComplete, orderHref, onSave }) {
  return (
    <div className="bg-brand-900 text-white rounded-xl shadow-lg overflow-hidden">
      <div className="p-5">
        <div className="text-xs uppercase tracking-wider text-brand-300">
          Live quote
        </div>
        <div className="mt-1 text-3xl font-bold">
          {formatZAR(price.total)}
        </div>
        <div className="mt-1 text-xs text-brand-300">
          incl. {price.vatPercent}% VAT
        </div>
      </div>

      <div className="bg-brand-800 px-5 py-4 space-y-2 text-sm">
        <Row
          label={`Plate area (${price.areaCm2} cm²)`}
          value={formatZAR(price.subtotal)}
        />
        {tier === "express" && price.rushUplift > 0 && (
          <Row
            label={`Express +${price.rushUpliftPercent}%`}
            value={formatZAR(price.rushUplift)}
            highlight
          />
        )}
        <Row label={`VAT ${price.vatPercent}%`} value={formatZAR(price.vat)} />
      </div>

      <div className="p-5 bg-brand-900 space-y-2">
        {isComplete ? (
          <Link
            href={orderHref}
            className="block w-full text-center px-4 py-3 bg-accent-500 hover:bg-accent-600 text-white font-medium rounded-md"
          >
            Sign up to order
          </Link>
        ) : (
          <button
            disabled
            className="block w-full text-center px-4 py-3 bg-brand-700 text-brand-300 cursor-not-allowed rounded-md"
          >
            Complete the form to order
          </button>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={!isComplete}
          className="block w-full text-center px-4 py-3 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white font-medium rounded-md"
        >
          Save / email this quote
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, highlight }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className={highlight ? "text-accent-400" : "text-brand-200"}>
        {label}
      </span>
      <span className={"font-medium " + (highlight ? "text-accent-300" : "text-white")}>
        {value}
      </span>
    </div>
  );
}

function SaveQuoteModal({ spec, price, onClose }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState("idle"); // idle | submitting | success | error
  const [errorMsg, setErrorMsg] = useState(null);

  async function handleSave(e) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg(null);
    try {
      await saveQuote({ email, name, spec, price });
      setStatus("success");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setErrorMsg(err?.message || "Could not save quote.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center px-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        {status === "success" ? (
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-50 text-green-600 text-2xl mb-3">
              v
            </div>
            <h3 className="text-xl font-bold text-brand-900">Quote saved</h3>
            <p className="mt-2 text-brand-700">
              We have your quote. We will email a copy to {email} and our team
              will follow up within one business day.
            </p>
            <button
              onClick={onClose}
              className="mt-6 px-4 py-2 bg-brand-700 hover:bg-brand-800 text-white font-medium rounded-md"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <h3 className="text-xl font-bold text-brand-900">Save this quote</h3>
            <p className="text-sm text-brand-700">
              Pop in your email and we will save the spec plus the live price
              for you, and follow up within one business day.
            </p>
            <label className="block">
              <span className="text-sm font-medium text-brand-800">Your name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full rounded-md border border-brand-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-brand-800">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-md border border-brand-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                required
              />
            </label>
            {status === "error" && (
              <div className="rounded-md bg-red-50 border border-red-200 text-red-800 px-3 py-2 text-sm">
                {errorMsg}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-brand-100 hover:bg-brand-200 text-brand-800 font-medium rounded-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={status === "submitting"}
                className="flex-1 px-4 py-2 bg-brand-700 hover:bg-brand-800 disabled:opacity-60 text-white font-medium rounded-md"
              >
                {status === "submitting" ? "Saving..." : "Save quote"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
