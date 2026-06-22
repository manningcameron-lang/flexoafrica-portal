/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // firebase-admin uses native Node.js modules — must not be bundled by webpack
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
