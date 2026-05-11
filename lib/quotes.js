import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

// Save a public quote to /quotes. Anonymous writes are allowed by Firestore rules.
export async function saveQuote({ email, name, spec, price, source = "public-configurator" }) {
  return addDoc(collection(db, "quotes"), {
    email: email || null,
    name: name || null,
    spec,
    price,
    source,
    status: "new",
    createdAt: serverTimestamp(),
  });
}
