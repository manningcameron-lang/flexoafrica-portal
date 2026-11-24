// The flavours on one job, ready to show (Cam, 24 Nov 2026 evening: "Yes,
// show them" and "Flavours on staff screen").
//
// One artwork can be ordered in several flavours: same design, each flavour
// with its own name, inks and barcode. The job system keeps them on the job as
// `variants` [{id, name, colours, barcode}], the customer's upload keeps them
// on its spec the same way, and the customer door sends {name, colours,
// barcode}. This reads any of the three and gives back a clean list, or []
// for a normal one-flavour job, so a page shows nothing new on most jobs.
//
// Pure: no Firebase, no browser. Tested in tests/job-flavours.test.mjs.

export const MAX_SHOWN = 10;
export const MAX_NAME = 60;
export const MAX_INKS = 10;
export const MAX_BARCODE = 40;

function text(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

/** Clean flavours from a job's or a spec's `variants`; [] unless 2 or more have a name. */
export function flavourList(variants) {
  const list = Array.isArray(variants) ? variants : [];
  // Anything that is not a flavour has no name, so it drops out below.
  const out = list
    .map((v) => ({
      name: text(v?.name, MAX_NAME),
      colours: (Array.isArray(v?.colours) ? v.colours : [])
        .map((c) => text(c, MAX_NAME))
        .filter(Boolean)
        .slice(0, MAX_INKS),
      barcode: text(v?.barcode, MAX_BARCODE),
    }))
    .filter((v) => v.name)
    .slice(0, MAX_SHOWN);
  return out.length >= 2 ? out : [];
}

/** "Black, PANTONE 469 U" or "No inks given". */
export function inksLine(flavour) {
  return flavour.colours.length > 0 ? flavour.colours.join(", ") : "No inks given";
}
