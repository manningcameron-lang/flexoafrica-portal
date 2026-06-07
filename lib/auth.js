import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

// Sign up a new customer.
//
// Pipeline:
//   1. Verify the Cloudflare Turnstile captcha token server-side
//   2. Create the Firebase Auth user (Firebase auto-signs them in)
//   3. Write the /users/{uid} doc with status=pending
//   4. Cloud Function gateCustomerSignup fires next: disables Auth, emails admin
//
// `captchaToken` is required when TURNSTILE_SECRET_KEY is set in Vercel.
// The route at /api/verify-captcha gracefully degrades to ok when the secret
// isn't configured — so signup still works locally / before Cloudflare is set up.
export async function signUpCustomer({
  email,
  password,
  company,
  contactName,
  phone,
  captchaToken,
}) {
  // 1. Captcha gate.
  const captchaResp = await fetch("/api/verify-captcha", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: captchaToken || "" }),
  });
  let captchaData = {};
  try { captchaData = await captchaResp.json(); } catch {}
  if (!captchaResp.ok || !captchaData?.ok) {
    const e = new Error(
      captchaData?.error || "Captcha verification failed. Try again.",
    );
    e.code = "captcha/failed";
    throw e;
  }

  // 2. Create the Auth account.
  const cred = await createUserWithEmailAndPassword(auth, email, password);

  // 3. Persist the /users doc. Gate function fires off this doc creation.
  await setDoc(doc(db, "users", cred.user.uid), {
    email,
    company,
    contactName,
    phone,
    role: "customer",
    status: "pending",
    createdAt: serverTimestamp(),
    lastActive: serverTimestamp(),
  });
  return cred.user;
}

// Sign in an existing user. Returns { user, profile } so the caller can route by status.
export async function signIn({ email, password }) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const snap = await getDoc(doc(db, "users", cred.user.uid));
  return {
    user: cred.user,
    profile: snap.exists() ? { uid: snap.id, ...snap.data() } : null,
  };
}

export async function sendPasswordReset(email) {
  await sendPasswordResetEmail(auth, email);
}

export async function signOut() {
  await firebaseSignOut(auth);
}

// Decide where to send the user after authentication based on their profile.
export function postLoginPath(profile) {
  if (!profile) return "/login?error=noprofile";
  // Operators and admins live in the MIS, not the portal.
  if (profile.role === "admin" || profile.role === "operator") {
    return "https://jobs.flexoafrica.com";
  }
  if (profile.role !== "customer") return "/login?error=role";
  if (profile.status === "pending") return "/awaiting-approval";
  if (profile.status === "suspended") return "/suspended";
  if (profile.status === "active") return "/dashboard";
  return "/login?error=status";
}
