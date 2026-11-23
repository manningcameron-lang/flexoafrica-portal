// Browser-side calls for AMBER's file check. Every save goes through our
// server, never straight to the database (the rules deny that anyway).

async function send(user, url, method = "GET", body) {
  const token = await user.getIdToken();
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || "That did not work. Please try again.");
    err.problems = Array.isArray(data?.problems) ? data.problems : [];
    err.status = res.status;
    throw err;
  }
  return data;
}

// ─── customer job page ───────────────────────────────────────────────────────
export function loadFileCheck(user, { submissionId, jobNumber }) {
  const q = submissionId
    ? `submissionId=${encodeURIComponent(submissionId)}`
    : `jobNumber=${encodeURIComponent(jobNumber || "")}`;
  return send(user, `/api/amber/file-check?${q}`);
}

export function submitAnswers(user, payload) {
  return send(user, "/api/amber/file-check", "POST", payload);
}

export function startInstantCheck(user, submissionId) {
  return send(user, "/api/amber/upload-check", "POST", { submissionId });
}

// ─── staff screen ────────────────────────────────────────────────────────────
export function staffList(user) {
  return send(user, "/api/staff/file-checks");
}

export function staffOpen(user, submissionId) {
  return send(user, `/api/staff/file-checks?submissionId=${encodeURIComponent(submissionId)}`);
}

export function staffSave(user, submissionId, report) {
  return send(user, "/api/staff/file-checks", "POST", { submissionId, report });
}

export function staffEdit(user, submissionId, reportId, report) {
  return send(user, "/api/staff/file-checks", "PATCH", { submissionId, reportId, report });
}

export function staffDelete(user, submissionId, reportId) {
  return send(user, "/api/staff/file-checks", "DELETE", { submissionId, reportId });
}

export function staffRelease(user, submissionId, reportId) {
  return send(user, "/api/staff/file-checks/release", "POST", { submissionId, reportId });
}
