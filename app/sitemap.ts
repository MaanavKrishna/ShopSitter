import type { MetadataRoute } from "next";

const BASE = "https://shopsitter.vercel.app";

/** The public pages. The stand, the pay page and the owner's dashboard are not listed. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE, changeFrequency: "monthly", priority: 1 },
    { url: `${BASE}/how-it-works`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/owners`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/trust`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/demo`, changeFrequency: "monthly", priority: 0.6 },
  ];
}
