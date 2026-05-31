/**
 * Client-side PDF analyzer (browser only).
 *
 * Runs pdfjs in the browser when the customer drops a PDF, before any upload
 * to Storage. Used by the order page to:
 *   - Auto-fill print width / print length from the PDF page dimensions
 *   - Surface basic warnings (multi-page, transparency, very large file)
 *
 * pdfjs is lazy-loaded so it only ships when a PDF is actually dropped.
 * Worker is hosted on a CDN to avoid bundling the worker file ourselves.
 */

// 1 PDF point = 1/72 inch = 0.3527777... mm
const POINTS_TO_MM = 25.4 / 72;

// pdfjs-dist version pinned to the CDN URL below. Bump both together.
const PDFJS_VERSION = "4.10.38";
const PDFJS_CDN_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.mjs`;
const PDFJS_WORKER_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`;

let pdfjsPromise = null;

async function loadPdfjs() {
  if (pdfjsPromise) return pdfjsPromise;
  // Use webpack-friendly dynamic import via the CDN URL.
  pdfjsPromise = (async () => {
    // eslint-disable-next-line no-new-func
    const mod = await import(/* webpackIgnore: true */ PDFJS_CDN_URL);
    mod.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
    return mod;
  })();
  return pdfjsPromise;
}

// Width in px we render the inline composite preview at. ~800px is a good
// balance between sharpness and the data-URL size we ship through React state.
const PREVIEW_WIDTH_PX = 800;

/**
 * Analyze a PDF File (from <input type="file">) and return basic info plus
 * an inline composite preview (page 1 rendered to a JPEG data URL).
 *
 * @param {File} file - the PDF file
 * @returns {Promise<{
 *   pageCount: number,
 *   widthMm: number,
 *   heightMm: number,
 *   widthCm: number,
 *   heightCm: number,
 *   fileSizeMb: number,
 *   hasMultiplePages: boolean,
 *   previewDataUrl: string|null,  // data:image/jpeg;base64,...
 *   warnings: Array<{ level: "info"|"warning"|"error", message: string }>,
 *   ok: boolean,
 *   error: string|null
 * }>}
 */
