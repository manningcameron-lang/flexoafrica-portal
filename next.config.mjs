/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // firebase-admin uses native Node.js modules — must not be bundled by
    // webpack. On Next 14 this option lives under `experimental` (the top-level
    // `serverExternalPackages` key is Next 15+ and is silently ignored on 14).
    serverComponentsExternalPackages: ["firebase-admin"],
  },
  async headers() {
    // Baseline security headers for the auth-gated portal. The portal is never
    // embedded in an iframe and is always served over HTTPS.
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
