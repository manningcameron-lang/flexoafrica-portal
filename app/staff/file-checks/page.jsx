"use client";

// STAFF screen: AMBER's file checks on customer uploads (Cam, 23 Nov 2026).
//
// 1. Pick an upload from the list (AMBER artwork jobs only).
// 2. AMBER pastes her report in the box and presses "Save AMBER's report".
//    The server checks the shape and says in plain words what is wrong, if
//    anything (a legal finding is always saved as a NOTE).
// 3. Cam reads it exactly as the customer will see it, changes wording,
//    deletes a finding, and presses "Send to customer" (Cam's login only,
//    checked on the server too).

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { ReportCard } from "@/components/FileCheckPanel";
import { mayReleaseFileCheck } from "@/lib/staff-view.mjs";
import { BY_AMBER, LEVELS, STATUS_REVIEW, statusLabel } from "@/lib/file-check.mjs";
import { INSPECTION_KEYS, LAMINATE_KEYS, PACK_KEYS, packAnswerLines } from "@/lib/pack-questions.mjs";
import { flavourList, inksLine } from "@/lib/job-flavours.mjs";
import {
  staffDelete,
  staffEdit,
  staffList,
  staffOpen,
  staffRelease,
  staffSave,
} from "@/lib/file-check-client";

const EXAMPLE = `{
  "printer": "Sack Force (Soma)",
  "pressClass": "CI bag press",
  "limitsAreDefaults": true,
  "findings": [
    { "stage": "5 Type and lines", "level": "FIX",
      "what": "The back panel text is 4 pt white out of the dark green.",
      "effect": "On this press white text that small fills in and the letters close up.",
      "options": [
        { "key": "A", "text": "Make it 6 pt and tighten the layout", "recommended": true },
        { "key": "B", "text": "Dark text on a pale panel" },
        { "key": "C", "text": "Leave it and accept the risk" } ] }
  ],
  "tidyList": ["Die lines moved to a layer that does not print"],
  "notChecked": ["Colour accuracy cannot be judged from a PDF"]
}`;