export async function analyzePdfClient(file) {
  if (!file) {
    return { ok: false, error: "No file provided", warnings: [] };
  }
  if (file.type && file.type !== "application/pdf") {
    return {
      ok: false,
      error: "Selected file is not a PDF",
      warnings: [],
    };
  }

  const fileSizeMb = file.size / (1024 * 1024);
  const warnings = [];

  // Very large files = warning. 50MB is the hard limit on the upload.
  if (fileSizeMb > 40) {
    warnings.push({
      level: "warning",
      message: `File is ${fileSizeMb.toFixed(1)} MB. Files over 50 MB cannot be uploaded.`,
    });
  }

  try {
    const buf = await file.arrayBuffer();
    const pdfjs = await loadPdfjs();

    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buf),
      disableFontFace: true,
      isEvalSupported: false,
      useSystemFonts: false,
    });
    const pdf = await loadingTask.promise;

    const pageCount = pdf.numPages;
    if (pageCount > 1) {
      warnings.push({
        level: "info",
        message: `PDF has ${pageCount} pages. We will plate page 1.`,
      });
    }

    // Read page 1 dimensions from the page's viewport at scale 1 (points).
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const widthMm = viewport.width * POINTS_TO_MM;
    const heightMm = viewport.height * POINTS_TO_MM;
    const widthCm = widthMm / 10;
    const heightCm = heightMm / 10;

    // Common gotchas:
    if (widthCm > 203 || heightCm > 127) {
      warnings.push({
        level: "warning",
        message: `Page is larger than our max plate size (203 x 127 cm). Confirm dimensions before plating.`,
      });
    }
    if (widthCm < 1 || heightCm < 1) {
      warnings.push({
        level: "warning",
        message: `Page is unusually small (${widthCm.toFixed(1)} x ${heightCm.toFixed(1)} cm). Double-check before proceeding.`,
      });
    }

    // Check for transparency / layers via the page's structural data. pdfjs
    // doesn't expose this directly without parsing operators, so we do a
    // best-effort scan of the operator list.
    let hasTransparency = false;
    let hasLayers = false;
    try {
      const opList = await page.getOperatorList();
      const fnNames = pdfjs.OPS;
      if (fnNames) {
        for (const op of opList.fnArray) {
          // setGState often signals transparency / blend modes
          if (op === fnNames.setGState) hasTransparency = true;
          // beginMarkedContentProps used for OCG (optional content groups = layers)
          if (op === fnNames.beginMarkedContentProps) hasLayers = true;
        }
      }
    } catch (_) {
      // best-effort, ignore failures
    }

    if (hasTransparency) {
      warnings.push({
        level: "info",
        message: "PDF contains transparency. We will flatten before plating.",
      });
    }
    if (hasLayers) {
      warnings.push({
        level: "info",
        message: "PDF contains layers. We will flatten before plating.",
      });
    }

    // Render page 1 to a canvas for inline preview. Best-effort — if it
    // fails we still return the other metadata.
    let previewDataUrl = null;
    let separations = [];
    try {
      const scale = PREVIEW_WIDTH_PX / viewport.width;
      const previewViewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(previewViewport.width);
      canvas.height = Math.floor(previewViewport.height);
      const ctx = canvas.getContext("2d");
      // White background — most flexo artwork sits on white substrate.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({
        canvasContext: ctx,
        viewport: previewViewport,
      }).promise;
      previewDataUrl = canvas.toDataURL("image/jpeg", 0.85);

      // Build CMYK separation previews from the RGB composite.
      // These are mathematical approximations — they show roughly where each
      // ink is laid down. True pre-press separations require server tooling.
      separations = buildCmykSeparations(ctx, canvas.width, canvas.height);
    } catch (renderErr) {
      // Note in warnings but don't fail the whole analysis.
      warnings.push({
        level: "info",
        message:
          "Could not render preview in browser. We'll generate one after upload.",
      });
    }

    // Detect named spot colours (Pantones, Die, etc.) from the PDF operator
    // list. These are added to the separations list without thumbnails — the
    // customer can still tick them as plates they need.
    let spotNames = [];
    try {
      spotNames = await detectSpotColorNames(page, pdfjs);
    } catch (_) {
      // best-effort
    }
    for (const name of spotNames) {
      separations.push({
        key: "spot:" + name,
        label: name,
        kind: "spot",
        previewDataUrl: null,
      });
    }

    await pdf.destroy();

    const result = {
      ok: true,
      error: null,
      pageCount,
      widthMm: round2(widthMm),
      heightMm: round2(heightMm),
      widthCm: round1(widthCm),
      heightCm: round1(heightCm),
      fileSizeMb: round2(fileSizeMb),
      hasMultiplePages: pageCount > 1,
      hasTransparency,
      hasLayers,
      previewDataUrl,
      separations,
      precise: false,
      warnings,
    };

    // ────────────────────────────────────────────────────────────────────────
    // Optional precise per-colour analysis via the Cloud Run ink analyser.
    // When NEXT_PUBLIC_INK_ANALYSER_URL is set, POST the PDF and replace the
    // CMYK math approximations with real per-separation bounding boxes from
    // Ghostscript's `tiffsep`. Failure is silent — we keep the client-side
    // approximations and add a note to warnings.
    // ────────────────────────────────────────────────────────────────────────
    const analyserUrl =
      (typeof process !== "undefined" &&
        process.env?.NEXT_PUBLIC_INK_ANALYSER_URL) ||
      null;
    if (analyserUrl) {
      try {
        const ink = await callInkAnalyser(file, analyserUrl);
        if (ink && Array.isArray(ink.separations) && ink.separations.length) {
          result.separations = mergeInkSeparations(separations, ink);
          result.precise = true;
          // Prefer the analyser's page dims if it returned them.
          if (ink.page_width_mm) {
            result.widthMm = round2(ink.page_width_mm);
            result.widthCm = round1(ink.page_width_mm / 10);
          }
          if (ink.page_height_mm) {
            result.heightMm = round2(ink.page_height_mm);
            result.heightCm = round1(ink.page_height_mm / 10);
          }
        }
      } catch (err) {
        // Keep the approximations and let the user proceed.
        result.warnings.push({
          level: "info",
          message:
            "Per-colour analyser unavailable — using approximate sizes. We will measure precisely on our side.",
        });
      }
    }

    return result;
  } catch (err) {
    return {
      ok: false,
      error: err?.message || "Could not analyse PDF",
      warnings,
    };
  }
}

