"use client";

import { stashCheckFile } from "@/lib/check-handoff";

/**
 * "Check my file" button. Opens the file-checking station in a new tab and
 * hands it the customer's uploaded PDF (via IndexedDB). Additive — it does not
 * touch the separation checkboxes the order uses.
 *
 * Shows only once the PDF has been read (analysis ok) and we still hold the
 * File object in memory.
 */
export default function CheckFileButton({ file, analysis }) {
  const ready = !!file && analysis && analysis.ok;
  if (!ready) return null;

  function openChecker() {
    const id =
      "chk_" +
      Math.random().toString(36).slice(2) +
      Date.now().toString(36);
    const url = "/check?id=" + encodeURIComponent(id);
    // Open the tab synchronously inside the click so pop-up blockers allow it,
    // then stash the file for that tab to pick up.
    const win = window.open(url, "_blank", "noopener");
    stashCheckFile(id, file, { name: file.name }).catch(() => {});
    if (!win) {
      // Pop-up blocked: fall back to opening in this tab.
      window.location.href = url;
    }
  }

  return (
    <button
      type="button"
      onClick={openChecker}
      className="inline-flex items-center gap-2 rounded-md bg-ink text-white text-sm font-semibold px-3 py-2 hover:bg-ink/90 transition-colors"
      title="Open the file checker to view inks, sizes and separations"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      Check my file
    </button>
  );
}
