// Sorting a customer's jobs and job messages IN THE BROWSER (Cam, 24 Nov 2026).
//
// WHY: the job list asked the database for the customer's jobs "newest first by
// createdAt". The database then silently leaves out every job that has no
// createdAt, and jobs made by the job system (every AMBER job, and the normal
// plate jobs) store their date as `created`. Top Flight saw 1 of its 4 jobs.
// The list now asks only "this company's jobs" and sorts them here, reading
// whichever date the job has.
//
// The job messages had the same kind of problem: the page asked for ALL of a
// job's messages, including the team's internal notes a customer may not read,
// so the database refused the whole request ("Missing or insufficient
// permissions"). It now asks only for the messages meant for the customer, and
// sorts them here (sorting in the database would need an extra index).
//
// Pure: no Firebase, no browser.

/** Messages a customer may read have this visibility. */
export const CUSTOMER_VISIBILITY = "customer";

/** A Firestore Timestamp, a Date, a number or a date text, as milliseconds. */
export function toMillis(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value?.toMillis === "function") {
    const ms = value.toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "object" && Number.isFinite(value.seconds)) {
    return value.seconds * 1000 + Math.floor((Number(value.nanoseconds) || 0) / 1e6);
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/** When a job was made: createdAt (portal orders), else created (job system), else updatedAt / updated. */
export function jobCreatedMs(job) {
  for (const key of ["createdAt", "created", "updatedAt", "updated"]) {
    const ms = toMillis(job?.[key]);
    if (ms !== null) return ms;
  }
  return null;
}

/** Newest first. Jobs with no date at all go last, in the order they came. */
export function sortJobsNewestFirst(jobs) {
  return (Array.isArray(jobs) ? jobs : [])
    .map((job, i) => ({ job, i, ms: jobCreatedMs(job) }))
    .sort((a, b) => {
      if (a.ms === null && b.ms === null) return a.i - b.i;
      if (a.ms === null) return 1;
      if (b.ms === null) return -1;
      return b.ms - a.ms || a.i - b.i;
    })
    .map(({ job }) => job);
}

/** Oldest first, the way a conversation reads. Undated messages go last. */
export function sortCommentsOldestFirst(comments) {
  return (Array.isArray(comments) ? comments : [])
    .map((c, i) => ({ c, i, ms: toMillis(c?.createdAt) }))
    .sort((a, b) => {
      if (a.ms === null && b.ms === null) return a.i - b.i;
      if (a.ms === null) return 1;
      if (b.ms === null) return -1;
      return a.ms - b.ms || a.i - b.i;
    })
    .map(({ c }) => c);
}
