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

// Where to send someone straight after they sign in. Decided in
// lib/staff-view.mjs with every other "who goes where" rule: staff now land on
// the portal dashboard in a read only view instead of the job system.
export { postLoginPath } from "./staff-view.mjs";
