import type { MetadataRoute } from "next";

/** Crawlers may read the public pages; the working screens and the API are left alone. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // "/owner" alone would also match the public /owners page, so the dashboard is named exactly.
      disallow: ["/owner$", "/owner/", "/stand", "/pay/", "/api/"],
    },
    sitemap: "https://shopsitter.vercel.app/sitemap.xml",
  };
}
