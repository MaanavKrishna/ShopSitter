import type { NextConfig } from "next";

// Sent with every response. A full script policy is left out on purpose: the PayPal button, the on-device
// detector and the chart board each load code from their own hosts, and a wrong policy would break paying.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // No other site may show these pages inside a frame.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  // Only this site's own pages may ask for the camera; nothing may ask for the microphone or location.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // Bills, baskets and dashboards are private and always live: never stored by a shared cache.
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
      { source: "/basket/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/pay/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
  // Every page here shows live data (bills, payments), so component caching stays off.
  // The demo reads its sample shelf photos from disk on the server, so they must ship with these routes.
  outputFileTracingIncludes: {
    "/api/stand/change": ["./public/samples/**"],
    "/demo": ["./public/samples/**"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
