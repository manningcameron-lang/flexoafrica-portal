// Tests for the staff read only view of the portal.
//
// Run them with:  npm test
//
// THE CHANGE THESE GUARD (Cam, 26 Oct 2026): signing in to the portal with a
// staff login used to throw you straight to the job system, so staff could
// never see the portal as a customer does. Staff now stay on the portal, READ
// ONLY: every page opens, and nothing can be ordered, approved, sent or saved.
//
// The dangerous one is Approve proof. The job system acts on an approval and
// moves the customer's real job on, and a staff login is allowed to write to
// the database, so the PORTAL has to refuse. Several tests below read the page
// code as text, because those pages cannot run outside a browser: they prove
// every button that saves something is switched off for staff and every save
// checks first.
//
// Every test here is mutation-tested by tests/mutate.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  JOB_SYSTEM_URL,
  READ_ONLY_MESSAGE,
  STAFF_ROLES,
  assertMayAct,
  commentsAsCustomerSees,
  customerPageGate,
  isActiveCustomer,
  isStaff,
  postLoginPath,
  publicPageRedirect,
  showsSignedInMenu,
} from "../lib/staff-view.mjs";

const ADMIN = { uid: "a1", role: "admin", status: "active" };
const OPERATOR = { uid: "o1", role: "operator" };
const DESIGNER = { uid: "d1", role: "designer", status: "active" };
const CUSTOMER = { uid: "c1", role: "customer", status: "active", company: "Top Flight Packaging" };
const PENDING = { ...CUSTOMER, status: "pending" };
const SUSPENDED = { ...CUSTOMER, status: "suspended" };
const USER = { uid: "u1" };

const read = (p) => readFileSync(p, "utf8");

// ─── who counts as staff ────────────────────────────────────────────────────

test("admin, operator and designer logins are staff", () => {
  assert.deepEqual([...STAFF_ROLES], ["admin", "operator", "designer"]);
  assert.equal(isStaff(ADMIN), true);
  assert.equal(isStaff(OPERATOR), true);
  assert.equal(isStaff(DESIGNER), true);
});

test("a customer, an unknown role or no profile is not staff", () => {
  assert.equal(isStaff(CUSTOMER), false);
  assert.equal(isStaff({ role: "something" }), false);
  assert.equal(isStaff(null), false);
  assert.equal(isStaff(undefined), false);
});

test("only an active customer counts as an active customer", () => {
  assert.equal(isActiveCustomer(CUSTOMER), true);
  assert.equal(isActiveCustomer(PENDING), false);
  assert.equal(isActiveCustomer(ADMIN), false);
  assert.equal(isActiveCustomer(null), false);
});

// ─── straight after signing in ──────────────────────────────────────────────

test("a staff login lands on the portal dashboard, NOT the job system", () => {
  assert.equal(postLoginPath(ADMIN), "/dashboard");
  assert.equal(postLoginPath(OPERATOR), "/dashboard");
  assert.equal(postLoginPath(DESIGNER), "/dashboard");
  assert.ok(!postLoginPath(ADMIN).startsWith("http"));
});

test("customers still land where they always did", () => {
  assert.equal(postLoginPath(CUSTOMER), "/dashboard");
  assert.equal(postLoginPath(PENDING), "/awaiting-approval");
  assert.equal(postLoginPath(SUSPENDED), "/suspended");
  assert.equal(postLoginPath({ role: "customer", status: "odd" }), "/login?error=status");
  assert.equal(postLoginPath({ role: "nobody" }), "/login?error=role");
  assert.equal(postLoginPath(null), "/login?error=noprofile");
});

// ─── customer-only pages ────────────────────────────────────────────────────

test("staff see customer pages, marked read only", () => {
  assert.deepEqual(customerPageGate({ user: USER, profile: ADMIN, loading: false }), {
    show: true, to: null, staff: true,
  });
  // A staff login's own status never locks them out of looking.
  assert.equal(customerPageGate({ user: USER, profile: OPERATOR, loading: false }).show, true);
});

test("an active customer sees the page, and is not read only", () => {
  assert.deepEqual(customerPageGate({ user: USER, profile: CUSTOMER, loading: false }), {
    show: true, to: null, staff: false,
  });
});

test("everyone else is held back or sent where they belong", () => {
  const gate = (profile, extra = {}) =>
    customerPageGate({ user: USER, profile, loading: false, ...extra });
  assert.deepEqual(customerPageGate({ user: USER, profile: ADMIN, loading: true }), {
    show: false, to: null, staff: false,
  });
  assert.equal(customerPageGate({ user: null, profile: null, loading: false }).to, "/login");
  assert.equal(gate(null).to, "/login?error=noprofile");
  assert.equal(gate({ role: "nobody" }).to, "/login?error=role");
  assert.equal(gate(PENDING).to, "/awaiting-approval");
  assert.equal(gate(SUSPENDED).to, "/suspended");
  assert.deepEqual(gate({ role: "customer", status: "odd" }), { show: false, to: null, staff: false });
  for (const p of [null, { role: "nobody" }, PENDING, SUSPENDED]) {
    assert.equal(gate(p).show, false);
  }
});

