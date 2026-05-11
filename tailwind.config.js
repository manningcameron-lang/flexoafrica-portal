/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand palette aligned with flexoafrica.com (pulled from the logo).
        // "brand" is kept as a navy scale for backwards-compat with existing
        // portal classes (brand-700, brand-900, etc.) so we don't break code.
        brand: {
          50: "#F8FAFC",
          100: "#F1F5F9",
          200: "#E2E8F0",
          300: "#CBD5E1",
          400: "#64748B",
          500: "#475569",
          600: "#334155",
          700: "#1E3A8A",
          800: "#1E2E5F",
          900: "#0F2E5F", // matches marketing site --color-ink
        },
        // Accent is the red from the logo stripe (matches marketing site).
        accent: {
          50: "#FEF2F2",
          100: "#FEE2E2",
          400: "#EF4444",
          500: "#DC2626",
          600: "#B91C1C",
          700: "#991B1B",
        },
        // Logo stripe colours, available for status chips, alerts, accents.
        logoYellow: "#F5C518",
        logoOrange: "#EA580C",
        logoRed: "#DC2626",
        logoBlue: "#1E40AF",
        logoTeal: "#0EA5E9",
        logoGreen: "#16A34A",
        ink: {
          DEFAULT: "#0F2E5F",
          soft: "#1E3A8A",
          muted: "#475569",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      maxWidth: {
        page: "1200px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)",
        cardHover: "0 8px 24px rgba(15, 23, 42, 0.10), 0 2px 6px rgba(15, 23, 42, 0.06)",
      },
    },
  },
  plugins: [],
};
