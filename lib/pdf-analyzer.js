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
    // fails we still return the other metadata. JPEG keeps the data URL
    // small enough to store in React state without bloating renders.
    let previewDataUrl = null;
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
    } catch (renderErr) {
      // Note in warnings but don't fail the whole analysis.
      warnings.push({
        level: "info",
        message:
          "Could not render preview in browser. We'll generate one after upload.",
      });
    }

    await pdf.destroy();

    return {
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
      warnings,
    };
  } catch (err) {
    return {
      ok: false,
      error: err?.message || "Could not analyse PDF",
      warnings,
    };
  }
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
