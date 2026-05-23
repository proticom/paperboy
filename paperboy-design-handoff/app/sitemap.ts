import type { MetadataRoute } from "next";

/**
 * SEO sitemap.xml for paperboy.run.
 *
 * Next.js App Router auto-discovers this file at `app/sitemap.ts` and serves
 * the result at `/sitemap.xml`. List every public route here so search
 * engines can crawl the marketing site cleanly.
 *
 * The human-facing site directory lives at /directory (see app/directory/page.tsx).
 */
const ROUTES: Array<{
  path: string;
  changeFrequency?: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority?: number;
}> = [
  { path: "/", changeFrequency: "weekly", priority: 1.0 },
  { path: "/a2", changeFrequency: "monthly", priority: 0.8 },
  { path: "/a3", changeFrequency: "monthly", priority: 0.8 },
  { path: "/a4", changeFrequency: "monthly", priority: 0.8 },
  { path: "/a5", changeFrequency: "monthly", priority: 0.8 },
  { path: "/viewer", changeFrequency: "monthly", priority: 0.7 },
  { path: "/help", changeFrequency: "monthly", priority: 0.6 },
  { path: "/directory", changeFrequency: "monthly", priority: 0.6 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/cookies", changeFrequency: "yearly", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://paperboy.run";
  const now = new Date();
  return ROUTES.map(({ path, changeFrequency, priority }) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));
}
