// Who may do what on the portal, and where each kind of sign-in is sent.
//
// THIS IS THE ONLY PLACE THAT DECIDES IT. The sign-in page, every customer-only
// page, the public pages, the menu and every button that saves something all
// read these rules. Two places deciding it differently is the bug.
//
// WHY (Cam, 26 Oct 2026): signing in to the portal with a staff login used to
// throw you straight to the job system, so staff could never see the portal
// the way a customer sees it. Staff now stay on the portal in a READ ONLY
// view: they can open every page, and nothing can be ordered, approved,
// sent or saved.
//
// Read only matters most for "Approve proof". The job system acts on an
// approval and moves the real customer's job on to plates, and a staff login
// is allowed to write to the database, so the portal itself must refuse.
//
// Pure: no Firebase, no browser. Tested in tests/staff-view.test.mjs.

export const JOB_SYSTEM_URL = "https://jobs.flexoafrica.com";

// Flexo Africa's own people. Anything else is treated as a customer login.
export const STAFF_ROLES = Object.freeze(["admin", "operator", "designer"]);

export const READ_ONLY_MESSAGE =
  "Staff view: the portal is read only for staff. Nothing can be ordered, approved, sent or saved from here.";

export function isStaff(profile) {
  return !!profile && STAFF_ROLES.includes(profile.role);
}

// A customer who may place orders, approve proofs and send messages.
export function isActiveCustomer(profile) {
  return !!profile && profile.role === "customer" && profile.status === "active";
}

// Every action that saves something calls this first, with the signed-in
// person's profile. Staff are refused here even if a disabled button is
// somehow pressed. It fails CLOSED: no profile, or any role that is not a
// customer, is refused too, so a caller that forgets to pass the profile
// cannot slip through.
export function assertMayAct(profile) {
  if (!profile) throw new Error("Not signed in");
  if (isStaff(profile)) throw new Error(READ_ONLY_MESSAGE);
  if (profile.role !== "customer") throw new Error("This account cannot do that.");
}

// Whether a job page must refuse to show a job because it belongs to another
// customer. Staff see every job, read only (Cam, 24 Nov 2026: his admin login
// opening FA005545 was told "This job belongs to another account"). A
// customer sees a job with no owner on it, or their own; never someone else's.
export function jobIsSomeoneElses(job, uid, staff) {
  if (!job || staff === true) return false;
  return !!job.customerUid && job.customerUid !== uid;
}

// Where the sign-in page sends someone straight after they sign in.
export function postLoginPath(profile) {
  if (!profile) return "/login?error=noprofile";
  if (isStaff(profile)) return "/dashboard";
  if (profile.role !== "customer") return "/login?error=role";
  if (profile.status === "pending") return "/awaiting-approval";
  if (profile.status === "suspended") return "/suspended";
  if (profile.status === "active") return "/dashboard";
  return "/login?error=status";
}

// What a customer-only page (dashboard, jobs, profile, orders, AMBER) does.
//   { show: false, to: null }  still loading, show "Loading..."
//   { show: false, to: "/x" }  send them to /x
//   { show: true,  staff }     show the page; staff means read only
export function customerPageGate({ user, profile, loading }) {
  if (loading) return { show: false, to: null, staff: false };
  if (!user) return { show: false, to: "/login", staff: false };
  if (!profile) return { show: false, to: "/login?error=noprofile", staff: false };
  if (isStaff(profile)) return { show: true, to: null, staff: true };
  if (profile.role !== "customer") return { show: false, to: "/login?error=role", staff: false };
  if (profile.status === "pending") return { show: false, to: "/awaiting-approval", staff: false };
  if (profile.status === "suspended") return { show: false, to: "/suspended", staff: false };
  if (profile.status !== "active") return { show: false, to: null, staff: false };
  return { show: true, to: null, staff: false };
}

// What a public page (home, sign in, sign up) does when someone is already
// signed in. Staff stay where they are, so they can see the public pages too.
// Returns the path to go to, or null to stay.
export function publicPageRedirect({ user, profile, loading }) {
  if (loading || !user) return null;
  if (isStaff(profile)) return null;
  if (profile?.role !== "customer") return null;
  if (profile.status === "pending") return "/awaiting-approval";
  if (profile.status === "suspended") return "/suspended";
  if (profile.status === "active") return "/dashboard";
  return null;
}

// Whether the menu and footer show the signed-in links (Dashboard, My Jobs...).
export function showsSignedInMenu({ user, profile, loading }) {
  if (loading || !user) return false;
  return isActiveCustomer(profile) || isStaff(profile);
}

// ─── AMBER's file check (Cam, 23 Nov 2026) ──────────────────────────────────
//
// Staff open the file check screen and save AMBER's report. Only CAM may send
// a report to a customer ("Cam only", his pick on the start card; it can be
// widened later by adding a login here and nowhere else).
//
// Cam is recognised by his ADMIN profile AND the email on his verified
// sign-in token (from Firebase Auth, which the browser cannot fake), never by
// an email typed into a profile or a request.
export const FILE_CHECK_RELEASERS = Object.freeze(["manning.cameron@gmail.com"]);

/** May this sign-in use the staff file check screen (list, save, edit)? */
export function mayUseFileCheckScreen(profile) {
  return isStaff(profile);
}

/**
 * May this sign-in press "Send to customer"? Fails CLOSED.
 * @param {object} profile  the users/{uid} record
 * @param {string} tokenEmail  decoded.email from the VERIFIED sign-in token
 */
export function mayReleaseFileCheck(profile, tokenEmail) {
  if (!profile || profile.role !== "admin") return false;
  const email = String(tokenEmail || "").trim().toLowerCase();
  if (!email) return false;
  return FILE_CHECK_RELEASERS.includes(email);
}

// On a job's conversation, staff see exactly what the customer sees: the
// team's internal notes are left out.
export function commentsAsCustomerSees(comments) {
  return (comments || []).filter((c) => c?.visibility === "customer");
}
