"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import {
  PLATE_TYPES,
  TIERS,
  SUBSTRATE_OPTIONS,
  INK_TYPES,
  SCREEN_RULING_OPTIONS,
  PRINT_SIDE_OPTIONS,
  TURNAROUND_TIERS,
  VAT_PERCENT,
} from "@/lib/plate-types";
import { calcPrice, formatZAR } from "@/lib/pricing";
import { createOrderFromPortal } from "@/lib/orders";

function newLineItem() {
  return {
    plateTier: "",
    plateTypeId: "",
    substrate: "",
    inkType: "",
    screenRuling: "",
    printSide: "",
    cylinderSize: "",
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
  const [turnaroundTier, setTurnaroundTier] = useState("standard");

  // ----- line items -----
  const [lineItems, setLineItems] = useState([newLineItem()]);

  // ----- submit state -----
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState("");
  const [error, setError] = useState(null);

  // Auth gate
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

  // Auto-populate delivery address with everything from the profile we know
  // (company + contact + phone + email). Runs once when the profile arrives.
  useEffect(() => {
    if (profile && !deliveryAddress) {
      const lines = [];
      if (profile.company) lines.push(profile.company);
      if (profile.contactName) lines.push(`Attn: ${profile.contactName}`);
      if (profile.phone) lines.push(profile.phone);
      if (profile.email) lines.push(profile.email);
      lines.push("", "Delivery address:");
      setDeliveryAddress(lines.join("\n"));
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
          isExpress: false,
        })
      ),
    [lineItems]
  );

  const subtotal = useMemo(
    () => lineItemPrices.reduce((sum, p) => sum + p.subtotal, 0),
    [lineItemPrices]
  );
  const tierInfo = TURNAROUND_TIERS.find((t) => t.id === turnaroundTier) || TURNAROUND_TIERS[0];
  const upliftPct = tierInfo.upliftPct || 0;
  const expressUplift = subtotal * (upliftPct / 100);
  const beforeVat = subtotal + expressUplift;
  const vat = beforeVat * (VAT_PERCENT / 100);
  const total = beforeVat + vat;

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
      if (!li.substrate) return `Plate ${idx}: choose a substrate.`;
      if (!li.plateTier) return `Plate ${idx}: choose a tier.`;
      if (!li.plateTypeId) return `Plate ${idx}: choose a thickness.`;
      if (!li.inkType) return `Plate ${idx}: choose an ink type.`;
      if (!li.printSide) return `Plate ${idx}: choose surface or reverse print.`;
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
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSubmitting(true);
    try {
      setSubmitProgress("Uploading and placing order...");
      const result = await createOrderFromPortal({
        profile: { ...profile, uid: user.uid },
        header: {
          poNumber,
          deliveryAddress,
          requiredByDate,
          tier: turnaroundTier,
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
      <div className="max-w-page mx-auto px-4 sm:px-6 py-20 text-center text-ink-muted">
        Loading...
      </div>
    );
  }

  return (
    <>
      {/* Breadcrumb / page header */}
      <section className="border-b border-ink/10 bg-white">
        <div className="max-w-page mx-auto px-4 sm:px-6 py-4 text-sm text-ink-muted flex items-center gap-2">
          <Link href="/dashboard" className="hover:text-ink">Dashboard</Link>
          <span className="text-ink/30">/</span>
          <span className="text-ink font-medium">Configure your plate</span>
        </div>
      </section>

      <form
        onSubmit={handleSubmit}
        className="max-w-page mx-auto px-4 sm:px-6 py-8 grid gap-8 lg:grid-cols-[260px_1fr] items-start"
      >
        {/* ----- LEFT SIDEBAR ----- */}
        <aside className="space-y-6 lg:sticky lg:top-20">
          {/* Reference image */}
          <div className="rounded-xl overflow-hidden border border-ink/10 bg-white">
            <div className="aspect-square bg-gradient-to-br from-accent-50 via-white to-brand-50 flex items-center justify-center">
              <PlateIllustration />
            </div>
            <div className="px-3 py-2 text-[10px] text-ink-muted text-right italic">
              (image for reference)
            </div>
          </div>

          {/* Trust badges */}
          <div className="grid grid-cols-2 gap-3 text-center text-[11px]">
            <TrustBadge icon="handshake" title="Confidentiality" sub="on all your saved data" />
            <TrustBadge icon="shield" title="Secure SSL" sub="encrypted transactions" />
            <TrustBadge icon="truck" title="3 to 5 days" sub="standard turnaround" />
            <TrustBadge icon="qa" title="QA checked" sub="every plate before dispatch" />
          </div>

          {/* Fast quote calculator */}
          <FastQuote
            total={total}
            subtotal={subtotal}
            expressUplift={expressUplift}
            upliftPct={upliftPct}
            vat={vat}
            lineItemCount={lineItems.length}
            tierLabel={tierInfo.label}
          />

          {/* Contact for help */}
          <div className="rounded-xl border border-ink/10 bg-white p-4 text-sm">
            <div className="text-xs uppercase tracking-wider text-ink-muted font-semibold mb-2">
              Need help?
            </div>
            <a href="tel:+27726652041" className="block text-ink font-semibold hover:text-accent-500">
              +27 72 665 2041
            </a>
            <a
              href="https://wa.me/27645867535"
              target="_blank"
              rel="noopener noreferrer"
              className="block mt-2 text-brand-green hover:underline text-xs font-semibold"
            >
              WhatsApp: +27 64 586 7535
            </a>
          </div>
        </aside>

        {/* ----- RIGHT: STEPS ----- */}
        <div className="space-y-8">
          {/* Error banner */}
          {error && (
            <div className="rounded-md border border-accent-500/40 bg-accent-50 px-4 py-3 text-sm text-accent-700">
              {error}
            </div>
          )}

          {/* STEP 1: Configure plate */}
          <div>
            <StepHeader number="1" title="Select your flexographic plate" />

            {lineItems.map((li, idx) => (
              <PlateCard
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
              className="mt-4 w-full px-5 py-3 bg-white border-2 border-dashed border-ink/20 hover:border-accent-500 text-ink font-medium rounded-md transition-colors"
            >
              + Add another plate
            </button>
          </div>

          {/* STEP 2: Order details */}
          <div>
            <StepHeader number="2" title="Order details" />

            <div className="bg-white rounded-xl border border-ink/10 p-6 space-y-5 shadow-card">
              {/* Turnaround tier */}
              <div>
                <div className="text-sm font-semibold text-ink mb-3">
                  Turnaround <span className="text-accent-500">*</span>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {TURNAROUND_TIERS.map((t) => (
                    <TurnaroundCard
                      key={t.id}
                      tier={t}
                      selected={turnaroundTier === t.id}
                      onClick={() => setTurnaroundTier(t.id)}
                    />
                  ))}
                </div>
              </div>

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
              <label className="block">
                <span className="text-sm font-medium text-ink">
                  Delivery address <span className="text-accent-500">*</span>
                </span>
                <p className="text-xs text-ink-muted mt-1 mb-1">
                  Pre-filled from your profile. Add the actual street address below.
                </p>
                <textarea
                  required
                  rows={5}
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="block w-full rounded-md border border-ink/20 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 font-mono text-sm"
                  placeholder="Company, street, city, country, contact name, phone"
                />
              </label>
            </div>
          </div>

          {/* STEP 3: Submit */}
          <div>
            <StepHeader number="3" title="Place your order" />

            <div className="bg-ink text-white rounded-xl p-6 shadow-card">
              <div className="flex flex-col sm:flex-row sm:items-end gap-4 justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wider text-white/70">Total incl. VAT</div>
                  <div className="text-4xl font-bold mt-1">{formatZAR(total)}</div>
                  <div className="text-xs text-white/60 mt-1">
                    {lineItems.length} {lineItems.length === 1 ? "plate" : "plates"} · {tierInfo.label} turnaround · {VAT_PERCENT}% VAT
                  </div>
                  {upliftPct > 0 && (
                    <div className="mt-2 text-xs text-accent-300">
                      Includes Express uplift +{upliftPct}% ({formatZAR(expressUplift)})
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 sm:items-end">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-6 py-3 bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white font-semibold rounded-md whitespace-nowrap"
                  >
                    {submitting ? "Placing order..." : "Confirm and place order"}
                  </button>
                  {submitProgress && (
                    <div className="text-xs text-white/70">{submitProgress}</div>
                  )}
                </div>
              </div>
              <p className="mt-4 text-xs text-white/60 max-w-xl">
                Submitting creates a job per plate in our system. Our team prepares your artwork
                and sends a proof for approval before plates are made. Track progress in your dashboard.
              </p>
            </div>
          </div>
        </div>
      </form>
    </>
  );
}

// ─── Step header ──────────────────────────────────────────────────────────

function StepHeader({ number, title }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent-500 text-white font-bold text-lg">
        {number}
      </div>
      <h2 className="text-2xl font-bold text-ink tracking-tight">{title}</h2>
    </div>
  );
}

// ─── One plate card (the meat) ────────────────────────────────────────────

function PlateCard({ idx, lineItem, price, canRemove, onChange, onRemove }) {
  const filteredTypes = PLATE_TYPES.filter(
    (t) => !lineItem.plateTier || t.tier === lineItem.plateTier
  );
  const selectedType = PLATE_TYPES.find((t) => t.id === lineItem.plateTypeId);

  return (
    <div className="bg-white rounded-xl border border-ink/10 shadow-card mb-4">
      {/* Plate header */}
      <div className="px-6 py-4 border-b border-ink/10 flex items-center justify-between">
        <div className="text-sm font-semibold text-ink uppercase tracking-wider">
          Plate {idx + 1}
          {selectedType && (
            <span className="ml-2 normal-case text-xs font-normal text-ink-muted">
              · {selectedType.name}
            </span>
          )}
        </div>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-accent-600 hover:text-accent-700 font-medium"
          >
            Remove plate
          </button>
        )}
      </div>

      <div className="p-6 space-y-6">
        {/* Substrate visual selector */}
        <div>
          <div className="text-sm font-semibold text-ink mb-3">
            Substrate <span className="text-accent-500">*</span>
            <span className="ml-2 text-xs font-normal text-ink-muted">What are you printing on?</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {SUBSTRATE_OPTIONS.map((s) => (
              <SubstrateCircle
                key={s.id}
                substrate={s}
                selected={lineItem.substrate === s.id}
                onClick={() => onChange("substrate", s.id)}
              />
            ))}
          </div>
        </div>

        {/* Plate tier */}
        <div>
          <div className="text-sm font-semibold text-ink mb-3">
            Plate tier <span className="text-accent-500">*</span>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            {TIERS.map((t) => (
              <TierCard
                key={t}
                tier={t}
                selected={lineItem.plateTier === t}
                onClick={() => {
                  onChange("plateTier", t);
                  onChange("plateTypeId", "");
                }}
              />
            ))}
          </div>
        </div>

        {/* Thickness */}
        {lineItem.plateTier && (
          <div>
            <div className="text-sm font-semibold text-ink mb-2">
              Plate thickness <span className="text-accent-500">*</span>
            </div>
            <select
              value={lineItem.plateTypeId}
              onChange={(e) => onChange("plateTypeId", e.target.value)}
              className="block w-full sm:w-72 rounded-md border border-ink/20 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
            >
              <option value="">Select thickness</option>
              {filteredTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name.replace(`${lineItem.plateTier} `, "")} ({t.thicknessMm.toFixed(2)} mm)
                </option>
              ))}
            </select>
            {selectedType && (
              <p className="mt-2 text-xs text-ink-muted">{selectedType.useCase}</p>
            )}
          </div>
        )}

        {/* Ink type */}
        <div>
          <div className="text-sm font-semibold text-ink mb-3">
            Ink type <span className="text-accent-500">*</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {INK_TYPES.map((ink) => (
              <InkCircle
                key={ink.id}
                ink={ink}
                selected={lineItem.inkType === ink.id}
                onClick={() => onChange("inkType", ink.id)}
              />
            ))}
          </div>
        </div>

        {/* Print side */}
        <div>
          <div className="text-sm font-semibold text-ink mb-3">
            Print side <span className="text-accent-500">*</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {PRINT_SIDE_OPTIONS.map((side) => (
              <PrintSideCard
                key={side.id}
                side={side}
                selected={lineItem.printSide === side.id}
                onClick={() => onChange("printSide", side.id)}
              />
            ))}
          </div>
        </div>

        {/* Screen ruling + cylinder size */}
        <div>
          <div className="text-sm font-semibold text-ink mb-2">
            Press setup
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-ink-muted">Screen ruling (LPI)</span>
              <select
                value={lineItem.screenRuling || ""}
                onChange={(e) => onChange("screenRuling", e.target.value)}
                className="mt-1 block w-full rounded-md border border-ink/20 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
              >
                <option value="">Select ruling (optional)</option>
                {SCREEN_RULING_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-ink-muted">Cylinder / tooth size</span>
              <input
                type="text"
                value={lineItem.cylinderSize || ""}
                onChange={(e) => onChange("cylinderSize", e.target.value)}
                placeholder="e.g. 120 teeth or 508mm"
                className="mt-1 block w-full rounded-md border border-ink/20 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
              />
            </label>
          </div>
        </div>

        {/* Dimensions */}
        <div>
          <div className="text-sm font-semibold text-ink mb-2">
            Print dimensions <span className="text-accent-500">*</span>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs text-ink-muted">Print width (cm)</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={203}
                step="0.1"
                value={lineItem.widthCm}
                onChange={(e) => onChange("widthCm", e.target.value)}
                className="mt-1 block w-full rounded-md border border-ink/20 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
              />
            </label>
            <label className="block">
              <span className="text-xs text-ink-muted">Print length (cm)</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={127}
                step="0.1"
                value={lineItem.heightCm}
                onChange={(e) => onChange("heightCm", e.target.value)}
                className="mt-1 block w-full rounded-md border border-ink/20 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
              />
            </label>
            <label className="block">
              <span className="text-xs text-ink-muted">Quantity</span>
              <div className="mt-1 flex items-center">
                <button
                  type="button"
                  onClick={() => onChange("qty", Math.max(1, Number(lineItem.qty || 1) - 1))}
                  className="px-3 py-2 border border-ink/20 rounded-l-md hover:bg-ink/5"
                  aria-label="Decrease quantity"
                >−</button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step="1"
                  value={lineItem.qty}
                  onChange={(e) => onChange("qty", e.target.value)}
                  className="block w-full text-center border-t border-b border-ink/20 px-2 py-2 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => onChange("qty", Number(lineItem.qty || 1) + 1)}
                  className="px-3 py-2 border border-ink/20 rounded-r-md hover:bg-ink/5"
                  aria-label="Increase quantity"
                >+</button>
              </div>
            </label>
          </div>
          {price && price.areaCm2 > 0 && (
            <p className="mt-2 text-xs text-ink-muted">
              Plate area: <span className="font-semibold text-ink">{price.areaCm2} cm²</span>
              <span className="mx-2">·</span>
              Line total: <span className="font-semibold text-ink">{formatZAR(price.subtotal)}</span>
            </p>
          )}
        </div>

        {/* PDF upload */}
        <div>
          <div className="text-sm font-semibold text-ink mb-2">
            Upload your artwork PDF <span className="text-accent-500">*</span>
          </div>
          <PdfDropzone
            file={lineItem.pdfFile}
            onChange={(file) => onChange("pdfFile", file)}
          />
        </div>

        {/* Special instructions */}
        <details className="group">
          <summary className="text-sm font-medium text-ink-muted cursor-pointer select-none flex items-center gap-2 list-none [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-ink/5 text-ink text-xs group-open:rotate-45 transition-transform">+</span>
            Special instructions (optional)
          </summary>
          <textarea
            rows={2}
            value={lineItem.specialInstructions}
            onChange={(e) => onChange("specialInstructions", e.target.value)}
            placeholder="Anything our repro team should know about this plate"
            className="mt-3 block w-full rounded-md border border-ink/20 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
          />
        </details>
      </div>
    </div>
  );
}

// ─── Substrate visual selector ────────────────────────────────────────────

function SubstrateCircle({ substrate, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "group rounded-xl border-2 p-3 text-center transition " +
        (selected
          ? "border-accent-500 bg-accent-50"
          : "border-ink/10 bg-white hover:border-ink/30")
      }
    >
      <div
        className={
          "mx-auto h-16 w-16 rounded-full grid place-items-center transition " +
          (selected ? "bg-accent-500 text-white" : "bg-ink/5 text-ink-muted group-hover:bg-ink/10")
        }
      >
        <SubstrateIcon id={substrate.id} />
      </div>
      <div className={"mt-2 text-xs font-medium " + (selected ? "text-accent-700" : "text-ink")}>
        {substrate.label}
      </div>
    </button>
  );
}

function SubstrateIcon({ id }) {
  const cls = "h-8 w-8";
  if (id === "film") {
    return (
      <svg className={cls} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M6 10c4-4 8-2 12 0s8 4 8 4-4 8-8 10-12-2-12-2V10z" strokeLinejoin="round" />
      </svg>
    );
  }
  if (id === "label") {
    return (
      <svg className={cls} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="6" y="8" width="20" height="16" rx="2" />
        <path d="M10 13h12M10 17h8" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === "corrugated") {
    return (
      <svg className={cls} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M4 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0 4 2 6 0M4 20c2-2 4-2 6 0s4 2 6 0 4-2 6 0 4 2 6 0" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === "paper") {
    return (
      <svg className={cls} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M10 4h10l6 6v18a2 2 0 01-2 2H10a2 2 0 01-2-2V6a2 2 0 012-2z" strokeLinejoin="round" />
        <path d="M20 4v6h6" />
      </svg>
    );
  }
  return (
    <svg className={cls} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="16" cy="16" r="10" />
      <path d="M16 11v6M16 19v.5" strokeLinecap="round" />
    </svg>
  );
}

// ─── Ink type selector (3 circles) ────────────────────────────────────────

function InkCircle({ ink, selected, onClick }) {
  const colorMap = {
    waterbased: "bg-brand-blue/15 text-brand-blue",
    solvent: "bg-brand-orange/15 text-brand-orange",
    uv: "bg-brand-yellow/30 text-yellow-700",
  };
  const selectedColor = {
    waterbased: "border-brand-blue bg-brand-blue text-white",
    solvent: "border-brand-orange bg-brand-orange text-white",
    uv: "border-brand-yellow bg-brand-yellow text-ink",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "group rounded-xl border-2 p-3 text-center transition " +
        (selected
          ? "border-accent-500 bg-accent-50"
          : "border-ink/10 bg-white hover:border-ink/30")
      }
    >
      <div
        className={
          "mx-auto h-14 w-14 rounded-full grid place-items-center transition border-2 " +
          (selected
            ? selectedColor[ink.id]
            : "border-transparent " + (colorMap[ink.id] || "bg-ink/5 text-ink-muted"))
        }
      >
        <InkDrop />
      </div>
      <div className={"mt-2 text-xs font-medium " + (selected ? "text-accent-700" : "text-ink")}>
        {ink.label}
      </div>
    </button>
  );
}

function InkDrop() {
  return (
    <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3c-3 5-6 8-6 12a6 6 0 0012 0c0-4-3-7-6-12z" />
    </svg>
  );
}

// ─── Print side selector ──────────────────────────────────────────────────

function PrintSideCard({ side, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-xl border-2 p-4 text-left transition " +
        (selected
          ? "border-accent-500 bg-accent-50"
          : "border-ink/10 bg-white hover:border-ink/30")
      }
    >
      <div className="flex items-center justify-between">
        <span className="font-bold text-ink">{side.label}</span>
        <span
          className={
            "h-5 w-5 rounded-full border-2 " +
            (selected ? "border-accent-500 bg-accent-500" : "border-ink/20 bg-white")
          }
        >
          {selected && (
            <svg viewBox="0 0 20 20" fill="white" className="h-full w-full p-0.5">
              <path d="M16.7 5.3a1 1 0 010 1.4l-7.4 7.4a1 1 0 01-1.4 0L3.3 9.5a1 1 0 011.4-1.4l3.9 3.9 6.7-6.7a1 1 0 011.4 0z" />
            </svg>
          )}
        </span>
      </div>
      <p className="mt-2 text-xs text-ink-muted">{side.note}</p>
    </button>
  );
}

// ─── Turnaround tier selector (Standard / Express) ────────────────────────

function TurnaroundCard({ tier, selected, onClick }) {
  const isExpress = tier.id === "express";
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-xl border-2 p-4 text-left transition " +
        (selected
          ? isExpress
            ? "border-accent-500 bg-accent-500 text-white"
            : "border-ink bg-ink text-white"
          : "border-ink/10 bg-white text-ink hover:border-ink/30")
      }
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="font-bold">{tier.label}</div>
          <div className={"text-xs mt-0.5 " + (selected ? "text-white/85" : "text-ink-muted")}>
            {tier.sub}
          </div>
        </div>
        {tier.upliftPct > 0 && (
          <div
            className={
              "text-xs font-bold px-2 py-0.5 rounded-full " +
              (selected ? "bg-white text-accent-600" : "bg-accent-500/15 text-accent-600")
            }
          >
            +{tier.upliftPct}%
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Plate tier card selector ─────────────────────────────────────────────

const TIER_INFO = {
  Crystal: {
    tagline: "Premium HD photopolymer",
    note: "Fine detail labels and premium flexible packaging.",
    accent: "from-accent-50 to-white",
  },
  "Surface Engineered": {
    tagline: "Cleaner ink lay, mid-tier",
    note: "Engineered surface for consistent ink transfer.",
    accent: "from-brand-blue/10 to-white",
  },
  Standard: {
    tagline: "Everyday photopolymer",
    note: "Reliable daily production across packaging.",
    accent: "from-brand-green/10 to-white",
  },
};

function TierCard({ tier, selected, onClick }) {
  const info = TIER_INFO[tier] || {};
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-xl border-2 p-4 text-left transition " +
        (selected
          ? "border-accent-500 bg-gradient-to-br " + info.accent
          : "border-ink/10 bg-white hover:border-ink/30")
      }
    >
      <div className="flex items-center justify-between">
        <span className={"font-bold " + (selected ? "text-ink" : "text-ink")}>{tier}</span>
        <span
          className={
            "h-5 w-5 rounded-full border-2 " +
            (selected ? "border-accent-500 bg-accent-500" : "border-ink/20 bg-white")
          }
        >
          {selected && (
            <svg viewBox="0 0 20 20" fill="white" className="h-full w-full p-0.5">
              <path d="M16.7 5.3a1 1 0 010 1.4l-7.4 7.4a1 1 0 01-1.4 0L3.3 9.5a1 1 0 011.4-1.4l3.9 3.9 6.7-6.7a1 1 0 011.4 0z" />
            </svg>
          )}
        </span>
      </div>
      <p className="mt-2 text-sm text-ink font-medium">{info.tagline}</p>
      <p className="mt-1 text-xs text-ink-muted leading-relaxed">{info.note}</p>
    </button>
  );
}

// ─── PDF dropzone ─────────────────────────────────────────────────────────

function PdfDropzone({ file, onChange }) {
  return (
    <label className="block">
      <div className="relative rounded-md border-2 border-dashed border-ink/20 hover:border-accent-500 transition-colors bg-ink/[0.02]">
        <input
          type="file"
          accept="application/pdf,image/*"
          onChange={(e) => onChange(e.target.files?.[0] || null)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div className="px-4 py-8 text-center pointer-events-none">
          {file ? (
            <div>
              <div className="inline-flex items-center gap-2 text-ink font-medium">
                <svg className="h-5 w-5 text-accent-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" strokeLinejoin="round" />
                  <path d="M14 3v6h6" />
                </svg>
                {file.name}
              </div>
              <div className="text-xs text-ink-muted mt-1">
                {(file.size / 1024 / 1024).toFixed(2)} MB · Click to replace
              </div>
            </div>
          ) : (
            <div>
              <div className="text-ink font-medium">
                Drop your PDF here, or click to choose
              </div>
              <div className="text-xs text-ink-muted mt-1">
                Print-ready PDF preferred · Max 50 MB
              </div>
            </div>
          )}
        </div>
      </div>
    </label>
  );
}

// ─── Trust badge (sidebar) ────────────────────────────────────────────────

function TrustBadge({ icon, title, sub }) {
  return (
    <div className="rounded-lg bg-white border border-ink/10 p-3">
      <div className="mx-auto h-8 w-8 grid place-items-center text-accent-500">
        <TrustIcon id={icon} />
      </div>
      <div className="mt-2 text-ink font-semibold leading-tight">{title}</div>
      <div className="mt-0.5 text-ink-muted leading-tight">{sub}</div>
    </div>
  );
}

function TrustIcon({ id }) {
  const cls = "h-7 w-7";
  if (id === "handshake") {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M8 11l3-3 4 4 5-5M3 13l5 5 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (id === "shield") {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" strokeLinejoin="round" />
        <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (id === "truck") {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M3 7h11v10H3zM14 10h4l3 3v4h-7" strokeLinejoin="round" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="17" cy="18" r="2" />
      </svg>
    );
  }
  // qa
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

// ─── Fast quote (sidebar) ─────────────────────────────────────────────────

function FastQuote({ total, subtotal, expressUplift, upliftPct, vat, lineItemCount, tierLabel }) {
  return (
    <div className="rounded-xl border border-ink/10 bg-white p-4">
      <div className="text-xs uppercase tracking-wider text-ink-muted font-semibold">Fast quote</div>
      <div className="mt-2 text-2xl font-bold text-ink">{formatZAR(total)}</div>
      <div className="mt-1 text-[11px] text-ink-muted">
        {lineItemCount} {lineItemCount === 1 ? "plate" : "plates"} · {tierLabel} · incl. {VAT_PERCENT}% VAT
      </div>
      <div className="mt-3 pt-3 border-t border-ink/10 space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-ink-muted">Subtotal</span>
          <span className="text-ink font-medium">{formatZAR(subtotal)}</span>
        </div>
        {upliftPct > 0 && (
          <div className="flex justify-between text-accent-600">
            <span>Express +{upliftPct}%</span>
            <span className="font-medium">{formatZAR(expressUplift)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-ink-muted">VAT</span>
          <span className="text-ink font-medium">{formatZAR(vat)}</span>
        </div>
      </div>
      <p className="mt-3 text-[10px] text-ink-muted italic leading-relaxed">
        Fast quote based on dimensions. Final price confirmed when artwork is reviewed.
      </p>
    </div>
  );
}

// ─── Reference plate illustration ─────────────────────────────────────────

function PlateIllustration() {
  return (
    <svg viewBox="0 0 200 200" className="h-32 w-32" fill="none">
      <defs>
        <linearGradient id="plate-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FEE2E2" />
          <stop offset="100%" stopColor="#FCA5A5" />
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="100" rx="80" ry="60" fill="url(#plate-grad)" stroke="#DC2626" strokeWidth="1.5" />
      <ellipse cx="100" cy="95" rx="50" ry="35" fill="none" stroke="#991B1B" strokeWidth="1" opacity="0.4" />
      <path d="M60 100 Q100 80 140 100 T180 100" stroke="#991B1B" strokeWidth="0.8" fill="none" opacity="0.3" />
      <path d="M55 110 Q100 90 145 110" stroke="#991B1B" strokeWidth="0.8" fill="none" opacity="0.3" />
    </svg>
  );
}

// ─── Small form atoms ─────────────────────────────────────────────────────

function Field({ label, ...rest }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">{label}</span>
      <input
        {...rest}
        className="mt-1 block w-full rounded-md border border-ink/20 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
      />
    </label>
  );
}

function DateField({ label, required, ...rest }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">
        {label} {required && <span className="text-accent-500">*</span>}
      </span>
      <input
        type="date"
        min={today}
        required={required}
        {...rest}
        className="mt-1 block w-full rounded-md border border-ink/20 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
      />
    </label>
  );
}
