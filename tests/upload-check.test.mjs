// Tests for the instant machine check's link to the tools engine (Cam's pick
// "C = both", 23 Nov 2026). The engine itself is the TOOLS thread's; these
// prove the portal's side:
//   - it stays OFF (the page shows nothing) until both settings are set;
//   - calls both ways are signed, and unsigned, wrongly signed, old or
//     tampered calls are refused;
//   - whatever the engine sends goes through the same report check as
//     AMBER's (a legal finding can never be above NOTE, never a half report).
//
// Every test here is mutation-tested by tests/mutate.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";

import {
  CALLBACK_URL,
  MAX_FILES_SENT,
  TOLERANCE_SECONDS,
  buildEngineRequest,
  engineSettings,
  pickCheckableFiles,
  readEngineAnswer,
  signBody,
  signedHeaders,
  verifySigned,
} from "../lib/upload-check-engine.mjs";
import { AUTO_HEADING, BY_AUTO } from "../lib/file-check.mjs";

const read = (p) => readFileSync(p, "utf8");
const KEY = "k".repeat(32);
const NOW = 1795450000;

function engineReport(extra = {}) {
  return {
    submissionId: "sub1",
    createdBy: "auto",
    printer: "Crown Bag",
    pressClass: "stack",
    limitsAreDefaults: true,
    findings: [
      { id: 1, stage: "2 Size", level: "STOP", what: "Your file is 310 x 300 mm and the job is 304.8 x 250 mm.",
        effect: "It will not fit the bag.", options: [{ key: "A", text: "AMBER refits it", recommended: true }, { key: "B", text: "You send a new file" }] },
      { id: 2, stage: "10 Legal copy", level: "STOP", what: "\"Nett\" is spelt the old way.", effect: "Shops may query it.", options: [] },
    ],
    tidyList: [],
    notChecked: ["Whether a fade ends in open space"],
    engineVersion: "1",
    tookMs: 900,
    ...extra,
  };
}

// ─── the switch ──────────────────────────────────────────────────────────────

test("OFF unless both the engine address and the key are set", () => {
  assert.equal(engineSettings({}).on, false);
  assert.equal(engineSettings({ UPLOAD_CHECK_URL: "https://tools.flexoafrica.com/api" }).on, false);
  assert.equal(engineSettings({ UPLOAD_CHECK_KEY: KEY }).on, false);
  assert.equal(engineSettings({ UPLOAD_CHECK_URL: "http://tools.flexoafrica.com", UPLOAD_CHECK_KEY: KEY }).on, false, "never over plain http");
  assert.equal(engineSettings({ UPLOAD_CHECK_URL: "https://t.x", UPLOAD_CHECK_KEY: "short" }).on, false, "a key that short is a mistake");
  const on = engineSettings({ UPLOAD_CHECK_URL: " https://tools.flexoafrica.com/api/// ", UPLOAD_CHECK_KEY: KEY });
  assert.equal(on.on, true);
  assert.equal(on.url, "https://tools.flexoafrica.com/api");
  assert.equal(engineSettings({}).key, "", "no key is handed out while off");
});

test("while OFF the start route answers off before touching anything", () => {
  const route = read("app/api/amber/upload-check/route.js");
  const body = route.split("export async function POST(request) {")[1];
  assert.match(body.slice(0, 160), /const settings = engineSettings\(process\.env\);\n {2}if \(!settings\.on\) return NextResponse\.json\(\{ off: true \}\);/);
  assert.match(read("app/api/amber/upload-check/callback/route.js"), /if \(!settings\.on\) return NextResponse\.json\(\{ error: "Not set up" \}, \{ status: 503 \}\);/);
});

test("the page shows nothing for it until there is something real", () => {
  const panel = read("components/FileCheckPanel.jsx");
  assert.match(panel, /if \(!data \|\| \(!data\.amber && !data\.auto && !data\.autoRunning\)\) return null;/);
  assert.equal(AUTO_HEADING, "First automatic check. AMBER's full check follows.");
  assert.match(panel, /\{auto && <p className="mt-2 text-sm font-semibold text-ink">\{AUTO_HEADING\}<\/p>\}/);
});

