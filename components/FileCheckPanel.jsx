"use client";

// AMBER's file check on the customer's job page (Cam, 23 Nov 2026).
// Phone first: Cam and most customers read this on a phone.
//
// Order: STOP first, then FIX, then "I will tidy these unless you say no",
// then NOTE, then Not checked. About 8 findings on show, the rest behind
// "show more". One choice per STOP and FIX, one "Submit my answers".
//
// It only SHOWS what the server sends; the server decides what a customer may
// see (lib/file-check.mjs customerView) and checks every answer again.

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { isStaff, READ_ONLY_MESSAGE } from "@/lib/staff-view.mjs";
import {
  AUTO_HEADING,
  DEFAULT_LIMIT_LINE,
  LEGAL_LINE,
  needsAnswer,
  readyToSubmit,
  splitForShow,
} from "@/lib/file-check.mjs";
import { loadFileCheck, startInstantCheck, submitAnswers } from "@/lib/file-check-client";

export default function FileCheckPanel({ job }) {
  const { user, profile } = useAuth();
  const staff = isStaff(profile);
  const submissionId = job?.amberIntake?.submissionId || "";
  const jobNumber = job?.jobName || "";
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!user || (!submissionId && !jobNumber)) return;
    let stop = false;
    let timer = null;
    let tries = 0;
    async function load() {
      try {
        const d = await loadFileCheck(user, { submissionId, jobNumber });
        if (stop) return;
        setData(d);
        // The instant check: start it once (the server does nothing while it
        // is switched off), then look again while it is still working.
        if (!staff && !d.auto && !d.autoRunning && tries === 0 && d.submissionId) {
          tries += 1;
          const s = await startInstantCheck(user, d.submissionId).catch(() => null);
          if (!stop && (s?.state === "ready" || s?.state === "running")) timer = setTimeout(load, 4000);
        } else if (d.autoRunning && tries < 60) {
          tries += 1;
          timer = setTimeout(load, 5000);
        }
      } catch {
        if (!stop) setData(null); // not an AMBER upload, or nothing to show
      }
    }
    load();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [user, submissionId, jobNumber, staff]);

  if (!data || (!data.amber && !data.auto && !data.autoRunning)) return null;

  return (
    <div className="mt-8 space-y-6" data-file-check>
      {data.amber && (
        <AmberCheck
          report={data.amber}
          submissionId={data.submissionId}
          staff={staff}
          onSaved={(report) => setData({ ...data, amber: report })}
        />
      )}
      {data.auto ? (
        <ReportCard title="First check" report={data.auto} mode="auto" />
      ) : data.autoRunning ? (
        <div className="card p-6 text-sm text-ink-muted" data-auto-running>
          <span
            className="inline-block h-4 w-4 mr-2 align-middle border-2 border-current border-r-transparent rounded-full animate-spin"
            role="status"
          />
          Checking your file. This takes a minute or two.
        </div>
      ) : null}
    </div>
  );
}

