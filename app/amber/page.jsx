"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import {
  ACCEPTED_EXTENSIONS,
  createSubmission,
  lastSpecForPrinter,
  removeSubmissionFile,
  saveSpec,
  setChoice as persistChoice,
  uploadSubmissionFile,
  watchMySubmissions,
  watchSubmission,
} from "@/lib/amber-client";
import {
  MATERIAL_OPTIONS,
  NOT_SURE,
  PLATE_DISTORTION_OPTIONS,
  PLATE_THICKNESS_OPTIONS,
  PRINT_DIRECTION_OPTIONS,
  PRINT_SIDE_OPTIONS,
  SCREEN_RULING_OPTIONS,
  TYPE_OPTIONS,
  missingSpecFields,
  notSureFields,
} from "@/lib/amber-spec.mjs";
import {
  AMBER_REPRO_REVISIONS_INCLUDED,
  CHOICE_PLATES,
  CHOICE_REPRO,
  EXTRA_REVISIONS_NOTE,
  priceReproJob,
} from "@/lib/amber-pricing.mjs";

export default function AmberPage() {
  return (
    <Suspense fallback={<Shell><p className="text-ink-muted">Loading...</p></Shell>}>
      <AmberPageInner />
    </Suspense>
  );
}

function Shell({ children }) {
  return (
    <div className="max-w-page mx-auto px-4 sm:px-6 py-10">{children}</div>
  );
}

