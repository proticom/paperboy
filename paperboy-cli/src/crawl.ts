import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { brotliDecompressSync, gunzipSync, inflateRawSync, inflateSync } from "node:zlib";
import { convertToMarkdown, toWordCount } from "@proticom/paperboy-converter";

type CrawlSource = "seed" | "sitemap" | "link";
type CrawlOutputMode = "single" | "mirror" | "jsonl";

type FetchResult =
  | { kind: "response"; ok: boolean; status: number; body: string; contentType: string }
  | { kind: "failure"; reason: string };

type FetchOptions = Pick<CrawlOptions, "timeoutMs" | "userAgent"> & { maxPageBytes: number };
type ContentDecoder = (body: Buffer, options: { maxOutputLength: number }) => Buffer;

const DEFAULT_MAX_PAGE_BYTES = 32 * 1024 * 1024;
const CONTENT_DECODERS = new Map<string, ContentDecoder>([
  ["gzip", gunzipSync],
  ["x-gzip", gunzipSync],
  ["br", brotliDecompressSync],
  ["deflate", (body, options) => {
    try {
      return inflateSync(body, options);
    } catch (error) {
      if (error instanceof Error && "code" in error &&
          (error.code === "Z_DATA_ERROR" || error.code === "Z_BUF_ERROR")) {
        return inflateRawSync(body, options);
      }
      throw error;
    }
  }],
]);

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
  maxPageBytes?: number;
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