function AmberCheck({ report, submissionId, staff, onSaved }) {
  const { user } = useAuth();
  const answered = report.status === "answered";
  const [picks, setPicks] = useState(() =>
    Object.fromEntries(report.findings.filter((f) => f.answer).map((f) => [String(f.id), f.answer])),
  );
  const [notes, setNotes] = useState({});
  const [refused, setRefused] = useState(report.tidyRefused || []);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ready = readyToSubmit(report.findings, picks);
  const toAnswer = needsAnswer(report.findings).length;
  const hiddenNeedAnswer = !showAll && splitForShow(report.findings, false).hidden > 0;

  async function onSubmit() {
    if (staff) {
      setError(READ_ONLY_MESSAGE);
      return;
    }
    if (!ready) {
      setShowAll(true);
      setError("Please pick an option for every point first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await submitAnswers(user, {
        submissionId,
        reportId: report.id,
        answers: picks,
        notes,
        tidyRefused: refused,
      });
      onSaved(res.report);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ReportCard
      title="AMBER's file check"
      report={report}
      mode={answered ? "answered" : "answer"}
      picks={picks}
      onPick={(id, key) => setPicks((p) => ({ ...p, [String(id)]: key }))}
      notes={notes}
      onNote={(id, text) => setNotes((n) => ({ ...n, [String(id)]: text }))}
      refused={refused}
      onRefuse={(i) => setRefused((r) => (r.includes(i) ? r.filter((x) => x !== i) : [...r, i]))}
      showAll={showAll}
      onShowAll={() => setShowAll(true)}
      locked={staff || answered}
      footer={
        answered ? (
          <p className="text-sm font-semibold text-logoGreen" data-answered>
            Thank you. Your answers are with us and AMBER will work from them.
          </p>
        ) : (
          <div>
            {error && <p className="mb-3 text-sm text-red-700" role="alert">{error}</p>}
            {staff && <p className="mb-3 text-xs text-ink-muted">{READ_ONLY_MESSAGE}</p>}
            <button
              type="button"
              onClick={onSubmit}
              disabled={busy || staff}
              className="w-full sm:w-auto rounded-md bg-accent-500 px-5 py-3 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-50"
              data-submit-answers
            >
              {busy ? "Sending..." : "Submit my answers"}
            </button>
            {toAnswer > 0 && !ready && (
              <p className="mt-2 text-xs text-ink-muted">
                Pick an option for each numbered point{hiddenNeedAnswer ? ", including the ones under Show more" : ""}.
              </p>
            )}
          </div>
        )
      }
    />
  );
}

/**
 * The report itself. Also used by the staff screen to show Cam exactly what
 * the customer will see (mode "preview").
 *   mode: "answer" | "answered" | "auto" | "preview"
 */
