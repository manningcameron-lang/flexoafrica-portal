"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import {
  PLATE_TYPES,
  TIERS,
  SUBSTRATE_OPTIONS,
  PUBLIC_SELL_RATE_PER_CM2,
  RUSH_UPLIFT_PERCENT,
  VAT_PERCENT,
} from "@/lib/plate-types";
import { calcPrice, formatZAR } from "@/lib/pricing";
import { createOrderFromPortal } from "@/lib/orders";

function newLineItem() {
  return {
    plateTier: "",
    plateTypeId: "",
    substrate: "",
    widthCm: "",
    heightCm: "",
    qty: 1,
    specialInstructions: "",
    pdfFile: null,
  };
}

export default function NewOrderPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  // ----- header -----
  const [poNumber, setPoNumber] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [requiredByDate, setRequiredByDate] = useState("");
  const [tier, setTier] = useState("standard");

  // ----- line items -----
  const [lineItems, setLineItems] = useState([newLineItem()]);

  // ----- submit state -----
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState("");
  const [error, setError] = useState(null);

  // Auth gate: redirect if not active customer.
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (profile && profile.role !== "customer")
      router.replace("/login?error=role");
    else if (profile && profile.status !== "active")
      router.replace(
        profile.status === "pending" ? "/awaiting-approval" : "/suspended"
      );
  }, [user, profile, loading, router]);

  // Pre-fill delivery address with company name once profile loads.
  useEffect(() => {
    if (profile && !deliveryAddress) {
      setDeliveryAddress(profile.company ? profile.company + "\n" : "");
    }
  }, [profile]); // eslint-disable-line

  // ----- pricing -----
  const lineItemPrices = useMemo(
    () =>
      lineItems.map((li) =>
        calcPrice({
          widthCm: li.widthCm,
          heightCm: li.heightCm,
          qty: li.qty,
          isExpress: false, // tier uplift applied at order level below
        })
      ),
    [lineItems]
  );

  const subtotal = useMemo(
    () => lineItemPrices.reduce((sum, p) => sum + p.subtotal, 0),
    [lineItemPrices]
  );
  const rushUplift = useMemo(
    () => (tier === "express" ? subtotal * (RUSH_UPLIFT_PERCENT / 100) : 0),
    [subtotal, tier]
  );
  const beforeVat = subtotal + rushUplift;
  const vat = beforeVat * (VAT_PERCENT / 100);
  const total = beforeVat + vat;

  // ----- handlers -----
  function updateLineItem(idx, field, value) {
    setLineItems((items) =>
      items.map((li, i) => (i === idx ? { ...li, [field]: value } : li))
    );
  }
  function addLineItem() {
    setLineItems((items) => [...items, newLineItem()]);
  }
  function removeLineItem(idx) {
    setLineItems((items) => (items.length === 1 ? items : items.filter((_, i) => i !== idx)));
  }

  function validate() {
    if (!deliveryAddress.trim()) return "Add a delivery address.";
    if (!requiredByDate) return "Pick a required-by date.";
    for (let i = 0; i < lineItems.length; i++) {
      const li = lineItems[i];
      const idx = i + 1;
      if (!li.plateTier) return `Plate ${idx}: choose a tier.`;
      if (!li.plateTypeId) return `Plate ${idx}: choose a thickness.`;
      if (!li.substrate) return `Plate ${idx}: choose a substrate.`;
      if (!(Number(li.widthCm) > 0)) return `Plate ${idx}: enter width.`;
      if (!(Number(li.heightCm) > 0)) return `Plate ${idx}: enter height.`;
      if (!(Number(li.qty) > 0)) return `Plate ${idx}: enter quantity.`;
      if (!li.pdfFile) return `Plate ${idx}: upload your artwork PDF.`;
    }
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setSubmitting(true);
    try {
      // PDF upload and order/job creation now happen atomically inside
      // createOrderFromPortal. No customer-side updates required.
      setSubmitProgress("Uploading and placing order...");
      const result = await createOrderFromPortal({
        profile: { ...profile, uid: user.uid },
        header: {
          poNumber,
          deliveryAddress,
          requiredByDate,
          tier,
        },
        lineItems,
      });

      setSubmitProgress("Done. Redirecting...");
      router.push(`/order/${result.orderId}/success`);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Could not place order. Please try again.");
      setSubmitting(false);
      setSubmitProgress("");
    }
  }

  if (loading || !profile || profile.status !== "active") {
    return (
      <div className="max-w-page mx-auto px-4 sm:px-6 py-20 text-center text-brand-600">
        Loading...
      </div>
    );
  }

  return (
    <>
      <section className="bg-gradient-to-br from-brand-50 via-white to-brand-100 border-b border-brand-100">
        <div className="max-w-page mx-auto px-4 sm:px-6 py-10">
          <p className="text-accent-500 font-semibold text-sm uppercase tracking-wider mb-2">
            Place an order
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-brand-900">
            New plate order
          </h1>
          <p className="mt-2 text-brand-700 max-w-2xl">
            Add one plate or many. Each plate gets its own job number in our
            system. Upload your artwork PDF per plate. We will email a proof
            for approval before plates are made.
          </p>
        </div>
      </section>

      <section className="border-b border-brand-100">
        <form
          onSubmit={handleSubmit}
          className="max-w-page mx-auto px-4 sm:px-6 py-10 grid md:grid-cols-3 gap-8 items-start"
        >
          {/* Left: form */}
          <div className="md:col-span-2 space-y-6">
            <Card title="Order details">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field
                  label="PO number (optional)"
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  placeholder="e.g. PO-2026-1234"
                />
                <DateField
                  label="Required by"
                  required
                  value={requiredByDate}
                  onChange={(e) => setRequiredByDate(e.target.value)}
                />
              </div>
              <label className="block mt-4">
                <span className="text-sm font-medium text-brand-800">
                  Delivery address
                </span>
                <textarea
                  required
                  rows={3}
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-brand-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Company, street, city, country, contact name, phone"
                />
              </label>
              <div className="mt-4">
                <p className="text-sm font-medium text-brand-800 mb-2">
                  Turnaround
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <TurnaroundToggle
                    label="Standard"
                    sub="48 to 72 hours from upload + approval"
                    active={tier === "standard"}
                    onClick={() => setTier("standard")}
                  />
                  <TurnaroundToggle
                    label="Express"
                    sub="24 to 36 hours after upload + approval, +25%"
                    active={tier === "express"}
                    onClick={() => setTier("express")}
                    accent
                  />
                </div>
              </div>
            </Card>

            {/* Line items */}
            {lineItems.map((li, idx) => (
              <LineItemCard
                key={idx}
                idx={idx}
                lineItem={li}
                price={lineItemPrices[idx]}
                canRemove={lineItems.length > 1}
                onChange={(field, value) => updateLineItem(idx, field, value)}
                onRemove={() => removeLineItem(idx)}
              />
            ))}

            <button
              type="button"
              onClick={addLineItem}
              className="w-full px-5 py-3 bg-white border-2 border-dashed border-brand-300 hover:border-brand-500 text-brand-700 font-medium rounded-md"
            >
              + Add another plate
            </button>
          </div>

          {/* Right: sticky summary */}
          <aside className="md:sticky md:top-20 space-y-4">
            <SummaryCard
              lineItemCount={lineItems.length}
              subtotal={subtotal}
              rushUplift={rushUplift}
              tier={tier}
              vat={vat}
              total={total}
              submitting={submitting}
              submitProgress={submitProgress}
              error={error}
            />
            <p className="text-xs text-brand-500 text-center px-4">
              Submitting an order creates a job for each plate in our system.
              Our team prepares your artwork and sends a proof for your
              approval before plates are made. You can track progress in your
              dashboard.
            </p>
          </aside>
        </form>
      </section>
    </>
  );
}