export interface CrawlResult {
  mode: CrawlOutputMode | "map";
  startUrl: string;
  outputPath: string | null;
  discoveredCount: number;
  crawledCount: number;
  failedFetchCount: number;
  /** Set for a seed skipped before it can produce saved output. Robots checks use this too. */
  seedSkipReason?: string;
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

async function fetchText(
  url: string,
  options: FetchOptions,
): Promise<FetchResult> {
  return fetchTextWithRedirects(url, options, 0);
}

async function fetchTextWithRedirects(
  url: string,
  options: FetchOptions,
  redirects: number,
): Promise<FetchResult> {
  if (redirects > 5) {
    return {
      kind: "response",
      ok: false,
      status: 0,
      body: "",
      contentType: "",
    };
  }

  return new Promise((resolve) => {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      resolve({
        kind: "response",
        ok: false,
        status: 0,
        body: "",
        contentType: "",
      });
      return;
    }

    const client = parsedUrl.protocol === "https:" ? https : http;
    const request = client.request(
      parsedUrl,
      {
        method: "GET",
        headers: {
          "User-Agent": options.userAgent,
          Accept: "text/html,application/xml,text/xml;q=0.9,*/*;q=0.8",
          "Accept-Encoding": "identity",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const contentType = String(response.headers["content-type"] ?? "");
        response.on("error", (error: Error) => {
          resolve({ kind: "failure", reason: `response could not be read: ${error.message}` });
        });
        const location = response.headers.location;
        if (status >= 300 && status < 400 && location) {
          response.resume();
          const nextUrl = new URL(location, parsedUrl).toString();
          resolve(fetchTextWithRedirects(nextUrl, options, redirects + 1));
          return;
        }
        if (status < 200 || status >= 300) {
          response.resume();
          resolve({ kind: "response", ok: false, status, body: "", contentType });
          return;
        }

        const chunks: Buffer[] = [];
        let receivedBytes = 0;
        response.on("data", (chunk: string | Buffer) => {
          if (receivedBytes > options.maxPageBytes) return;
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          receivedBytes += bytes.byteLength;
          if (receivedBytes > options.maxPageBytes) {
            chunks.length = 0;
            resolve({ kind: "failure", reason: `response larger than ${options.maxPageBytes} bytes` });
            response.destroy();
            request.destroy();
            return;
          }
          chunks.push(bytes);
        });
        response.on("end", () => {
          if (receivedBytes > options.maxPageBytes) return;
          try {
            const encoding = String(response.headers["content-encoding"] ?? "");
            const encodings = encoding.split(",").map((token) => token.trim().toLowerCase())
              .filter((token) => token && token !== "identity");
            const decoders: ContentDecoder[] = [];
            const encodingFailure: FetchResult = {
              kind: "failure", reason: `unsupported or invalid content-encoding: ${encoding}`,
            };
            for (const token of encodings) {
              const decoder = CONTENT_DECODERS.get(token);
              if (!decoder) {
                resolve(encodingFailure);
                return;
              }
              decoders.push(decoder);
            }
            let body: Buffer = Buffer.concat(chunks);
            if (body.byteLength > 0) {
              for (const decode of decoders.reverse()) {
                try {
                  body = decode(body, { maxOutputLength: options.maxPageBytes });
                } catch (error) {
                  if (error instanceof Error && "code" in error && error.code === "ERR_BUFFER_TOO_LARGE") {
                    resolve({ kind: "failure", reason: `decoded response larger than ${options.maxPageBytes} bytes` });
                    return;
                  }
                  if (error instanceof Error && "errno" in error && typeof error.errno === "number") {
                    resolve(encodingFailure);
                    return;
                  }
                  throw error;
                }
              }
            }
            resolve({ kind: "response", ok: true, status, body: body.toString("utf8"), contentType });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            resolve({ kind: "failure", reason: `response could not be read: ${message}` });
          }
        });
      },
    );

    request.setTimeout(options.timeoutMs, () => {
      request.destroy(new Error("Request timed out"));
    });

    request.on("error", () => {
      resolve({
        kind: "response",
        ok: false,
        status: 0,
        body: "",
        contentType: "",
      });
    });

    request.end();
  });
}

async function discoverSitemapUrls(
  rootUrl: URL,
  options: FetchOptions,
  maxSitemaps: number,
  warnings: string[],
): Promise<string[]> {
  const rootSitemap = new URL("/sitemap.xml", rootUrl).toString();
  const queue = [rootSitemap];
  const seenSitemaps = new Set<string>();
  const discoveredPages = new Set<string>();

  while (queue.length > 0 && seenSitemaps.size < maxSitemaps) {
    const sitemapUrl = queue.shift();
    if (!sitemapUrl || seenSitemaps.has(sitemapUrl)) continue;
    seenSitemaps.add(sitemapUrl);

    const fetched = await fetchText(sitemapUrl, options);
    if (fetched.kind === "failure") {
      warnings.push(`Skipping ${sitemapUrl} (${fetched.reason}).`);
      continue;
    }
    if (!fetched.ok) continue;

    const locs = parseSitemapLocs(fetched.body);
    for (const loc of locs) {
      const normalized = normalizeUrl(loc, rootUrl);
      if (!normalized) continue;
      if (!isInternalUrl(normalized, rootUrl)) continue;

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
  const fetchOptions: FetchOptions = {
    timeoutMs: options.timeoutMs,
    userAgent: options.userAgent,
    maxPageBytes: options.maxPageBytes ?? DEFAULT_MAX_PAGE_BYTES,
  };
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

  const sitemapUrls = await discoverSitemapUrls(
    startUrl,
    fetchOptions,
    options.maxSitemaps,
    warnings,
  );

  if (sitemapUrls.length > 0) {
    for (const url of sitemapUrls) {
      if (!shouldIncludeUrl(url, includePatterns, excludePatterns)) continue;
      if (enqueued.has(url)) continue;
      queue.push({ url, depth: 0, source: "sitemap" });
      enqueued.add(url);
    }
  }

  if (!enqueued.has(normalizedStart)) {
    queue.push({ url: normalizedStart, depth: 0, source: "seed" });
    enqueued.add(normalizedStart);
  }

  let processedCount = 0;
  let fetches = 0;
  let failedFetchCount = 0;
  let seedSkipReason: string | undefined;

  while (queue.length > 0 && processedCount < options.maxPages) {
    const item = queue.shift();
    if (!item) break;
    if (visited.has(item.url)) continue;
    visited.add(item.url);

    if (item.depth > options.maxDepth) continue;
    if (!isInternalUrl(item.url, startUrl)) continue;
    if (!shouldIncludeUrl(item.url, includePatterns, excludePatterns)) continue;

    if (fetches > 0) {
      await sleep(options.rateLimitMs);
    }
    fetches += 1;

    const fetched = await fetchText(item.url, fetchOptions);
    if (fetched.kind === "failure") {
      warnings.push(`Skipping ${item.url} (${fetched.reason}).`);
      continue;
    }
    if (!fetched.ok) {
      failedFetchCount += 1;
      if (item.source === "seed") seedSkipReason = "request failed";
      warnings.push(`Skipping ${item.url} (HTTP ${fetched.status || "error"}).`);
      continue;
    }
    if (!/html|xml/i.test(fetched.contentType)) {
      if (item.source === "seed") {
        seedSkipReason = `non-HTML content type: ${fetched.contentType}`;
      }
      warnings.push(`Skipping ${item.url} (non-HTML content type: ${fetched.contentType}).`);
      continue;
    }

    try {
      const title = extractTitle(fetched.body, item.url);
      const conversion = options.mapOnly
        ? null
        : await convertToMarkdown(`${title || "page"}.html`, fetched.body);
      const links = item.depth >= options.maxDepth
        ? []
        : extractLinksFromHtml(fetched.body, item.url);

      discovered.push({
        url: item.url,
        depth: item.depth,
        source: item.source,
        title,
        status: fetched.status,
      });
      processedCount += 1;

      if (conversion) {
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

      for (const link of links) {
        const normalized = normalizeUrl(link, startUrl);
        if (!normalized) continue;
        if (!isInternalUrl(normalized, startUrl)) continue;
        if (!shouldIncludeUrl(normalized, includePatterns, excludePatterns)) continue;
        if (enqueued.has(normalized) || visited.has(normalized)) continue;
        queue.push({
          url: normalized,
          depth: item.depth + 1,
          source: "link",
        });
        enqueued.add(normalized);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Skipping ${item.url} (conversion failed: ${message}).`);
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
      failedFetchCount,
      seedSkipReason,
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
    failedFetchCount,
    seedSkipReason,
    warnings,
    discoveredUrls: discovered,
  };
}
