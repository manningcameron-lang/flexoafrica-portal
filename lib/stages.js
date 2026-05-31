// Single source of truth for the 8-stage flexographic workflow.
// Mirrors the MIS stage IDs in lib/constants.js (jobs.flexoafrica.com).

export const STAGES = [
  {
    id: "artwork",
    label: "Artwork / Repro",
    customerLabel: "We're preparing your artwork",
    short: "Artwork",
    description: "Our team is preparing your artwork.",
    icon: "pencil",
    color: "logoYellow",
  },
  {
    id: "pdf_sent",
    label: "PDF Sent",
    customerLabel: "Awaiting your approval",
    short: "Awaiting Approval",
    description: "We've sent a proof. Please review and approve or reject.",
    icon: "mail",
    color: "logoOrange",
    customerAction: true, // customer can take action at this stage
  },
  {
    id: "fa_po",
    label: "Flexo Africa PO",
    customerLabel: "Approved, ordering plates",
    short: "Ordering",
    description: "Your approval is in. We're issuing the plate order.",
    icon: "doc",
    color: "logoBlue",
  },
  {
    id: "for_checking",
    label: "For Checking",
    customerLabel: "Quality check in progress",
    short: "QC",
    description: "Plates are with us for the QC checklist.",
    icon: "shield",
    color: "logoTeal",
  },
  {
    id: "plates",
    label: "Plates",
    customerLabel: "Plates at supplier",
    short: "Plate-making",
    description: "Plates are being made at our supplier.",
    icon: "layers",
    color: "logoTeal",
  },
  {
    id: "shipping",
    label: "Shipping",
    customerLabel: "Plates in transit",
    short: "Shipping",
    description: "Plates have left the supplier and are on their way.",
    icon: "truck",
    color: "logoBlue",
  },
  {
    id: "invoicing",
    label: "Invoicing",
    customerLabel: "Invoice issued",
    short: "Invoicing",
    description: "Job complete. Invoice has been issued.",
    icon: "receipt",
    color: "logoGreen",
  },
  {
    id: "complete",
    label: "Complete",
    customerLabel: "Complete",
    short: "Complete",
    description: "Paid and closed.",
    icon: "check",
    color: "logoGreen",
  },
];

export const STAGE_INDEX = Object.fromEntries(
  STAGES.map((s, i) => [s.id, i])
);

export function getStage(id) {
  return STAGES.find((s) => s.id === id) || null;
}

export function isComplete(stageId) {
  return stageId === "complete";
}

export function isAwaitingApproval(stageId) {
  return stageId === "pdf_sent";
}

export function isInProduction(stageId) {
  // Anything between artwork and shipping (inclusive) is "in production" for
  // customers. Shipping was inserted between plates (4) and invoicing so the
  // upper bound is now 5.
  const i = STAGE_INDEX[stageId];
  return i !== undefined && i >= 0 && i <= 5;
}

// Stage color classes — tailwind class strings for chips / badges.
export const STAGE_CHIP = {
  artwork: "bg-logoYellow/20 text-yellow-700 border-logoYellow/30",
  pdf_sent: "bg-logoOrange/20 text-logoOrange border-logoOrange/30",
  fa_po: "bg-logoBlue/20 text-logoBlue border-logoBlue/30",
  for_checking: "bg-logoTeal/20 text-logoTeal border-logoTeal/30",
  plates: "bg-logoTeal/20 text-logoTeal border-logoTeal/30",
  shipping: "bg-logoBlue/20 text-logoBlue border-logoBlue/30",
  invoicing: "bg-logoGreen/20 text-logoGreen border-logoGreen/30",
  complete: "bg-logoGreen/20 text-logoGreen border-logoGreen/30",
};
