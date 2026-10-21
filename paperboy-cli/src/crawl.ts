import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { convertToMarkdown, toWordCount } from "@proticom/paperboy-converter";
import { isAllowedByRobots, parseRobots, type RobotsPolicy } from "./robots.js";

type CrawlSource = "seed" | "sitemap" | "link";
type CrawlOutputMode = "single" | "mirror" | "jsonl";

interface QueueItem {
  url: string;
  depth: number;
  source: CrawlSource;
}

interface CrawlRecord {
  url: string;
  title: string;
  markdown: string;
  depth: number;
  source: CrawlSource;
  wordCount: number;
  warnings: string[];
  fetchedAt: string;
}

interface DiscoverRecord {
  url: string;
  depth: number;
  source: CrawlSource;
  title: string;
  status: number;
}

export interface CrawlOptions {
  maxPages: number;
  maxDepth: number;
  includePatterns?: string[];
  excludePatterns?: string[];
  minContentWords: number;
  outputMode: CrawlOutputMode;
  outputPath?: string;
  json: boolean;
  mapOnly: boolean;
  rateLimitMs: number;
  timeoutMs: number;
  maxSitemaps: number;
  userAgent: string;
}

export type RobotsUnavailable =
  | { origin: string; kind: "http"; status: number }
  | { origin: string; kind: "error"; error: string };

type OriginRobots =
  | { kind: "available"; policy: RobotsPolicy }
  | { kind: "unavailable"; failure: RobotsUnavailable };

export interface CrawlResult {
  mode: CrawlOutputMode | "map";
  startUrl: string;
  outputPath: string | null;
  discoveredCount: number;
  crawledCount: number;
  robotsUnavailable: RobotsUnavailable | null;
  robotsUnavailableOrigins: RobotsUnavailable[];
  warnings: string[];
  discoveredUrls: Array<{
    url: string;
    depth: number;
    source: CrawlSource;
    title: string;
    status: number;
  }>;
}

const TRACKING_QUERY_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "mc_cid",
  "mc_eid",
];

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function splitPatterns(input?: string[]): string[] {
  if (!input || input.length === 0) return [];
  return input
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function compilePatterns(patterns: string[]): RegExp[] {
  return patterns.map((pattern) => new RegExp(pattern, "i"));
}

function normalizeUrl(rawUrl: string, base: URL): string | null {
  try {
    const url = new URL(rawUrl, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    url.hash = "";
    for (const param of TRACKING_QUERY_PARAMS) {
      url.searchParams.delete(param);
    }
    url.search = "";
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return null;
  }
}

function isInternalUrl(candidate: string, root: URL): boolean {
  try {
    const parsed = new URL(candidate);
    return parsed.origin === root.origin;
  } catch {
    return false;
  }
}

function shouldIncludeUrl(
  url: string,
  includePatterns: RegExp[],
  excludePatterns: RegExp[],
): boolean {
  if (excludePatterns.some((pattern) => pattern.test(url))) {
    return false;
  }
  if (includePatterns.length === 0) {
    return true;
  }
  return includePatterns.some((pattern) => pattern.test(url));
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractTitle(html: string, fallbackUrl: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = match?.[1]?.replace(/\s+/g, " ").trim();
  if (title) return decodeHtmlEntities(title);
  try {
    const parsed = new URL(fallbackUrl);
    if (parsed.pathname === "/" || parsed.pathname === "") {
      return parsed.hostname;
    }
    return parsed.pathname.split("/").filter(Boolean).slice(-1)[0] ?? parsed.hostname;
  } catch {
    return fallbackUrl;
  }
}

function extractLinksFromHtml(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const linkPattern =
    /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+))/gi;

  for (const match of html.matchAll(linkPattern)) {
    const href = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (!href) continue;
    const lower = href.toLowerCase();
    if (
      lower.startsWith("#") ||
      lower.startsWith("mailto:") ||
      lower.startsWith("tel:") ||
      lower.startsWith("javascript:") ||
      lower.startsWith("data:")
    ) {
      continue;
    }
    try {
      links.push(new URL(href, baseUrl).toString());
    } catch {
      // Ignore malformed URLs.
    }
  }

  return links;
}

function parseSitemapLocs(xml: string): string[] {
  const urls: string[] = [];
  const locPattern = /<loc>\s*([^<]+)\s*<\/loc>/gi;
  for (const match of xml.matchAll(locPattern)) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    urls.push(
      raw
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">"),
    );
  }
  return urls;
}

