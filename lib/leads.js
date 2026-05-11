import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

// Submit a contact form lead. Writes to /leads.
// Firestore rules permit anonymous create on /leads.
export async function submitLead({
  name,
  company,
  email,
  phone,
  plateType,
  message,
  source = "portal-contact",
}) {
  return addDoc(collection(db, "leads"), {
    name: name || "",
    company: company || "",
    email: email || "",
    phone: phone || "",
    plateType: plateType || null,
    message: message || "",
    source,
    status: "new",
    createdAt: serverTimestamp(),
  });
}
