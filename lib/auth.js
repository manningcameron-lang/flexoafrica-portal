import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

// Sign up a new customer.
// Creates Firebase Auth user, then writes a /users/{uid} doc with status=pending.
export async function signUpCustomer({
  email,
  password,
  company,
  contactName,
  phone,
}) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
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
