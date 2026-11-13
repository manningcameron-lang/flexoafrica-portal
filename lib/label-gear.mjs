// Label cylinder and gap maths, for the Order Artwork (AMBER) form.
//
// WHAT WAS WRONG (Cam, 13 Nov 2026): on a Label the customer had to type the
// cylinder AND the gear AND the teeth AND both gaps, each by hand. Nothing
// checked that they agreed, so a customer could send 93 teeth CP with a
// cylinder of 300 and a gap round of 0, and the job system would get three
// figures that cannot all be true.
//
// WHAT IT DOES NOW: the customer picks the press gear (CP or DP) and types the
// tooth size (the number of teeth). The cylinder fills itself in, exactly the
// way the job system works it out:
//
//   CP  = 1/8 inch, 3.175 mm a tooth.    93 teeth  = 295.275 mm
//   DP  = 32 DP,    2.494 mm a tooth.   112 teeth  = 279.288 mm
//
// and the gap round fills itself in once the pitch and the number round are
// there:  gap round = cylinder / number round - pitch
//         (1 round on 295.275 mm with a 282 mm label = 13.275 mm)
// The gap across follows the house rule: 0 for 1 across, 3 mm for more.
//
// ⚠ COPIED WORD FOR WORD from the job system (jobs.flexoafrica.com,
// lib/labelGear.js, origin/main 70c3f01, 13 Nov 2026), from
// DP_DIAMETRAL_PITCH down. Both sites must give the same cylinder and gaps for
// the same teeth, so change it there first and copy it here again.
//
// Pure functions, no imports, so the tests can load this file on its own.

export const DP_DIAMETRAL_PITCH = 32;
export const CP_MM_PER_TOOTH = 3.175; // 1/8 inch
export const DP_MM_PER_TOOTH = (Math.PI * 25.4) / DP_DIAMETRAL_PITCH; // 2.49364 mm

/** The gear choices, in the order the dropdown shows them. */
export const GEAR_PITCH_OPTIONS = [
  { value: "CP", label: "CP (1/8 inch, 3.175 mm per tooth)", mmPerTooth: CP_MM_PER_TOOTH },
  { value: "DP", label: "DP (32 DP, 2.494 mm per tooth)", mmPerTooth: DP_MM_PER_TOOTH },
];

/** House gap across when a label runs more than one across. */
export const HOUSE_GAP_ACROSS_MM = 3;

/** A gap round the cylinder below this is almost always a typing mistake. */
export const SMALL_GAP_AROUND_MM = 0.5;

/** Smallest gap used when suggesting how many labels fit round. */
export const SUGGEST_MIN_GAP_MM = 2;

/** The fields this module reads and writes. Carried with the print spec. */
export const LABEL_GEAR_FIELDS = ["gearPitch", "cylinderTeeth"];

/** mm per tooth for "CP" or "DP", null for anything else. */
export function mmPerTooth(gear) {
  const g = String(gear || "").trim().toUpperCase();
  if (g === "CP") return CP_MM_PER_TOOTH;
  if (g === "DP") return DP_MM_PER_TOOTH;
  return null;
}

/**
 * Read a millimetre figure the way people type it: "381", "330.20",
 * "355,60", "600mm", "112t (279.30)". Takes the LARGEST number in the text,
 * so a tooth count written beside the repeat never wins over the repeat.
 * Returns null for blank or rubbish.
 */
export function parseMm(v) {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/(\d),(\d)/g, "$1.$2");
  const nums = s.match(/\d+(?:\.\d+)?/g);
  if (!nums) return null;
  const vals = nums.map(Number).filter((n) => Number.isFinite(n));
  if (!vals.length) return null;
  return Math.max(...vals);
}

