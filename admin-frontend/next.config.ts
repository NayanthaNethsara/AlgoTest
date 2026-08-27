import type { NextConfig } from "next";

// Stricter than the competitor portal's: no Monaco, so no eval and no blob workers,
// and nothing here talks to the proctor agent over loopback.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=15552000" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      process.env.NODE_ENV !== "production"
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : "script-src 'self' 'unsafe-inline'",
      // Tailwind and KaTeX both emit inline styles.
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https: http:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
