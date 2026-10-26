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
 *   ask_for_missing - something a workticket needs is not there yet.
 *   wait_on_flexo   - the customer answered "Not sure" somewhere, so the ball
 *                     is with us and the 24 hours has not started.
 *   create          - complete. Ask the MIS to make the job.
 */
export function jobCreationDecision(submission, opts = {}) {
  if (submission?.jobNumber) {
    return { action: "return_existing", jobNumber: submission.jobNumber };
  }
  const missing = missingSpecFields(submission, opts);
  if (missing.length > 0) return { action: "ask_for_missing", missing };
  const notSure = notSureFields(submission);
  if (notSure.length > 0) return { action: "wait_on_flexo", notSure };
  return { action: "create" };
}
