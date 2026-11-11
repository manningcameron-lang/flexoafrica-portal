// The email sales@ gets every time a customer orders on the portal.
//
// WHAT WAS WRONG (Cam, 11 Nov 2026): "what happens if someone uploads artwork
// to the portal, do i get an email to sales@?" Not reliably:
//   - Order Plates sent sales@ NOTHING. The FA jobs appeared on the MIS board
//     and nobody was told, not even when a card order had not been paid yet.
//   - Order Artwork only copied sales@ on the customer's "your job is with
//     AMBER" email. A job where the customer ticked "Not sure" sends that
//     email to nobody, and a customer who had already had three automatic
//     emails that day was blocked by the loop guard, sales@ copy included.
//
// WHAT IT DOES NOW: one plain email to sales@ for every order that makes a
// job, built here and sent by the order and Submit routes. It never depends on
// the customer's own email going out. This file only BUILDS the email (pure,
// tested); lib/amber-server.js sends it.
//
// Everything a customer typed (company, job name, description) is copied into
// the email as data only, on one line each, never as a header.

export const SALES_ALERT_TO = "sales@flexoafrica.com";
export const SALES_ALERT_FROM = "Flexo Africa Portal <amber@flexoafrica.com>";
export const MIS_URL = "https://jobs.flexoafrica.com";
export const AMBER_PRICE_EXCL_VAT = 499;

/** One line of text: no line breaks (they could fake extra lines or headers). */
export function oneLine(value, max = 160) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, max);
}

/** R5 000,00 style, the way the MIS writes rands. */
export function rands(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "R0,00";
  const [whole, cents] = Math.abs(n).toFixed(2).split(".");
  const spaced = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${n < 0 ? "-" : ""}R${spaced},${cents}`;
}

function customerLines({ company, name, email, phone }) {
  const lines = [`Customer: ${oneLine(company) || "(no company on the account)"}`];
  const who = [oneLine(name), oneLine(email), oneLine(phone)].filter(Boolean);
  if (who.length) lines.push(`Contact: ${who.join(", ")}`);
  return lines;
}

/**
 * A portal PLATE order. One FA job per plate line.
 *
 * @param {{order: object, jobs: Array<object>}} args
 *   order: orderNumber, customerCompany, customerName, customerEmail,
 *          customerPhone, paymentTerms ("po" | "prepaid"), poNumber,
 *          orderTotalIncVat, deliveryMethod, deliveryAddress, requiredByDate,
 *          tier, matchedCustomer
 *   jobs:  jobName, description, colours[], plateCount
 */
export function buildPlateOrderAlert({ order = {}, jobs = [] } = {}) {
  const company = oneLine(order.customerCompany) || "Portal customer";
  const numbers = jobs.map((j) => oneLine(j.jobName, 20)).filter(Boolean);
  const onAccount = order.paymentTerms === "po";

  const subject = oneLine(
    `New portal plate order ${oneLine(order.orderNumber, 30)}: ${company}` +
      (numbers.length ? ` (${numbers.join(", ")})` : ""),
    200,
  );

  const lines = [];
  lines.push(`A customer has just placed a plate order on the portal.`);
  lines.push("");
  lines.push(...customerLines({
    company: order.customerCompany,
    name: order.customerName,
    email: order.customerEmail,
    phone: order.customerPhone,
  }));
  lines.push(`Order: ${oneLine(order.orderNumber, 30)}`);
  lines.push(`Total: ${rands(order.orderTotalIncVat)} incl VAT`);
  if (onAccount) {
    lines.push(`Payment: on account, PO ${oneLine(order.poNumber, 60) || "(none given)"}`);
  } else {
    lines.push(
      "Payment: CARD, NOT PAID YET. The jobs are already on the MIS. " +
        "Check the order is paid before making plates.",
    );
  }
  lines.push(`Turnaround: ${order.tier === "express" ? "EXPRESS" : "Standard"}`);
  if (order.requiredByDate) lines.push(`Required by: ${oneLine(order.requiredByDate, 40)}`);
  lines.push(
    order.deliveryMethod === "collection"
      ? "Delivery: customer will collect"
      : `Delivery: ${oneLine(order.deliveryAddress, 200) || "(no address given)"}`,
  );
  if (order.matchedCustomer === false) {
    lines.push("");
    lines.push(
      "CHECK: this company is not on the customer list, so it was priced at " +
        "the public rate.",
    );
  }

  lines.push("");
  lines.push(jobs.length === 1 ? "The job:" : `The ${jobs.length} jobs:`);
  for (const j of jobs) {
    const colours = Array.isArray(j.colours) ? j.colours.map((c) => oneLine(c, 30)) : [];
    const plates = Number(j.plateCount) || colours.length;
    lines.push(
      `- ${oneLine(j.jobName, 20)}: ${oneLine(j.description, 160) || "(no description)"}, ` +
        `${plates} ${plates === 1 ? "plate" : "plates"}` +
        (colours.length ? ` (${colours.join(", ")})` : ""),
    );
  }

  lines.push("");
  lines.push(`Open the MIS: ${MIS_URL}`);
  return { to: SALES_ALERT_TO, subject, text: lines.join("\n") };
}

/**
 * An ARTWORK job made by the MIS after the customer pressed Submit on the
 * AMBER page.
 *
 * @param {object} job  jobNumber, jobName, company, customerName,
 *   customerEmail, dueSaid, firstFree, waitingOn[], fileCount, warnings[]
 */
export function buildArtworkJobAlert(job = {}) {
  const company = oneLine(job.company) || "Portal customer";
  const waitingOn = Array.isArray(job.waitingOn)
    ? job.waitingOn.map((w) => oneLine(w, 60)).filter(Boolean)
    : [];
  const waiting = waitingOn.length > 0;

  const subject = oneLine(
    `New AMBER artwork job ${oneLine(job.jobNumber, 20)}: ${company}` +
      (waiting ? " (waiting on us)" : ""),
    200,
  );

  const lines = [];
  lines.push("A customer has just sent an artwork job through the portal.");
  lines.push("");
  lines.push(...customerLines({
    company: job.company,
    name: job.customerName,
    email: job.customerEmail,
  }));
  lines.push(`Job: ${oneLine(job.jobNumber, 20)}, ${oneLine(job.jobName, 160) || "(no job name)"}`);
  lines.push(
    `Price: ${job.firstFree ? "FIRST JOB FREE" : `${rands(AMBER_PRICE_EXCL_VAT)} excl VAT`}`,
  );
  const files = Number(job.fileCount) || 0;
  lines.push(`Files: ${files} ${files === 1 ? "file" : "files"}, copied to the job's Supplied folder`);

  if (waiting) {
    lines.push("");
    lines.push(
      `WAITING ON US: the customer was not sure about ${waitingOn.join(", ")}. ` +
        "Fill these in on the workticket. The 24 hours starts once they are in, " +
        "and the customer has not been sent a due time yet.",
    );
  } else {
    lines.push(`Due: ${oneLine(job.dueSaid, 60) || "see the MIS"}`);
  }

  const warnings = Array.isArray(job.warnings)
    ? job.warnings.map((w) => oneLine(w, 200)).filter(Boolean)
    : [];
  if (warnings.length) {
    lines.push("");
    lines.push("The MIS said:");
    for (const w of warnings) lines.push(`- ${w}`);
  }

  lines.push("");
  lines.push(`Open the MIS: ${MIS_URL}`);
  return { to: SALES_ALERT_TO, subject, text: lines.join("\n") };
}
