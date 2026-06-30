"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthProvider";
import {
  postCustomerComment,
  subscribeJobComments,
} from "@/lib/comments";

/**
 * Threaded comments on a job. Lives on the Job Detail page, renders only
 * customer-visible comments (Firestore rules filter internal ones server-
 * side). Posting a new comment writes visibility="customer".
 *
 * Sends are gated by Firestore rules + the customer's company match on the
 * parent job. UI is optimistic-add — appears immediately in the thread,
 * server timestamp resolves on next snapshot.
 */
export default function JobCommentsThread({ job }) {
  const { user, profile } = useAuth();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState(null);
  const composerRef = useRef(null);

  useEffect(() => {
    if (!job?.id) return;
    setLoading(true);
    const unsub = subscribeJobComments(job.id, (items, err) => {
      if (err) {
        setError(err.message || "Couldn't load conversation");
        setLoading(false);
        return;
      }
      setComments(items || []);
      setLoading(false);
    });
    return unsub;
  }, [job?.id]);

  async function handleSubmit(e) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || posting) return;
    setPosting(true);
    setError(null);
    try {
      await postCustomerComment({
        jobId: job.id,
        text,
        author: {
          uid: user.uid,
          contactName: profile?.contactName,
          company: profile?.company,
          email: user.email,
        },
      });
      setDraft("");
    } catch (err) {
      setError(err.message || "Couldn't post comment");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-ink-muted">
          Conversation
        </h2>
        <span className="text-xs text-ink-muted">
          {comments.length === 0
            ? "No messages yet"
            : `${comments.length} message${comments.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {/* Thread */}
      {loading ? (
        <div className="rounded-md border border-dashed border-ink/15 bg-brand-50 p-6 text-center text-sm text-ink-muted">
          Loading conversation...
        </div>
      ) : comments.length === 0 ? (
        <div className="rounded-md border border-dashed border-ink/15 bg-brand-50 p-6 text-sm text-ink-muted">
          No conversation yet. Use the box below to send a note about this job —
          our team gets an email immediately and replies in here.
        </div>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id}>
              <CommentBubble
                comment={c}
                isMine={c.authorUid === user?.uid}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Composer */}
      <form onSubmit={handleSubmit} className="mt-5">
        <label className="block">
          <span className="sr-only">Add a comment</span>
          <textarea
            ref={composerRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask a question, share a revision note, request a change..."
            rows={3}
            className="w-full rounded-md border border-ink/15 bg-white px-4 py-3 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
            disabled={posting}
          />
        </label>
        {error && (
          <p className="mt-2 text-xs text-accent-600">{error}</p>
        )}
        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-ink-muted">
            Our team gets an email when you post. Replies show up here in real time.
          </p>
          <button
            type="submit"
            disabled={posting || !draft.trim()}
            className="btn-primary disabled:opacity-50"
          >
            {posting ? "Sending..." : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}

function CommentBubble({ comment, isMine }) {
  const role = comment.authorRole || "customer";
  const isStaff =
    role === "operator" || role === "admin" || role === "designer";
  const align = isMine ? "items-end" : "items-start";
  const bubble = isMine
    ? "bg-accent-500 text-white border-accent-500"
    : isStaff
      ? "bg-brand-50 text-ink border-ink/10"
      : "bg-white text-ink border-ink/10";
  const meta = isMine
    ? "text-ink-muted text-right"
    : "text-ink-muted";

  return (
    <div className={`flex flex-col gap-1 ${align}`}>
      <div
        className={`max-w-[85%] rounded-2xl border px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${bubble}`}
      >
        {comment.text}
      </div>
      <div className={`text-[11px] ${meta}`}>
        <span className="font-medium">{comment.authorName || "Someone"}</span>
        {isStaff && !isMine && (
          <span className="ml-1.5 inline-flex items-center rounded-full bg-ink/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink">
            Flexo Africa
          </span>
        )}
        {comment.createdAt && (
          <span className="ml-1.5">{formatStamp(comment.createdAt)}</span>
        )}
      </div>
    </div>
  );
}

function formatStamp(ts) {
  if (!ts) return "";
  try {
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    if (Number.isNaN(date.getTime())) return "";
    const sameDay = isSameDay(date, new Date());
    return new Intl.DateTimeFormat("en-ZA", {
      day: sameDay ? undefined : "numeric",
      month: sameDay ? undefined : "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return "";
  }
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
