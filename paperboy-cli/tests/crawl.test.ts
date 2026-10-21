import fs from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { crawlSite, type CrawlOptions } from "../src/crawl.ts";

type Route = {
  status: number;
  contentType: string;
  body: string;
  location?: string;
};

async function startTestServer(
  routes: Record<string, Route>,
): Promise<{ baseUrl: string; requests: string[]; close: () => Promise<void> }> {
  const requests: string[] = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    requests.push(url.pathname);
    const route = routes[url.pathname];
    if (!route) {
      res.statusCode = 404;
      res.setHeader("content-type", "text/plain");
      res.end("not found");
      return;
    }
    res.statusCode = route.status;
    res.setHeader("content-type", route.contentType);
    if (route.location) res.setHeader("location", route.location);
    res.end(route.body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function defaultOptions(overrides: Partial<CrawlOptions> = {}): CrawlOptions {
  return {
    maxPages: 50,
    maxDepth: 5,
    minContentWords: 1,
    outputMode: "single",
    json: false,
    mapOnly: false,
    rateLimitMs: 0,
    timeoutMs: 5000,
    maxSitemaps: 5,
    userAgent: "paperboy-cli-test/0.0.0",
    ...overrides,
  };
}

function htmlPage(title: string, bodyHtml: string): Route {
  return {
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html><head><title>${title}</title></head><body>${bodyHtml}</body></html>`,
  };
}

function leafPage(title: string): Route {
  return htmlPage(
    title,
    `<h1>${title}</h1><p>This page has enough words for the crawler minimum content filter to accept it.</p>`,
  );
}

const homeWithAboutContact = htmlPage(
  "Home",
  `<h1>Home page</h1><p>Welcome to the test site with at least a few words of content.</p>
   <a href="/about">About</a> <a href="/contact">Contact</a>`,
);

let tempDir = "";

describe("crawlSite", () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperboy-cli-crawl-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("crawls the seed page and follows internal links", async () => {
    const server = await startTestServer({
      "/": homeWithAboutContact,
      "/about": leafPage("About"),
      "/contact": leafPage("Contact"),
    });
    try {
      const outputPath = path.join(tempDir, "crawl.md");
      const result = await crawlSite(server.baseUrl, {
        ...defaultOptions(),
        outputPath,
      });

      expect(result.crawledCount).toBe(3);
      expect(result.discoveredUrls.length).toBe(3);
      const output = await fs.readFile(outputPath, "utf8");
      expect(output).toContain(`# Page: ${server.baseUrl}/about`);
    } finally {
      await server.close();
    }
  });

  it("respects the maxPages cap", async () => {
    const server = await startTestServer({
      "/": htmlPage(
        "Home",
        `<h1>Home</h1><p>Seed page with enough words for the crawler.</p>
         <a href="/p1">P1</a><a href="/p2">P2</a><a href="/p3">P3</a>
         <a href="/p4">P4</a><a href="/p5">P5</a>`,
      ),
      "/p1": leafPage("P1"),
      "/p2": leafPage("P2"),
      "/p3": leafPage("P3"),
      "/p4": leafPage("P4"),
      "/p5": leafPage("P5"),
    });
    try {
      const result = await crawlSite(server.baseUrl, {
        ...defaultOptions({ maxPages: 2 }),
        outputPath: path.join(tempDir, "crawl.md"),
      });

      expect(result.crawledCount).toBe(2);
      expect(result.discoveredUrls.length).toBe(2);
    } finally {
      await server.close();
    }
  });

  it("respects the maxDepth cap", async () => {
    const server = await startTestServer({
      "/": htmlPage(
        "Root",
        `<h1>Root</h1><p>Root page with enough words for the crawler to index it.</p>
         <a href="/level1">Level 1</a>`,
      ),
      "/level1": htmlPage(
        "Level 1",
        `<h1>Level 1</h1><p>First depth page with enough words for the crawler.</p>
         <a href="/level2">Level 2</a>`,
      ),
      "/level2": htmlPage(
        "Level 2",
        `<h1>Level 2</h1><p>Second depth page that should not be crawled at maxDepth 1.</p>
         <a href="/level3">Level 3</a>`,
      ),
      "/level3": leafPage("Level 3"),
    });
    try {
      const result = await crawlSite(server.baseUrl, {
        ...defaultOptions({ maxDepth: 1 }),
        outputPath: path.join(tempDir, "crawl.md"),
      });

      const urls = result.discoveredUrls.map((entry) => entry.url.replace(/\/$/, ""));
      expect(urls).toContain(server.baseUrl.replace(/\/$/, ""));
      expect(urls.some((url) => url.endsWith("/level1"))).toBe(true);
      expect(urls.some((url) => url.endsWith("/level2"))).toBe(false);
      expect(result.discoveredUrls.length).toBe(2);
    } finally {
      await server.close();
    }
  });

  it("filters by includePatterns", async () => {
    const server = await startTestServer({
      "/": htmlPage(
        "Home",
        `<h1>Home</h1><p>Home page with enough words for the crawler filter test.</p>
         <a href="/blog/post">Blog</a> <a href="/about/team">About</a>`,
      ),
      "/blog/post": leafPage("Blog post"),
      "/about/team": leafPage("About team"),
    });
    try {
      const result = await crawlSite(server.baseUrl, {
        ...defaultOptions({ includePatterns: ["blog"] }),
        outputPath: path.join(tempDir, "crawl.md"),
      });

      expect(result.discoveredUrls.every((entry) => /\/blog\//i.test(entry.url))).toBe(
        true,
      );
      expect(result.discoveredUrls.some((entry) => /\/about\//i.test(entry.url))).toBe(
        false,
      );
    } finally {
      await server.close();
    }
  });

  it("filters by excludePatterns", async () => {
    const server = await startTestServer({
      "/": htmlPage(
        "Home",
        `<h1>Home</h1><p>Home page with enough words for the crawler exclude test.</p>
         <a href="/docs/guide">Docs</a> <a href="/admin/secret">Admin</a>`,
      ),
      "/docs/guide": leafPage("Docs guide"),
      "/admin/secret": leafPage("Admin secret"),
    });
    try {
      const result = await crawlSite(server.baseUrl, {
        ...defaultOptions({ excludePatterns: ["admin"] }),
        outputPath: path.join(tempDir, "crawl.md"),
      });

      expect(result.discoveredUrls.some((entry) => /\/admin/i.test(entry.url))).toBe(
        false,
      );
      expect(result.discoveredUrls.length).toBeGreaterThanOrEqual(1);
      expect(
        result.discoveredUrls.some((entry) => !/\/admin/i.test(entry.url)),
      ).toBe(true);
    } finally {
      await server.close();
    }
  });

  it("returns a map when mapOnly is true", async () => {
    const server = await startTestServer({
      "/": homeWithAboutContact,
      "/about": leafPage("About"),
      "/contact": leafPage("Contact"),
    });
    try {
      const mapPath = path.join(tempDir, "urls.txt");
      const result = await crawlSite(server.baseUrl, {
        ...defaultOptions({ mapOnly: true }),
        outputPath: mapPath,
      });

      expect(result.mode).toBe("map");
      expect(result.crawledCount).toBe(0);
      expect(result.discoveredCount).toBeGreaterThanOrEqual(1);
      const mapBody = await fs.readFile(mapPath, "utf8");
      expect(mapBody).toContain(server.baseUrl);
      expect(mapBody).not.toContain("# Page:");
      await expect(fs.stat(path.join(tempDir, "crawl.md"))).rejects.toThrow();
    } finally {
      await server.close();
    }
  });

  it("discovers URLs via /sitemap.xml", async () => {
    const staticRoutes: Record<string, Route> = {
      "/": leafPage("Home"),
      "/discovered-1": leafPage("Discovered 1"),
      "/discovered-2": leafPage("Discovered 2"),
    };
    let baseUrl = "";
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/sitemap.xml") {
        res.statusCode = 200;
        res.setHeader("content-type", "application/xml");
        res.end(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${baseUrl}/discovered-1</loc></url>
  <url><loc>${baseUrl}/discovered-2</loc></url>
</urlset>`);
        return;
      }
      const route = staticRoutes[url.pathname];
      if (!route) {
        res.statusCode = 404;
        res.setHeader("content-type", "text/plain");
        res.end("not found");
        return;
      }
      res.statusCode = route.status;
      res.setHeader("content-type", route.contentType);
      res.end(route.body);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    try {
      const result = await crawlSite(baseUrl, {
        ...defaultOptions(),
        outputPath: path.join(tempDir, "crawl.md"),
      });

      expect(result.discoveredUrls.length).toBe(3);
      expect(
        result.discoveredUrls.filter((entry) => entry.source === "sitemap").length,
      ).toBe(2);
      expect(result.discoveredUrls.some((entry) => entry.source === "seed")).toBe(
        true,
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it("ignores external links", async () => {
    const server = await startTestServer({
      "/": htmlPage(
        "Home",
        `<h1>Home</h1><p>Home page with enough words and an external link reference.</p>
         <a href="https://example.com/foo">External</a>
         <a href="/local">Local</a>`,
      ),
      "/local": leafPage("Local"),
    });
    try {
      const result = await crawlSite(server.baseUrl, {
        ...defaultOptions(),
        outputPath: path.join(tempDir, "crawl.md"),
      });

      expect(
        result.discoveredUrls.every((entry) => entry.url.startsWith(server.baseUrl)),
      ).toBe(true);
      expect(
        result.discoveredUrls.some((entry) => entry.url.includes("example.com")),
      ).toBe(false);
    } finally {
      await server.close();
    }
  });

  it("resolves relative links from a trailing-slash seed", async () => {
    const server = await startTestServer({
      "/docs/": htmlPage("Docs", '<a href="a.html">A</a><a href="b.html">B</a>'),
      "/docs/a.html": leafPage("A"),
      "/docs/b.html": leafPage("B"),
    });
    try {
      const result = await crawlSite(`${server.baseUrl}/docs/`, {
        ...defaultOptions({ maxDepth: 1 }),
        outputPath: path.join(tempDir, "crawl.md"),
      });

      expect(result.discoveredUrls.map((entry) => entry.url)).toEqual([
        `${server.baseUrl}/docs`,
        `${server.baseUrl}/docs/a.html`,
        `${server.baseUrl}/docs/b.html`,
      ]);
      expect(server.requests).not.toContain("/a.html");
      expect(server.requests).not.toContain("/b.html");
      expect(result.warnings).not.toContain(
        `Skipping ${server.baseUrl}/a.html (HTTP 404).`,
      );
    } finally {
      await server.close();
    }
  });

  it("resolves links from the final URL after a redirect", async () => {
    const server = await startTestServer({
      "/docs": {
        status: 301,
        contentType: "text/plain",
        body: "redirect",
        location: "/docs/",
      },
      "/docs/": htmlPage("Docs", '<a href="a.html">A</a><a href="b.html">B</a>'),
      "/docs/a.html": leafPage("A"),
      "/docs/b.html": leafPage("B"),
    });
    try {
      const result = await crawlSite(`${server.baseUrl}/docs`, {
        ...defaultOptions({ maxDepth: 1 }),
        outputPath: path.join(tempDir, "crawl.md"),
      });

      expect(result.discoveredUrls.map((entry) => entry.url)).toEqual([
        `${server.baseUrl}/docs`,
        `${server.baseUrl}/docs/a.html`,
        `${server.baseUrl}/docs/b.html`,
      ]);
      expect(server.requests).not.toContain("/a.html");
      expect(server.requests).not.toContain("/b.html");
    } finally {
      await server.close();
    }
  });

  it("resolves a relative link from a no-slash nested URL", async () => {
    const server = await startTestServer({
      "/guide/intro": htmlPage("Intro", '<a href="next">Next</a>'),
      "/guide/next": leafPage("Next"),
    });
    try {
      const result = await crawlSite(`${server.baseUrl}/guide/intro`, {
        ...defaultOptions({ maxDepth: 1 }),
        outputPath: path.join(tempDir, "crawl.md"),
      });

      expect(result.discoveredUrls.map((entry) => entry.url)).toContain(
        `${server.baseUrl}/guide/next`,
      );
    } finally {
      await server.close();
    }
  });

  it("deduplicates slash variants of the same URL", async () => {
    const server = await startTestServer({
      "/": htmlPage("Home", '<a href="/dup">One</a><a href="/dup/">Two</a>'),
      "/dup": leafPage("Duplicate"),
    });
    try {
      const result = await crawlSite(server.baseUrl, {
        ...defaultOptions(),
        outputPath: path.join(tempDir, "crawl.md"),
      });

      expect(
        result.discoveredUrls.filter((entry) => entry.url === `${server.baseUrl}/dup`),
      ).toHaveLength(1);
    } finally {
      await server.close();
    }
  });
});