// ─── public pages (home, sign in, sign up) ──────────────────────────────────

test("staff are left on public pages instead of being thrown out", () => {
  assert.equal(publicPageRedirect({ user: USER, profile: ADMIN, loading: false }), null);
  assert.equal(publicPageRedirect({ user: USER, profile: DESIGNER, loading: false }), null);
});

test("signed-in customers are still taken off public pages", () => {
  const go = (profile) => publicPageRedirect({ user: USER, profile, loading: false });
  assert.equal(go(CUSTOMER), "/dashboard");
  assert.equal(go(PENDING), "/awaiting-approval");
  assert.equal(go(SUSPENDED), "/suspended");
  assert.equal(go({ role: "customer", status: "odd" }), null);
  assert.equal(go({ role: "nobody" }), null);
  assert.equal(publicPageRedirect({ user: null, profile: null, loading: false }), null);
  assert.equal(publicPageRedirect({ user: USER, profile: CUSTOMER, loading: true }), null);
});

// ─── the menu ───────────────────────────────────────────────────────────────

test("staff and active customers get the signed-in menu", () => {
  assert.equal(showsSignedInMenu({ user: USER, profile: ADMIN, loading: false }), true);
  assert.equal(showsSignedInMenu({ user: USER, profile: OPERATOR, loading: false }), true);
  assert.equal(showsSignedInMenu({ user: USER, profile: CUSTOMER, loading: false }), true);
});

test("visitors, pending customers and a loading page get the public menu", () => {
  assert.equal(showsSignedInMenu({ user: USER, profile: PENDING, loading: false }), false);
  assert.equal(showsSignedInMenu({ user: null, profile: null, loading: false }), false);
  assert.equal(showsSignedInMenu({ user: USER, profile: ADMIN, loading: true }), false);
});

// ─── nothing can be saved by staff ──────────────────────────────────────────

test("staff are refused with the read only message", () => {
  for (const p of [ADMIN, OPERATOR, DESIGNER]) {
    assert.throws(() => assertMayAct(p), (err) => err.message === READ_ONLY_MESSAGE);
  }
  assert.match(READ_ONLY_MESSAGE, /read only/);
});

test("it fails closed: no profile or an unknown role is refused too", () => {
  assert.throws(() => assertMayAct(null), /Not signed in/);
  assert.throws(() => assertMayAct(undefined), /Not signed in/);
  assert.throws(() => assertMayAct({ role: "nobody" }), /cannot do that/);
});

test("a customer may act", () => {
  assert.doesNotThrow(() => assertMayAct(CUSTOMER));
});

test("staff see a job's conversation as the customer does, without internal notes", () => {
  const thread = [
    { id: "1", visibility: "customer", text: "Proof attached" },
    { id: "2", visibility: "internal", text: "Customer is slow to pay" },
    { id: "3", text: "no visibility set" },
    null,
  ];
  assert.deepEqual(commentsAsCustomerSees(thread).map((c) => c.id), ["1"]);
  assert.deepEqual(commentsAsCustomerSees(undefined), []);
});

test("the banner's button goes to the job system", () => {
  assert.equal(JOB_SYSTEM_URL, "https://jobs.flexoafrica.com");
  const banner = read("components/StaffBanner.jsx");
  assert.match(banner, /href=\{JOB_SYSTEM_URL\}/);
  assert.match(banner, /if \(loading \|\| !user \|\| !isStaff\(profile\)\) return null;/);
  assert.match(read("app/layout.jsx"), /<StaffBanner \/>/);
});

// ─── every save checks first (read as text: these need a browser to run) ────

test("approving a proof is refused for staff before anything is written", () => {
  const src = read("lib/approvals.js");
  const guard = src.indexOf("assertMayAct(profile);");
  assert.ok(guard > 0, "submitApproval must call assertMayAct(profile)");
  assert.ok(guard < src.indexOf("addDoc(collection(db"), "the check must come before the write");
});

test("the approval box shows staff no Approve or Request changes buttons", () => {
  const src = read("components/ApprovalActions.jsx");
  const staffBranch = src.indexOf("if (isStaff(profile)) {");
  assert.ok(staffBranch > 0, "ApprovalActions must have a staff branch");
  assert.ok(staffBranch < src.indexOf("Approve proof"), "the staff branch must come before the buttons");
});

