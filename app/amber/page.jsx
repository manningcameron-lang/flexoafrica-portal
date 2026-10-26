"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { READ_ONLY_MESSAGE, isStaff } from "@/lib/staff-view.mjs";
import {
  ACCEPTED_EXTENSIONS,
  createSubmission,
  lastSpecForPrinter,
  listSubmissions,
  removeSubmissionFile,
  saveSubmission,
  uploadSubmissionFile,
} from "@/lib/amber-client";
import {
  GEAR_PITCH_OPTIONS,
  MATERIAL_OPTIONS,
  NOT_SURE_ALLOWED,
  NOT_SURE_LABELS,
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
  AMBER_REPRO_PRICE_EXCL_VAT,
  AMBER_REPRO_REVISIONS_INCLUDED,
  CHOICE_PLATES,
  CHOICE_REPRO,
  EXTRA_REVISIONS_NOTE,
  NEW_SUBMISSION_KIND,
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
  return <div className="max-w-page mx-auto px-4 sm:px-6 py-10">{children}</div>;
}

function AmberPageInner() {
  const { user, profile } = useAuth();
  const params = useSearchParams();
  const idFromLink = params.get("id");
  // Staff see the page read only: no job sheet is made, nothing is uploaded
  // and Submit is off. The server refuses staff too. Cam 2026-10-26.
  const staff = isStaff(profile);

  const [submissionId, setSubmissionId] = useState(idFromLink || null);
  const [mine, setMine] = useState([]);
  const [terms, setTerms] = useState(null);
  const [spec, setSpecState] = useState({});
  const [notSure, setNotSure] = useState([]);
  const [files, setFiles] = useState([]);
  const [kind, setKind] = useState(CHOICE_REPRO);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const fileInput = useRef(null);

  const submission = useMemo(
    () => mine.find((s) => s.id === submissionId) || null,
    [mine, submissionId],
  );

  // What this job will cost, and whether a PO number is compulsory.
  useEffect(() => {
    if (!user || staff) return;
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
  }, [user, staff]);

  const refresh = useCallback(async () => {
    if (!user || staff) return [];
    const items = await listSubmissions(user);
    setMine(items);
    return items;
  }, [user, staff]);

  // Load what this customer already has on the go, including artwork that came
  // in by email before they ever opened this page.
  useEffect(() => {
    if (!user || staff) return;
    let cancelled = false;
    (async () => {
      try {
        const items = await listSubmissions(user);
        if (cancelled) return;
        setMine(items);
        const open = items.find((s) => (idFromLink ? s.id === idFromLink : !s.jobNumber));
        if (open) {
          setSubmissionId(open.id);
          setSpecState(open.spec || {});
          setNotSure(open.notSure || []);
          setFiles(open.files || []);
          setKind(open.kind || CHOICE_REPRO);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [user, idFromLink, staff]);

  const poRequired = !!terms?.poRequired;
  const draft = useMemo(() => ({ spec, notSure, files }), [spec, notSure, files]);
  const missing = useMemo(
    () => missingSpecFields(draft, { poRequired }),
    [draft, poRequired],
  );
  const unsure = useMemo(() => notSureFields(draft), [draft]);
  const isLabel = spec.bagType === "Label";

  const price = useMemo(() => {
    if (kind !== CHOICE_REPRO) return null;
    return priceReproJob({ companyHasHadFreeJob: !!terms?.companyHasHadFreeJob });
  }, [kind, terms]);

  const ensureSubmission = useCallback(async () => {
    if (staff) throw new Error(READ_ONLY_MESSAGE);
    if (submissionId) return submissionId;
    // Always an artwork job. Plates go through Order Plates, which takes the
    // payment. The server enforces this too.
    const id = await createSubmission(user, NEW_SUBMISSION_KIND);
    setSubmissionId(id);
    await refresh();
    return id;
  }, [submissionId, user, kind, refresh, staff]);

  async function onPickFiles(event) {
    const picked = Array.from(event.target.files || []);
    if (!picked.length) return;
    if (staff) {
      setError(READ_ONLY_MESSAGE);
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const id = await ensureSubmission();
      let running = files;
      for (const file of picked) {
        setProgress({ name: file.name, percent: 0 });
        const { meta } = await uploadSubmissionFile({
          user,
          uid: user.uid,
          submissionId: id,
          file,
          existingFiles: running,
          onProgress: (percent) => setProgress({ name: file.name, percent }),
        });
        running = [...running, meta];
        setFiles(running);
      }
      await refresh();
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

  function toggleNotSure(key, on) {
    setNotSure((prev) => {
      const next = prev.filter((k) => k !== key);
      if (on && NOT_SURE_ALLOWED.includes(key)) next.push(key);
      return next;
    });
    if (on) update({ [key]: "" });
  }

  async function onSameAsLastTime() {
    const last = lastSpecForPrinter(mine.filter((s) => s.id !== submissionId), spec.printer);
    if (!last) {
      setError("We could not find an earlier job to copy. Fill it in once and next time it will be here.");
      return;
    }
    setError(null);
    setSpecState((prev) => ({ ...last, description: prev.description || "" }));
  }

  async function onRemoveFile(path) {
    if (staff) {
      setError(READ_ONLY_MESSAGE);
      return;
    }
    setBusy(true);
    try {
      const after = await removeSubmissionFile({
        user, submissionId, existingFiles: files, path,
      });
      setFiles(after.files || []);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit() {
    if (staff) {
      setError(READ_ONLY_MESSAGE);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const id = await ensureSubmission();
      // `kind` is not sent: a sheet is what it was created as, and the
      // server ignores any attempt to change it.
      await saveSubmission(user, { id, spec, notSure, files });
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
        if (data?.missing?.length) setError("Still needed: " + data.missing.join(", "));
        else setError(data?.error || "That did not go through. Please try again.");
        return;
      }
      setResult(data);
      await refresh();
    } catch (err) {
      setError(err.message || "That did not go through. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (result?.jobNumber) {
    const waiting = (result.waitingOn || []).length > 0;
    return (
      <Shell>
        <h1 className="text-2xl font-semibold text-ink">
          {waiting ? "Thanks, we have it from here" : "Thanks, AMBER is on it"}
        </h1>
        <p className="mt-3 text-ink">
          Your job is <strong>{result.jobNumber}</strong>.
          {waiting
            ? " You told us you were not sure about a few press details, so we will work those out for you. The 24 hours starts once they are in."
            : result.dueSaid
              ? <> You will have your plate-ready file and PDF proof by <strong>{result.dueSaid}</strong>.</>
              : " You will have your plate-ready file and PDF proof shortly."}
        </p>
        {result.firstFree && (
          <p className="mt-2 text-ink">This one is on us: your first AMBER job is free.</p>
        )}
        <a href="/jobs" className="inline-block mt-6 px-4 py-2 bg-accent-500 text-white rounded-md font-semibold">
          Track it in My Jobs
        </a>
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

      <div className="mt-8 border border-accent-500 rounded-lg p-5">
        <div className="font-semibold text-ink">Artwork by AMBER</div>
        <div className="mt-1 text-accent-600 font-semibold">
          {price?.free
            ? "First job free"
            : `R${AMBER_REPRO_PRICE_EXCL_VAT} a job, excl VAT`}
        </div>
        <ul className="mt-3 space-y-1 text-sm text-ink-muted">
          <li>{AMBER_REPRO_REVISIONS_INCLUDED} rounds of changes included</li>
          <li>Back within 24 hours, working days</li>
          <li>You get a plate-ready file and a PDF proof</li>
        </ul>
      </div>

      <p className="mt-4 text-sm text-ink-muted">
        Already have a plate-ready file and just want the plates?{" "}
        <a href="/order/new" className="font-semibold text-accent-600 hover:underline">
          Order plates instead
        </a>
        , where your price and payment are worked out for you.
      </p>

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
                {f.name}
                <span className="text-ink-muted"> · {formatSize(f.bytes)}</span>
              </span>
              <button
                type="button"
                disabled={busy}
                className="text-sm text-ink-muted hover:text-ink"
                onClick={() => onRemoveFile(f.path)}
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
          disabled={staff || busy}
          className="mt-3 block text-sm"
        />
        <p className="mt-1 text-sm text-ink">
          Easiest is <strong>one zip folder</strong> holding the artwork and
          everything it needs: linked images, logos and fonts. A single PDF is
          fine too.
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          PDF, AI, EPS, PSD, TIFF, ZIP and fonts. Up to 300 MB a file, 1 GB a job.
        </p>
        {progress && (
          <p className="mt-2 text-sm text-ink-muted">
            Sending {progress.name}... {progress.percent}%
          </p>
        )}
      </section>

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
            value={spec.description} onChange={(v) => update({ description: v })} />
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
            notSureKey="plateThickness" notSure={notSure} onNotSure={toggleNotSure}
            onChange={(v) => update({ plateThickness: v })} />
          <Choose label="Screen ruling" value={spec.screenRuling} options={SCREEN_RULING_OPTIONS}
            notSureKey="screenRuling" notSure={notSure} onNotSure={toggleNotSure}
            onChange={(v) => update({ screenRuling: v })} />

          <Text label="Cylinder" hint="The cylinder this prints on"
            value={spec.cylinder} onChange={(v) => update({ cylinder: v })}
            notSureKey="cylinder" notSure={notSure} onNotSure={toggleNotSure} />

          <Choose label="Distortion" value={spec.plateDistortion} options={PLATE_DISTORTION_OPTIONS}
            notSureKey="plateDistortion" notSure={notSure} onNotSure={toggleNotSure}
            onChange={(v) => update({ plateDistortion: v })} />
          <Choose label="Print direction" value={spec.printDirection} options={PRINT_DIRECTION_OPTIONS}
            onChange={(v) => update({ printDirection: v })} />

          {/* Gear and teeth are a label thing. On a bag they mean nothing, so
              they are only asked for, and only required, on a Label. */}
          {isLabel && (
            <>
              <ChooseValued label="Press gear" value={spec.gearPitch} options={GEAR_PITCH_OPTIONS}
                notSureKey="gearPitch" notSure={notSure} onNotSure={toggleNotSure}
                onChange={(v) => update({ gearPitch: v })} />
              <Num label="Teeth" value={spec.cylinderTeeth} onChange={(v) => update({ cylinderTeeth: v })} />
              <Num label="Gap across" suffix="mm" value={spec.gapAcrossMm} onChange={(v) => update({ gapAcrossMm: v })} />
              <Num label="Gap around" suffix="mm" value={spec.gapAroundMm} onChange={(v) => update({ gapAroundMm: v })} />
            </>
          )}
        </div>

        <div className="mt-4">
          <Inks
            value={spec.colours}
            unsure={notSure.includes("colours")}
            onNotSure={(on) => toggleNotSure("colours", on)}
            onChange={(v) => update({ colours: v })}
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Text label="Barcode number" hint="Leave blank if there is none"
            value={spec.barcode} onChange={(v) => update({ barcode: v })} />
          <Text label="Required by" type="date"
            value={spec.requiredBy} onChange={(v) => update({ requiredBy: v })} />
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

      <section className="mt-10 border-t border-ink/10 pt-6">
        {kind === CHOICE_REPRO && price && (
          <p className="text-lg font-semibold text-ink">{price.customerText}</p>
        )}
        {/* An older sheet from before 26 Oct 2026 can still say "plates".
            Submit sends it to Order Plates rather than making a job. */}
        {kind === CHOICE_PLATES && (
          <p className="text-lg font-semibold text-ink">
            This one was started as a plates job. Please order it on the Order
            Plates page instead, where your price and payment are worked out.
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
          disabled={staff || busy || missing.length > 0}
          onClick={onSubmit}
          className="mt-5 px-5 py-2.5 bg-accent-500 text-white rounded-md font-semibold disabled:opacity-40"
        >
          {busy ? "Sending..." : "Submit to AMBER"}
        </button>
        {staff && (
          <p data-staff-read-only className="mt-2 text-sm text-ink-muted">{READ_ONLY_MESSAGE}</p>
        )}
      </section>

      {mine.filter((s) => s.jobNumber).length > 0 && (
        <section className="mt-12 border-t border-ink/10 pt-6">
          <h2 className="text-lg font-semibold text-ink">Already with AMBER</h2>
          <ul className="mt-3 text-sm text-ink">
            {mine.filter((s) => s.jobNumber).map((s) => (
              <li key={s.id} className="py-1">
                {s.jobNumber} · {s.spec?.description || "Job"}
                {(s.misWaitingOn || []).length > 0
                  ? " · waiting on us"
                  : s.dueSaid ? ` · due back ${s.dueSaid}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
    </Shell>
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

function NotSureBox({ notSureKey, notSure, onNotSure }) {
  if (!notSureKey || !onNotSure) return null;
  const on = (notSure || []).includes(notSureKey);
  return (
    <label className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
      <input type="checkbox" checked={on} onChange={(e) => onNotSure(notSureKey, e.target.checked)} />
      {NOT_SURE_LABELS[notSureKey] || "Not sure"}
    </label>
  );
}

function Text({ label, hint, value, onChange, type = "text", notSureKey, notSure, onNotSure }) {
  const off = (notSure || []).includes(notSureKey);
  return (
    <Field label={label} hint={hint}>
      <input
        type={type}
        value={value || ""}
        disabled={off}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls + (off ? " opacity-50" : "")}
      />
      <NotSureBox notSureKey={notSureKey} notSure={notSure} onNotSure={onNotSure} />
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

function Choose({ label, value, options, onChange, notSureKey, notSure, onNotSure }) {
  const off = (notSure || []).includes(notSureKey);
  return (
    <Field label={label}>
      <select
        value={value || ""}
        disabled={off}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls + (off ? " opacity-50" : "")}
      >
        <option value="">Choose...</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <NotSureBox notSureKey={notSureKey} notSure={notSure} onNotSure={onNotSure} />
    </Field>
  );
}

// Same as Choose, but the stored value and the words shown differ (the MIS
// stores "CP" but shows the tooth pitch beside it).
function ChooseValued({ label, value, options, onChange, notSureKey, notSure, onNotSure }) {
  const off = (notSure || []).includes(notSureKey);
  return (
    <Field label={label}>
      <select
        value={value || ""}
        disabled={off}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls + (off ? " opacity-50" : "")}
      >
        <option value="">Choose...</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <NotSureBox notSureKey={notSureKey} notSure={notSure} onNotSure={onNotSure} />
    </Field>
  );
}

// Inks, in the order they print. Ten slots, same as the MIS.
function Inks({ value, unsure, onChange, onNotSure }) {
  const inks = Array.isArray(value) ? value : [];
  function setInk(index, text) {
    const next = [...inks];
    while (next.length <= index) next.push("");
    next[index] = text;
    onChange(next);
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
        <input type="checkbox" checked={!!unsure} onChange={(e) => onNotSure(e.target.checked)} />
        {NOT_SURE_LABELS.colours}
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
