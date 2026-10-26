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

// On a job's conversation, staff see exactly what the customer sees: the
// team's internal notes are left out.
export function commentsAsCustomerSees(comments) {
  return (comments || []).filter((c) => c?.visibility === "customer");
}
