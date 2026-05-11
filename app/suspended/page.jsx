"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { signOut } from "@/lib/auth";

export default function SuspendedPage() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const wa = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
  const waLink = wa
    ? `https://wa.me/${wa}?text=${encodeURIComponent(
        "Hi Flexo Africa, my portal account is suspended. Could you check?"
      )}`
    : null;

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-20 text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-50 text-red-600 mb-5 text-2xl">
        !
      </div>
      <h1 className="text-3xl font-bold text-brand-900">Account suspended</h1>
      <p className="mt-3 text-brand-700">
        Your account at{" "}
        <span className="font-medium text-brand-900">
          {profile?.email || user?.email}
        </span>{" "}
        is currently suspended. This usually means there is something to sort
        out on the account, like overdue invoices or contact details.
      </p>
      <p className="mt-3 text-sm text-brand-500">
        Please get in touch and we will help you reactivate.
      </p>

      <div className="mt-8 flex justify-center gap-3">
        {waLink && (
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white font-medium rounded-md"
          >
            Contact us on WhatsApp
          </a>
        )}
        <button
          onClick={() => signOut().then(() => router.push("/"))}
          className="px-4 py-2 bg-brand-100 hover:bg-brand-200 text-brand-800 font-medium rounded-md"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
