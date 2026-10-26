// The rules Submit applies, kept out of the route so they can be tested.

import { missingSpecFields, notSureFields } from "./amber-spec.mjs";

/**
 * May this signed-in caller submit this submission?
 *
 * A forged From address on an email can put files into somebody's holding
 * area, but it can never make a job, because a job is only ever made from a
 * submission whose uid matches the signed-in caller's verified uid.
 *
 * @param {object} args
 * @param {object|null} args.submission
 * @param {{uid: string, role?: string, status?: string}|null} args.caller
 */
export function mayCustomerSubmit({ submission, caller }) {
  if (!caller?.uid) return { allowed: false, reason: "not signed in" };
  if (caller.role && caller.role !== "customer") {
    return { allowed: false, reason: "not a customer" };
  }
  if (caller.status !== "active") return { allowed: false, reason: "account not active" };
  if (!submission) return { allowed: false, reason: "not found" };
  if (submission.uid !== caller.uid) return { allowed: false, reason: "not yours" };
  return { allowed: true, reason: null };
}

/**
 * What Submit should do with a submission.
 *
 *   return_existing - a job was already made from it. Hand back the SAME FA
 *                     number. One submission makes one job, however many
 *                     times Submit is pressed.
 *   ask_for_missing - something a workticket needs is not there yet. The MIS
 *                     is never called.
 *   create          - hand it to the MIS.
 *
 * ⚠ CHANGED 26 Oct 2026 to match the MIS contract. A "Not sure" answer used
 * to stop here and park the job on our side. It no longer does: the MIS makes
 * the job anyway and answers with what it is waiting on, so the customer gets
 * a real job number straight away and we fill the box in afterwards. The 24
 * hours still only starts once that box is filled.
 */
export function jobCreationDecision(submission, opts = {}) {
  if (submission?.jobNumber) {
    return { action: "return_existing", jobNumber: submission.jobNumber };
  }
  const missing = missingSpecFields(submission, opts);
  if (missing.length > 0) return { action: "ask_for_missing", missing };
  return { action: "create", notSure: notSureFields(submission) };
}

/**
 * Turn whatever the MIS answered into what the portal should do.
 *
 * The MIS can answer in more ways than "yes" or "no", and getting this wrong
 * is how a customer ends up with two jobs or a lost file. Every shape in its
 * contract is handled here, where it can be tested without a network.
 *
 * @param {number} status the HTTP status
 * @param {object|null} body the parsed JSON, or null if it was not JSON
 */
export function readMisAnswer(status, body) {
  // ⚠ A REFUSAL CAN ARRIVE ON ANY STATUS. The live door answers a refusal with
  // a 4xx AND a body of {ok:false, missing:[...], why}. Checked against the
  // live door 26 Oct 2026. Reading the status first threw the list away and
  // told the customer "that job sheet could not be found" instead of
  // "still needed: Printer, Inks". So the list is read FIRST, whatever the
  // status, and only an EMPTY list falls through to the status handling
  // (a 401 also carries ok:false with an empty missing list).
  if (body?.ok === false) {
    const missing = Array.isArray(body.missing) ? body.missing : [];
    if (missing.length > 0) {
      return { outcome: "ask_for_missing", missing, message: body.why || null };
    }
    // Refused, but with nothing the customer could act on (a 401 looks like
    // this). Fall through to the status handling so they get a sensible
    // message instead of an empty "still needed:" list.
  }
  if (status === 401) {
    return { outcome: "config_error", message: "The link to the job system is not set up." };
  }
  if (status === 403) {
    return { outcome: "not_allowed", message: body?.why || "This account is not active." };
  }
  if (status === 404 || status === 400) {
    return {
      outcome: "bad_request",
      message: body?.why || "That job sheet could not be found.",
    };
  }
  if (status !== 200 || !body) {
    return { outcome: "try_again", message: "The job system did not answer properly." };
  }
  if (body.ok === true && body.jobNumber) {
    const waitingOn = Array.isArray(body.waitingOn) ? body.waitingOn : [];
    return {
      outcome: waitingOn.length > 0 ? "made_waiting_on_us" : "made",
      jobNumber: body.jobNumber,
      dueAt: body.dueAt || null,
      dueSaid: body.dueSaid || null,
      firstFree: !!body.firstFree,
      kind: body.kind || null,
      waitingOn,
      // The MIS made the job but a folder or file step did not finish. It
      // retries the leftovers, so this is worth saying out loud, not hiding.
      warnings: Array.isArray(body.warnings) ? body.warnings : [],
      again: !!body.again,
    };
  }
  return { outcome: "try_again", message: "The job system did not answer properly." };
}