/** Whole positive tooth count, or null. "93", 93, "93T", " 93 " all read 93. */
export function parseTeeth(v) {
  if (v == null || v === "") return null;
  if (/^\s*-/.test(String(v))) return null; // minus teeth
  const m = String(v).match(/\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  if (!Number.isFinite(n) || n <= 0 || Math.floor(n) !== n) return null;
  if (n > 1000) return null; // no label press has a thousand teeth
  return n;
}

/** A whole positive count (across / around), default 1 when blank. */
function parseCount(v) {
  const n = Number(String(v ?? "").trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

/** Round to 3 decimals and drop trailing zeros: 295.275, 13.275, 381, 1.85. */
export function formatMm(n) {
  if (n == null || !Number.isFinite(n)) return "";
  const r = Math.round(n * 1000) / 1000;
  const z = Object.is(r, -0) ? 0 : r;
  return String(Number(z.toFixed(3)));
}

/** Cylinder repeat in mm from the gear and the tooth count, or null. */
export function repeatFromTeeth(gear, teeth) {
  const per = mmPerTooth(gear);
  const t = parseTeeth(teeth);
  if (per == null || t == null) return null;
  return Math.round(per * t * 1000) / 1000;
}

/**
 * Which gear and tooth count a typed cylinder matches exactly, if any, so an
 * older job showing 381 can say "120T CP". CP is checked first because it is
 * the common press. Allows 0.05 mm for people rounding 279.288 to 279.30.
 */
export function teethFromRepeat(cylinder) {
  const r = parseMm(cylinder);
  if (r == null || r <= 0) return null;
  for (const { value, mmPerTooth: per } of GEAR_PITCH_OPTIONS) {
    const t = Math.round(r / per);
    if (t > 0 && Math.abs(t * per - r) <= 0.05) return { gearPitch: value, teeth: t };
  }
  return null;
}

/**
 * The cylinder as a person reads it: "295.275 mm (93T CP)". Labels only: a
 * bag, box or sleeve always shows the cylinder exactly as typed, even if it
 * still carries teeth from when it was set up as a Label.
 */
export function cylinderDisplay(src) {
  const cyl = String(src?.cylinder ?? "").trim();
  if (String(src?.bagType || "") !== "Label") return cyl;
  const t = parseTeeth(src?.cylinderTeeth);
  const g = String(src?.gearPitch || "").trim().toUpperCase();
  if (t != null && mmPerTooth(g) != null) {
    const r = repeatFromTeeth(g, t);
    return `${formatMm(r)} mm (${t}T ${g})`;
  }
  return cyl;
}

/**
 * Work out the gap around and say whether it makes sense.
 *   { gap, repeat, pitch, around, status, message }
 * status: "ok", "small" (under 0.5 mm, usually a typing mistake),
 *         "nofit" (the labels are longer than the cylinder),
 *         "incomplete" (cylinder, pitch or around missing).
 */
export function gapAroundCheck(src) {
  const repeat = parseMm(src?.cylinder);
  const pitch = parseMm(src?.pitchMm);
  const around = parseCount(src?.around) ?? (String(src?.around ?? "").trim() === "" ? 1 : null);
  if (repeat == null || repeat <= 0 || pitch == null || pitch <= 0 || around == null) {
    return { gap: null, repeat, pitch, around, status: "incomplete", message: "" };
  }
  const raw = repeat / around - pitch;
  const gap = Math.round(raw * 1000) / 1000;
  if (gap < 0) {
    const need = around * pitch;
    return {
      gap, repeat, pitch, around, status: "nofit",
      message: `${around} x ${formatMm(pitch)} mm needs ${formatMm(need)} mm, but the cylinder is only ${formatMm(repeat)} mm round. Check the pitch, the number around or the teeth.`,
    };
  }
  if (gap < SMALL_GAP_AROUND_MM) {
    const sameAsCyl = around === 1 && Math.abs(pitch - repeat) < 0.5;
    return {
      gap, repeat, pitch, around, status: "small",
      message: sameAsCyl
        ? `The pitch is the same as the cylinder, so there is no gap. The pitch must be the label height, not the cylinder.`
        : `Only ${formatMm(gap)} mm between labels round the cylinder. Check the pitch and the number around.`,
    };
  }
  return { gap, repeat, pitch, around, status: "ok", message: "" };
}

/** How many labels fit round with at least a 2 mm gap, or null. */
export function maxAround(src, minGap = SUGGEST_MIN_GAP_MM) {
  const repeat = parseMm(src?.cylinder);
  const pitch = parseMm(src?.pitchMm);
  if (repeat == null || repeat <= 0 || pitch == null || pitch <= 0) return null;
  const n = Math.floor(repeat / (pitch + minGap));
  return n >= 1 ? n : 0;
}

/** Gap across for a number across, keeping a gap someone set on purpose. */
export function gapAcrossFor(across, currentGap) {
  const a = parseCount(across) ?? 1;
  if (a <= 1) return "0";
  const cur = parseMm(currentGap);
  if (cur == null || cur === 0) return String(HOUSE_GAP_ACROSS_MM);
  return String(currentGap).trim();
}

/** True when the stored gap around disagrees with the worked-out one. */
export function gapAroundDisagrees(src) {
  const chk = gapAroundCheck(src);
  if (chk.gap == null || chk.status === "nofit") return false;
  const stored = parseMm(src?.gapAroundMm);
  if (stored == null) return true;
  return Math.abs(stored - chk.gap) > 0.01;
}

const AROUND_INPUTS = ["gearPitch", "cylinderTeeth", "cylinder", "pitchMm", "around", "bagType"];

/**
 * The extra fields to save when a label layout field changes.
 *
 *   state   = the job or quote AFTER the change (old values spread with the change)
 *   changed = the field names that were just changed
 *
 * Returns only the DERIVED fields (cylinder, gapAroundMm, gapAcrossMm), never
 * the changed fields themselves. Returns {} for anything that is not a Label,
 * so bags, boxes and sleeves are never touched.
 *
 *  - Teeth + gear both valid -> cylinder is set from them.
 *  - Teeth cleared or gear cleared -> the cylinder is left as it was, so it
 *    can be typed by hand again.
 *  - Any input to the gap around changes -> gap around is worked out. If the
 *    labels do not fit, the gap is CLEARED rather than left at a stale figure,
 *    so the Artwork tab blocks the job until it is fixed.
 *  - Across changes (or the job becomes a Label) -> gap across follows the
 *    house rule, keeping a non-zero gap someone set on purpose.
 */
export function labelLayoutPatch(state, changed) {
  const s = state || {};
  if (String(s.bagType || "") !== "Label") return {};
  const ch = new Set(Array.isArray(changed) ? changed : [changed]);
  const out = {};

  let cylinder = s.cylinder;
  if (ch.has("gearPitch") || ch.has("cylinderTeeth") || ch.has("bagType")) {
    const r = repeatFromTeeth(s.gearPitch, s.cylinderTeeth);
    if (r != null) {
      const txt = formatMm(r);
      if (String(s.cylinder ?? "") !== txt) out.cylinder = txt;
      cylinder = txt;
    }
  }

  if (AROUND_INPUTS.some((k) => ch.has(k))) {
    const chk = gapAroundCheck({ ...s, cylinder });
    if (chk.status === "nofit") {
      if (String(s.gapAroundMm ?? "") !== "") out.gapAroundMm = "";
    } else if (chk.gap != null) {
      const txt = formatMm(chk.gap);
      if (String(s.gapAroundMm ?? "") !== txt) out.gapAroundMm = txt;
    }
  }

  if (ch.has("across") || ch.has("bagType")) {
    const want = gapAcrossFor(s.across, s.gapAcrossMm);
    if (String(s.gapAcrossMm ?? "") !== want) out.gapAcrossMm = want;
  }

  return out;
}

// ─── Portal only, below this line (not in the job system) ──────────────────

/**
 * What goes on the AMBER job sheet at Submit: the cylinder and the gap round
 * worked out once more from the gear, tooth size, pitch and number round, so an
 * older job sheet or "Same as last time" can never send figures that disagree.
 * The gap across is left as typed. Anything that is not a Label is returned
 * unchanged.
 */
export function settleLabelLayout(spec) {
  const s = spec || {};
  return { ...s, ...labelLayoutPatch(s, ["gearPitch", "cylinderTeeth", "pitchMm", "around"]) };
}
