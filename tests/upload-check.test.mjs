// Tests for the instant machine check's link to the tools engine, as the
// tools thread built it (claude/tools-upload-check-live-2026-11-23-for-portal.md).
// They prove the portal's side:
//   - it stays OFF (the page shows nothing) until the signing key is set;
//   - every call is signed the way the engine checks it (ECDSA P-256, the
//     time, the upload and a fingerprint of the exact body), proved here
//     against a throwaway key pair, and a changed body no longer verifies;
//   - the file link is only ever a Firebase Storage https link;
//   - whatever the engine sends goes through the same report check as
//     AMBER's (a legal finding can never be above NOTE, never a half report);
//   - its pictures are shown only as small JPEGs.
//
// Every test here is mutation-tested by tests/mutate.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import {
  ENGINE_URL,
  RUNNING_FOR_MS,
  buildPollCall,
  buildStartCall,
  isAllowedFileUrl,
  loadSigningKey,
  pickCheckableFile,
  readEngineAnswer,
  sha256Hex,
  signHeaders,
} from "../lib/upload-check-engine.mjs";
import {
  AUTO_HEADING,
  BY_AUTO,
  MAX_PICTURES,
  STATUS_SENT,
  checkReport,
  customerView,
  safePicture,
} from "../lib/file-check.mjs";

const read = (p) => readFileSync(p, "utf8");
const NOW = 1795450000;

// A throwaway key pair, made the way the real one was (P-256, private key as
// base64 PKCS#8 DER). The tools site keeps only the public half.
const pair = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const PRIVATE_B64 = pair.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
const KEY = loadSigningKey({ PORTAL_TOOLS_SIGNING_KEY: PRIVATE_B64 });
const verifies = (text, headers) =>
  crypto.verify("sha256", Buffer.from(`${headers["x-portal-time"]}.${text}`), pair.publicKey, Buffer.from(headers["x-portal-signature"], "base64"));

const PIC = "data:image/jpeg;base64," + "A".repeat(2000);

function engineReport(extra = {}) {
  return {
    submissionId: "sub1",
    createdBy: "auto",
    printer: "Crown Bag",
    pressClass: "stack",
    limitsAreDefaults: true,
    printerKnown: false,
    findings: [
      { id: 1, fault: 11, stage: "2 Size", level: "STOP", what: "Your file is 310 x 300 mm and the job is 304.8 x 250 mm.",
        effect: "It will not fit the bag.", picture: PIC,
        options: [{ key: "A", text: "AMBER refits it", recommended: true }, { key: "B", text: "You send a new file" }] },
      { id: 2, stage: "10 Legal copy", level: "STOP", what: "\"Nett\" is spelt the old way.", effect: "Shops may query it.", options: [] },
    ],
    tidyList: [],
    notChecked: ["Whether a fade ends in open space"],
    ...extra,
  };
}

// ─── the switch ──────────────────────────────────────────────────────────────

