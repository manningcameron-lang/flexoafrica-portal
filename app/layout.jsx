import { Inter } from "next/font/google";
import "./globals.css";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import { AuthProvider } from "../components/AuthProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata = {
  title: {
    default: "Flexo Africa Client Portal",
    template: "%s | Flexo Africa Client Portal",
  },
  description:
    "Real-time visibility on every flexographic plate you order with Flexo Africa. Track status, approve proofs, download invoices.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_PORTAL_URL || "https://portal.flexoafrica.com"
  ),
  openGraph: {
    title: "Flexo Africa Client Portal",
    description:
      "Real-time visibility on every flexographic plate you order with Flexo Africa.",
    type: "website",
  },
  robots: {
    index: false, // portal is auth-gated, no SEO benefit indexing
    follow: false,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans text-ink bg-white antialiased">
        <AuthProvider>
          <Nav />
          <main className="min-h-[60vh]">{children}</main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
