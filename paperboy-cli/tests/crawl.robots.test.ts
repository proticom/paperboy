import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpFixture, type HttpRoute } from "./helpers/http-fixture.ts";
import { crawlSite, fetchText, type CrawlOptions } from "../src/crawl.ts";

const transport = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("node:http", () => ({ default: transport }));
vi.mock("node:https", () => ({ default: transport }));

const origin = "http://127.0.0.1:12345";
const otherOrigin = "http://localhost:23456";
const response = (body: string, status = 200): HttpRoute => ({ kind: "response", status, body });
const page = (body: string) => response(`<html><head><title>Public</title></head><body><h1>Public page</h1><p>Some public content.</p>${body}</body></html>`);
let tempDir: string;
let options: CrawlOptions;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperboy-robots-"));
  options = {
    maxPages: 10, maxDepth: 1, minContentWords: 1, outputMode: "mirror",
    outputPath: path.join(tempDir, "output"), json: false, mapOnly: false,
    rateLimitMs: 0, timeoutMs: 100, maxSitemaps: 5, userAgent: "paperboy/test",
  };
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  transport.request.mockReset();
  await fs.rm(tempDir, { recursive: true, force: true });
});

function install(routes: Record<string, HttpRoute>) {
  const fixture = createHttpFixture(routes);
  transport.request.mockImplementation(fixture.request);
  return fixture;
}

