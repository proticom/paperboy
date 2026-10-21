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
  body: string | Buffer;
};

async function startTestServer(
  routes: Record<string, Route>,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
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
    res.end(route.body);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
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
        conversionTimeoutMs: 200,
        conversionWorkerUrl: new URL("./fixtures/controlled-convert-worker.mjs", import.meta.url),
      }));
      expect(performance.now() - started).toBeLessThan(5000);
      expect(result.crawledCount).toBe(4);
      expect(result.skippedCount).toBe(1);
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
});
