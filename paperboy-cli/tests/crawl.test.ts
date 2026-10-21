import fs from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { brotliCompressSync, deflateRawSync, deflateSync, gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as converter from "@proticom/paperboy-converter";

import { crawlSite, type CrawlOptions } from "../src/crawl.ts";

type Route = {
  status: number;
  contentType: string;
  contentEncoding?: string;
  body: string | Buffer | ((url: URL) => string);
  location?: string;
};
type RecordedRequest = { pathname: string; at: number; userAgent: string | undefined };

async function startTestServer(
  routes: Record<string, Route>,
): Promise<{ baseUrl: string; requests: RecordedRequest[]; close: () => Promise<void> }> {
  const requests: RecordedRequest[] = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    requests.push({ pathname: url.pathname, at: performance.now(), userAgent: req.headers["user-agent"] });
    const route = routes[url.pathname];
    if (!route) {
      res.statusCode = 404;
      res.setHeader("content-type", "text/plain");
      res.end("not found");
      return;
    }
    res.statusCode = route.status;
    res.setHeader("content-type", route.contentType);
    if (route.contentEncoding) res.setHeader("content-encoding", route.contentEncoding);
    if (route.location) res.setHeader("location", route.location);
    res.end(typeof route.body === "function" ? route.body(url) : route.body);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
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

async function startSitemapTestServer(): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  let baseUrl = "";
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/sitemap.xml") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/xml");
      res.end(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${baseUrl}/sm-only</loc></url>
  <url><loc>${baseUrl}/about</loc></url>
</urlset>`);
      return;
    }
    const routes: Record<string, Route> = {
      "/depth/1": leafPage("Seed"),
      "/sm-only": leafPage("Sitemap only"),
      "/about": leafPage("About"),
    };
    const route = routes[url.pathname];
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
  return {
    baseUrl,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

async function startCustomSitemapTestServer(
  sitemapPaths: string[],
  routes: Record<string, Route>,
  onRequest?: (pathname: string) => void,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  let baseUrl = "";
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    onRequest?.(url.pathname);
    if (url.pathname === "/sitemap.xml") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/xml");
      res.end(
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemapPaths
          .map((pathname) => `<url><loc>${baseUrl}${pathname}</loc></url>`)
          .join("")}</urlset>`,
      );
      return;
    }
    const route = routes[url.pathname];
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
  return {
    baseUrl,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
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

  it("checks another origin's robots before following a page redirect", async () => {
    const target = await startTestServer({
      "/robots.txt": { status: 200, contentType: "text/plain", body: "User-agent: *\nDisallow: /" },
      "/wild/y": leafPage("Private target"),
    });
    try {
      const seed = await startTestServer({
        "/robots.txt": { status: 200, contentType: "text/plain", body: "User-agent: *\nAllow: /wild/y" },
        "/": htmlPage("Home", '<h1>Home page</h1><a href="/offhost2">Other origin</a>'),
        "/offhost2": { status: 302, contentType: "text/html", body: "", location: `${target.baseUrl}/wild/y` },
      });
      try {
        const outputPath = path.join(tempDir, "mirror");
        const result = await crawlSite(seed.baseUrl, defaultOptions({ outputMode: "mirror", outputPath }));
        expect(seed.requests.map(({ pathname }) => pathname)).toEqual(["/robots.txt", "/sitemap.xml", "/", "/offhost2"]);
        expect(target.requests.map(({ pathname }) => pathname)).toEqual(["/robots.txt"]);
        expect(target.requests.map(({ userAgent }) => userAgent)).toEqual(["paperboy-cli-test/0.0.0"]);
        expect(result.discoveredUrls.map(({ url }) => url)).toEqual([`${seed.baseUrl}/`]);
        expect(result.crawledCount).toBe(1);
        expect(result.warnings).toEqual([`Skipping ${seed.baseUrl}/offhost2 (redirect to ${target.baseUrl}/wild/y disallowed by robots.txt).`]);
        expect(await fs.readdir(outputPath)).toEqual(["index.md"]);
      } finally {
        await seed.close();
      }
    } finally {
      await target.close();
    }
  });

  it.each([false, true])("obeys robots for sitemap URLs and links (mapOnly=%s)", async (mapOnly) => {
    const server = await startTestServer({
      "/robots.txt": {
        status: 200,
        contentType: "application/octet-stream",
        body: "User-agent: *\nDisallow: /private\n",
      },
      "/sitemap.xml": {
        status: 200,
        contentType: "application/xml",
        body: "<urlset><url><loc>/private/secret</loc></url><url><loc>/private/sitemap.xml</loc></url><url><loc>/public</loc></url></urlset>",
      },
      "/": htmlPage("Home", '<h1>Home</h1><p>Public home content.</p><a href="/private/secret">Secret</a><a href="/private/secret">Secret again</a>'),
      "/public": leafPage("Public"),
      "/private/secret": leafPage("Secret"),
      "/private/sitemap.xml": { status: 200, contentType: "application/xml", body: "<urlset/>" },
    });
    try {
      const outputPath = path.join(tempDir, mapOnly ? "map.txt" : "mirror");
      const result = await crawlSite(server.baseUrl, defaultOptions({
        mapOnly, outputMode: "mirror", outputPath, maxDepth: 1,
      }));

      expect(server.requests.map((request) => request.pathname)).toEqual([
        "/robots.txt", "/sitemap.xml", "/", "/public",
      ]);
      expect(server.requests.map((request) => request.userAgent)).toEqual(Array(4).fill("paperboy-cli-test/0.0.0"));
      expect(result.discoveredUrls.map((entry) => entry.url)).toEqual([
        `${server.baseUrl}/`, `${server.baseUrl}/public`,
      ]);
      expect(result.crawledCount).toBe(mapOnly ? 0 : 2);
      expect(result.warnings).toEqual([
        `Skipping ${server.baseUrl}/private/secret (disallowed by robots.txt).`,
        `Skipping ${server.baseUrl}/private/sitemap.xml (disallowed by robots.txt).`,
      ]);
      if (mapOnly) {
        expect(await fs.readFile(outputPath, "utf8")).toBe(`${server.baseUrl}/\n${server.baseUrl}/public\n`);
      } else {
        expect(await fs.readFile(path.join(outputPath, "public/index.md"), "utf8")).toContain("# Public");
        expect(await fs.readdir(outputPath)).toEqual(["index.md", "public"]);
      }
    } finally {
      await server.close();
    }
  });

  it.each([403, 404])("crawls without restrictions for robots HTTP %s", async (status) => {
    const server = await startTestServer({
      "/robots.txt": { status, contentType: "text/plain", body: "User-agent: *\nDisallow: /" },
      "/": htmlPage("Home", '<h1>Home</h1><a href="/private/secret">Secret</a>'),
      "/private/secret": leafPage("Secret"),
    });
    try {
      const result = await crawlSite(server.baseUrl, defaultOptions({ outputPath: path.join(tempDir, "crawl.md") }));
      expect(server.requests.map((request) => request.pathname)).toEqual([
        "/robots.txt", "/sitemap.xml", "/", "/private/secret",
      ]);
      expect(result.crawledCount).toBe(2);
      expect(result.discoveredUrls.map((entry) => entry.url)).toEqual([
        `${server.baseUrl}/`, `${server.baseUrl}/private/secret`,
      ]);
      expect(result.warnings).toEqual([]);
    } finally {
      await server.close();
    }
  });

  it.each([429, 503])("stops without sitemap or page requests for unavailable robots HTTP %s", async (status) => {
    const server = await startTestServer({
      "/robots.txt": { status, contentType: "text/plain", body: "Unavailable" },
      "/": leafPage("Home"),
    });
    try {
      const result = await crawlSite(server.baseUrl, defaultOptions({ outputPath: path.join(tempDir, "crawl.md") }));
      expect(server.requests.map((request) => request.pathname)).toEqual(["/robots.txt"]);
      expect(result.robotsUnavailable).toEqual({ origin: server.baseUrl, kind: "http", status });
      expect(result.crawledCount).toBe(0);
      expect(result.discoveredUrls).toEqual([]);
      expect(await fs.readdir(tempDir)).toEqual([]);
    } finally {
      await server.close();
    }
  });

  it("skips a disallowed seed without crashing", async () => {
    const server = await startTestServer({
      "/robots.txt": { status: 200, contentType: "text/plain", body: "User-agent: *\nDisallow: /private" },
      "/private/secret": leafPage("Secret"),
    });
    try {
      const result = await crawlSite(`${server.baseUrl}/private/secret`, defaultOptions({ outputPath: path.join(tempDir, "mirror"), outputMode: "mirror" }));
      expect(server.requests.map((request) => request.pathname)).toEqual(["/robots.txt", "/sitemap.xml"]);
      expect(result.crawledCount).toBe(0);
      expect(result.discoveredUrls).toEqual([]);
      expect(await fs.readdir(path.join(tempDir, "mirror"))).toEqual([]);
      expect(result.warnings).toEqual([`Skipping ${server.baseUrl}/private/secret (disallowed by robots.txt).`]);
    } finally {
      await server.close();
    }
  });

  it.each([
    { crawlDelay: 0.2, rateLimitMs: 0 },
    { crawlDelay: 0.01, rateLimitMs: 200 },
  ])("spaces page requests by the greater delay ($crawlDelay seconds, $rateLimitMs ms)", async ({ crawlDelay, rateLimitMs }) => {
    const server = await startTestServer({
      "/robots.txt": { status: 200, contentType: "text/plain", body: `User-agent: *\nCrawl-delay: ${crawlDelay}` },
      "/": homeWithAboutContact,
      "/about": leafPage("About"),
      "/contact": leafPage("Contact"),
    });
    try {
      const result = await crawlSite(server.baseUrl, defaultOptions({ rateLimitMs, outputPath: path.join(tempDir, "crawl.md") }));
      expect(result.crawledCount).toBe(3);
      expect(server.requests.filter((request) => request.pathname === "/robots.txt")).toHaveLength(1);
      const pages = server.requests.filter((request) => ["/", "/about", "/contact"].includes(request.pathname));
      expect(pages.map((request) => request.pathname)).toEqual(["/", "/about", "/contact"]);
      expect(pages[1].at - pages[0].at).toBeGreaterThanOrEqual(180);
      expect(pages[2].at - pages[1].at).toBeGreaterThanOrEqual(180);
    } finally {
      await server.close();
    }
  });

  it("warns once when robots Crawl-delay exceeds 30 seconds", async () => {
    const server = await startTestServer({
      "/robots.txt": { status: 200, contentType: "text/plain", body: "User-agent: *\nCrawl-delay: 31.5" },
      "/": leafPage("Home"),
    });
    try {
      const result = await crawlSite(server.baseUrl, defaultOptions({ outputPath: path.join(tempDir, "crawl.md") }));
      expect(result.crawledCount).toBe(1);
      expect(result.warnings).toEqual(["robots.txt Crawl-delay 31.5s capped at 30s."]);
    } finally {
      await server.close();
    }
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

  it("keeps decoded, empty, and plain-text HTML pages when one gzip response is invalid", async () => {
    const server = await startTestServer({
      "/": htmlPage("Home", `<p>HOME BODY</p>
        <a href="/gz">Gzip</a><a href="/br">Brotli</a><a href="/deflate">Deflate</a>
        <a href="/raw-deflate">Raw deflate</a><a href="/x-gzip">X-gzip</a>
        <a href="/empty">Empty</a><a href="/plain">Plain</a>
        <a href="/bad-gzip">Bad gzip</a><a href="/about">About</a>`),
      "/gz": {
        ...htmlPage("Gzip", ""),
        contentEncoding: "gzip",
        body: gzipSync("<p>GZIP BODY</p><a href='/gzip-child'>Child</a>"),
      },
      "/gzip-child": leafPage("GZIP CHILD BODY"),
      "/br": {
        ...htmlPage("Brotli", ""),
        contentEncoding: "br",
        body: brotliCompressSync("<p>BROTLI BODY</p>"),
      },
      "/deflate": {
        ...htmlPage("Deflate", ""),
        contentEncoding: "deflate",
        body: deflateSync("<p>DEFLATE BODY</p>"),
      },
      "/raw-deflate": {
        ...htmlPage("Raw deflate", ""),
        contentEncoding: "deflate",
        body: deflateRawSync("<p>RAW DEFLATE BODY</p>"),
      },
      "/x-gzip": {
        ...htmlPage("X-gzip", ""),
        contentEncoding: "x-gzip",
        body: gzipSync("<p>X-GZIP BODY</p>"),
      },
      "/empty": { status: 200, contentType: "text/html", body: "" },
      "/plain": { status: 200, contentType: "text/html", body: "PLAIN BODY" },
      "/bad-gzip": {
        status: 200,
        contentType: "text/html",
        contentEncoding: "gzip",
        body: Buffer.from("invalid gzip bytes"),
      },
      "/about": leafPage("ABOUT BODY"),
    });
    try {
      const outputPath = path.join(tempDir, "crawl.md");
      const result = await crawlSite(server.baseUrl, defaultOptions({
        minContentWords: 0,
        outputPath,
      }));

      expect(result.outputPath).toBe(outputPath);
      expect(result.crawledCount).toBe(10);
      expect(result.discoveredCount).toBe(10);
      expect(result.discoveredUrls.map((page) => page.url)).toContain(`${server.baseUrl}/empty`);
      expect(result.discoveredUrls.map((page) => page.url)).not.toContain(`${server.baseUrl}/bad-gzip`);
      expect(result.warnings).toEqual([
        `Skipping ${server.baseUrl}/bad-gzip (unsupported or invalid content-encoding: gzip).`,
      ]);
      const output = await fs.readFile(outputPath, "utf8");
      for (const marker of [
        "HOME BODY", "GZIP BODY", "BROTLI BODY", "DEFLATE BODY", "RAW DEFLATE BODY",
        "X-GZIP BODY", "PLAIN BODY", "ABOUT BODY", "GZIP CHILD BODY",
      ]) {
        expect(output).toContain(marker);
      }
      expect(output).toContain(`# Page: ${server.baseUrl}/empty`);
      expect(output).toContain(`# Page: ${server.baseUrl}/about`);
      expect(output).not.toContain(`# Page: ${server.baseUrl}/bad-gzip`);
    } finally {
      await server.close();
    }
  });

  it.each(["br", "deflate", "unknown"])("skips invalid or unsupported %s encoding and keeps other pages", async (encoding) => {
    const server = await startTestServer({
      "/": htmlPage("Home", '<p>HOME BODY</p><a href="/bad">Bad</a><a href="/about">About</a>'),
      "/bad": {
        status: 200,
        contentType: "text/html",
        contentEncoding: encoding,
        body: Buffer.from("invalid encoded body"),
      },
      "/about": leafPage("ABOUT BODY"),
    });
    try {
      const outputPath = path.join(tempDir, "crawl.md");
      const result = await crawlSite(server.baseUrl, defaultOptions({ outputPath }));
      expect(result.crawledCount).toBe(2);
      expect(result.warnings).toEqual([
        `Skipping ${server.baseUrl}/bad (unsupported or invalid content-encoding: ${encoding}).`,
      ]);
      const output = await fs.readFile(outputPath, "utf8");
      expect(output).toContain("HOME BODY");
      expect(output).toContain("ABOUT BODY");
      expect(output).not.toContain(`# Page: ${server.baseUrl}/bad`);
    } finally {
      await server.close();
    }
  });

  it.each([
    { marker: "HANG", reason: "conversion timed out after 200 ms" },
    { marker: "CRASH", reason: "conversion failed: worker exited with code 7" },
    { marker: "ERROR", reason: "conversion failed: synthetic worker error" },
    { marker: "FAIL", reason: "conversion failed: synthetic conversion failure" },
    { marker: "OOM", reason: "conversion failed: Worker terminated due to reaching memory limit: JS heap out of memory" },
  ])("keeps pages around a $marker conversion and replaces the worker", async ({ marker, reason }) => {
    const server = await startTestServer({
      "/": htmlPage("Home", '<p>HOME BODY</p><a href="/before">Before</a><a href="/broken">Broken</a><a href="/after">After</a><a href="/last">Last</a>'),
      "/before": leafPage("BEFORE BODY"),
      "/broken": { status: 200, contentType: "text/html", body: marker },
      "/after": leafPage("AFTER BODY"),
      "/last": leafPage("LAST BODY"),
    });
    try {
      const outputPath = path.join(tempDir, "crawl.jsonl");
      const started = performance.now();
      const result = await crawlSite(server.baseUrl, defaultOptions({
        maxPages: 4,
        outputPath,
        outputMode: "jsonl",
        conversionTimeoutMs: marker === "OOM" ? 2000 : 200,
        conversionWorkerUrl: new URL("./fixtures/controlled-convert-worker.mjs", import.meta.url),
        conversionResourceLimits: { maxOldGenerationSizeMb: 16, maxYoungGenerationSizeMb: 4 },
      }));
      expect(performance.now() - started).toBeLessThan(5000);
      expect(result.crawledCount).toBe(4);
      expect(result.skippedCount).toBe(1);
      expect(result.seedSkipReason).toBeUndefined();
      expect(result.discoveredUrls.map((page) => page.url)).toEqual([
        `${server.baseUrl}/`, `${server.baseUrl}/before`, `${server.baseUrl}/after`, `${server.baseUrl}/last`,
      ]);
      expect(result.warnings).toEqual([`Skipping ${server.baseUrl}/broken (${reason}).`]);
      const records = (await fs.readFile(outputPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
      expect(records.map((record) => record.url)).toEqual(result.discoveredUrls.map((page) => page.url));
      for (const [index, body] of ["HOME BODY", "BEFORE BODY", "AFTER BODY", "LAST BODY"].entries()) {
        expect(records[index].markdown).toContain(body);
      }
      const workerIds = records.map((record) => record.metadata.warnings[0]);
      expect(workerIds[0]).toBe(workerIds[1]);
      expect(workerIds[2]).toBe(workerIds[3]);
      expect(workerIds[2]).not.toBe(workerIds[0]);
      expect(records.map((record) => record.metadata.warnings[1])).toEqual([
        "conversion:1", "conversion:2", "conversion:1", "conversion:2",
      ]);
    } finally {
      await server.close();
    }
  });

  it.each([
    { marker: "HANG", reason: "conversion timed out after 200 ms" },
    { marker: "ERROR", reason: "conversion failed: synthetic worker error" },
    { marker: "CRASH", reason: "conversion failed: worker exited with code 7" },
  ])("reports a $marker conversion failure for the seed", async ({ marker, reason }) => {
    const server = await startTestServer({
      "/": { status: 200, contentType: "text/html", body: marker },
    });
    try {
      const result = await crawlSite(server.baseUrl, defaultOptions({
        conversionTimeoutMs: 200,
        conversionWorkerUrl: new URL("./fixtures/controlled-convert-worker.mjs", import.meta.url),
        conversionResourceLimits: { maxOldGenerationSizeMb: 16, maxYoungGenerationSizeMb: 4 },
      }));
      expect(result.seedSkipReason).toBe(reason);
      expect(result.crawledCount).toBe(0);
      expect(result.skippedCount).toBe(1);
      expect(result.failedFetchCount).toBe(0);
      expect(result.warnings).toEqual([`Skipping ${server.baseUrl}/ (${reason}).`]);
    } finally {
      await server.close();
    }
  });

  it("uses the default 8 MiB cap for raw and gzip responses, accepting exactly the cap", async () => {
    const cap = 8 * 1024 * 1024;
    const prefix = "<p>CAP BODY</p><!--";
    const exact = prefix + "x".repeat(cap - prefix.length - 3) + "-->";
    const overflow = exact + " ";
    const server = await startTestServer({
      "/": htmlPage("Home", '<p>HOME BODY</p><a href="/raw">Raw</a><a href="/gzip">Gzip</a><a href="/exact">Exact</a>'),
      "/raw": { status: 200, contentType: "text/html", body: overflow },
      "/gzip": { status: 200, contentType: "text/html", contentEncoding: "gzip", body: gzipSync(overflow) },
      "/exact": { status: 200, contentType: "text/html", body: exact },
    });
    try {
      const outputPath = path.join(tempDir, "crawl.md");
      const result = await crawlSite(server.baseUrl, defaultOptions({ outputPath }));
      expect(result.crawledCount).toBe(2);
      expect(result.skippedCount).toBe(0);
      expect(result.discoveredUrls.map((page) => page.url)).toEqual([
        `${server.baseUrl}/`, `${server.baseUrl}/exact`,
      ]);
      expect(result.warnings).toEqual([
        `Skipping ${server.baseUrl}/raw (response larger than 8388608 bytes).`,
        `Skipping ${server.baseUrl}/gzip (decoded response larger than 8388608 bytes).`,
      ]);
      expect(await fs.readFile(outputPath, "utf8")).toContain("CAP BODY");
    } finally {
      await server.close();
    }
  });

  it("writes byte-identical mirror files to inline conversion for multiple pages", async () => {
    const routes = { "/": homeWithAboutContact, "/about": leafPage("About"), "/contact": leafPage("Contact") };
    const server = await startTestServer(routes);
    try {
      const result = await crawlSite(server.baseUrl, defaultOptions({ outputMode: "mirror", outputPath: tempDir }));
      expect(result.crawledCount).toBe(3);
      expect(result.skippedCount).toBe(0);
      expect(result.warnings).toEqual([]);
      for (const [route, page] of Object.entries(routes)) {
        const title = route === "/" ? "Home" : route === "/about" ? "About" : "Contact";
        const conversion = await converter.convertToMarkdown(`${title}.html`, page.body);
        const expected = [
          "---", `title: "${title}"`, `url: "${server.baseUrl}${route}"`,
          `depth: ${route === "/" ? 0 : 1}`, `wordCount: ${converter.toWordCount(conversion.markdown)}`,
          "---", "", conversion.markdown, "",
        ].join("\n");
        expect(await fs.readFile(path.join(tempDir, route, "index.md"), "utf8")).toBe(expected);
      }
    } finally {
      await server.close();
    }
  });

  it.each([false, true])("terminates its worker after output (write failure: %s)", async (failWrite) => {
    const server = await startTestServer({ "/": leafPage("Home") });
    const terminate = vi.spyOn(Worker.prototype, "terminate");
    try {
      const blockedPath = path.join(tempDir, "blocked");
      await fs.writeFile(blockedPath, "file blocks directory creation");
      const crawl = crawlSite(server.baseUrl, defaultOptions({
        outputPath: failWrite ? path.join(blockedPath, "crawl.md") : path.join(tempDir, "crawl.md"),
      }));
      if (failWrite) {
        await expect(crawl).rejects.toMatchObject({ code: "EEXIST" });
      } else {
        expect((await crawl).crawledCount).toBe(1);
      }
      expect(terminate).toHaveBeenCalledTimes(1);
      expect(terminate.mock.contexts[0].threadId).toBe(-1);
    } finally {
      terminate.mockRestore();
      await server.close();
    }
  });

  it.each([
    { name: "gzip", contentEncoding: "gzip", encode: gzipSync },
    { name: "Brotli", contentEncoding: "br", encode: brotliCompressSync },
    { name: "zlib deflate", contentEncoding: "deflate", encode: deflateSync },
    { name: "raw deflate", contentEncoding: "deflate", encode: deflateRawSync },
    { name: "stacked gzip/Brotli", contentEncoding: "gzip, br", encode: (body: Buffer) => brotliCompressSync(gzipSync(body)) },
    { name: "uncompressed", contentEncoding: undefined, encode: (body: Buffer) => body },
  ])("bounds $name responses and preserves other pages", async ({ contentEncoding, encode }) => {
    const maxPageBytes = 64 * 1024;
    const body = encode(Buffer.alloc(1 << 20, 0x41));
    const aboutBody = encode(Buffer.from("<p>ABOUT BODY</p>".padEnd(maxPageBytes, " ")));
    if (contentEncoding) expect(body.byteLength).toBeLessThan(maxPageBytes);
    const server = await startTestServer({
      "/": htmlPage("Home", '<p>HOME BODY</p><a href="/bomb">Bomb</a><a href="/about">About</a>'),
      "/bomb": { status: 200, contentType: "text/html", contentEncoding, body },
      "/about": { status: 200, contentType: "text/html", contentEncoding, body: aboutBody },
    });
    try {
      const outputPath = path.join(tempDir, "crawl.md");
      const result = await crawlSite(server.baseUrl, defaultOptions({ maxPageBytes, outputPath }));
      expect(result.crawledCount).toBe(2);
      expect(result.discoveredUrls.map((page) => page.url)).toEqual([
        `${server.baseUrl}/`, `${server.baseUrl}/about`,
      ]);
      const reason = contentEncoding ? "decoded response" : "response";
      expect(result.warnings).toEqual([
        `Skipping ${server.baseUrl}/bomb (${reason} larger than ${maxPageBytes} bytes).`,
      ]);
      const output = await fs.readFile(outputPath, "utf8");
      expect(output).toContain("HOME BODY");
      expect(output).toContain("ABOUT BODY");
      expect(output).not.toContain(`# Page: ${server.baseUrl}/bomb`);
    } finally {
      await server.close();
    }
  });

  it.each([304, 404])("reports HTTP %i before trying to decode an empty gzip body", async (status) => {
    const server = await startTestServer({
      "/": htmlPage("Home", '<p>HOME BODY</p><a href="/bad-status">Bad</a><a href="/about">About</a>'),
      "/bad-status": { status, contentType: "text/html", contentEncoding: "gzip", body: "" },
      "/about": leafPage("ABOUT BODY"),
    });
    try {
      const outputPath = path.join(tempDir, "crawl.md");
      const result = await crawlSite(server.baseUrl, defaultOptions({ outputPath }));
      expect(result.crawledCount).toBe(2);
      expect(result.warnings).toEqual([`Skipping ${server.baseUrl}/bad-status (HTTP ${status}).`]);
      const output = await fs.readFile(outputPath, "utf8");
      expect(output).toContain("HOME BODY");
      expect(output).toContain("ABOUT BODY");
    } finally {
      await server.close();
    }
  });

  it.each([200, 204])("accepts an empty HTTP %i body with a gzip header", async (status) => {
    const server = await startTestServer({
      "/": htmlPage("Home", '<p>HOME BODY</p><a href="/empty">Empty</a>'),
      "/empty": { status, contentType: "text/html", contentEncoding: "gzip", body: "" },
    });
    try {
      const outputPath = path.join(tempDir, "crawl.jsonl");
      const result = await crawlSite(server.baseUrl, defaultOptions({
        minContentWords: 0, outputMode: "jsonl", outputPath,
      }));
      expect(result.crawledCount).toBe(2);
      expect(result.warnings).toEqual([]);
      const records = (await fs.readFile(outputPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
      expect(records.map(({ url, markdown }) => ({ url, markdown }))).toEqual([
        { url: `${server.baseUrl}/`, markdown: "HOME BODY\n\n[Empty](/empty)" },
        { url: `${server.baseUrl}/empty`, markdown: "" },
      ]);
    } finally {
      await server.close();
    }
  });

  it.each(["gzip, br", "identity, GZIP, identity, br"])("decodes %s in reverse order", async (encoding) => {
    const server = await startTestServer({
      "/": htmlPage("Home", '<p>HOME BODY</p><a href="/stacked">Stacked</a>'),
      "/stacked": {
        status: 200,
        contentType: "text/html",
        contentEncoding: encoding,
        body: brotliCompressSync(gzipSync('<p>STACKED BODY</p><a href="/child">Child</a>')),
      },
      "/child": leafPage("STACKED CHILD BODY"),
    });
    try {
      const outputPath = path.join(tempDir, "crawl.md");
      const result = await crawlSite(server.baseUrl, defaultOptions({ outputPath }));
      expect(result.crawledCount).toBe(3);
      expect(result.warnings).toEqual([]);
      const output = await fs.readFile(outputPath, "utf8");
      expect(output).toContain("STACKED BODY");
      expect(output).toContain("STACKED CHILD BODY");
    } finally {
      await server.close();
    }
  });

  it("skips a list containing an unsupported encoding", async () => {
    const server = await startTestServer({
      "/": htmlPage("Home", '<p>HOME BODY</p><a href="/unsupported">Unsupported</a><a href="/about">About</a>'),
      "/unsupported": {
        status: 200,
        contentType: "text/html",
        contentEncoding: "gzip, zstd",
        body: gzipSync("<p>UNSUPPORTED BODY</p>"),
      },
      "/about": leafPage("ABOUT BODY"),
    });
    try {
      const outputPath = path.join(tempDir, "crawl.md");
      const result = await crawlSite(server.baseUrl, defaultOptions({ outputPath }));
      expect(result.crawledCount).toBe(2);
      expect(result.warnings).toEqual([
        `Skipping ${server.baseUrl}/unsupported (unsupported or invalid content-encoding: gzip, zstd).`,
      ]);
      const output = await fs.readFile(outputPath, "utf8");
      expect(output).toContain("ABOUT BODY");
      expect(output).not.toContain("UNSUPPORTED BODY");
    } finally {
      await server.close();
    }
  });

  it("keeps other pages when UTF-8 decoding unexpectedly throws", async () => {
    const body = Buffer.from("<p>SYNTHETIC READ FAILURE</p>");
    const server = await startTestServer({
      "/": htmlPage("Home", '<p>HOME BODY</p><a href="/broken">Broken</a><a href="/about">About</a>'),
      "/broken": { status: 200, contentType: "text/html", body },
      "/about": leafPage("ABOUT BODY"),
    });
    const originalToString = Buffer.prototype.toString;
    const decode = vi.spyOn(Buffer.prototype, "toString").mockImplementation(function (encoding, start, end) {
      if (encoding === "utf8" && this.equals(body)) throw new Error("synthetic UTF-8 failure");
      return originalToString.call(this, encoding, start, end);
    });
    try {
      const outputPath = path.join(tempDir, "crawl.md");
      const result = await crawlSite(server.baseUrl, defaultOptions({ outputPath }));
      expect(result.crawledCount).toBe(2);
      expect(result.warnings).toEqual([
        `Skipping ${server.baseUrl}/broken (response could not be read: synthetic UTF-8 failure).`,
      ]);
      const output = await fs.readFile(outputPath, "utf8");
      expect(output).toContain("HOME BODY");
      expect(output).toContain("ABOUT BODY");
      expect(output).not.toContain(`# Page: ${server.baseUrl}/broken`);
    } finally {
      decode.mockRestore();
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
    const workerListeners = vi.spyOn(Worker.prototype, "on");
    try {
      const mapPath = path.join(tempDir, "urls.txt");
      const result = await crawlSite(server.baseUrl, {
        ...defaultOptions({
          mapOnly: true,
          conversionWorkerUrl: new URL("https://127.0.0.1/unused-worker.js"),
        }),
        outputPath: mapPath,
      });

      expect(result.mode).toBe("map");
      expect(workerListeners).not.toHaveBeenCalled();
      expect(result.skippedCount).toBe(0);
      expect(result.warnings).toEqual([]);
      expect(result.discoveredUrls.map((page) => page.url)).toEqual([
        `${server.baseUrl}/`, `${server.baseUrl}/about`, `${server.baseUrl}/contact`,
      ]);
      expect(result.crawledCount).toBe(0);
      expect(result.discoveredCount).toBeGreaterThanOrEqual(1);
      const mapBody = await fs.readFile(mapPath, "utf8");
      expect(mapBody).toContain(server.baseUrl);
      expect(mapBody).not.toContain("# Page:");
      await expect(fs.stat(path.join(tempDir, "crawl.md"))).rejects.toThrow();
    } finally {
      workerListeners.mockRestore();
      await server.close();
    }
  });

  it.each([
    { name: "HTTP 404", status: 404 },
    { name: "HTTP 500", status: 500 },
  ])("counts a failed $name seed fetch", async ({ status }) => {
    const server = await startTestServer({
      "/": { status, contentType: "text/plain", body: "failed" },
    });
    try {
      const result = await crawlSite(server.baseUrl, {
        ...defaultOptions(),
        maxDepth: 0,
        outputPath: path.join(tempDir, "failed.md"),
      });

      expect(result.crawledCount).toBe(0);
      expect(result.failedFetchCount).toBe(1);
    } finally {
      await server.close();
    }
  });

  it("reports when the seed is skipped for a non-HTML response", async () => {
    const server = await startTestServer({
      "/": { status: 200, contentType: "application/json", body: "{}" },
    });
    try {
      const result = await crawlSite(server.baseUrl, {
        ...defaultOptions(),
        maxDepth: 0,
        outputPath: path.join(tempDir, "non-html.md"),
      });

      expect(result.crawledCount).toBe(0);
      expect(result.seedSkipReason).toBe("non-HTML content type: application/json");
    } finally {
      await server.close();
    }
  });

  it.each([
    {
      name: "an oversized body",
      route: (): Route => ({
        status: 200,
        contentType: "text/html",
        body: "<p>" + "x".repeat(9 * 1024 * 1024) + "</p>",
      }),
      reason: "response larger than 8388608 bytes",
    },
    {
      name: "an invalid gzip body",
      route: (): Route => ({
        status: 200,
        contentType: "text/html",
        contentEncoding: "gzip",
        body: Buffer.from("not gzip"),
      }),
      reason: "unsupported or invalid content-encoding: gzip",
    },
    {
      name: "an unsupported content encoding",
      route: (): Route => ({
        status: 200,
        contentType: "text/html",
        contentEncoding: "zstd-bogus",
        body: "<p>body</p>",
      }),
      reason: "unsupported or invalid content-encoding: zstd-bogus",
    },
  ])("counts $name as a skipped seed, not a failed fetch", async ({ route, reason }) => {
    const server = await startTestServer({ "/": route() });
    try {
      const result = await crawlSite(server.baseUrl, defaultOptions({ maxDepth: 0 }));

      expect(result.seedSkipReason).toContain(reason);
      expect(result.skippedCount).toBe(1);
      expect(result.failedFetchCount).toBe(0);
      expect(result.crawledCount).toBe(0);
    } finally {
      await server.close();
    }
  });

  it("keeps a normal seed when child fetches fail", async () => {
    const server = await startTestServer({
      "/": htmlPage("Home", '<p>HOME BODY</p><a href="/oversize">Oversize</a><a href="/bad-gzip">Bad gzip</a><a href="/zstd">Zstd</a>'),
      "/oversize": {
        status: 200,
        contentType: "text/html",
        body: "<p>" + "x".repeat(9 * 1024 * 1024) + "</p>",
      },
      "/bad-gzip": {
        status: 200,
        contentType: "text/html",
        contentEncoding: "gzip",
        body: Buffer.from("not gzip"),
      },
      "/zstd": {
        status: 200,
        contentType: "text/html",
        contentEncoding: "zstd-bogus",
        body: "<p>body</p>",
      },
    });
    try {
      const result = await crawlSite(server.baseUrl, defaultOptions({ maxDepth: 1 }));

      expect(result.crawledCount).toBe(1);
      expect(result.skippedCount).toBe(0);
      expect(result.failedFetchCount).toBe(0);
      expect(result.seedSkipReason).toBeUndefined();
      expect(result.warnings).toEqual([
        `Skipping ${server.baseUrl}/oversize (response larger than 8388608 bytes).`,
        `Skipping ${server.baseUrl}/bad-gzip (unsupported or invalid content-encoding: gzip).`,
        `Skipping ${server.baseUrl}/zstd (unsupported or invalid content-encoding: zstd-bogus).`,
      ]);
    } finally {
      await server.close();
    }
  });

  it("stops on a connection-refused robots.txt without counting a page fetch", async () => {
    const server = await startTestServer({ "/": leafPage("Temporary") });
    const closedUrl = server.baseUrl;
    await server.close();

    const result = await crawlSite(closedUrl, {
      ...defaultOptions(),
      maxDepth: 0,
      outputPath: path.join(tempDir, "refused.md"),
    });

    expect(result.crawledCount).toBe(0);
    // With robots.txt support the refused connection is seen on robots.txt first (RFC 9309: unreachable means complete disallow).
    expect(result.robotsUnavailable).toMatchObject({ origin: new URL(closedUrl).origin, kind: "error" });
    expect(result.failedFetchCount).toBe(0);
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

  it("crawls the seed before sitemap URLs when maxPages is one", async () => {
    const server = await startSitemapTestServer();
    try {
      const result = await crawlSite(`${server.baseUrl}/depth/1`, {
        ...defaultOptions({ maxPages: 1, maxDepth: 0 }),
        outputPath: path.join(tempDir, "crawl.md"),
      });

      expect(result.discoveredUrls).toEqual([
        expect.objectContaining({
          url: `${server.baseUrl}/depth/1`,
          source: "seed",
          depth: 0,
        }),
      ]);
    } finally {
      await server.close();
    }
  });

  it("keeps the seed first when sitemap URLs are also crawled", async () => {
    const server = await startSitemapTestServer();
    try {
      const result = await crawlSite(`${server.baseUrl}/depth/1`, {
        ...defaultOptions({ maxDepth: 0 }),
        outputPath: path.join(tempDir, "crawl.md"),
      });

      expect(result.discoveredUrls.map((entry) => [entry.url, entry.source])).toEqual([
        [`${server.baseUrl}/depth/1`, "seed"],
        [`${server.baseUrl}/sm-only`, "sitemap"],
        [`${server.baseUrl}/about`, "sitemap"],
      ]);
    } finally {
      await server.close();
    }
  });

  it("lists the seed first in map mode", async () => {
    const server = await startSitemapTestServer();
    try {
      const result = await crawlSite(`${server.baseUrl}/depth/1`, {
        ...defaultOptions({ mapOnly: true, maxPages: 1, maxDepth: 0 }),
        outputPath: path.join(tempDir, "urls.txt"),
      });

      expect(result.discoveredUrls[0]).toEqual(
        expect.objectContaining({
          url: `${server.baseUrl}/depth/1`,
          source: "seed",
        }),
      );
    } finally {
      await server.close();
    }
  });

  it("crawls seed links before sitemap roots", async () => {
    const server = await startCustomSitemapTestServer(
      ["/3.11", "/3.12", "/3.13", "/3.14", "/3.15"],
      {
        "/3/library": htmlPage(
          "Library",
          `<a href="/3/library/os.html">OS</a><a href="/3/library/sys.html">Sys</a><a href="/3/library/re.html">RE</a><a href="/3/library/json.html">JSON</a><a href="/3/tutorial/index.html">Tutorial</a>`,
        ),
        "/3/library/": htmlPage(
          "Library",
          `<a href="/3/library/os.html">OS</a><a href="/3/library/sys.html">Sys</a><a href="/3/library/re.html">RE</a><a href="/3/library/json.html">JSON</a><a href="/3/tutorial/index.html">Tutorial</a>`,
        ),
        "/3/library/os.html": leafPage("OS"),
        "/3/library/sys.html": leafPage("Sys"),
        "/3/library/re.html": leafPage("RE"),
        "/3/library/json.html": leafPage("JSON"),
        "/3/tutorial/index.html": leafPage("Tutorial"),
        "/3.11": leafPage("3.11"),
        "/3.12": leafPage("3.12"),
        "/3.13": leafPage("3.13"),
        "/3.14": leafPage("3.14"),
        "/3.15": leafPage("3.15"),
      },
    );
    try {
      const result = await crawlSite(`${server.baseUrl}/3/library/`, {
        ...defaultOptions({ mapOnly: true, maxDepth: 1, maxPages: 5 }),
        outputPath: path.join(tempDir, "urls.txt"),
      });

      expect(result.discoveredUrls.map((entry) => entry.url)).toEqual([
        `${server.baseUrl}/3/library`,
        `${server.baseUrl}/3/library/os.html`,
        `${server.baseUrl}/3/library/sys.html`,
        `${server.baseUrl}/3/library/re.html`,
        `${server.baseUrl}/3/library/json.html`,
      ]);
    } finally {
      await server.close();
    }
  });

  it("keeps breadth-first links ahead of sitemap URLs", async () => {
    const server = await startCustomSitemapTestServer(
      ["/sm1", "/sm2"],
      {
        "/seed": htmlPage("Seed", `<a href="/l1">L1</a><a href="/l2">L2</a>`),
        "/l1": leafPage("L1"),
        "/l2": leafPage("L2"),
        "/sm1": leafPage("SM1"),
        "/sm2": leafPage("SM2"),
      },
    );
    try {
      const limited = await crawlSite(`${server.baseUrl}/seed`, {
        ...defaultOptions({ maxPages: 2 }),
        outputPath: path.join(tempDir, "limited.md"),
      });
      expect(limited.discoveredUrls.map((entry) => entry.url)).toEqual([
        `${server.baseUrl}/seed`,
        `${server.baseUrl}/l1`,
      ]);

      const complete = await crawlSite(`${server.baseUrl}/seed`, {
        ...defaultOptions(),
        outputPath: path.join(tempDir, "complete.md"),
      });
      expect(complete.discoveredUrls.map((entry) => entry.url)).toEqual([
        `${server.baseUrl}/seed`,
        `${server.baseUrl}/l1`,
        `${server.baseUrl}/l2`,
        `${server.baseUrl}/sm1`,
        `${server.baseUrl}/sm2`,
      ]);
    } finally {
      await server.close();
    }
  });

  it("promotes a linked sitemap URL without fetching it twice", async () => {
    let l1Requests = 0;
    const server = await startCustomSitemapTestServer(
      ["/sm1", "/l1"],
      {
        "/seed": htmlPage("Seed", `<a href="/l1">L1</a>`),
        "/l1": leafPage("L1"),
        "/sm1": leafPage("SM1"),
      },
      (pathname) => {
        if (pathname === "/l1") l1Requests += 1;
      },
    );
    try {
      const result = await crawlSite(`${server.baseUrl}/seed`, {
        ...defaultOptions(),
        outputPath: path.join(tempDir, "promotion.md"),
      });

      expect(result.discoveredUrls.map((entry) => entry.url)).toEqual([
        `${server.baseUrl}/seed`,
        `${server.baseUrl}/l1`,
        `${server.baseUrl}/sm1`,
      ]);
      expect(l1Requests).toBe(1);
      expect(result.discoveredUrls[1].source).toBe("sitemap");
      expect(result.discoveredUrls[1].depth).toBe(0);
    } finally {
      await server.close();
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

  it("keeps meaningful query parameters, strips tracking parameters, and deduplicates sorted queries", async () => {
    const requests: string[] = [];
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      requests.push(url.pathname + url.search);
      res.statusCode = 200;
      res.setHeader("content-type", "text/html; charset=utf-8");
      if (url.pathname === "/") {
        res.end(htmlPage("Home", `<a href="/q?page=1">one</a><a href="/q?page=2">two</a><a href="/utm?utm_source=x&amp;z=1">tracking</a><a href="/p?b=2&a=1">p1</a><a href="/p?b=2&amp;a=1">p2</a><a href="/p?b=2&#38;a=1">p3</a><a href="/p?b=2&#x26;a=1">p4</a><a href="/a&quot;b">quote</a><a href="/edge/&#38;amp;x">edge</a><a href="/big/&#99999999;x">big</a>`).body);
        return;
      }
      if (url.pathname === "/q" || url.pathname === "/p" || url.pathname === "/utm") {
        res.end(htmlPage(url.pathname, `<h1>${url.pathname}</h1><p>QUERY PAGE ${url.searchParams.get("page") ?? "null"}</p>`).body);
        return;
      }
      res.statusCode = 404;
      res.end("not found");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const outputPath = path.join(tempDir, "crawl.md");
      const result = await crawlSite(`http://127.0.0.1:${port}`, {
        ...defaultOptions(),
        outputPath,
      });
      const output = await fs.readFile(outputPath, "utf8");
      expect(requests).toContain("/q?page=1");
      expect(requests).toContain("/q?page=2");
      expect(requests).toContain("/utm?z=1");
      expect(requests.some((request) => request.includes("utm_source") || /[?&]amp%3B/.test(request))).toBe(false);
      expect(requests.filter((request) => request.startsWith("/p?")).length).toBe(1);
      expect(requests.filter((request) => request === "/p?a=1&b=2").length).toBe(1);
      expect(requests).toContain("/a%22b");
      // Entities decode once (&#38;amp; -> literal "&amp;"); an out-of-range code point stays literal (no throw).
      expect(requests).toContain("/edge/&amp;x");
      expect(requests).toContain("/big/&");
      expect(result.discoveredUrls.map((entry) => entry.url)).toContain(`http://127.0.0.1:${port}/q?page=1`);
      expect(result.discoveredUrls.map((entry) => entry.url)).toContain(`http://127.0.0.1:${port}/q?page=2`);
      expect(output).toContain("QUERY PAGE 1");
      expect(output).toContain("QUERY PAGE 2");
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  it("keeps query seed values at maxDepth zero and separates query mirror files", async () => {
    const server = await startTestServer({
      "/q": { status: 200, contentType: "text/html; charset=utf-8", body: (url) => htmlPage("Query", `<p>QUERY PAGE ${url.searchParams.get("page")}</p>`).body },
      "/plain": leafPage("Plain"),
    });
    try {
      const outputDir = path.join(tempDir, "mirror");
      const result = await crawlSite(`${server.baseUrl}/q?page=7`, {
        ...defaultOptions({ maxDepth: 0, outputMode: "mirror" }),
        outputPath: outputDir,
      });
      expect(result.startUrl).toBe(`${server.baseUrl}/q?page=7`);
      const page7File = (await fs.readdir(outputDir)).find((file) => /^q__page-7__[0-9a-f]{8}\.md$/.test(file));
      expect(page7File).toMatch(/^q__page-7__[0-9a-f]{8}\.md$/);
      expect(await fs.readFile(path.join(outputDir, page7File ?? ""), "utf8")).toContain("QUERY PAGE 7");

      await crawlSite(`${server.baseUrl}/q?page=1`, {
        ...defaultOptions({ maxDepth: 0, outputMode: "mirror" }),
        outputPath: outputDir,
      });
      await crawlSite(`${server.baseUrl}/q?page=2`, {
        ...defaultOptions({ maxDepth: 0, outputMode: "mirror" }),
        outputPath: outputDir,
      });
      const page1File = (await fs.readdir(outputDir)).find((file) => /^q__page-1__[0-9a-f]{8}\.md$/.test(file));
      const page2File = (await fs.readdir(outputDir)).find((file) => /^q__page-2__[0-9a-f]{8}\.md$/.test(file));
      expect(await fs.readFile(path.join(outputDir, page1File ?? ""), "utf8")).toContain("QUERY PAGE 1");
      expect(await fs.readFile(path.join(outputDir, page2File ?? ""), "utf8")).toContain("QUERY PAGE 2");

      for (const url of [
        `${server.baseUrl}/q?a=1&b=2`,
        `${server.baseUrl}/q?a=1-b-2`,
        `${server.baseUrl}/page.html?v=1`,
        `${server.baseUrl}/page.htm?v=1`,
        `${server.baseUrl}/q?x=A`,
        `${server.baseUrl}/q?x=a`,
      ]) {
        await crawlSite(url, {
          ...defaultOptions({ maxDepth: 0, outputMode: "mirror" }),
          outputPath: outputDir,
        });
      }
      const mirrorFiles = (await fs.readdir(outputDir, { recursive: true })).filter(
        (entry): entry is string => typeof entry === "string" && entry.endsWith(".md"),
      );
      expect(new Set(mirrorFiles.map((file) => file.toLowerCase())).size).toBe(mirrorFiles.length);

      await crawlSite(`${server.baseUrl}/plain`, {
        ...defaultOptions({ maxDepth: 0, outputMode: "mirror" }),
        outputPath: outputDir,
      });
      expect((await fs.stat(path.join(outputDir, "plain", "index.md"))).isFile()).toBe(true);
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
      expect(server.requests.map(({ pathname }) => pathname)).not.toContain("/a.html");
      expect(server.requests.map(({ pathname }) => pathname)).not.toContain("/b.html");
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
      expect(server.requests.map(({ pathname }) => pathname)).not.toContain("/a.html");
      expect(server.requests.map(({ pathname }) => pathname)).not.toContain("/b.html");
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