// ─── signing ─────────────────────────────────────────────────────────────────

test("the signature is HMAC-SHA256 of '<timestamp>.<raw body>'", () => {
  const body = '{"a":1}';
  const want = "v1=" + crypto.createHmac("sha256", KEY).update(`${NOW}.${body}`).digest("hex");
  assert.equal(signBody({ body, key: KEY, timestamp: NOW }), want);
  const h = signedHeaders({ body, key: KEY, nowSeconds: NOW });
  assert.equal(h["x-flexo-timestamp"], String(NOW));
  assert.equal(h["x-flexo-signature"], want);
  assert.equal(h["Content-Type"], "application/json");
});

test("a correctly signed call is accepted", () => {
  const body = JSON.stringify(engineReport());
  const headers = signedHeaders({ body, key: KEY, nowSeconds: NOW });
  assert.deepEqual(verifySigned({ body, headers, key: KEY, nowSeconds: NOW + 10 }), { valid: true, reason: null });
  const viaGet = { get: (n) => headers[n] };
  assert.equal(verifySigned({ body, headers: viaGet, key: KEY, nowSeconds: NOW }).valid, true);
});

test("unsigned, wrongly signed, tampered, old or keyless calls are refused", () => {
  const body = JSON.stringify(engineReport());
  const good = signedHeaders({ body, key: KEY, nowSeconds: NOW });
  assert.equal(verifySigned({ body, headers: {}, key: KEY, nowSeconds: NOW }).reason, "not signed");
  assert.equal(verifySigned({ body, headers: { "x-flexo-timestamp": String(NOW) }, key: KEY, nowSeconds: NOW }).reason, "not signed", "a time with no signature is unsigned");
  assert.equal(verifySigned({ body, headers: { "x-flexo-signature": good["x-flexo-signature"] }, key: KEY, nowSeconds: NOW }).reason, "not signed", "a signature with no time is unsigned");
  const otherKey = signedHeaders({ body, key: "z".repeat(32), nowSeconds: NOW });
  assert.equal(verifySigned({ body, headers: otherKey, key: KEY, nowSeconds: NOW }).reason, "signature does not match");
  assert.equal(verifySigned({ body: body.replace("STOP", "NOTE"), headers: good, key: KEY, nowSeconds: NOW }).valid, false, "a changed body fails");
  assert.equal(verifySigned({ body, headers: good, key: KEY, nowSeconds: NOW + TOLERANCE_SECONDS + 1 }).reason, "too old or too new");
  assert.equal(verifySigned({ body, headers: good, key: KEY, nowSeconds: NOW - TOLERANCE_SECONDS - 1 }).valid, false);
  assert.equal(verifySigned({ body, headers: good, key: KEY, nowSeconds: NOW + TOLERANCE_SECONDS }).valid, true, "5 minutes is still fine");
  assert.equal(verifySigned({ body, headers: { ...good, "x-flexo-timestamp": "soon" }, key: KEY, nowSeconds: NOW }).reason, "bad timestamp");
  assert.equal(verifySigned({ body, headers: good, key: "", nowSeconds: NOW }).reason, "not set up");
  assert.equal(TOLERANCE_SECONDS, 300);
});