describe("crawl robots enforcement without sockets", () => {
  it.each([false, true])("uses the target origin robots for cross-origin redirects (mapOnly=%s)", async (mapOnly) => {
    const fixture = install({
      [`${origin}/robots.txt`]: response("User-agent: *\nAllow: /wild/y"),
      [`${otherOrigin}/robots.txt`]: response("User-agent: *\nDisallow: /"),
      "/": page('<a href="/offhost2">Other host</a>'),
      "/offhost2": { kind: "response", status: 302, location: `${otherOrigin}/wild/y`, body: "" },
      [`${otherOrigin}/wild/y`]: page("Private"),
    });
    const result = await crawlSite(origin, { ...options, mapOnly });
    expect(fixture.requests.map(({ url }) => url)).toEqual([
      `${origin}/robots.txt`, `${origin}/sitemap.xml`, `${origin}/`, `${origin}/offhost2`, `${otherOrigin}/robots.txt`,
    ]);
    expect(result.discoveredUrls.map(({ url }) => url)).toEqual([`${origin}/`]);
    expect(result.robotsUnavailableOrigins).toEqual([]);
    expect(result.warnings).toEqual([`Skipping ${origin}/offhost2 (redirect to ${otherOrigin}/wild/y disallowed by robots.txt).`]);
    if (mapOnly) expect(await fs.readFile(options.outputPath!, "utf8")).toBe(`${origin}/\n`);
    else expect(await fs.readdir(options.outputPath!)).toEqual(["index.md"]);
  });

  it.each([200, 404])("fetches and saves allowed cross-origin targets with robots HTTP %s", async (status) => {
    const fixture = install({
      [`${origin}/robots.txt`]: response("User-agent: *\nDisallow: /wild"),
      [`${otherOrigin}/robots.txt`]: response(status === 200 ? "User-agent: paperboy\nAllow: /wild" : "User-agent: *\nDisallow: /", status),
      "/": page('<a href="/offhost2">Other host</a>'),
      "/offhost2": { kind: "response", status: 302, location: `${otherOrigin}/wild/y`, body: "" },
      [`${otherOrigin}/wild/y`]: page("External allowed content"),
    });
    const result = await crawlSite(origin, options);
    expect(fixture.requests.map(({ url }) => url)).toEqual([
      `${origin}/robots.txt`, `${origin}/sitemap.xml`, `${origin}/`, `${origin}/offhost2`, `${otherOrigin}/robots.txt`, `${otherOrigin}/wild/y`,
    ]);
    expect(result.crawledCount).toBe(2);
    expect(result.warnings).toEqual([]);
    expect(await fs.readFile(path.join(options.outputPath!, "offhost2/index.md"), "utf8")).toContain("External allowed content");
  });

  it.each([
    { route: response("", 503), failure: { kind: "http", status: 503 }, reason: "HTTP 503" },
    { route: response("", 429), failure: { kind: "http", status: 429 }, reason: "HTTP 429" },
    { route: { kind: "error", message: "ECONNRESET" }, failure: { kind: "error", error: "ECONNRESET" }, reason: "ECONNRESET" },
    { route: { kind: "timeout" }, failure: { kind: "error", error: "Request timed out" }, reason: "Request timed out" },
    { route: { kind: "response", status: 302, location: `${otherOrigin}/robots.txt`, body: "" }, failure: { kind: "error", error: "Too many redirects" }, reason: "Too many redirects" },
  ] satisfies Array<{ route: HttpRoute; failure: { kind: "http"; status: number } | { kind: "error"; error: string }; reason: string }>)("skips unavailable target robots and continues ($reason)", async ({ route, failure, reason }) => {
    const fixture = install({
      [`${origin}/robots.txt`]: response(""), [`${otherOrigin}/robots.txt`]: route,
      "/": page('<a href="/offhost2">Other host</a><a href="/next">Next</a><a href="/offhost3">Same other host</a>'),
      "/offhost2": { kind: "response", status: 302, location: `${otherOrigin}/wild/y`, body: "" },
      "/offhost3": { kind: "response", status: 302, location: `${otherOrigin}/wild/z`, body: "" },
      "/next": page("Continued page"),
    });
    const result = await crawlSite(origin, options);
    expect(result.robotsUnavailable).toBeNull();
    expect(result.robotsUnavailableOrigins).toEqual([{ origin: otherOrigin, ...failure }]);
    expect(result.discoveredUrls.map(({ url }) => url)).toEqual([`${origin}/`, `${origin}/next`]);
    expect(result.crawledCount).toBe(2);
    expect(fixture.requests.filter(({ url }) => new URL(url).origin === otherOrigin).map(({ url }) => url)).toEqual(
      Array(reason === "Too many redirects" ? 6 : 1).fill(`${otherOrigin}/robots.txt`),
    );
    expect(result.warnings).toEqual(["offhost2", "offhost3"].map((link, index) =>
      `Skipping ${origin}/${link} (redirect to ${otherOrigin}/wild/${index === 0 ? "y" : "z"}: robots.txt for ${otherOrigin} unavailable (${reason}); treated as disallowed per RFC 9309).`,
    ));
    expect(await fs.readFile(path.join(options.outputPath!, "next/index.md"), "utf8")).toContain("Continued page");
  });

  it("caches the target policy across links and later hops, and reuses the seed policy on return", async () => {
    const fixture = install({
      [`${origin}/robots.txt`]: response("User-agent: *\nDisallow: /seed-private"),
      [`${otherOrigin}/robots.txt`]: response("User-agent: *\nDisallow: /private"),
      "/": page('<a href="/offhost2">One</a><a href="/offhost3">Two</a><a href="/back">Return</a>'),
      "/offhost2": { kind: "response", status: 302, location: `${otherOrigin}/hop`, body: "" },
      [`${otherOrigin}/hop`]: { kind: "response", status: 302, location: "/private/secret", body: "" },
      "/offhost3": { kind: "response", status: 302, location: `${otherOrigin}/public`, body: "" },
      [`${otherOrigin}/public`]: page("Public target"),
      "/back": { kind: "response", status: 302, location: `${otherOrigin}/return`, body: "" },
      [`${otherOrigin}/return`]: { kind: "response", status: 302, location: `${origin}/seed-private`, body: "" },
    });
    const result = await crawlSite(origin, options);
    expect(fixture.requests.map(({ url }) => url)).toEqual([
      `${origin}/robots.txt`, `${origin}/sitemap.xml`, `${origin}/`, `${origin}/offhost2`, `${otherOrigin}/robots.txt`,
      `${otherOrigin}/hop`, `${origin}/offhost3`, `${otherOrigin}/public`, `${origin}/back`, `${otherOrigin}/return`,
    ]);
    expect(result.crawledCount).toBe(2);
    expect(result.warnings).toEqual([
      `Skipping ${origin}/offhost2 (redirect to ${otherOrigin}/private/secret disallowed by robots.txt).`,
      `Skipping ${origin}/back (redirect to ${origin}/seed-private disallowed by robots.txt).`,
    ]);
  });

  it.each([false, true])("applies target rules to sitemap redirects and page redirects (mapOnly=%s)", async (mapOnly) => {
    const fixture = install({
      [`${origin}/robots.txt`]: response(""), [`${otherOrigin}/robots.txt`]: response("User-agent: *\nDisallow: /"),
      "/sitemap.xml": { kind: "response", status: 302, location: `${otherOrigin}/map.xml`, body: "" },
      "/": page('<a href="/offhost2">Other host</a>'),
      "/offhost2": { kind: "response", status: 302, location: `${otherOrigin}/wild/y`, body: "" },
    });
    const result = await crawlSite(origin, { ...options, mapOnly });
    expect(fixture.requests.map(({ url }) => url)).toEqual([
      `${origin}/robots.txt`, `${origin}/sitemap.xml`, `${otherOrigin}/robots.txt`, `${origin}/`, `${origin}/offhost2`,
    ]);
    expect(result.warnings).toEqual([
      `Skipping ${origin}/sitemap.xml (redirect to ${otherOrigin}/map.xml disallowed by robots.txt).`,
      `Skipping ${origin}/offhost2 (redirect to ${otherOrigin}/wild/y disallowed by robots.txt).`,
    ]);
  });

  it.each(["/admin/", "/admin$", "/caf%C3%A9", "/enc%7Ejoe"])("uses target original/normalized forms and percent encoding (%s)", async (rule) => {
    const target = rule.startsWith("/admin") ? "/admin/" : rule === "/caf%C3%A9" ? "/café" : "/enc~joe";
    const fixture = install({
      [`${origin}/robots.txt`]: response(""),
      [`${otherOrigin}/robots.txt`]: response(`User-agent: paper\nAllow: /\nUser-agent: PAPERBOY\nDisallow: ${rule}`),
      "/": page('<a href="/offhost2">Other</a>'),
      "/offhost2": { kind: "response", status: 302, location: `${otherOrigin}${target}`, body: "" },
    });
    const result = await crawlSite(origin, options);
    expect(fixture.requests.filter(({ url }) => new URL(url).origin === otherOrigin).map(({ url }) => url)).toEqual([`${otherOrigin}/robots.txt`]);
    expect(result.warnings).toEqual([`Skipping ${origin}/offhost2 (redirect to ${new URL(target, otherOrigin)} disallowed by robots.txt).`]);
  });

  it("treats schemes on the same host and port as different origins", async () => {
    const httpsOrigin = origin.replace("http:", "https:");
    const fixture = install({
      [`${origin}/robots.txt`]: response(""), [`${httpsOrigin}/robots.txt`]: response("User-agent: *\nDisallow: /"),
      "/": page('<a href="/offhost2">HTTPS</a>'),
      "/offhost2": { kind: "response", status: 302, location: `${httpsOrigin}/wild/y`, body: "" },
    });
    const result = await crawlSite(origin, options);
    expect(fixture.requests.filter(({ url }) => new URL(url).origin === httpsOrigin).map(({ url }) => url)).toEqual([`${httpsOrigin}/robots.txt`]);
    expect(result.warnings).toEqual([`Skipping ${origin}/offhost2 (redirect to ${httpsOrigin}/wild/y disallowed by robots.txt).`]);
  });

  it.each([false, true])("stops without output if the seed redirects to unavailable robots (mapOnly=%s)", async (mapOnly) => {
    const fixture = install({
      [`${origin}/robots.txt`]: response(""), [`${otherOrigin}/robots.txt`]: response("", 503),
      "/sitemap.xml": response(`<urlset><url><loc>${origin}/</loc></url></urlset>`),
      "/": { kind: "response", status: 302, location: `${otherOrigin}/wild/y`, body: "" },
    });
    const result = await crawlSite(origin, { ...options, mapOnly });
    expect(fixture.requests.map(({ url }) => url)).toEqual([`${origin}/robots.txt`, `${origin}/sitemap.xml`, `${origin}/`, `${otherOrigin}/robots.txt`]);
    expect(result.robotsUnavailable).toEqual({ origin: otherOrigin, kind: "http", status: 503 });
    expect(result.crawledCount).toBe(0);
    expect(result.outputPath).toBeNull();
    expect(await fs.readdir(tempDir)).toEqual([]);
  });

  it("caps other-origin robots while streaming and ignores its Crawl-delay", async () => {
    let producedBytes = 0;
    function* body() {
      const prefix = Buffer.from("User-agent: paperboy\nAllow: /wild\nCrawl-delay: 60\n#");
      producedBytes += prefix.length;
      yield prefix;
      for (let index = 0; index < 12800; index += 1) {
        producedBytes += 4096;
        yield Buffer.alloc(4096, "x");
      }
      yield Buffer.from("\nDisallow: /");
    }
    const fixture = install({
      [`${origin}/robots.txt`]: response(""), [`${otherOrigin}/robots.txt`]: { kind: "response", status: 200, body: body() },
      "/": page('<a href="/offhost2">Other</a><a href="/next">Next</a>'),
      "/offhost2": { kind: "response", status: 302, location: `${otherOrigin}/wild/y`, body: "" },
      [`${otherOrigin}/wild/y`]: page("Allowed"), "/next": page("Next"),
    });
    const result = await crawlSite(origin, options);
    expect(result.crawledCount).toBe(3);
    expect(result.warnings).toEqual([]);
    expect(producedBytes).toBeLessThanOrEqual(500 * 1024 + 8192);
    expect(fixture.responses[4].destroyed).toBe(true);
    expect(fixture.requests.filter(({ url }) => url === `${otherOrigin}/robots.txt`)).toHaveLength(1);
  });

  it.each([
    { mapOnly: false, rule: "/private", target: "/private/secret" },
    { mapOnly: true, rule: "/private", target: "/private/secret" },
    { mapOnly: false, rule: "/admin$", target: "/admin/" },
    { mapOnly: true, rule: "/admin$", target: "/admin/" },
    { mapOnly: false, rule: "/admin/", target: "/admin/" },
    { mapOnly: true, rule: "/admin/", target: "/admin/" },
  ])("blocks disallowed targets at every redirect hop ($target, mapOnly=$mapOnly)", async ({ mapOnly, rule, target }) => {
    const fixture = install({
      "/robots.txt": response(`User-agent: *\nDisallow: ${rule}`),
      "/": page('<a href="/redir-private">Redirect</a>'),
      "/redir-private": { kind: "response", status: 302, location: "/hop", body: "" },
      "/hop": { kind: "response", status: 302, location: target, body: "" },
      [target]: page("Secret"),
    });
    const result = await crawlSite(origin, { ...options, mapOnly });
    expect(fixture.requests.map(({ url }) => url)).toEqual([
      `${origin}/robots.txt`, `${origin}/sitemap.xml`, `${origin}/`, `${origin}/redir-private`, `${origin}/hop`,
    ]);
    expect(result.discoveredUrls.map(({ url }) => url)).toEqual([`${origin}/`]);
    expect(result.warnings).toEqual([`Skipping ${origin}/redir-private (redirect to ${origin}${target} disallowed by robots.txt).`]);
    if (mapOnly) {
      expect(await fs.readFile(options.outputPath!, "utf8")).toBe(`${origin}/\n`);
    } else {
      expect(await fs.readdir(options.outputPath!)).toEqual(["index.md"]);
    }
  });

  it.each([
    { mapOnly: false, source: "link" }, { mapOnly: true, source: "link" },
    { mapOnly: false, source: "sitemap" }, { mapOnly: true, source: "sitemap" },
    { mapOnly: false, source: "seed" }, { mapOnly: true, source: "seed" },
  ])("checks original trailing slash for $source (mapOnly=$mapOnly)", async ({ source, mapOnly }) => {
    const fixture = install({
      "/robots.txt": response("User-agent: *\nDisallow: /admin/"),
      "/": page(source === "link" ? '<a href="/admin/">Admin</a>' : ""),
      "/sitemap.xml": source === "sitemap" ? response("<urlset><url><loc>/admin/</loc></url></urlset>") : response("", 404),
      "/admin": { kind: "response", status: 301, location: "/admin/", body: "" },
      "/admin/": page("Admin"),
    });
    const result = await crawlSite(source === "seed" ? `${origin}/admin/` : origin, { ...options, mapOnly });
    expect(fixture.requests.map(({ url }) => url)).toEqual([
      `${origin}/robots.txt`, `${origin}/sitemap.xml`, ...(source === "seed" ? [] : [`${origin}/`]),
    ]);
    expect(result.discoveredUrls.map(({ url }) => url)).toEqual(source === "seed" ? [] : [`${origin}/`]);
    expect(result.warnings).toEqual([`Skipping ${origin}/admin/ (disallowed by robots.txt).`]);
  });

  it("also checks the normalized form when the original form is allowed", async () => {
    const fixture = install({
      "/robots.txt": response("User-agent: *\nDisallow: /admin$"),
      "/": page('<a href="/admin/">Admin</a>'),
      "/admin": page("Admin"),
    });
    const result = await crawlSite(origin, options);
    expect(fixture.requests.map(({ url }) => url)).toEqual([`${origin}/robots.txt`, `${origin}/sitemap.xml`, `${origin}/`]);
    expect(result.discoveredCount).toBe(1);
    expect(result.warnings).toEqual([`Skipping ${origin}/admin (disallowed by robots.txt).`]);
  });

  it("checks sitemap redirect targets", async () => {
    const fixture = install({
      "/robots.txt": response("User-agent: *\nDisallow: /private"),
      "/sitemap.xml": { kind: "response", status: 302, location: "/private/sitemap.xml", body: "" },
      "/": page("Home"),
    });
    const result = await crawlSite(origin, options);
    expect(fixture.requests.map(({ url }) => url)).toEqual([`${origin}/robots.txt`, `${origin}/sitemap.xml`, `${origin}/`]);
    expect(result.warnings).toEqual([`Skipping ${origin}/sitemap.xml (redirect to ${origin}/private/sitemap.xml disallowed by robots.txt).`]);
  });

  it.each([429, 500, 503])("fully disallows robots HTTP %s before sitemap or page fetching", async (status) => {
    const fixture = install({ "/robots.txt": response("", status), "/": page("Home") });
    const result = await crawlSite(origin, options);
    expect(fixture.requests.map(({ url }) => url)).toEqual([`${origin}/robots.txt`]);
    expect(result.robotsUnavailable).toEqual({ origin, kind: "http", status });
    expect(result.discoveredUrls).toEqual([]);
    expect(result.crawledCount).toBe(0);
    expect(await fs.readdir(tempDir)).toEqual([]);
  });

  it.each([
    { route: { kind: "error", message: "ECONNRESET" }, error: "ECONNRESET" },
    { route: { kind: "timeout" }, error: "Request timed out" },
    { route: { kind: "response", status: 302, location: "/robots.txt", body: "" }, error: "Too many redirects" },
  ] satisfies Array<{ route: HttpRoute; error: string }>)("fully disallows robots fetch failure $error", async ({ route, error }) => {
    const fixture = install({ "/robots.txt": route, "/": page("Home") });
    const result = await crawlSite(origin, { ...options, mapOnly: true, json: true });
    expect(fixture.requests.map(({ url }) => url)).toEqual(Array(error === "Too many redirects" ? 6 : 1).fill(`${origin}/robots.txt`));
    expect(result.robotsUnavailable).toEqual({ origin, kind: "error", error });
    expect(result.discoveredUrls).toEqual([]);
    expect(result.crawledCount).toBe(0);
    expect(await fs.readdir(tempDir)).toEqual([]);
  });

  it.each([400, 403, 404])("allows crawling without rules for robots HTTP %s", async (status) => {
    const fixture = install({ "/robots.txt": response("User-agent: *\nDisallow: /", status), "/": page("Home") });
    const result = await crawlSite(origin, options);
    expect(fixture.requests.map(({ url }) => url)).toEqual([`${origin}/robots.txt`, `${origin}/sitemap.xml`, `${origin}/`]);
    expect(result.robotsUnavailable).toBeNull();
    expect(result.crawledCount).toBe(1);
    expect(result.warnings).toEqual([]);
  });

  it("caps the robots stream at 500 KiB and cancels the response", async () => {
    const limit = 500 * 1024;
    let producedBytes = 0;
    function* body() {
      const prefix = Buffer.from("User-agent: *\nDisallow: /private\n#");
      producedBytes += prefix.length;
      yield prefix;
      for (let index = 0; index < 12800; index += 1) {
        producedBytes += 4096;
        yield Buffer.alloc(4096, "x");
      }
      yield Buffer.from("\nDisallow: /");
    }
    const fixture = install({
      "/robots.txt": { kind: "response", status: 200, body: body() },
      "/": page('<a href="/private/secret">Private</a>'),
    });
    const result = await crawlSite(origin, options);
    expect(result.crawledCount).toBe(1);
    expect(result.warnings).toEqual([`Skipping ${origin}/private/secret (disallowed by robots.txt).`]);
    expect(producedBytes).toBeLessThanOrEqual(limit + 8192);
    expect(fixture.responses[0].destroyed).toBe(true);
  });

  it("returns exactly the byte limit from a chunk that crosses it", async () => {
    const fixture = install({ "/robots.txt": { kind: "response", status: 200, body: [Buffer.from("abc"), Buffer.from("defgh")] } });
    const result = await fetchText(`${origin}/robots.txt`, 100, "paperboy/test", { maxBytes: 5 });
    expect(result).toEqual({ ok: true, status: 200, body: "abcde", contentType: "text/html" });
    expect(fixture.responses[0].destroyed).toBe(true);
  });

  it.each([
    { rateLimitMs: 40000, delaySeconds: 60, expectedMs: 40000 },
    { rateLimitMs: 0, delaySeconds: 60, expectedMs: 30000 },
    { rateLimitMs: 500, delaySeconds: 0.2, expectedMs: 500 },
  ])("waits $expectedMs ms for user rate $rateLimitMs and robots delay $delaySeconds seconds", async ({ rateLimitMs, delaySeconds, expectedMs }) => {
    vi.useFakeTimers();
    const fixture = install({
      "/robots.txt": response(`User-agent: *\nCrawl-delay: ${delaySeconds}`),
      "/": page('<a href="/next">Next</a>'), "/next": page("Next"),
    });
    const pending = crawlSite(origin, { ...options, rateLimitMs });
    await vi.waitFor(() => expect(vi.getTimerCount()).toBe(1));
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result.crawledCount).toBe(2);
    expect(fixture.requests.map(({ url }) => url)).toEqual([`${origin}/robots.txt`, `${origin}/sitemap.xml`, `${origin}/`, `${origin}/next`]);
    expect(fixture.requests[3].at - fixture.requests[2].at).toBeGreaterThanOrEqual(expectedMs);
    expect(fixture.requests[3].at - fixture.requests[2].at).toBeLessThan(expectedMs + 100);
    expect(result.warnings).toEqual(delaySeconds > 30 ? [`robots.txt Crawl-delay ${delaySeconds}s capped at 30s.`] : []);
  });
});
