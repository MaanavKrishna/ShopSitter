import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page here shows live data (bills, payments), so component caching stays off.
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