// ----- presentational components -----

function Card({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-brand-100 p-5 shadow-sm">
      <h3 className="font-semibold text-brand-900 text-sm uppercase tracking-wider">
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Field({ label, ...rest }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-brand-800">{label}</span>
      <input
        {...rest}
        className="mt-1 block w-full rounded-md border border-brand-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </label>
  );
}

function DateField({ label, required, ...rest }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <label className="block">
      <span className="text-sm font-medium text-brand-800">{label}</span>
      <input
        type="date"
        min={today}
        required={required}
        {...rest}
        className="mt-1 block w-full rounded-md border border-brand-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </label>
  );
}

function TurnaroundToggle({ label, sub, active, onClick, accent = false }) {
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
          "text-xs mt-0.5 " + (active ? "text-white/85" : "text-brand-600")
        }
      >
        {sub}
      </div>
    </button>
  );
}

function LineItemCard({ idx, lineItem, price, canRemove, onChange, onRemove }) {
  const filteredTypes = PLATE_TYPES.filter(
    (t) => !lineItem.plateTier || t.tier === lineItem.plateTier
  );
  const selectedType = PLATE_TYPES.find((t) => t.id === lineItem.plateTypeId);

  return (
    <div className="bg-white rounded-xl border border-brand-100 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-brand-900">
          Plate {idx + 1}
          {selectedType && (
            <span className="ml-2 text-xs font-normal text-brand-500">
              {selectedType.name}
            </span>
          )}
        </h3>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-sm text-red-600 hover:text-red-700"
          >
            Remove
          </button>
        )}
      </div>

      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium text-brand-800">Tier</span>
            <select
              value={lineItem.plateTier}
              onChange={(e) => {
                onChange("plateTier", e.target.value);
                onChange("plateTypeId", "");
              }}
              className="mt-1 block w-full rounded-md border border-brand-200 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Select tier</option>
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-brand-800">
              Thickness
            </span>
            <select
              value={lineItem.plateTypeId}
              disabled={!lineItem.plateTier}
              onChange={(e) => onChange("plateTypeId", e.target.value)}
              className="mt-1 block w-full rounded-md border border-brand-200 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
            >
              <option value="">Select thickness</option>
              {filteredTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.thicknessMm.toFixed(2)} mm)
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-brand-800">Substrate</span>
          <select
            value={lineItem.substrate}
            onChange={(e) => onChange("substrate", e.target.value)}
            className="mt-1 block w-full rounded-md border border-brand-200 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">What are you printing on?</option>
            {SUBSTRATE_OPTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid sm:grid-cols-3 gap-4">
          <label className="block">
            <span className="text-sm font-medium text-brand-800">
              Width (cm)
            </span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={203}
              step="0.1"
              value={lineItem.widthCm}
              onChange={(e) => onChange("widthCm", e.target.value)}
              className="mt-1 block w-full rounded-md border border-brand-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-brand-800">
              Height (cm)
            </span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={127}
              step="0.1"
              value={lineItem.heightCm}
              onChange={(e) => onChange("heightCm", e.target.value)}
              className="mt-1 block w-full rounded-md border border-brand-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-brand-800">Quantity</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              step="1"
              value={lineItem.qty}
              onChange={(e) => onChange("qty", e.target.value)}
              className="mt-1 block w-full rounded-md border border-brand-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>
        </div>

        <PdfDropzone
          file={lineItem.pdfFile}
          onChange={(file) => onChange("pdfFile", file)}
        />

        <label className="block">
          <span className="text-sm font-medium text-brand-800">
            Special instructions (optional)
          </span>
          <textarea
            rows={2}
            value={lineItem.specialInstructions}
            onChange={(e) => onChange("specialInstructions", e.target.value)}
            placeholder="Anything our repro team should know about this plate"
            className="mt-1 block w-full rounded-md border border-brand-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </label>

        <div className="flex justify-between text-sm pt-2 border-t border-brand-100">
          <span className="text-brand-600">
            Plate area:{" "}
            <span className="font-medium text-brand-800">
              {price.areaCm2} cm²
            </span>
          </span>
          <span className="font-semibold text-brand-900">
            {formatZAR(price.subtotal)}
          </span>
        </div>
      </div>
    </div>
  );
}