function looksLikeSitemap(url: string): boolean {
  return /sitemap/i.test(url) || /\.xml(\?|$)/i.test(url);
}

interface FetchTextExtra {
  maxBytes?: number;
  canFollowRedirect?: (target: string) => boolean | Promise<boolean>;
}

export async function fetchText(
  url: string,
  timeoutMs: number,
  userAgent: string,
  extra?: FetchTextExtra,
): Promise<{ ok: boolean; status: number; body: string; contentType: string; error?: string; redirectBlockedTarget?: string }> {
  return fetchTextWithRedirects(url, timeoutMs, userAgent, 0, extra);
}

async function fetchTextWithRedirects(
  url: string,
  timeoutMs: number,
  userAgent: string,
  redirects: number,
  extra?: FetchTextExtra,
): Promise<{ ok: boolean; status: number; body: string; contentType: string; error?: string; redirectBlockedTarget?: string }> {
  if (redirects > 5) {
    return {
      ok: false,
      status: 0,
      body: "",
      contentType: "",
      error: "Too many redirects",
    };
  }

  return new Promise((resolve) => {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      resolve({
        ok: false,
        status: 0,
        body: "",
        contentType: "",
        error: "Invalid URL",
      });
      return;
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      resolve({ ok: false, status: 0, body: "", contentType: "", error: "Unsupported URL protocol" });
      return;
    }

    const client = parsedUrl.protocol === "https:" ? https : http;
    const request = client.request(
      parsedUrl,
      {
        method: "GET",
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xml,text/xml;q=0.9,*/*;q=0.8",
          "Accept-Encoding": "identity",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const contentType = String(response.headers["content-type"] ?? "");
        const location = response.headers.location;
        response.on("error", (error: Error) => {
          resolve({ ok: false, status: 0, body: "", contentType: "", error: error.message });
        });
        response.on("aborted", () => {
          resolve({ ok: false, status: 0, body: "", contentType: "", error: "Response aborted" });
        });
        if (status >= 300 && status < 400 && location) {
          let nextUrl: string;
          try {
            nextUrl = new URL(location, parsedUrl).toString();
          } catch {
            resolve({ ok: false, status: 0, body: "", contentType: "", error: "Invalid redirect URL" });
            response.destroy();
            return;
          }
          resolve((async () => {
            if (extra?.canFollowRedirect && !(await extra.canFollowRedirect(nextUrl))) {
              return { ok: false, status, body: "", contentType, redirectBlockedTarget: nextUrl };
            }
            return fetchTextWithRedirects(nextUrl, timeoutMs, userAgent, redirects + 1, extra);
          })());
          response.destroy();
          return;
        }

        const chunks: Buffer[] = [];
        const maxBytes = extra?.maxBytes ?? Infinity;
        let bytes = 0;
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            body: Buffer.concat(chunks, bytes).toString("utf8"),
            contentType,
          });
        };
        response.on("data", (chunk: string | Buffer) => {
          if (finished) return;
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          const part = buffer.subarray(0, Math.max(0, maxBytes - bytes));
          chunks.push(part);
          bytes += part.length;
          if (bytes >= maxBytes) {
            finish();
            response.destroy();
          }
        });
        response.on("end", finish);
      },
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error("Request timed out"));
    });

    request.on("error", (error: Error) => {
      resolve({
        ok: false,
        status: 0,
        body: "",
        contentType: "",
        error: error.message,
      });
    });

    request.end();
  });
}

function redirectSkipWarning(url: string, target: string, unavailableOrigins: readonly RobotsUnavailable[]): string {
  const targetOrigin = new URL(target).origin;
  const unavailable = unavailableOrigins.find(({ origin }) => origin === targetOrigin);
  if (unavailable) {
    const reason = unavailable.kind === "http" ? `HTTP ${unavailable.status}` : unavailable.error;
    return `Skipping ${url} (redirect to ${target}: robots.txt for ${unavailable.origin} unavailable (${reason}); treated as disallowed per RFC 9309).`;
  }
  return `Skipping ${url} (redirect to ${target} disallowed by robots.txt).`;
}

async function discoverSitemapUrls(
  rootUrl: URL,
  timeoutMs: number,
  maxSitemaps: number,
  userAgent: string,
  warnings: string[],
  isAllowed: (url: string) => boolean,
  extra?: FetchTextExtra,
  unavailableOrigins: readonly RobotsUnavailable[] = [],
): Promise<string[]> {
  const rootSitemap = new URL("/sitemap.xml", rootUrl).toString();
  const queue = [rootSitemap];
  const seenSitemaps = new Set<string>();
  const discoveredPages = new Set<string>();

  while (queue.length > 0 && seenSitemaps.size < maxSitemaps) {
    const sitemapUrl = queue.shift();
    if (!sitemapUrl || seenSitemaps.has(sitemapUrl)) continue;
    if (!isAllowed(sitemapUrl)) continue;
    seenSitemaps.add(sitemapUrl);

    const fetched = await fetchText(sitemapUrl, timeoutMs, userAgent, extra);
    if (fetched.redirectBlockedTarget) {
      warnings.push(redirectSkipWarning(sitemapUrl, fetched.redirectBlockedTarget, unavailableOrigins));
    }
    if (!fetched.ok) continue;

    const locs = parseSitemapLocs(fetched.body);
    for (const loc of locs) {
      const normalized = normalizeUrl(loc, rootUrl);
      if (!normalized) continue;
      if (!isInternalUrl(normalized, rootUrl)) continue;
      if (!isAllowed(new URL(loc, rootUrl).toString())) continue;
      if (!isAllowed(normalized)) continue;

      if (looksLikeSitemap(normalized)) {
        if (!seenSitemaps.has(normalized)) {
          queue.push(normalized);
        }
      } else {
        discoveredPages.add(normalized);
      }
    }
  }

  if (seenSitemaps.size >= maxSitemaps) {
    warnings.push(`Stopped sitemap traversal after ${maxSitemaps} sitemap files.`);
  }

  return Array.from(discoveredPages);
}

function defaultOutputPath(startUrl: URL, mode: CrawlOutputMode): string {
  const host = startUrl.hostname.replace(/[^a-z0-9.-]/gi, "_");
  if (mode === "single") return path.resolve(process.cwd(), `${host}.crawl.md`);
  if (mode === "jsonl") return path.resolve(process.cwd(), `${host}.crawl.jsonl`);
  return path.resolve(process.cwd(), `${host}.crawl`);
}

function safeFileNameSegment(segment: string): string {
  const cleaned = segment.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").trim();
  return cleaned || "index";
}

function mirrorPathForUrl(baseDir: string, url: string): string {
  const parsed = new URL(url);
  const rawSegments = parsed.pathname.split("/").filter(Boolean);
  const segments = rawSegments.map(safeFileNameSegment);

  if (segments.length === 0) {
    return path.join(baseDir, "index.md");
  }

  const last = segments[segments.length - 1];
  if (!last.includes(".")) {
    return path.join(baseDir, ...segments, "index.md");
  }

  segments[segments.length - 1] = `${last.replace(/\.[^.]+$/, "")}.md`;
  return path.join(baseDir, ...segments);
}

function pageSection(record: CrawlRecord): string {
  const lines: string[] = [];
  lines.push(`# Page: ${record.url}`);
  lines.push(`**Title:** ${record.title}`);
  lines.push(`**URL:** ${record.url}`);
  lines.push(`**Depth:** ${record.depth}`);
  lines.push(`**Word Count:** ${record.wordCount}`);
  lines.push(`**Fetched At:** ${record.fetchedAt}`);
  if (record.warnings.length > 0) {
    lines.push(`**Warnings:** ${record.warnings.join("; ")}`);
  }
  lines.push("");
  lines.push(record.markdown || "_No markdown extracted._");
  return lines.join("\n");
}

async function writeSingleOutput(
  outputPath: string,
  startUrl: URL,
  records: CrawlRecord[],
): Promise<void> {
  const lines: string[] = [];
  lines.push(`# Site: ${startUrl.hostname} - Crawl Output`);
  lines.push(
    `Crawled: ${new Date().toISOString()} | Pages: ${records.length} | Start URL: ${startUrl.toString()}`,
  );
  lines.push("");
  lines.push("## Table of Contents");
  for (const record of records) {
    lines.push(`- [${record.title}](${record.url})`);
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  for (let index = 0; index < records.length; index += 1) {
    lines.push(pageSection(records[index]));
    if (index < records.length - 1) {
      lines.push("");
      lines.push("---");
      lines.push("");
    }
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");
}

async function writeMirrorOutput(
  outputDir: string,
  records: CrawlRecord[],
): Promise<void> {
  await fs.mkdir(outputDir, { recursive: true });
  for (const record of records) {
    const filePath = mirrorPathForUrl(outputDir, record.url);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const content = [
      "---",
      `title: "${record.title.replace(/"/g, '\\"')}"`,
      `url: "${record.url}"`,
      `depth: ${record.depth}`,
      `wordCount: ${record.wordCount}`,
      "---",
      "",
      record.markdown || "_No markdown extracted._",
      "",
    ].join("\n");
    await fs.writeFile(filePath, content, "utf8");
  }
}

async function writeJsonlOutput(
  outputPath: string,
  records: CrawlRecord[],
): Promise<void> {
  const lines = records.map((record) =>
    JSON.stringify({
      url: record.url,
      title: record.title,
      markdown: record.markdown,
      metadata: {
        depth: record.depth,
        source: record.source,
        fetchedAt: record.fetchedAt,
        wordCount: record.wordCount,
        warnings: record.warnings,
      },
    }),
  );
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");
}

export async function crawlSite(
  startUrlRaw: string,
  options: CrawlOptions,
): Promise<CrawlResult> {
  const startUrl = new URL(startUrlRaw);
  const warnings: string[] = [];
  const includePatterns = compilePatterns(splitPatterns(options.includePatterns));
  const excludePatterns = compilePatterns(splitPatterns(options.excludePatterns));

  const queue: QueueItem[] = [];
  const enqueued = new Set<string>();
  const visited = new Set<string>();
  const records: CrawlRecord[] = [];
  const discovered: DiscoverRecord[] = [];

  const normalizedStart = normalizeUrl(startUrl.toString(), startUrl);
  if (!normalizedStart) {
    throw new Error(`Unsupported crawl URL: ${startUrlRaw}`);
  }

  const robotsPolicies = new Map<string, Promise<OriginRobots>>();
  const robotsUnavailableOrigins: RobotsUnavailable[] = [];
  const getRobotsPolicy = (origin: string): Promise<OriginRobots> => {
    const cached = robotsPolicies.get(origin);
    if (cached) return cached;
    const pending: Promise<OriginRobots> = (async () => {
      const response = await fetchText(
        new URL("/robots.txt", origin).toString(),
        options.timeoutMs,
        options.userAgent,
        { maxBytes: 500 * 1024 },
      );
      let failure: RobotsUnavailable | null = null;
      if (response.error !== undefined) {
        failure = { origin, kind: "error", error: response.error };
      } else if (response.status === 429 || response.status >= 500) {
        failure = { origin, kind: "http", status: response.status };
      }
      if (failure) {
        if (origin !== startUrl.origin) robotsUnavailableOrigins.push(failure);
        return { kind: "unavailable", failure };
      }
      return { kind: "available", policy: parseRobots(response.ok ? response.body : "") };
    })();
    robotsPolicies.set(origin, pending);
    return pending;
  };
  const unavailableResult = (failure: RobotsUnavailable): CrawlResult => ({
    mode: options.mapOnly ? "map" : options.outputMode,
    startUrl: normalizedStart, outputPath: null,
    discoveredCount: 0, crawledCount: 0, warnings, discoveredUrls: [],
    robotsUnavailable: failure, robotsUnavailableOrigins,
  });
  const seedRobots = await getRobotsPolicy(startUrl.origin);
  if (seedRobots.kind === "unavailable") return unavailableResult(seedRobots.failure);
  const robots = seedRobots.policy;
  const skippedByRobots = new Set<string>();
  const isPermitted = (url: string): boolean => {
    const parsed = new URL(url);
    return isAllowedByRobots(robots, parsed.pathname + parsed.search);
  };
  const isAllowed = (url: string): boolean => {
    if (isPermitted(url)) return true;
    if (!skippedByRobots.has(url)) {
      skippedByRobots.add(url);
      warnings.push(`Skipping ${url} (disallowed by robots.txt).`);
    }
    return false;
  };
  const fetchExtra: FetchTextExtra = {
    canFollowRedirect: async (target) => {
      const targetUrl = new URL(target);
      const targetRobots = await getRobotsPolicy(targetUrl.origin);
      if (targetRobots.kind === "unavailable") return false;
      const normalized = normalizeUrl(target, startUrl);
      const normalizedUrl = normalized === null ? targetUrl : new URL(normalized);
      return isAllowedByRobots(targetRobots.policy, targetUrl.pathname + targetUrl.search) &&
        isAllowedByRobots(targetRobots.policy, normalizedUrl.pathname + normalizedUrl.search);
    },
  };
  // Only the seed origin's Crawl-delay applies because other origins are reached through redirects.
  const robotsDelayMs = (robots.crawlDelaySeconds ?? 0) * 1000;
  if (robotsDelayMs > 30000) {
    warnings.push(`robots.txt Crawl-delay ${robots.crawlDelaySeconds}s capped at 30s.`);
  }
  const effectiveDelayMs = Math.max(options.rateLimitMs, Math.min(30000, robotsDelayMs));

  const sitemapUrls = await discoverSitemapUrls(
    startUrl,
    options.timeoutMs,
    options.maxSitemaps,
    options.userAgent,
    warnings,
    isAllowed,
    fetchExtra,
    robotsUnavailableOrigins,
  );

  if (sitemapUrls.length > 0) {
    for (const url of sitemapUrls) {
      if (!shouldIncludeUrl(url, includePatterns, excludePatterns)) continue;
      if (enqueued.has(url)) continue;
      queue.push({ url, depth: 0, source: "sitemap" });
      enqueued.add(url);
    }
  }

  if (isAllowed(startUrl.toString()) && isAllowed(normalizedStart) && !enqueued.has(normalizedStart)) {
    queue.push({ url: normalizedStart, depth: 0, source: "seed" });
    enqueued.add(normalizedStart);
  }

  let processedCount = 0;
  let fetches = 0;

  while (queue.length > 0 && processedCount < options.maxPages) {
    const item = queue.shift();
    if (!item) break;
    if (visited.has(item.url)) continue;
    visited.add(item.url);

    if (item.depth > options.maxDepth) continue;
    if (!isInternalUrl(item.url, startUrl)) continue;
    if (!shouldIncludeUrl(item.url, includePatterns, excludePatterns)) continue;

    if (fetches > 0) {
      await sleep(effectiveDelayMs);
    }
    fetches += 1;

    const fetched = await fetchText(item.url, options.timeoutMs, options.userAgent, fetchExtra);
    if (!fetched.ok) {
      const target = fetched.redirectBlockedTarget;
      if (target) {
        const targetOrigin = new URL(target).origin;
        const failure = robotsUnavailableOrigins.find(({ origin }) => origin === targetOrigin);
        if (item.url === normalizedStart && failure) return unavailableResult(failure);
        warnings.push(redirectSkipWarning(item.url, target, robotsUnavailableOrigins));
      } else {
        warnings.push(`Skipping ${item.url} (HTTP ${fetched.status || "error"}).`);
      }
      continue;
    }
    if (!/html|xml/i.test(fetched.contentType)) {
      warnings.push(`Skipping ${item.url} (non-HTML content type: ${fetched.contentType}).`);
      continue;
    }

    const title = extractTitle(fetched.body, item.url);
    discovered.push({
      url: item.url,
      depth: item.depth,
      source: item.source,
      title,
      status: fetched.status,
    });
    processedCount += 1;

    if (!options.mapOnly) {
      const conversion = await convertToMarkdown(`${title || "page"}.html`, fetched.body);
      const wordCount = toWordCount(conversion.markdown);
      if (wordCount >= options.minContentWords) {
        records.push({
          url: item.url,
          title,
          markdown: conversion.markdown,
          depth: item.depth,
          source: item.source,
          wordCount,
          warnings: conversion.warnings,
          fetchedAt: new Date().toISOString(),
        });
      } else {
        warnings.push(
          `Skipping ${item.url} (content too short: ${wordCount} words, min ${options.minContentWords}).`,
        );
      }
    }

    if (item.depth >= options.maxDepth) continue;

    const links = extractLinksFromHtml(fetched.body, item.url);
    for (const link of links) {
      const normalized = normalizeUrl(link, startUrl);
      if (!normalized) continue;
      if (!isInternalUrl(normalized, startUrl)) continue;
      if (!isAllowed(link)) continue;
      if (!isAllowed(normalized)) continue;
      if (!shouldIncludeUrl(normalized, includePatterns, excludePatterns)) continue;
      if (enqueued.has(normalized) || visited.has(normalized)) continue;
      queue.push({
        url: normalized,
        depth: item.depth + 1,
        source: "link",
      });
      enqueued.add(normalized);
    }
  }

  let outputPath: string | null = null;

  if (options.mapOnly) {
    if (options.outputPath) {
      outputPath = path.resolve(process.cwd(), options.outputPath);
      const payload = options.json
        ? JSON.stringify(discovered, null, 2)
        : `${discovered.map((entry) => entry.url).join("\n")}\n`;
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, payload, "utf8");
    }
    return {
      mode: "map",
      startUrl: normalizedStart,
      outputPath,
      discoveredCount: discovered.length,
      crawledCount: 0,
      robotsUnavailable: null,
      robotsUnavailableOrigins,
      warnings,
      discoveredUrls: discovered,
    };
  }

  const resolvedOutputPath = options.outputPath
    ? path.resolve(process.cwd(), options.outputPath)
    : defaultOutputPath(startUrl, options.outputMode);
  outputPath = resolvedOutputPath;

  if (options.outputMode === "single") {
    await writeSingleOutput(resolvedOutputPath, startUrl, records);
  } else if (options.outputMode === "mirror") {
    await writeMirrorOutput(resolvedOutputPath, records);
  } else {
    await writeJsonlOutput(resolvedOutputPath, records);
  }

  return {
    mode: options.outputMode,
    startUrl: normalizedStart,
    outputPath,
    discoveredCount: discovered.length,
    crawledCount: records.length,
    robotsUnavailable: null,
    robotsUnavailableOrigins,
    warnings,
    discoveredUrls: discovered,
  };
}
