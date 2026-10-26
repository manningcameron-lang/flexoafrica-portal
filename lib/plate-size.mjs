// How big a plate is, for money AND for the job sheet.
//
// ⛔ THIS FILE IS THE ONLY PLACE A PLATE SIZE IS WORKED OUT.
//
// Why it exists: the price the customer paid was worked out from the ink area
// PLUS 4 cm of trim, while the job sheet that went to the MIS recorded the raw
// page size with no trim at all. A 20 x 30 cm job was charged as 24 x 34 cm
// (816 cm2) and written down as 600 cm2, a quarter small, on every single
// portal plate order. The MIS then ordered and costed plates off the small
// number. Same family of fault as the Gold A plate size found on 21 Sep 2026.
// Both sides now read their sizes from here. Cam 2026-10-26.
//
// Pure functions, no Next and no Firebase, so the tests can prove them.

// Plate trim allowance in centimetres, added to BOTH the width and the length.
// The customer gives the print size; we plate bigger and trim it down.
// Example: a 20 x 30 cm print is plated and billed as 24 x 34 cm = 816 cm2.
export const TRIM_CM = 4;

/**
 * The plate we actually buy and bill for, from an ink area.
 *
 * @param {number} widthCm  ink area width
 * @param {number} heightCm ink area height
 * @returns {{billedWidthCm:number, billedHeightCm:number, areaCm2:number}}
 */
export function billedPlateDimensions(widthCm, heightCm) {
  const w = positive(widthCm);
  const h = positive(heightCm);
  const billedWidthCm = w > 0 ? w + TRIM_CM : 0;
  const billedHeightCm = h > 0 ? h + TRIM_CM : 0;
  return {
    billedWidthCm: round2(billedWidthCm),
    billedHeightCm: round2(billedHeightCm),
    areaCm2: round2(billedWidthCm * billedHeightCm),
  };
}

/**
 * The ink area for ONE colour on a plate line.
 *
 * The file checker measures each colour separately, so the small yellow sun
 * does not get charged as a full page. When it has measured that colour we use
 * its figures; when it has not, we fall back to the whole page.
 *
 * Both the price and the job sheet call this, so they can never disagree.
 *
 * @param {object} lineItem  one plate line off the order form
 * @param {string} colourKey e.g. "cmyk:C" or "spot:Pantone 485 C"
 * @returns {{bboxWidthCm:number, bboxHeightCm:number}} ink area, NO trim yet
 */
export function inkAreaForColour(lineItem, colourKey) {
  const pageWidthCm = positive(lineItem?.widthCm);
  const pageHeightCm = positive(lineItem?.heightCm);
  const separations = lineItem?.pdfAnalysis?.separations || [];
  const measured = separations.find((s) => s?.key === colourKey);
  if (measured && positive(measured.bboxWidthCm) > 0 && positive(measured.bboxHeightCm) > 0) {
    return {
      bboxWidthCm: positive(measured.bboxWidthCm),
      bboxHeightCm: positive(measured.bboxHeightCm),
    };
  }
  return { bboxWidthCm: pageWidthCm, bboxHeightCm: pageHeightCm };
}

/**
 * The plate size for one colour, in MILLIMETRES, which is what the MIS plate
 * list is in. Ink area for that colour, plus the trim.
 */
export function billedPlateMm(lineItem, colourKey) {
  const ink = inkAreaForColour(lineItem, colourKey);
  const billed = billedPlateDimensions(ink.bboxWidthCm, ink.bboxHeightCm);
  return {
    widthMm: round2(billed.billedWidthCm * 10),
    lengthMm: round2(billed.billedHeightCm * 10),
    areaCm2: billed.areaCm2,
  };
}

function positive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