test("OFF unless a real private signing key is set", () => {
  assert.equal(loadSigningKey({}), null);
  assert.equal(loadSigningKey({ PORTAL_TOOLS_SIGNING_KEY: "   " }), null);
  assert.equal(loadSigningKey({ PORTAL_TOOLS_SIGNING_KEY: "not a key" }), null);
  const rsa = crypto.generateKeyPairSync("rsa", { modulusLength: 1024 });
  assert.equal(loadSigningKey({ PORTAL_TOOLS_SIGNING_KEY: rsa.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64") }), null, "only the P-256 kind the engine checks");
  assert.notEqual(KEY, null);
  assert.equal(KEY.asymmetricKeyType, "ec");
});

test("while OFF the route answers off before touching anything", () => {
  const route = read("app/api/amber/upload-check/route.js");
  const body = route.split("export async function POST(request) {")[1];
  assert.match(body.slice(0, 140), /const key = loadSigningKey\(process\.env\);\n {2}if \(!key\) return NextResponse\.json\(\{ off: true \}\);/);
});

test("the page shows nothing for it until there is something real", () => {
  const panel = read("components/FileCheckPanel.jsx");
  assert.match(panel, /if \(!data \|\| \(!data\.amber && !data\.auto && !data\.autoRunning\)\) return null;/);
  assert.equal(AUTO_HEADING, "First automatic check. AMBER's full check follows.");
  assert.match(panel, /\{auto && <p className="mt-2 text-sm font-semibold text-ink">\{AUTO_HEADING\}<\/p>\}/);
});

test("nothing can push a report into the portal: there is no call-back door", () => {
  assert.equal(existsSync("app/api/amber/upload-check/callback/route.js"), false);
});

// ─── signing, proved against the public key the way the engine checks it ────

test("a signature verifies with the matching public key, over '<time>.<text>'", () => {
  const h = signHeaders("sub1.abc", KEY, NOW);
  assert.equal(h["x-portal-time"], String(NOW));
  assert.equal(verifies("sub1.abc", h), true);
  assert.equal(verifies("sub1.abd", h), false, "other text does not verify");
  const other = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  assert.equal(
    crypto.verify("sha256", Buffer.from(`${NOW}.sub1.abc`), other.publicKey, Buffer.from(h["x-portal-signature"], "base64")),
    false,
    "another key's public half does not verify it",
  );
});

test("the start call signs the upload and the exact body sent", () => {
  const call = buildStartCall({
    submissionId: "sub1", fileUrl: "https://storage.googleapis.com/b/a.pdf?x=1", fileName: "front.pdf",
    spec: { widthMm: "300", printer: "Crown Bag" }, notSure: ["barcode"], key: KEY, nowSeconds: NOW,
  });
  assert.equal(call.url, ENGINE_URL);
  assert.equal(ENGINE_URL, "https://tools.flexoafrica.com/api/upload-check");
  assert.equal(call.headers["content-type"], "application/json");
  const parsed = JSON.parse(call.body);
  assert.deepEqual(parsed, {
    submissionId: "sub1", fileUrl: "https://storage.googleapis.com/b/a.pdf?x=1", fileName: "front.pdf",
    spec: { widthMm: "300", printer: "Crown Bag" }, notSure: ["barcode"],
  });
  const text = `sub1.${sha256Hex(Buffer.from(call.body, "utf8"))}`;
  assert.equal(verifies(text, call.headers), true);
  const tampered = call.body.replace("300", "301");
  assert.equal(verifies(`sub1.${sha256Hex(Buffer.from(tampered))}`, call.headers), false, "a changed body no longer verifies");
  const empty = JSON.parse(buildStartCall({ submissionId: "s", fileUrl: "https://x", key: KEY }).body);
  assert.deepEqual(empty.spec, {});
  assert.deepEqual(empty.notSure, []);
  assert.equal(empty.fileName, "file");
});

test("the poll call signs the ticket; anything that is not a ticket is never sent", () => {
  const p = buildPollCall({ ticket: "t_abc-123", key: KEY, nowSeconds: NOW });
  assert.equal(p.url, `${ENGINE_URL}/t_abc-123`);
  assert.equal(verifies("t_abc-123", p.headers), true);
  for (const bad of ["", "abc", "../../etc", "a/b/c/d/e", "x".repeat(121), null, "abc def"]) {
    assert.equal(buildPollCall({ ticket: bad, key: KEY }), null, `refused: ${bad}`);
  }
});

test("only Firebase Storage https links go to the engine", () => {
  assert.equal(isAllowedFileUrl("https://storage.googleapis.com/bucket/a.pdf?sig=1"), true);
  assert.equal(isAllowedFileUrl("https://firebasestorage.googleapis.com/v0/b/x/o/a"), true);
  assert.equal(isAllowedFileUrl("https://flexo.firebasestorage.app/a.pdf"), true);
  assert.equal(isAllowedFileUrl("http://storage.googleapis.com/a.pdf"), false);
  assert.equal(isAllowedFileUrl("https://storage.googleapis.com.evil.com/a.pdf"), false);
  assert.equal(isAllowedFileUrl("https://evil.com/storage.googleapis.com"), false);
  assert.equal(isAllowedFileUrl("not a link"), false);
});

test("the first artwork file is sent; fonts and zips are not", () => {
  assert.equal(pickCheckableFile([{ name: "font.otf" }, { name: "all.zip" }, { name: "Back.AI" }, { name: "front.pdf" }]).name, "Back.AI");
  assert.equal(pickCheckableFile([{ name: "font.ttf" }]), null);
  assert.equal(pickCheckableFile(null), null);
});

// ─── what comes back ─────────────────────────────────────────────────────────

test("a good engine report is accepted as automatic: legal as NOTE, missing Recommended read as no", () => {
  const a = readEngineAnswer(200, engineReport(), { submissionId: "sub1" });
  assert.equal(a.outcome, "report");
  assert.equal(a.report.createdBy, BY_AUTO);
  assert.equal(a.report.findings.find((f) => /Nett/.test(f.what)).level, "NOTE");
  const stop = a.report.findings.find((f) => f.level === "STOP");
  assert.deepEqual(stop.options.map((o) => o.recommended), [true, false]);
  assert.equal(stop.picture, PIC);
  assert.equal(a.report.limitsAreDefaults, true);
});

test("a slow file answers with a ticket and a sensible wait", () => {
  assert.deepEqual(readEngineAnswer(202, { ticket: "t_1234567", pollAfterMs: 3000 }), { outcome: "running", ticket: "t_1234567", pollAfterMs: 3000 });
  assert.equal(readEngineAnswer(202, { ticket: "t_1234567", pollAfterMs: 10 }).pollAfterMs, 1000);
  assert.equal(readEngineAnswer(202, { ticket: "t_1234567", pollAfterMs: 999999 }).pollAfterMs, 15000);
  assert.equal(readEngineAnswer(202, { ticket: "t_1234567" }).pollAfterMs, 3000);
  assert.equal(readEngineAnswer(202, { ticket: "../x" }).outcome, "error");
  assert.equal(readEngineAnswer(202, {}).outcome, "error");
});

test("errors, a report for another upload, or a half report are never shown", () => {
  assert.match(readEngineAnswer(413, { error: { code: "too_big", message: "x" } }).message, /413 \(too_big\)/);
  assert.equal(readEngineAnswer(401, null).outcome, "error");
  assert.equal(readEngineAnswer(200, null).outcome, "error");
  assert.equal(readEngineAnswer(200, { submissionId: "sub1", error: { code: "failed" } }, { submissionId: "sub1" }).outcome, "error");
  assert.equal(
    readEngineAnswer(200, engineReport({ error: { code: "failed", message: "stopped half way" } }), { submissionId: "sub1" }).outcome,
    "error",
    "a report that also says it failed is never shown, even with findings in it",
  );
  assert.match(readEngineAnswer(200, engineReport(), { submissionId: "other" }).message, /different upload/);
  const half = engineReport();
  half.findings[0].level = "MAYBE";
  assert.match(readEngineAnswer(200, half, { submissionId: "sub1" }).message, /engine report refused/);
  const leak = engineReport();
  leak.findings[0].effect = "see /srv/engine/tmp/file.pdf";
  assert.equal(readEngineAnswer(200, leak, { submissionId: "sub1" }).outcome, "error");
});

// ─── pictures ────────────────────────────────────────────────────────────────

test("only small JPEG pictures are kept; anything else is dropped", () => {
  assert.equal(safePicture(PIC), PIC);
  assert.equal(safePicture("data:image/png;base64,AAAA"), null);
  assert.equal(safePicture("data:image/svg+xml;base64,AAAA"), null, "no drawings that can carry script");
  assert.equal(safePicture("https://evil.com/a.jpg"), null);
  assert.equal(safePicture("javascript:alert(1)"), null);
  assert.equal(safePicture("data:image/jpeg;base64,AA AA"), null);
  assert.equal(safePicture("data:image/jpeg;base64," + "A".repeat(90000)), null, "too big");
  assert.equal(safePicture(null), null);
});

test("at most 8 pictures in a report, and not too much in all", () => {
  const r = engineReport();
  r.findings = Array.from({ length: 10 }, (_, i) => ({ level: "NOTE", what: `n${i}`, picture: PIC }));
  const out = checkReport(r, { createdBy: BY_AUTO }).report;
  assert.equal(MAX_PICTURES, 8);
  assert.equal(out.findings.filter((f) => f.picture).length, 8);
  const big = engineReport();
  const fat = "data:image/jpeg;base64," + "A".repeat(89000);
  big.findings = Array.from({ length: 8 }, (_, i) => ({ level: "NOTE", what: `b${i}`, picture: fat }));
  assert.equal(checkReport(big, { createdBy: BY_AUTO }).report.findings.filter((f) => f.picture).length, 6, "600 KB in all");
});

test("the customer's copy carries the picture, and the page shows only a JPEG", () => {
  const r = { id: "a1", ...checkReport(engineReport(), { createdBy: BY_AUTO }).report, status: STATUS_SENT };
  assert.equal(customerView(r).findings.find((f) => f.level === "STOP").picture, PIC);
  const sneaky = { ...r, findings: r.findings.map((f) => ({ ...f, picture: "https://evil.com/x.jpg" })) };
  assert.equal(customerView(sneaky).findings.every((f) => f.picture === null), true);
  assert.match(read("components/FileCheckPanel.jsx"), /\{typeof f\.picture === "string" && f\.picture\.startsWith\("data:image\/jpeg;base64,"\) && \(/);
});

// ─── the route and the page ─────────────────────────────────────────────────

test("the route signs both calls and checks whose upload it is", () => {
  const route = read("app/api/amber/upload-check/route.js");
  assert.match(route, /assertMayAct\(profile\); \/\/ the customer's own page only; staff never start it/);
  assert.match(route, /if \(!submission \|\| !mayReadSubmission\(caller, submission\)\) \{/);
  assert.match(route, /await callEngine\(call\.url, \{ method: "POST", headers: call\.headers, body: call\.body \}\);/);
  assert.match(route, /await callEngine\(poll\.url, \{ method: "GET", headers: poll\.headers \}\);/);
  assert.match(route, /if \(!isAllowedFileUrl\(fileUrl\)\) \{/);
});

test("a check runs once per upload; a slow one is only asked about while fresh", () => {
  const route = read("app/api/amber/upload-check/route.js");
  assert.match(route, /const existing = \(await listReports\(db, sid\)\)\.find\(\(r\) => r\.createdBy === BY_AUTO\);\n {2}if \(existing\) \{\n {4}if \(existing\.status === STATUS_SENT\) return NextResponse\.json\(\{ state: "ready" \}\);/);
  assert.match(route, /const fresh = existing\.running === true && Date\.now\(\) - Number\(existing\.createdAtMs \|\| 0\) < RUNNING_FOR_MS;\n {4}if \(!fresh\) return NextResponse\.json\(\{ state: "none" \}\);/);
  assert.equal(RUNNING_FOR_MS, 300000);
});

test("staff never start or poll it, and the page stops asking after about 5 minutes", () => {
  const panel = read("components/FileCheckPanel.jsx");
  assert.match(panel, /if \(staff \|\| !d\.submissionId \|\| d\.auto \|\| tries >= 60\) return;/);
  assert.match(panel, /if \(tries === 0 \|\| d\.autoRunning\) \{/);
});

// ─── Cylinder repeat and Esko LEN files (Cam, 24 Nov 2026 evening, "1/2/3") ───
import { MAX_REPEAT_MM, MIN_REPEAT_MM, repeatMmFor } from "../lib/upload-check-engine.mjs";

test("a label's repeat comes from the gear and the tooth size, like the job system", () => {
  assert.equal(repeatMmFor({ bagType: "Label", gearPitch: "CP", cylinderTeeth: "93", cylinder: "295.275" }), 295.275);
  assert.equal(repeatMmFor({ bagType: "Label", gearPitch: "DP", cylinderTeeth: 112 }), 279.288);
  // The gear sum wins over a different figure typed in the cylinder box.
  assert.equal(repeatMmFor({ bagType: "Label", gearPitch: "CP", cylinderTeeth: "93", cylinder: "300" }), 295.275);
  // No gear: the cylinder box, if it is a plain figure.
  assert.equal(repeatMmFor({ bagType: "Label", cylinderTeeth: "93", cylinder: "381" }), 381);
  // Teeth ticked Not sure: the cylinder box only.
  assert.equal(repeatMmFor({ bagType: "Label", gearPitch: "CP", cylinderTeeth: "93", cylinder: "300" }, ["cylinderTeeth"]), 300);
  assert.equal(repeatMmFor({ bagType: "Label", gearPitch: "CP", cylinderTeeth: "93", cylinder: "300" }, ["gearPitch"]), 300);
  assert.equal(repeatMmFor({ bagType: "Label", gearPitch: "CP", cylinderTeeth: "93" }, ["cylinderTeeth"]), null);
});

test("a bag's repeat is the cylinder box only when it is a plain millimetre figure", () => {
  assert.equal(repeatMmFor({ bagType: "SO Bag", cylinder: "440" }), 440);
  assert.equal(repeatMmFor({ bagType: "SO Bag", cylinder: " 440 mm " }), 440);
  assert.equal(repeatMmFor({ bagType: "SO Bag", cylinder: "440MM" }), 440);
  assert.equal(repeatMmFor({ bagType: "SO Bag", cylinder: "295,275" }), 295.275);
  assert.equal(repeatMmFor({ bagType: "SO Bag", cylinder: "635.1234" }), 635.123);
  assert.equal(repeatMmFor({ bagType: "SO Bag", cylinder: 600 }), 600);
  for (const bad of ["96T", "112t (279.30)", "see last job", "", "440 x 2", "-440", "4 40"]) {
    assert.equal(repeatMmFor({ bagType: "SO Bag", cylinder: bad }), null, bad);
  }
  // Gear and teeth left over on a bag are never used.
  assert.equal(repeatMmFor({ bagType: "SO Bag", gearPitch: "CP", cylinderTeeth: "93" }), null);
  assert.equal(repeatMmFor({ bagType: "SO Bag", cylinder: "440" }, ["cylinder"]), null);
  assert.equal(repeatMmFor({ bagType: "Label", gearPitch: "CP", cylinderTeeth: "93" }, ["cylinder"]), null);
  assert.equal(repeatMmFor(null), null);
  assert.equal(repeatMmFor({ cylinder: "440" }, "cylinder"), 440);
});

test("only real cylinder sizes are sent, 50 to 2000 mm", () => {
  assert.equal(MIN_REPEAT_MM, 50);
  assert.equal(MAX_REPEAT_MM, 2000);
  assert.equal(repeatMmFor({ cylinder: "50" }), 50);
  assert.equal(repeatMmFor({ cylinder: "49.9" }), null);
  assert.equal(repeatMmFor({ cylinder: "2000" }), 2000);
  assert.equal(repeatMmFor({ cylinder: "2000.1" }), null);
  assert.equal(repeatMmFor({ cylinder: Number.NaN }), null);
});

test("the start call adds repeatMm to the spec when known, and changes nothing else", () => {
  const spec = { bagType: "Label", gearPitch: "CP", cylinderTeeth: "93", cylinder: "295.275", widthMm: "100" };
  const call = buildStartCall({ submissionId: "s1", fileUrl: "https://storage.googleapis.com/b/a.pdf", fileName: "a.pdf", spec, notSure: [], key: KEY, nowSeconds: NOW });
  const parsed = JSON.parse(call.body);
  assert.deepEqual(parsed.spec, { ...spec, repeatMm: 295.275 });
  assert.equal("repeatMm" in spec, false, "the stored spec is not changed");
  assert.equal(verifies(`s1.${sha256Hex(Buffer.from(call.body, "utf8"))}`, call.headers), true);
  const unsure = JSON.parse(buildStartCall({ submissionId: "s1", fileUrl: "https://x", spec: { cylinder: "440" }, notSure: ["cylinder"], key: KEY }).body);
  assert.deepEqual(unsure.spec, { cylinder: "440" });
});

test("Esko LEN plate files can be uploaded and are sent to the instant check", () => {
  // The upload list (lib/amber-client.js loads Firebase, so it is read as text).
  const client = read("lib/amber-client.js");
  const list = client.match(/export const ACCEPTED_EXTENSIONS = \[([\s\S]*?)\];/)[1];
  const exts = [...list.replace(/\/\/.*$/gm, "").matchAll(/"(\.[a-z0-9]+)"/g)].map((m) => m[1]);
  assert.deepEqual(exts, [".pdf", ".ai", ".eps", ".psd", ".tif", ".tiff", ".zip", ".otf", ".ttf", ".woff", ".woff2", ".len", ".lenx"]);
  assert.match(client, /return ACCEPTED_EXTENSIONS\.some\(\(ext\) => lower\.endsWith\(ext\)\);/);
  assert.equal(pickCheckableFile([{ name: "font.otf" }, { name: "Cyan.LEN" }]).name, "Cyan.LEN");
  assert.equal(pickCheckableFile([{ name: "all.lenx" }]).name, "all.lenx");
  assert.match(read("app/amber/page.jsx"), /PDF, AI, EPS, PSD, TIFF, ZIP, Esko LEN and fonts\./);
});