// ─── Cloud Run ink analyser caller ────────────────────────────────────────
// POSTs the PDF to the Ghostscript-backed service and returns its JSON.
// Times out after 45 seconds so a stalled service doesn't hang the form.

const STRUCTURAL_CHANNELS = new Set([
  "grid", "dieline", "die line", "workmap", "work map", "clear", "clear area",
  "cut", "die cut", "die-cut", "diecut", "die", "kiss cut", "kiss-cut",
  "crease", "fold", "bleed", "registration", "varnish guide",
  "emboss", "braille", "perf", "perforation", "score",
  "free cut", "freecut", "free-cut",
  "brown substrate", "brown paper", "substrate",
  "cutback", "cut back", "cut-back",
]);

async function callInkAnalyser(file, baseUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const fd = new FormData();
    fd.append("file", file);
    const resp = await fetch(`${baseUrl.replace(/\/$/, "")}/analyse`, {
      method: "POST",
      body: fd,
      signal: controller.signal,
    });
    if (!resp.ok) {
      throw new Error(`Analyser HTTP ${resp.status}`);
    }
    const data = await resp.json();
    if (data?.type !== "esko_ink_coverage") {
      throw new Error("Unexpected analyser response");
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// Replace the math separations from buildCmykSeparations with the real
// per-colour bounding boxes from the analyser. Keep the math previews as
// visual aids when the analyser doesn't have a matching tile.
function mergeInkSeparations(mathSeparations, ink) {
  const out = [];
  for (let i = 0; i < ink.separations.length; i++) {
    const s = ink.separations[i];
    const name = String(s.name || `Sep ${i + 1}`);
    const lower = name.toLowerCase();
    if (STRUCTURAL_CHANNELS.has(lower)) continue;

    const bboxWidthMm = Number(s.bbox_width_mm ?? 0);
    const bboxHeightMm = Number(s.bbox_height_mm ?? 0);
    if (bboxWidthMm <= 0 || bboxHeightMm <= 0) continue;

    // Try to find a matching math thumbnail (Cyan / Magenta / Yellow / Black).
    const mathMatch = mathSeparations.find(
      (m) => m.label?.toLowerCase() === lower,
    );
    const isProcess = ["cyan", "magenta", "yellow", "black"].includes(lower);

    out.push({
      key: (isProcess ? "process:" : "spot:") + name,
      label: name,
      kind: isProcess ? "process" : "spot",
      bboxWidthMm: round2(bboxWidthMm),
      bboxHeightMm: round2(bboxHeightMm),
      bboxWidthCm: round1(bboxWidthMm / 10),
      bboxHeightCm: round1(bboxHeightMm / 10),
      coveragePct:
        typeof s.coverage_pct === "number" ? round2(s.coverage_pct) : null,
      previewDataUrl: mathMatch?.previewDataUrl || null,
    });
  }
  return out;
}

// ─── CMYK separation rendering ─────────────────────────────────────────────
// Build 4 small canvases — Cyan / Magenta / Yellow / Black — by inverting the
// RGB composite into approximate CMYK channels. This is a visual aid only;
// real pre-press separations need Ghostscript or a commercial RIP.

const CMYK_CHANNELS = [
  { key: "C", label: "Cyan", ink: [0, 174, 239] },     // C 100%
  { key: "M", label: "Magenta", ink: [236, 0, 140] },  // M 100%
  { key: "Y", label: "Yellow", ink: [255, 242, 0] },   // Y 100%
  { key: "K", label: "Black", ink: [0, 0, 0] },        // K 100%
];

function buildCmykSeparations(srcCtx, width, height) {
  // Sample the composite into image data once.
  const src = srcCtx.getImageData(0, 0, width, height);
  const pixels = src.data;
  const out = [];

  // Generate separations at half the composite resolution to keep
  // data-URL sizes manageable in React state.
  const sepW = Math.max(200, Math.floor(width / 2));
  const sepH = Math.max(100, Math.floor(height * (sepW / width)));

  for (const ch of CMYK_CHANNELS) {
    const canvas = document.createElement("canvas");
    canvas.width = sepW;
    canvas.height = sepH;
    const ctx = canvas.getContext("2d");
    const imgData = ctx.createImageData(sepW, sepH);
    const dst = imgData.data;

    // Walk every output pixel, sample the nearest source pixel, extract the
    // matching channel from C/M/Y/K math.
    for (let y = 0; y < sepH; y++) {
      const srcY = Math.floor((y / sepH) * height);
      for (let x = 0; x < sepW; x++) {
        const srcX = Math.floor((x / sepW) * width);
        const i = (srcY * width + srcX) * 4;
        const r = pixels[i] / 255;
        const g = pixels[i + 1] / 255;
        const b = pixels[i + 2] / 255;

        const k = 1 - Math.max(r, g, b);
        let c = 0, m = 0, yCh = 0;
        if (k < 1) {
          c = (1 - r - k) / (1 - k);
          m = (1 - g - k) / (1 - k);
          yCh = (1 - b - k) / (1 - k);
        }
        const intensity =
          ch.key === "C" ? c :
          ch.key === "M" ? m :
          ch.key === "Y" ? yCh :
          k;

        // Render on white: tint the ink at the channel's intensity.
        const t = Math.min(1, Math.max(0, intensity));
        const di = (y * sepW + x) * 4;
        dst[di]     = Math.round(255 - t * (255 - ch.ink[0]));
        dst[di + 1] = Math.round(255 - t * (255 - ch.ink[1]));
        dst[di + 2] = Math.round(255 - t * (255 - ch.ink[2]));
        dst[di + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    out.push({
      key: "cmyk:" + ch.key,
      label: ch.label,
      kind: "process",
      previewDataUrl: canvas.toDataURL("image/jpeg", 0.8),
    });
  }
  return out;
}

// ─── Spot colour name detection ────────────────────────────────────────────
// Walk the page's operator list looking for named colour spaces (Pantones,
// Die layers, etc.). Returns the list of unique names found. Best-effort —
// pdfjs doesn't expose colour space dictionaries through its public API,
// so the names are read from setFillColorSpace / setStrokeColorSpace args.

async function detectSpotColorNames(page, pdfjs) {
  const opList = await page.getOperatorList();
  const OPS = pdfjs.OPS;
  const names = new Set();

  if (!OPS) return [];

  const csOps = new Set([
    OPS.setFillColorSpace,
    OPS.setStrokeColorSpace,
  ]);

  for (let i = 0; i < opList.fnArray.length; i++) {
    const op = opList.fnArray[i];
    if (!csOps.has(op)) continue;
    const args = opList.argsArray[i] || [];
    // args[0] is usually a colour space reference (string or array).
    for (const a of args) {
      if (typeof a === "string" && looksLikeSpotName(a)) {
        names.add(a);
      } else if (Array.isArray(a)) {
        // DeviceN / Separation are encoded as arrays. Scan for strings.
        for (const inner of a) {
          if (typeof inner === "string" && looksLikeSpotName(inner)) {
            names.add(inner);
          }
        }
      }
    }
  }

  return Array.from(names);
}

function looksLikeSpotName(s) {
  if (!s || s.length < 3) return false;
  const upper = s.toUpperCase();
  // Skip standard PDF colour space names.
  if (
    upper === "DEVICERGB" ||
    upper === "DEVICECMYK" ||
    upper === "DEVICEGRAY" ||
    upper === "PATTERN" ||
    upper === "INDEXED" ||
    upper === "ICCBASED" ||
    upper === "CALRGB" ||
    upper === "CALGRAY" ||
    upper === "LAB" ||
    upper === "SEPARATION" ||
    upper === "DEVICEN"
  ) {
    return false;
  }
  // Heuristic: a spot name usually contains letters and may have a number.
  return /[A-Za-z]/.test(s);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
