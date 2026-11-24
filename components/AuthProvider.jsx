"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

const AuthContext = createContext({
  user: null,
  profile: null,
  loading: true,
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Watch Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setProfile(null);
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  // Watch the user's Firestore profile doc
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const unsub = onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        setProfile(snap.exists() ? { uid: snap.id, ...snap.data() } : null);
        setLoading(false);
      },
      (err) => {
        console.error("Profile listen error", err);
        setProfile(null);
        setLoading(false);
      }
    );
    return unsub;
  }, [user]);

  // Once per sign-in, for a customer: save our customer list's name on the
  // account when they typed it differently, so their jobs (found by that name)
  // show up. Best effort and silent; the profile listener above picks up the
  // new name by itself. Cam 24 Nov 2026.
  const companySynced = useRef(null);
  useEffect(() => {
    if (!user || !profile) return;
    if (profile.role !== "customer" || profile.status !== "active") return;
    if (companySynced.current === user.uid) return;
    companySynced.current = user.uid;
    user
      .getIdToken()
      .then((token) =>
        fetch("/api/account/company-sync", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }),
      )
      .catch(() => {});
  }, [user, profile]);

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
