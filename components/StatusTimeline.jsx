import { STAGES, STAGE_INDEX } from "@/lib/stages";

// Vertical timeline showing all 7 stages with current position.
// Past stages: filled. Current stage: highlighted. Future stages: muted.
export default function StatusTimeline({ stage }) {
  const currentIndex = STAGE_INDEX[stage] ?? 0;

  return (
    <ol className="relative space-y-6">
      {STAGES.map((s, i) => {
        const status =
          i < currentIndex ? "done" : i === currentIndex ? "current" : "future";
        const isLast = i === STAGES.length - 1;

        return (
          <li key={s.id} className="relative pl-12">
            {/* Vertical line */}
            {!isLast && (
              <span
                className={`absolute left-[14px] top-7 h-[calc(100%+0.5rem)] w-0.5 ${
                  i < currentIndex ? "bg-logoGreen" : "bg-ink/10"
                }`}
                aria-hidden="true"
              />
            )}

            {/* Dot */}
            <span
              className={`absolute left-0 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full border-2 ${
                status === "done"
                  ? "bg-logoGreen border-logoGreen text-white"
                  : status === "current"
                  ? "bg-white border-accent-500 text-accent-500 ring-4 ring-accent-500/20"
                  : "bg-white border-ink/20 text-ink/40"
              }`}
            >
              {status === "done" ? (
                <CheckIcon />
              ) : status === "current" ? (
                <span className="h-2 w-2 rounded-full bg-accent-500" />
              ) : (
                <span className="text-xs font-semibold">{i + 1}</span>
              )}
            </span>

            <div>
              <div
                className={`text-sm font-semibold ${
                  status === "done"
                    ? "text-ink"
                    : status === "current"
                    ? "text-ink"
                    : "text-ink/40"
                }`}
              >
                {s.customerLabel || s.label}
              </div>
              {status === "current" && (
                <p className="mt-1 text-sm text-ink-muted">{s.description}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function CheckIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 010 1.4l-7.4 7.4a1 1 0 01-1.4 0L3.3 9.5a1 1 0 011.4-1.4l3.9 3.9 6.7-6.7a1 1 0 011.4 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}