function AmberPageInner() {
  const { user, profile } = useAuth();
  const params = useSearchParams();
  const idFromLink = params.get("id");

  const [submissionId, setSubmissionId] = useState(idFromLink || null);
  const [submission, setSubmission] = useState(null);
  const [mine, setMine] = useState([]);
  const [terms, setTerms] = useState(null);
  const [spec, setSpecState] = useState({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const fileInput = useRef(null);

  // What this job will cost, and whether a PO number is compulsory.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/amber/price", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!cancelled && res.ok) setTerms(data);
      } catch {
        /* the page still works, it just can't show the price */
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Anything this customer already has on the go, including files that came
  // in by email before they ever opened this page.
  useEffect(() => {
    if (!user?.uid) return;
    return watchMySubmissions(user.uid, (items, err) => {
      if (err) { setError(err.message); return; }
      setMine(items || []);
      if (!submissionId) {
        const open = (items || []).find((s) => !s.jobNumber);
        if (open) setSubmissionId(open.id);
      }
    });
  }, [user?.uid, submissionId]);

  useEffect(() => {
    if (!submissionId) return;
    return watchSubmission(submissionId, (item, err) => {
      if (err) { setError(err.message); return; }
      setSubmission(item);
      if (item?.spec) setSpecState((prev) => (Object.keys(prev).length ? prev : item.spec));
    });
  }, [submissionId]);

  const choice = submission?.choice || CHOICE_REPRO;
  const files = submission?.files || [];
  const poRequired = !!terms?.poRequired;

  const missing = useMemo(
    () => missingSpecFields({ files, spec }, { poRequired }),
    [files, spec, poRequired],
  );
  const unsure = useMemo(() => notSureFields({ files, spec }), [files, spec]);

  const price = useMemo(() => {
    if (choice !== CHOICE_REPRO) return null;
    return priceReproJob({ companyHasHadFreeJob: !!terms?.companyHasHadFreeJob });
  }, [choice, terms]);

  const ensureSubmission = useCallback(async () => {
    if (submissionId) return submissionId;
    const id = await createSubmission({
      uid: user.uid,
      company: profile?.company,
      email: profile?.email || user.email,
      choice,
    });
    setSubmissionId(id);
    return id;
  }, [submissionId, user, profile, choice]);

  async function onPickFiles(event) {
    const picked = Array.from(event.target.files || []);
    if (!picked.length) return;
    setError(null);
    setBusy(true);
    try {
      const id = await ensureSubmission();
      let running = files;
      for (const file of picked) {
        setProgress({ name: file.name, percent: 0 });
        const meta = await uploadSubmissionFile({
          uid: user.uid,
          submissionId: id,
          file,
          existingFiles: running,
          onProgress: (percent) => setProgress({ name: file.name, percent }),
        });
        running = [...running, meta];
      }
    } catch (err) {
      setError(err.message || "That upload did not work. Please try again.");
    } finally {
      setBusy(false);
      setProgress(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function update(patch) {
    setSpecState((prev) => ({ ...prev, ...patch }));
  }

  async function onChoice(next) {
    const id = await ensureSubmission();
    await persistChoice(id, next);
  }

  async function onSameAsLastTime() {
    if (!user?.uid) return;
    const last = await lastSpecForPrinter(user.uid, spec.printer);
    if (!last) {
      setError("We could not find an earlier job to copy. Fill it in once and next time it will be here.");
      return;
    }
    setError(null);
    setSpecState((prev) => ({ ...last, jobName: prev.jobName || "" }));
  }

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      const id = await ensureSubmission();
      await saveSpec(id, spec);
      const token = await user.getIdToken();
      const res = await fetch("/api/amber/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ submissionId: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.missing?.length) {
          setError("Still needed: " + data.missing.join(", "));
        } else {
          setError(data?.error || "That did not go through. Please try again.");
        }
        return;
      }
      setResult(data);
    } catch (err) {
      setError(err.message || "That did not go through. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (result?.jobNumber) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold text-ink">Thanks, AMBER is on it</h1>
        <p className="mt-3 text-ink">
          Your job is <strong>{result.jobNumber}</strong>. You will have your
          plate-ready file and PDF proof by <strong>{result.dueText}</strong>.
        </p>
        <a href="/jobs" className="inline-block mt-6 px-4 py-2 bg-accent-500 text-white rounded-md font-semibold">
          Track it in My Jobs
        </a>
      </Shell>
    );
  }

  if (result?.waitingOnFlexo) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold text-ink">Thanks, we have it from here</h1>
        <p className="mt-3 text-ink">
          You told us you were not sure about {result.notSure.join(", ")}. We will
          work that out and open the job for you. The 24 hours starts once it is in.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-2xl font-semibold text-ink">Send a job to AMBER</h1>
      <p className="mt-2 text-ink-muted">
        Send us your artwork and the press details, and you get back a
        plate-ready file and a PDF proof to sign off.
      </p>

      {/* ── What they want ─────────────────────────────────────────────── */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <ChoiceCard
          active={choice === CHOICE_REPRO}
          onClick={() => onChoice(CHOICE_REPRO)}
          title="Artwork by AMBER"
          price={price?.free ? "First job free" : "R499 a job, excl VAT"}
          lines={[
            `${AMBER_REPRO_REVISIONS_INCLUDED} rounds of changes included`,
            "Back within 24 hours, working days",
            "You get a plate-ready file and a PDF proof",
          ]}
        />
        <ChoiceCard
          active={choice === CHOICE_PLATES}
          onClick={() => onChoice(CHOICE_PLATES)}
          title="Plates from my ready file"
          price="Your normal plate price"
          lines={[
            "Your file is already plate-ready",
            "Priced at your account rate",
            "This is not the R499 repro service",
          ]}
        />
      </div>

      {/* ── Files ──────────────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-ink">Your files</h2>
        {submission?.source === "email" && files.length > 0 && (
          <p className="mt-1 text-sm text-ink-muted">
            These came in with your email, so there is no need to send them again.
          </p>
        )}
        <ul className="mt-3 divide-y divide-ink/10 border border-ink/10 rounded-md">
          {files.length === 0 && (
            <li className="px-4 py-3 text-sm text-ink-muted">Nothing yet.</li>
          )}
          {files.map((f) => (
            <li key={f.path} className="px-4 py-3 flex items-center justify-between gap-4">
              <span className="text-sm text-ink truncate">
                {f.fileName}
                <span className="text-ink-muted"> · {formatSize(f.sizeBytes)}</span>
              </span>
              <button
                type="button"
                className="text-sm text-ink-muted hover:text-ink"
                onClick={() =>
                  removeSubmissionFile({ submissionId, existingFiles: files, path: f.path })
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS.join(",")}
          onChange={onPickFiles}
          disabled={busy}
          className="mt-3 block text-sm"
        />
        <p className="mt-1 text-xs text-ink-muted">
          PDF, AI, EPS, PSD, TIFF, ZIP and fonts. Up to 300 MB a file, 1 GB a job.
        </p>
        {progress && (
          <p className="mt-2 text-sm text-ink-muted">
            Sending {progress.name}... {progress.percent}%
          </p>
        )}
      </section>

      {/* ── Press details ──────────────────────────────────────────────── */}
      <section className="mt-10">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-ink">Press details</h2>
          <button
            type="button"
            onClick={onSameAsLastTime}
            className="text-sm font-medium text-accent-600 hover:underline"
          >
            Same as last time
          </button>
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          One job is one artwork in one size. Another flavour or another size is
          its own job.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Text label="Job name" hint="For example: Bordeaux Washed Potatoes 10kg"
            value={spec.jobName} onChange={(v) => update({ jobName: v })} />
          <Text label="Printer" value={spec.printer} onChange={(v) => update({ printer: v })} />
          <Text label="Press" value={spec.press} onChange={(v) => update({ press: v })} />

          <Choose label="Product type" value={spec.bagType} options={TYPE_OPTIONS}
            onChange={(v) => update({ bagType: v })} />
          <Choose label="Material" value={spec.material} options={MATERIAL_OPTIONS}
            onChange={(v) => update({ material: v })} />
          <Choose label="Print side" value={spec.printSide} options={PRINT_SIDE_OPTIONS}
            onChange={(v) => update({ printSide: v })} />

          <Num label="Width" suffix="mm" value={spec.widthMm} onChange={(v) => update({ widthMm: v })} />
          <Num label="Repeat (pitch)" suffix="mm" value={spec.pitchMm} onChange={(v) => update({ pitchMm: v })} />
          <Num label="Across" value={spec.across} onChange={(v) => update({ across: v })} />
          <Num label="Around" value={spec.around} onChange={(v) => update({ around: v })} />

          <Choose label="Plate thickness" value={spec.plateThickness} options={PLATE_THICKNESS_OPTIONS}
            onChange={(v) => update({ plateThickness: v })} />
          <Choose label="Screen ruling" value={spec.screenRuling} options={SCREEN_RULING_OPTIONS}
            onChange={(v) => update({ screenRuling: v })} />

          <Text label="Cylinder or gear teeth" hint="For example: 93T"
            value={spec.cylinder === NOT_SURE ? "" : spec.cylinder}
            notSure={spec.cylinder === NOT_SURE}
            onNotSure={(on) => update({ cylinder: on ? NOT_SURE : "" })}
            onChange={(v) => update({ cylinder: v })} />

          <Choose label="Distortion" value={spec.plateDistortion} options={PLATE_DISTORTION_OPTIONS}
            notSureLabel="Not sure, work it out with me"
            onChange={(v) => update({ plateDistortion: v })} />
          <Choose label="Print direction" value={spec.printDirection} options={PRINT_DIRECTION_OPTIONS}
            onChange={(v) => update({ printDirection: v })} />

          {spec.bagType === "Label" && (
            <>
              <Num label="Gap across" suffix="mm" value={spec.gapAcrossMm} onChange={(v) => update({ gapAcrossMm: v })} />
              <Num label="Gap around" suffix="mm" value={spec.gapAroundMm} onChange={(v) => update({ gapAroundMm: v })} />
            </>
          )}
        </div>

        <div className="mt-4">
          <Inks
            value={spec.colours}
            onChange={(v) => update({ colours: v })}
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Text label="Barcode number" hint="Leave blank if there is none"
            value={spec.barcode} onChange={(v) => update({ barcode: v })} />
          <Text label="Required by" type="date"
            value={spec.requiredByDate} onChange={(v) => update({ requiredByDate: v })} />
          <Text label={`PO number${poRequired ? "" : " (optional)"}`}
            value={spec.poNumber} onChange={(v) => update({ poNumber: v })} />
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-ink">Anything else we should know</label>
          <textarea
            rows={4}
            value={spec.instructions || ""}
            onChange={(e) => update({ instructions: e.target.value })}
            className="mt-1 w-full border border-ink/15 rounded-md px-3 py-2 text-sm"
            placeholder="This becomes Revision 1 on your job."
          />
        </div>
      </section>

      {/* ── Price and Submit ───────────────────────────────────────────── */}
      <section className="mt-10 border-t border-ink/10 pt-6">
        {choice === CHOICE_REPRO && price && (
          <p className="text-lg font-semibold text-ink">{price.customerText}</p>
        )}
        {choice === CHOICE_PLATES && (
          <p className="text-lg font-semibold text-ink">
            Priced at your normal plate rate once we have measured the file.
          </p>
        )}
        <p className="mt-1 text-sm text-ink-muted">{EXTRA_REVISIONS_NOTE}.</p>

        {missing.length > 0 && (
          <div className="mt-4 text-sm text-ink">
            <strong>Still needed:</strong> {missing.join(", ")}
          </div>
        )}
        {missing.length === 0 && unsure.length > 0 && (
          <div className="mt-4 text-sm text-ink">
            You said you were not sure about {unsure.join(", ")}. We will work
            that out with you, and the 24 hours starts once it is in.
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <button
          type="button"
          disabled={busy || missing.length > 0}
          onClick={onSubmit}
          className="mt-5 px-5 py-2.5 bg-accent-500 text-white rounded-md font-semibold disabled:opacity-40"
        >
          {busy ? "Sending..." : "Submit to AMBER"}
        </button>
      </section>

      {mine.filter((s) => s.jobNumber).length > 0 && (
        <section className="mt-12 border-t border-ink/10 pt-6">
          <h2 className="text-lg font-semibold text-ink">Already with AMBER</h2>
          <ul className="mt-3 text-sm text-ink">
            {mine.filter((s) => s.jobNumber).map((s) => (
              <li key={s.id} className="py-1">
                {s.jobNumber} · {s.spec?.jobName || "Job"}
                {s.dueText ? ` · due back ${s.dueText}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
    </Shell>
  );
}

function ChoiceCard({ active, onClick, title, price, lines }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "text-left border rounded-lg p-5 transition-colors " +
        (active ? "border-accent-500 bg-brand-50" : "border-ink/15 hover:border-ink/30")
      }
    >
      <div className="font-semibold text-ink">{title}</div>
      <div className="mt-1 text-accent-600 font-semibold">{price}</div>
      <ul className="mt-3 space-y-1 text-sm text-ink-muted">
        {lines.map((l) => <li key={l}>{l}</li>)}
      </ul>
    </button>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

const inputCls = "mt-1 w-full border border-ink/15 rounded-md px-3 py-2 text-sm";

function Text({ label, hint, value, onChange, type = "text", notSure, onNotSure }) {
  return (
    <Field label={label} hint={hint}>
      <input
        type={type}
        value={value || ""}
        disabled={notSure}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls + (notSure ? " opacity-50" : "")}
      />
      {onNotSure && (
        <label className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
          <input type="checkbox" checked={!!notSure} onChange={(e) => onNotSure(e.target.checked)} />
          Not sure, work it out with me
        </label>
      )}
    </Field>
  );
}

function Num({ label, suffix, value, onChange }) {
  return (
    <Field label={suffix ? `${label} (${suffix})` : label}>
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    </Field>
  );
}

function Choose({ label, value, options, onChange, notSureLabel }) {
  return (
    <Field label={label}>
      <select value={value || ""} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        <option value="">Choose...</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
        {notSureLabel && <option value={NOT_SURE}>{notSureLabel}</option>}
      </select>
    </Field>
  );
}

// Inks, in the order they print. Ten slots, same as the MIS.
function Inks({ value, onChange }) {
  const unsure = Array.isArray(value) && value.length === 1 && value[0] === NOT_SURE;
  const inks = unsure ? [] : (Array.isArray(value) ? value : []);

  function setInk(index, text) {
    const next = [...inks];
    next[index] = text;
    onChange(next.filter((v, i) => String(v || "").trim() || i < next.length - 1));
  }

  return (
    <div>
      <label className="block text-sm font-medium text-ink">Inks, in print order</label>
      <div className="mt-1 grid gap-2 sm:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <input
            key={i}
            type="text"
            value={inks[i] || ""}
            disabled={unsure}
            placeholder={`${i + 1}`}
            onChange={(e) => setInk(i, e.target.value)}
            className={inputCls + (unsure ? " opacity-50" : "")}
          />
        ))}
      </div>
      <label className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
        <input
          type="checkbox"
          checked={unsure}
          onChange={(e) => onChange(e.target.checked ? [NOT_SURE] : [])}
        />
        Not sure, AMBER suggests
      </label>
    </div>
  );
}

function formatSize(bytes) {
  const n = Number(bytes) || 0;
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n > 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} bytes`;
}