export default function StaffFileChecksPage() {
  const { user, profile } = useAuth();
  // Hides the button only; the server checks again with the verified sign-in.
  const mayRelease = mayReleaseFileCheck(profile, user?.email);
  const [items, setItems] = useState(null);
  const [openId, setOpenId] = useState("");
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");

  async function refreshList() {
    try {
      const d = await staffList(user);
      setItems(d.items || []);
    } catch (err) {
      setError(err.message);
    }
  }

  async function open(id) {
    setOpenId(id);
    setDetail(null);
    setError("");
    try {
      setDetail(await staffOpen(user, id));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (user) refreshList();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-page mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-ink">AMBER file checks</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Customer artwork sent through the AMBER page. Save AMBER&apos;s report, read it as the customer will, then send it.
        {!mayRelease && " Only Cam can send a check to a customer."}
      </p>
      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <div className="card divide-y divide-ink/10" data-upload-list>
            {items === null && <p className="p-4 text-sm text-ink-muted">Loading...</p>}
            {items?.length === 0 && <p className="p-4 text-sm text-ink-muted">No AMBER uploads yet.</p>}
            {items?.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => open(s.id)}
                className={`block w-full p-4 text-left hover:bg-brand-50 ${openId === s.id ? "bg-brand-50" : ""}`}
              >
                <div className="text-sm font-semibold text-ink">
                  {s.jobNumber || "No FA number yet"} · {s.company || "?"}
                </div>
                <div className="text-sm text-ink-muted truncate">{s.jobName || "(no job name)"}</div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs">
                  <span className="rounded bg-brand-100 px-2 py-0.5">{statusLabel(s.fileCheckStatus)}</span>
                  {s.fileCheckHold && <span className="rounded bg-red-100 px-2 py-0.5 text-red-800">On hold: STOP not answered</span>}
                  <span className="text-ink-muted">{s.files} file{s.files === 1 ? "" : "s"}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {!openId && <p className="text-sm text-ink-muted">Pick an upload on the left.</p>}
          {openId && !detail && !error && <p className="text-sm text-ink-muted">Loading...</p>}
          {detail && (
            <UploadDetail
              key={detail.submission.id}
              detail={detail}
              mayRelease={mayRelease}
              onChanged={async () => {
                await open(detail.submission.id);
                refreshList();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function UploadDetail({ detail, mayRelease, onChanged }) {
  const { submission, files, reports } = detail;
  const spec = submission.spec || {};
  const open = reports.find((r) => r.createdBy === BY_AMBER && r.status === STATUS_REVIEW);
  const sent = reports.filter((r) => r.createdBy === BY_AMBER && r.status !== STATUS_REVIEW);

  return (
    <>
      <div className="card p-5">
        <h2 className="text-lg font-semibold text-ink">
          {submission.jobNumber || "No FA number yet"}: {spec.description || "(no job name)"}
        </h2>
        <p className="text-sm text-ink-muted">
          {submission.company} · {submission.customerEmail} · {statusLabel(submission.fileCheckStatus)}
          {submission.fileCheckHold ? " · ON HOLD" : ""}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
          {Object.entries(spec)
            .filter(([k, v]) => k !== "description" && !PACK_KEYS.includes(k) && !LAMINATE_KEYS.includes(k) && !INSPECTION_KEYS.includes(k) && v !== "" && v != null && typeof v !== "object")
            .map(([k, v]) => (
              <div key={k}>
                <dt className="text-ink-muted">{k}</dt>
                <dd className="text-ink">{String(v)}</dd>
              </div>
            ))}
          {Array.isArray(spec.colours) && spec.colours.length > 0 && (
            <div>
              <dt className="text-ink-muted">colours</dt>
              <dd className="text-ink">{spec.colours.join(", ")}</dd>
            </div>
          )}
        </dl>
        {/* Flavours: one artwork, each flavour its own inks and barcode. */}
        {flavourList(spec.variants).length > 0 && (
          <div className="mt-2 text-xs" data-flavours>
            <p className="text-ink-muted">Flavours ({flavourList(spec.variants).length})</p>
            <ul className="mt-0.5 space-y-0.5 text-ink">
              {flavourList(spec.variants).map((v, i) => (
                <li key={i}>
                  <span className="font-medium">{v.name}</span>: {inksLine(v)}
                  {v.barcode ? ` · barcode ${v.barcode}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
        {packAnswerLines(spec).length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-ink" data-pack-answers>
            {packAnswerLines(spec).map((line) => <li key={line}>{line}</li>)}
          </ul>
        )}
        {submission.notSure?.length > 0 && (
          <p className="mt-2 text-xs text-ink-muted">Not sure: {submission.notSure.join(", ")}</p>
        )}
        <ul className="mt-3 space-y-1 text-sm">
          {files.map((f, i) => (
            <li key={i}>
              {f.url ? (
                <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-accent-600 hover:underline">
                  {f.name}
                </a>
              ) : (
                f.name
              )}{" "}
              <span className="text-xs text-ink-muted">({Math.round((f.bytes || 0) / 1024)} KB)</span>
            </li>
          ))}
        </ul>
      </div>

      {open ? (
        <ReviewReport submission={submission} report={open} mayRelease={mayRelease} onChanged={onChanged} />
      ) : (
        <SaveReport submission={submission} onChanged={onChanged} />
      )}

      {sent.map((r) => (
        <div key={r.id}>
          <p className="mb-2 text-xs text-ink-muted">
            {statusLabel(r.status)}
            {r.releasedByEmail ? ` by ${r.releasedByEmail}` : ""}
            {r.releasedAtMs ? ` on ${new Date(r.releasedAtMs).toLocaleString("en-ZA")}` : ""}
            {r.emailNote ? `. ${r.emailNote}` : ""}
          </p>
          <ReportCard title="As the customer sees it" report={r} mode={r.status === "answered" ? "answered" : "preview"} />
        </div>
      ))}
    </>
  );
}

function SaveReport({ submission, onChanged }) {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [problems, setProblems] = useState([]);
  const [busy, setBusy] = useState(false);

  async function save() {
    setProblems([]);
    let report;
    try {
      report = JSON.parse(text);
    } catch {
      setProblems(["That is not a readable report. It must be one { ... } block, like the example."]);
      return;
    }
    setBusy(true);
    try {
      await staffSave(user, submission.id, report);
      setText("");
      await onChanged();
    } catch (err) {
      setProblems([err.message, ...(err.problems || [])]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5" data-save-report>
      <h2 className="text-sm font-semibold uppercase tracking-widest text-ink-muted">Save AMBER&apos;s report</h2>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={14}
        placeholder={EXAMPLE}
        className="mt-3 w-full rounded-md border border-ink/15 p-3 font-mono text-xs"
        data-report-box
      />
      {problems.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-sm text-red-700" role="alert">
          {problems.map((p, i) => <li key={i}>{p}</li>)}
        </ul>
      )}
      <button
        type="button"
        onClick={save}
        disabled={busy || !text.trim()}
        className="mt-3 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Saving..." : "Save AMBER's report"}
      </button>
    </div>
  );
}

function ReviewReport({ submission, report, mayRelease, onChanged }) {
  const { user } = useAuth();
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(report)));
  const [problems, setProblems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  const changed = JSON.stringify(draft) !== JSON.stringify(report);

  const setFinding = (i, patch) =>
    setDraft((d) => ({ ...d, findings: d.findings.map((f, j) => (j === i ? { ...f, ...patch } : f)) }));
  const setOption = (i, k, patch) =>
    setFinding(i, {
      options: draft.findings[i].options.map((o, j) => (j === k ? { ...o, ...patch } : patch.recommended ? { ...o, recommended: false } : o)),
    });

  async function run(fn) {
    setBusy(true);
    setProblems([]);
    try {
      await fn();
    } catch (err) {
      setProblems([err.message, ...(err.problems || [])]);
    } finally {
      setBusy(false);
    }
  }

  const save = () => run(async () => {
    await staffEdit(user, submission.id, report.id, draft);
    await onChanged();
  });
  const throwAway = () => run(async () => {
    await staffDelete(user, submission.id, report.id);
    await onChanged();
  });
  const release = () => run(async () => {
    const res = await staffRelease(user, submission.id, report.id);
    setNote(res.emailNote || "");
    await onChanged();
  });

  return (
    <div className="card p-5 space-y-4" data-review>
      <h2 className="text-sm font-semibold uppercase tracking-widest text-ink-muted">Check ready for review</h2>
      <p className="text-xs text-ink-muted">
        Saved by {report.savedByEmail || "staff"}. Change any wording below, then Save changes. A legal finding always stays a NOTE.
      </p>

      {draft.findings.map((f, i) => (
        <div key={i} className="rounded-md border border-ink/10 p-3 space-y-2" data-edit-finding>
          <div className="flex items-center gap-2">
            <span className="font-bold">{i + 1}.</span>
            <select
              value={f.level}
              onChange={(e) => setFinding(i, { level: e.target.value })}
              disabled={f.legal}
              className="rounded border border-ink/15 px-2 py-1 text-sm"
            >
              {LEVELS.map((l) => <option key={l}>{l}</option>)}
            </select>
            {f.legal && <span className="text-xs text-ink-muted">Legal note (advice only)</span>}
            <button
              type="button"
              onClick={() => setDraft((d) => ({ ...d, findings: d.findings.filter((_, j) => j !== i) }))}
              className="ml-auto text-xs font-semibold text-red-700"
            >
              Delete this finding
            </button>
          </div>
          <textarea value={f.what} onChange={(e) => setFinding(i, { what: e.target.value })} rows={2} className="w-full rounded border border-ink/15 p-2 text-sm" />
          <textarea value={f.effect} onChange={(e) => setFinding(i, { effect: e.target.value })} rows={2} className="w-full rounded border border-ink/15 p-2 text-sm" />
          {f.options.map((o, k) => (
            <div key={k} className="flex items-center gap-2">
              <span className="w-5 text-sm font-bold">{o.key}</span>
              <input value={o.text} onChange={(e) => setOption(i, k, { text: e.target.value })} className="flex-1 rounded border border-ink/15 px-2 py-1 text-sm" />
              <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                <input type="radio" name={`rec-${i}`} checked={o.recommended} onChange={() => setOption(i, k, { recommended: true })} />
                Recommended
              </label>
            </div>
          ))}
        </div>
      ))}

      <label className="block text-xs text-ink-muted">
        I will tidy these unless you say no (one per line)
        <textarea
          value={(draft.tidyList || []).join("\n")}
          onChange={(e) => setDraft((d) => ({ ...d, tidyList: e.target.value.split("\n") }))}
          rows={3}
          className="mt-1 w-full rounded border border-ink/15 p-2 text-sm text-ink"
        />
      </label>
      <label className="block text-xs text-ink-muted">
        Not checked (one per line)
        <textarea
          value={(draft.notChecked || []).join("\n")}
          onChange={(e) => setDraft((d) => ({ ...d, notChecked: e.target.value.split("\n") }))}
          rows={2}
          className="mt-1 w-full rounded border border-ink/15 p-2 text-sm text-ink"
        />
      </label>

      {problems.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-red-700" role="alert">
          {problems.map((p, i) => <li key={i}>{p}</li>)}
        </ul>
      )}
      {note && <p className="text-sm text-ink">{note}</p>}

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={save} disabled={busy || !changed} className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          Save changes
        </button>
        <button type="button" onClick={throwAway} disabled={busy} className="rounded-md border border-ink/20 px-4 py-2 text-sm font-semibold text-ink">
          Throw this check away
        </button>
        {mayRelease && !confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={busy || changed || !submission.jobNumber}
            className="rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            data-send
          >
            Send to customer
          </button>
        )}
        {mayRelease && confirming && (
          <>
            <button type="button" onClick={release} disabled={busy} className="rounded-md bg-accent-600 px-4 py-2 text-sm font-semibold text-white" data-send-yes>
              Yes, send it now
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="rounded-md border border-ink/20 px-4 py-2 text-sm font-semibold text-ink">
              Not yet
            </button>
          </>
        )}
      </div>
      {mayRelease && changed && <p className="text-xs text-ink-muted">Save your changes before sending.</p>}
      {mayRelease && !submission.jobNumber && (
        <p className="text-xs text-ink-muted">It can be sent once the MIS has made the job (no FA number yet).</p>
      )}

      <ReportCard title="As the customer will see it" report={report} mode="preview" />
    </div>
  );
}
