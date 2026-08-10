"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import CustomerGuard from "@/components/CustomerGuard";
import { takeCheckFile, cleanupCheckFiles } from "@/lib/check-handoff";
import { buildCheckViewerHtml } from "@/lib/build-check-viewer";

function StatusScreen({ phase, error, fileName }) {
  const spinning = phase === "loading" || phase === "rendering";
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 60 }}
      className="flex flex-col items-center justify-center bg-[#0f1720] text-[#e8eef4] px-6 text-center"
    >
      <div className="font-extrabold tracking-wide text-lg mb-6">
        FLEXO <span className="text-[#e11d2a]">AFRICA</span>
      </div>
      {spinning && (
        <div
          className="inline-block h-8 w-8 border-2 border-current border-r-transparent rounded-full animate-spin mb-4"
          role="status"
          aria-label="Working"
        />
      )}
      {phase === "loading" && (
        <div className="text-sm text-[#93a3b4]">Opening your file…</div>
      )}
      {phase === "rendering" && (
        <div className="text-sm text-[#93a3b4] max-w-sm">
          Preparing your file for checking…
          <div className="mt-1 text-xs">
            {fileName ? fileName : ""} — this takes a few seconds.
          </div>
        </div>
      )}
      {phase === "error" && (
        <div className="max-w-md">
          <div className="text-base font-semibold mb-2">
            We couldn&rsquo;t open the file checker
          </div>
          <div className="text-sm text-[#93a3b4]">{error}</div>
          <a
            href="/order/new"
            className="inline-block mt-5 rounded-md bg-[#e11d2a] text-white text-sm font-semibold px-4 py-2"
          >
            Back to your order
          </a>
        </div>
      )}
    </div>
  );
}

function CheckInner() {
  const params = useSearchParams();
  const id = params.get("id");
  const [phase, setPhase] = useState("loading"); // loading | rendering | ready | error
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return; // run once
    startedRef.current = true;
    let alive = true;

    (async () => {
      cleanupCheckFiles().catch(() => {});

      if (!id) {
        setError("No file reference. Please open the checker from your order page.");
        setPhase("error");
        return;
      }

      const rec = await takeCheckFile(id);
      if (!alive) return;
      if (!rec || !rec.blob) {
        setError(
          "We couldn't find your file. Please go back to your order and click Check my file again."
        );
        setPhase("error");
        return;
      }
      setFileName(rec.name || "Your file");
      setPhase("rendering");

      try {
        const base = process.env.NEXT_PUBLIC_INK_ANALYSER_URL;
        if (!base) throw new Error("The file-checking service isn't configured yet.");

        const fd = new FormData();
        fd.append("file", rec.blob, rec.name || "artwork.pdf");

        const resp = await fetch(base.replace(/\/$/, "") + "/render", {
          method: "POST",
          body: fd,
        });
        if (!resp.ok) {
          let msg = "The file couldn't be prepared (" + resp.status + ").";
          try {
            const j = await resp.json();
            if (j && j.error) msg = j.error;
          } catch {}
          throw new Error(msg);
        }
        const payload = await resp.json();
        if (!alive) return;
        if (!payload || !payload.separations || !payload.separations.length) {
          throw new Error("We couldn't read any printable inks from this file.");
        }
        setHtml(buildCheckViewerHtml(payload, rec.name || "Your file"));
        setPhase("ready");
      } catch (e) {
        if (!alive) return;
        setError((e && e.message) || "Could not prepare your file.");
        setPhase("error");
      }
    })();

    return () => {
      alive = false;
    };
  }, [id]);

  if (phase === "ready") {
    return (
      <iframe
        title="File check"
        srcDoc={html}
        style={{ position: "fixed", inset: 0, width: "100%", height: "100%", border: 0, zIndex: 60 }}
      />
    );
  }
  return <StatusScreen phase={phase} error={error} fileName={fileName} />;
}

export default function CheckPage() {
  return (
    <CustomerGuard>
      <Suspense fallback={<StatusScreen phase="loading" />}>
        <CheckInner />
      </Suspense>
    </CustomerGuard>
  );
}