test("the callback checks the signature on the raw body before reading it", () => {
  const route = read("app/api/amber/upload-check/callback/route.js");
  const sig = route.indexOf("const sig = verifySigned({ body: raw, headers: request.headers, key: settings.key });");
  assert.ok(sig > 0);
  assert.match(route, /if \(!sig\.valid\) return NextResponse\.json\(\{ error: "Unauthorized" \}, \{ status: 401 \}\);/);
  assert.ok(sig < route.indexOf("JSON.parse(raw)"), "nothing is read before the signature is checked");
  assert.match(route, /if \(!saved \|\| saved\.createdBy !== BY_AUTO \|\| saved\.status !== STATUS_DRAFT\) \{/, "it can only fill a check the portal started");
});

test("the portal signs what it sends the engine", () => {
  const route = read("app/api/amber/upload-check/route.js");
  assert.match(route, /headers: signedHeaders\(\{ body: payload, key: settings\.key \}\),\n\s+body: payload,/);
  assert.match(route, /assertMayAct\(profile\); \/\/ the customer's own page only; staff never start it/);
  assert.match(route, /if \(!submission \|\| !mayReadSubmission\(caller, submission\)\) \{/);
});

// ─── what is sent ────────────────────────────────────────────────────────────

test("only artwork files are sent, at most 5, fonts and zips left out", () => {
  const files = [
    { name: "front.PDF" }, { name: "font.otf" }, { name: "all.zip" }, { name: "back.ai" },
    { name: "a.tif" }, { name: "b.jpg" }, { name: "c.png" }, { name: "d.pdf" },
  ];
  const out = pickCheckableFiles(files);
  assert.deepEqual(out.map((f) => f.name), ["front.PDF", "back.ai", "a.tif", "b.jpg", "c.png"]);
  assert.equal(MAX_FILES_SENT, 5);
  assert.deepEqual(pickCheckableFiles(null), []);
});

test("the request follows THE CONTRACT and asks for a call back", () => {
  const r = buildEngineRequest({
    submissionId: "sub1", checkId: "chk1",
    files: [{ name: "a.pdf", bytes: 10, url: "https://signed/a" }, { name: "b.pdf", url: "https://signed/b" }],
    spec: { width: "300" }, notSure: ["printer"],
  });
  assert.equal(r.submissionId, "sub1");
  assert.equal(r.checkId, "chk1");
  assert.equal(r.fileUrl, "https://signed/a");
  assert.equal(r.files.length, 2);
  assert.equal(r.files[1].bytes, 0);
  assert.deepEqual(r.spec, { width: "300" });
  assert.deepEqual(r.notSure, ["printer"]);
  assert.equal(r.callbackUrl, CALLBACK_URL);
  assert.equal(CALLBACK_URL, "https://portal.flexoafrica.com/api/amber/upload-check/callback");
  const empty = buildEngineRequest({ submissionId: "s", checkId: "c" });
  assert.equal(empty.fileUrl, null);
  assert.deepEqual(empty.spec, {});
});

// ─── what comes back ─────────────────────────────────────────────────────────

test("a good engine report is accepted as automatic, with legal findings as NOTE", () => {
  const a = readEngineAnswer(200, engineReport(), { submissionId: "sub1" });
  assert.equal(a.outcome, "report");
  assert.equal(a.report.createdBy, BY_AUTO);
  assert.equal(a.report.findings.find((f) => /Nett/.test(f.what)).level, "NOTE");
});

test("still working (202) waits for the call back", () => {
  assert.deepEqual(readEngineAnswer(202, { ticket: "x" }), { outcome: "running" });
});

test("errors, a report for another upload, or a half report are never shown", () => {
  assert.equal(readEngineAnswer(500, { code: "timed out" }).outcome, "error");
  assert.match(readEngineAnswer(413, { code: "too big" }).message, /413 \(too big\)/);
  assert.equal(readEngineAnswer(200, null).outcome, "error");
  assert.match(readEngineAnswer(200, engineReport(), { submissionId: "other" }).message, /different upload/);
  const half = engineReport();
  half.findings[0].level = "MAYBE";
  assert.match(readEngineAnswer(200, half, { submissionId: "sub1" }).message, /engine report refused/);
  const leak = engineReport();
  leak.findings[0].effect = "see /srv/engine/tmp/file.pdf";
  assert.equal(readEngineAnswer(200, leak, { submissionId: "sub1" }).outcome, "error");
});

test("the instant check is started once per upload and never by staff", () => {
  const route = read("app/api/amber/upload-check/route.js");
  assert.match(route, /const existing = \(await listReports\(db, sid\)\)\.find\(\(r\) => r\.createdBy === BY_AUTO\);\n {2}if \(existing\) \{/);
  const panel = read("components/FileCheckPanel.jsx");
  assert.match(panel, /if \(!staff && !d\.auto && !d\.autoRunning && tries === 0 && d\.submissionId\) \{/);
});
