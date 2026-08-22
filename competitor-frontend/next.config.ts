import type { NextConfig } from "next";

// Set here rather than in nginx, so a portal hosted off the contest LAN gets them too.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  // Safe unconditionally: RFC 6797 has browsers ignore this over plain HTTP. An env
  // gate would not work anyway -- headers() is evaluated at build time.
  { key: "Strict-Transport-Security", value: "max-age=15552000" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Monaco needs eval and loads its workers as blobs.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
      "worker-src 'self' blob:",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      // Loopback is the proctor agent's attestation nonce.
      "connect-src 'self' http://127.0.0.1:* http://localhost:*",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: "..",
  },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