function PdfDropzone({ file, onChange }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-brand-800">
        Artwork PDF (required)
      </span>
      <div className="mt-1 relative rounded-md border-2 border-dashed border-brand-300 hover:border-brand-500 transition bg-brand-50/50">
        <input
          type="file"
          accept="application/pdf,image/*"
          onChange={(e) => onChange(e.target.files?.[0] || null)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div className="px-4 py-6 text-center pointer-events-none">
          {file ? (
            <div>
              <div className="text-brand-900 font-medium">{file.name}</div>
              <div className="text-xs text-brand-600 mt-1">
                {(file.size / 1024 / 1024).toFixed(2)} MB. Click to replace.
              </div>
            </div>
          ) : (
            <div className="text-brand-600">
              <div className="font-medium text-brand-800">
                Drop a PDF here, or click to choose
              </div>
              <div className="text-xs mt-1">
                Print-ready PDF preferred. Max 50 MB.
              </div>
            </div>
          )}
        </div>
      </div>
    </label>
  );
}

function SummaryCard({
  lineItemCount,
  subtotal,
  rushUplift,
  tier,
  vat,
  total,
  submitting,
  submitProgress,
  error,
}) {
  return (
    <div className="bg-brand-900 text-white rounded-xl shadow-lg overflow-hidden">
      <div className="p-5">
        <div className="text-xs uppercase tracking-wider text-brand-300">
          Order summary
        </div>
        <div className="mt-1 text-3xl font-bold">{formatZAR(total)}</div>
        <div className="mt-1 text-xs text-brand-300">
          incl. {VAT_PERCENT}% VAT
        </div>
      </div>

      <div className="bg-brand-800 px-5 py-4 space-y-2 text-sm">
        <Row
          label={`Plates (${lineItemCount})`}
          value={formatZAR(subtotal)}
        />
        {tier === "express" && rushUplift > 0 && (
          <Row
            label={`Express +${RUSH_UPLIFT_PERCENT}%`}
            value={formatZAR(rushUplift)}
            highlight
          />
        )}
        <Row label={`VAT ${VAT_PERCENT}%`} value={formatZAR(vat)} />
      </div>

      <div className="p-5 bg-brand-900 space-y-3">
        {error && (
          <div className="rounded-md bg-red-500/15 border border-red-500/40 text-red-200 px-3 py-2 text-sm">
            {error}
          </div>
        )}
        {submitProgress && !error && (
          <div className="text-xs text-brand-300">{submitProgress}</div>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="block w-full text-center px-4 py-3 bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white font-medium rounded-md"
        >
          {submitting ? "Placing order..." : "Place order"}
        </button>
        <Link
          href="/dashboard"
          className="block w-full text-center text-sm text-brand-300 hover:text-white"
        >
          Cancel and return to dashboard
        </Link>
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
      <span
        className={
          "font-medium " + (highlight ? "text-accent-300" : "text-white")
        }
      >
        {value}
      </span>
    </div>
  );
}
