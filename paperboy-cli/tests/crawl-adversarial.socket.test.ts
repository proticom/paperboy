import http from "node:http";
import { performance } from "node:perf_hooks";
import { gunzipSync, gzipSync } from "node:zlib";
import { expect, it } from "vitest";

import { crawlSite } from "../src/crawl.ts";

it("keeps both normal pages around gzip-stored adversarial title and link pages", async () => {
  const compressedPages = new Map([
    ["/bad-title", gzipSync("<title>".repeat(Math.ceil(2 ** 20 / 7)).slice(0, 2 ** 20))],
    ["/bad-links", gzipSync("<a ".repeat(Math.ceil(2 ** 20 / 3)).slice(0, 2 ** 20))],
  ]);
  for (const body of compressedPages.values()) expect(body.length).toBeLessThan(4096);
  const normalPages = new Map([
    ["/", '<title>First normal page</title><a href=/bad-title>Title</a><a href=/bad-links>Links</a><a href=/last>Last</a>'],
    ["/last", "<title>Last normal page</title><p>Normal content.</p>"],
  ]);
  const requestedEncodings: Array<string | string[] | undefined> = [];
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    const compressed = compressedPages.get(pathname);
    const normal = normalPages.get(pathname);
    if (!compressed && normal === undefined) {
      res.writeHead(404);
      res.end();
      return;
    }
    requestedEncodings.push(req.headers["accept-encoding"]);
    res.setHeader("content-type", "text/html; charset=utf-8");
    // The crawler requests identity and does not decode gzip on the wire.
    res.end(compressed ? gunzipSync(compressed) : normal);
  });

  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server port");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const start = performance.now();
    const result = await crawlSite(baseUrl, {
      maxPages: 4,
      maxDepth: 5,
      minContentWords: 1,
      outputMode: "single",
      json: false,
      mapOnly: true,
      rateLimitMs: 0,
      timeoutMs: 1000,
      maxSitemaps: 5,
      userAgent: "paperboy-cli-test/0.0.0",
    });
    const elapsed = performance.now() - start;
    expect(result.discoveredUrls.map(({ url, title, status }) => ({
      path: new URL(url).pathname, title, status,
    }))).toEqual([
      { path: "/", title: "First normal page", status: 200 },
      { path: "/bad-title", title: "bad-title", status: 200 },
      { path: "/bad-links", title: "bad-links", status: 200 },
      { path: "/last", title: "Last normal page", status: 200 },
    ]);
    expect(result.discoveredCount).toBe(4);
    expect(result.warnings).toEqual([]);
    expect(requestedEncodings).toEqual(["identity", "identity", "identity", "identity"]);
    expect(elapsed).toBeLessThan(2000);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});