test("posting a job message is refused for staff, and the box is replaced", () => {
  const lib = read("lib/comments.js");
  const guard = lib.indexOf("assertMayAct(author?.role ? { role: author.role } : null);");
  assert.ok(guard > 0 && guard < lib.indexOf("addDoc("));
  const ui = read("components/JobCommentsThread.jsx");
  assert.match(ui, /role: profile\?\.role,/);
  assert.match(ui, /if \(!text \|\| posting \|\| staff\) return;/);
  assert.match(ui, /\{staff \? \(/);
  assert.match(ui, /const shown = staff \? commentsAsCustomerSees\(comments\) : comments;/);
  assert.match(ui, /\{shown\.map\(/);
});

test("saving a profile or email settings is refused for staff", () => {
  const lib = read("lib/profile.js");
  assert.equal(lib.split("assertMayAct(profile);").length - 1, 2, "both saves must check");
  const page = read("app/profile/page.jsx");
  assert.match(page, /updateMyProfile\(\{ uid: user\.uid, patch: form, profile \}\)/);
  assert.match(page, /disabled=\{staff \|\| state\.status === "submitting"\}/);
  const prefs = read("app/profile/notifications/page.jsx");
  assert.match(prefs, /prefs: optimistic, profile \}/);
  assert.match(prefs, /if \(!prefs \|\| !user\?\.uid \|\| staff\) return;/);
});

test("placing a plate order is refused for staff before any upload", () => {
  const lib = read("lib/orders.js");
  const guard = lib.indexOf("assertMayAct(profile);");
  assert.ok(guard > 0 && guard < lib.indexOf("uploadPurchaseOrder({"));
  const page = read("app/order/new/page.jsx");
  assert.match(page, /disabled=\{staff \|\| submitting\}/);
  assert.match(page, /if \(staff\) \{\s*setError\(READ_ONLY_MESSAGE\);\s*return;/);
  assert.match(page, /const gate = customerPageGate\(\{ user, profile, loading \}\);/);
});

test("the AMBER page makes no job sheet, uploads nothing and cannot submit for staff", () => {
  const page = read("app/amber/page.jsx");
  assert.match(page, /if \(staff\) throw new Error\(READ_ONLY_MESSAGE\);/);
  assert.match(page, /disabled=\{staff \|\| busy \|\| missing\.length > 0\}/);
  assert.match(page, /disabled=\{staff \|\| busy\}/);
  // onPickFiles, onRemoveFile and onSubmit each stop staff first.
  assert.ok(page.split("setError(READ_ONLY_MESSAGE);").length - 1 >= 3);
});

test("staff never start a card payment", () => {
  const page = read("app/order/[orderId]/success/page.jsx");
  const guard = page.indexOf("if (isStaff(profile)) {");
  assert.ok(guard > 0 && guard < page.indexOf('fetch("/api/payfast/checkout"'));
});

test("a staff login with no company sees an empty dashboard and job list, not 'loading' for ever", () => {
  for (const file of ["app/dashboard/page.jsx", "app/jobs/page.jsx"]) {
    const src = read(file);
    const branch = src.indexOf("if (user?.uid && isStaff(profile) && !profile?.company) {");
    assert.ok(branch > 0, `${file} needs the staff empty state`);
    assert.ok(src.indexOf("setLoading(false);", branch) > branch);
  }
});

// ─── one rule, in one place ─────────────────────────────────────────────────

function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(js|jsx|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

const ALL_SOURCE = ["app", "components", "lib"].flatMap(sourceFiles);

test("nothing sends a staff login to the job system any more", () => {
  for (const file of ALL_SOURCE) {
    assert.doesNotMatch(read(file), /location\.href\s*=\s*["'`]https:\/\/jobs\.flexoafrica\.com/,
      `${file} still throws people to the job system`);
  }
});

test("no page keeps its own copy of the staff rule", () => {
  for (const file of ALL_SOURCE) {
    if (file.endsWith("staff-view.mjs")) continue;
    assert.doesNotMatch(read(file), /role === ["']admin["']|role === ["']operator["']/,
      `${file} decides who is staff by itself; use lib/staff-view.mjs`);
  }
});

test("the gates all read the one rule", () => {
  assert.match(read("components/CustomerGuard.jsx"), /customerPageGate\(\{ user, profile, loading \}\)/);
  assert.match(read("components/RedirectIfSignedIn.jsx"), /publicPageRedirect\(\{ user, profile, loading \}\)/);
  assert.match(read("app/dashboard/layout.jsx"), /<CustomerGuard/);
  assert.match(read("lib/auth.js"), /export \{ postLoginPath \} from "\.\/staff-view\.mjs";/);
  assert.match(read("components/Nav.jsx"), /showsSignedInMenu\(\{ user, profile, loading \}\)/);
  assert.match(read("components/Footer.jsx"), /showsSignedInMenu\(\{ user, profile, loading \}\)/);
});
