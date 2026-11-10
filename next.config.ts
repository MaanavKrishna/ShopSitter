import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