export function ReportCard({
  title,
  report,
  mode,
  picks = {},
  onPick = () => {},
  notes = {},
  onNote = () => {},
  refused = [],
  onRefuse = () => {},
  showAll: showAllProp,
  onShowAll,
  locked = true,
  footer = null,
}) {
  const [showAllLocal, setShowAllLocal] = useState(false);
  const showAll = showAllProp ?? showAllLocal;
  const expand = onShowAll || (() => setShowAllLocal(true));
  const split = splitForShow(report.findings, showAll);
  const auto = mode === "auto";
  const choose = mode === "answer" || mode === "preview";

  const block = (heading, list, tone) =>
    list.length > 0 && (
      <section className="mt-5">
        <h3 className={`text-sm font-bold ${tone}`}>{heading}</h3>
        <ol className="mt-2 space-y-4">
          {list.map((f) => (
            <Finding
              key={f.id}
              f={f}
              auto={auto}
              choose={choose && !auto && (f.level === "STOP" || f.level === "FIX")}
              locked={locked}
              pick={picks[String(f.id)] || f.answer || ""}
              onPick={(k) => onPick(f.id, k)}
              note={notes[String(f.id)] ?? f.answerNote ?? ""}
              onNote={(t) => onNote(f.id, t)}
              answered={mode === "answered"}
            />
          ))}
        </ol>
      </section>
    );

  return (
    <div className="card p-5 sm:p-6" data-report={auto ? "auto" : "amber"}>
      <h2 className="text-sm font-semibold uppercase tracking-widest text-ink-muted">{title}</h2>
      {auto && <p className="mt-2 text-sm font-semibold text-ink">{AUTO_HEADING}</p>}
      {!auto && mode !== "answered" && needsAnswer(report.findings).length > 0 && (
        <p className="mt-2 text-sm text-ink">
          AMBER has checked your artwork against your job. Nothing is changed until you answer.
        </p>
      )}
      {report.limitsAreDefaults && (
        <p className="mt-2 text-xs text-ink-muted">
          Some limits below are our usual settings, {DEFAULT_LIMIT_LINE}.
        </p>
      )}

      {block("Must sort out before we start", split.stop, "text-red-700")}
      {block("Will print badly unless fixed", split.fix, "text-logoOrange")}

      {report.tidyList?.length > 0 && (
        <section className="mt-5">
          <h3 className="text-sm font-bold text-ink">
            {auto ? "Small things AMBER can tidy" : "I will tidy these unless you say no"}
          </h3>
          <ul className="mt-2 space-y-2">
            {report.tidyList.map((t, i) => (
              <li key={i} className="flex items-start justify-between gap-3 text-sm text-ink-muted">
                <span className={refused.includes(i) ? "line-through" : ""}>{t}</span>
                {!auto && choose && (
                  <label className="flex flex-none items-center gap-1 text-xs whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={refused.includes(i)}
                      onChange={() => onRefuse(i)}
                      disabled={locked}
                    />
                    No, leave it
                  </label>
                )}
                {mode === "answered" && refused.includes(i) && (
                  <span className="flex-none text-xs font-semibold">You said leave it</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {block("Worth knowing", split.note, "text-ink")}

      {split.hidden > 0 && (
        <button
          type="button"
          onClick={expand}
          className="mt-4 text-sm font-semibold text-accent-600 hover:underline"
          data-show-more
        >
          Show {split.hidden} more
        </button>
      )}

      {report.notChecked?.length > 0 && (
        <section className="mt-5">
          <h3 className="text-sm font-bold text-ink-muted">Not checked</h3>
          <ul className="mt-1 list-disc pl-5 text-xs text-ink-muted space-y-1">
            {report.notChecked.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </section>
      )}

      {footer && <div className="mt-6">{footer}</div>}
    </div>
  );
}

function Finding({ f, auto, choose, locked, pick, onPick, note, onNote, answered }) {
  const badge =
    f.level === "STOP" ? "bg-red-100 text-red-800" : f.level === "FIX" ? "bg-orange-100 text-orange-800" : "bg-brand-50 text-ink-muted";
  return (
    <li className="rounded-lg border border-ink/10 p-4" data-finding={f.level}>
      <div className="flex items-start gap-2">
        <span className="font-bold text-ink">{f.id}.</span>
        <div className="min-w-0 flex-1">
          <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold ${badge}`}>{f.level}</span>
          <p className="mt-1 text-sm font-medium text-ink break-words">{f.what}</p>
          {f.effect && <p className="mt-1 text-sm text-ink-muted break-words">{f.effect}</p>}
          {f.limitIsDefault && <p className="mt-1 text-xs text-ink-muted">({DEFAULT_LIMIT_LINE})</p>}
          {f.legal && <p className="mt-1 text-xs italic text-ink-muted" data-legal-line>{LEGAL_LINE}</p>}

          {f.options?.length > 0 && (
            <div className="mt-3 space-y-2" role={choose ? "radiogroup" : undefined}>
              {f.options.map((o) =>
                choose ? (
                  <label
                    key={o.key}
                    className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                      pick === o.key ? "border-accent-500 bg-accent-50" : "border-ink/10"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`finding-${f.id}`}
                      value={o.key}
                      checked={pick === o.key}
                      onChange={() => onPick(o.key)}
                      disabled={locked}
                      className="mt-0.5"
                    />
                    <span>
                      <strong>{o.key}:</strong> {o.text}
                      {o.recommended && <span className="ml-1 text-xs font-semibold text-logoGreen">(Recommended)</span>}
                    </span>
                  </label>
                ) : (
                  <p
                    key={o.key}
                    className={`text-sm ${answered && pick === o.key ? "font-semibold text-ink" : "text-ink-muted"}`}
                  >
                    <strong>{o.key}:</strong> {o.text}
                    {o.recommended && <span className="ml-1 text-xs font-semibold text-logoGreen">(Recommended)</span>}
                    {answered && pick === o.key && <span className="ml-1 text-xs">Your pick</span>}
                  </p>
                ),
              )}
            </div>
          )}

          {choose && !locked && (
            <input
              type="text"
              value={note}
              maxLength={300}
              onChange={(e) => onNote(e.target.value)}
              placeholder="Anything to add? (optional)"
              className="mt-2 w-full rounded-md border border-ink/15 px-3 py-2 text-sm"
            />
          )}
          {answered && note && <p className="mt-2 text-xs text-ink-muted">Your note: {note}</p>}
        </div>
      </div>
    </li>
  );
}
