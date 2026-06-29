import Link from "next/link";

/**
 * App-router custom 404. Replaces the bare default ("404 This page could not
 * be found.") with the portal's branded shell, a clear explanation, and
 * two routes back into the site so visitors don't dead-end.
 */
export const metadata = {
  title: "Page not found | Flexo Africa",
};

export default function NotFound() {
  return (
    <main className="max-w-page mx-auto px-4 sm:px-6 py-24">
      <div className="max-w-xl mx-auto text-center">
        <p className="text-accent-500 font-semibold text-sm uppercase tracking-wider mb-3">
          404
        </p>
        <h1 className="text-4xl md:text-5xl font-bold text-brand-900 leading-tight">
          That page doesn&apos;t exist.
        </h1>
        <p className="mt-4 text-lg text-brand-700">
          You may have followed an old link, or the page has moved. Head
          back to the dashboard, or get in touch and we&apos;ll point you in
          the right direction.
        </p>
        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <Link
            href="/dashboard"
            className="px-5 py-3 bg-accent-500 hover:bg-accent-600 text-white font-medium rounded-md"
          >
            Back to dashboard
          </Link>
          <Link
            href="/"
            className="px-5 py-3 bg-white border border-brand-200 hover:bg-brand-50 text-brand-800 font-medium rounded-md"
          >
            Back to home
          </Link>
          <Link
            href="/contact"
            className="px-5 py-3 bg-white border border-brand-200 hover:bg-brand-50 text-brand-800 font-medium rounded-md"
          >
            Talk to us
          </Link>
        </div>
      </div>
    </main>
  );
}
