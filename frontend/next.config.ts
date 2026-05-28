import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Security headers applied to every response. Tuned to what this app
// actually needs — anything stricter would break the Next runtime or
// the bilingual UI fetches.
//
// - HSTS: only meaningful over HTTPS, but harmless on localhost; preload
//   is left OFF until the domain is fully ready for the preload list.
// - X-Frame-Options + frame-ancestors: redundant on modern browsers, but
//   the older header still gates IE/Edge-legacy and a handful of
//   embedded views (Slack unfurls, etc.).
// - Permissions-Policy: hard-disable hardware we never use. Easier to
//   list opt-OUTs than to maintain an allowlist as features land.
// - CSP: pragmatic, NOT strict-nonce based. Next's RSC inline scripts
//   require either nonces (intrusive to wire) or `'unsafe-inline'`; we
//   take the latter and keep the rest of the directives tight to limit
//   blast radius. `connect-src 'self'` is enough because every API call
//   goes through the BFF proxy under /api/*. `img-src` allows `data:`
//   (favicons, inline SVGs) and the public CDN we use for the brand
//   logo in emails (which is also embedded into preview screens).
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: [
      "accelerometer=()",
      "autoplay=()",
      "camera=()",
      "geolocation=()",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "payment=()",
      "usb=()",
    ].join(", "),
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://i.ibb.co",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
