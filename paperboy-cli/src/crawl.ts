import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { Worker, type ResourceLimits } from "node:worker_threads";
import { brotliDecompressSync, gunzipSync, inflateRawSync, inflateSync } from "node:zlib";
import { toWordCount, type ConvertResult } from "@proticom/paperboy-converter";

import type { ConversionRequest, ConversionResponse } from "./convert-worker.js";
import { isAllowedByRobots, parseRobots, type RobotsPolicy } from "./robots.js";

type CrawlSource = "seed" | "sitemap" | "link";
type CrawlOutputMode = "single" | "mirror" | "jsonl";

type FetchResult =
  | { kind: "response"; ok: boolean; status: number; body: string; contentType: string; finalUrl: string }
  | { kind: "failure"; reason: string }
  | { kind: "redirect-blocked"; status: number; target: string };

type FetchOptions = Pick<CrawlOptions, "timeoutMs" | "userAgent"> & {
  maxPageBytes: number;
  /** Robots check for each redirect hop, using the hop target's origin policy. */
  canFollowRedirect?: (target: string) => boolean | Promise<boolean>;
};
type ContentDecoder = (body: Buffer, options: { maxOutputLength: number }) => Buffer;

const DEFAULT_MAX_PAGE_BYTES = 8 * 1024 * 1024;
const MAX_ROBOTS_BYTES = 500 * 1024;
const MAX_REDIRECTS = 5;
const DEFAULT_CONVERSION_TIMEOUT_MS = 30_000;
const CONVERSION_MAX_OLD_GENERATION_SIZE_MB = 512;
const CONVERSION_MAX_YOUNG_GENERATION_SIZE_MB = 64;
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
  fetchUrl: string;
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
  conversionTimeoutMs?: number;
  conversionWorkerUrl?: URL;
  conversionResourceLimits?: ResourceLimits;
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
  skippedCount: number;
  failedFetchCount: number;
  /** Set for a seed skipped before it can produce saved output. Robots checks use this too. */
  seedSkipReason?: string;
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

class ConversionTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`conversion timed out after ${timeoutMs} ms`);
  }
}

class PageConverter {
  private worker: Worker | undefined;
  private nextId = 0;

  constructor(
    private readonly options: Pick<
      CrawlOptions,
      "conversionTimeoutMs" | "conversionWorkerUrl" | "conversionResourceLimits"
    >,
  ) {}

  async close(): Promise<void> {
    const worker = this.worker;
    this.worker = undefined;
    if (worker) await worker.terminate();
  }

  async convert(filename: string, body: string): Promise<ConvertResult> {
    const timeoutMs = this.options.conversionTimeoutMs ?? DEFAULT_CONVERSION_TIMEOUT_MS;
    if (!this.worker) {
      // Source imports in Vitest use the worker emitted by the preceding build.
      const workerUrl = this.options.conversionWorkerUrl ?? new URL(
        import.meta.url.endsWith(".ts") ? "../dist/convert-worker.js" : "./convert-worker.js",
        import.meta.url,
      );
      const worker = new Worker(workerUrl, {
        resourceLimits: {
          maxOldGenerationSizeMb: CONVERSION_MAX_OLD_GENERATION_SIZE_MB,
          maxYoungGenerationSizeMb: CONVERSION_MAX_YOUNG_GENERATION_SIZE_MB,
          ...this.options.conversionResourceLimits,
        },
      });
      this.worker = worker;
      const clearWorker = () => {
        if (this.worker === worker) this.worker = undefined;
      };
      worker.on("error", clearWorker);
      worker.on("exit", clearWorker);
    }
    const worker = this.worker;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        settled = true;
        clearTimeout(timer);
        worker.off("message", onMessage);
        worker.off("error", onError);
        worker.off("exit", onExit);
      };
      const fail = (error: Error) => {
        if (settled) return;
        cleanup();
        if (this.worker === worker) this.worker = undefined;
        void worker.terminate().then(() => reject(error), reject);
      };
      const onMessage = (message: ConversionResponse) => {
        if (message.id !== id || settled) return;
        if ("error" in message) {
          fail(new Error(message.error));
        } else {
          cleanup();
          resolve(message.result);
        }
      };
      const onError = (error: Error) => { fail(error); };
      const onExit = (code: number) => { fail(new Error(`worker exited with code ${code}`)); };
      const timer = setTimeout(() => { fail(new ConversionTimeoutError(timeoutMs)); }, timeoutMs);
      worker.on("message", onMessage);
      worker.once("error", onError);
      worker.once("exit", onExit);
      try {
        worker.postMessage({ id, filename, body } satisfies ConversionRequest);
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
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

function normalizeUrl(
  rawUrl: string,
  base: URL,
  preserveTrailingSlash = false,
): string | null {
  try {
    const url = new URL(rawUrl, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    url.hash = "";
    for (const param of TRACKING_QUERY_PARAMS) {
      url.searchParams.delete(param);
    }
    url.searchParams.sort();
    if (
      !preserveTrailingSlash &&
      url.pathname.length > 1 &&
      url.pathname.endsWith("/")
    ) {
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

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeHtmlEntities(value: string): string {
  // Single pass, so "&#38;amp;" decodes once to "&amp;" rather than to "&".
  return value.replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi, (entity, dec?: string, hex?: string, name?: string) => {
    if (name !== undefined) return NAMED_HTML_ENTITIES[name.toLowerCase()] ?? entity;
    const code = dec !== undefined ? Number(dec) : Number.parseInt(hex ?? "", 16);
    if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return entity;
    return String.fromCodePoint(code);
  });
}

function matchesAsciiCaseInsensitive(input: string, start: number, literal: string): boolean {
  for (let offset = 0; offset < literal.length; offset += 1) {
    const code = input.charCodeAt(start + offset);
    const lower = code >= 65 && code <= 90 ? code + 32 : code;
    if (lower !== literal.charCodeAt(offset)) return false;
  }
  return true;
}

function findTitleContent(html: string): string | undefined {
  let start = html.indexOf("<");
  while (start !== -1 && !matchesAsciiCaseInsensitive(html, start, "<title")) {
    start = html.indexOf("<", start + 1);
  }
  if (start === -1) return undefined;
  const openingEnd = html.indexOf(">", start + 6);
  if (openingEnd === -1) return undefined;

  // Any later opening has its first '>' here or later, so it cannot rescue a missing close.
  let end = html.indexOf("<", openingEnd + 1);
  while (end !== -1 && !matchesAsciiCaseInsensitive(html, end, "</title>")) {
    end = html.indexOf("<", end + 1);
  }
  return end === -1 ? undefined : html.slice(openingEnd + 1, end);
}

export function extractTitle(html: string, fallbackUrl: string): string {
  const title = findTitleContent(html)?.replace(/\s+/g, " ").trim();
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

function isWordCode(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) ||
    (code >= 48 && code <= 57) || code === 95;
}

function isWhitespace(input: string, position: number): boolean {
  return /\s/.test(input.charAt(position));
}

function nextOccurrence(html: string, character: string): (from: number) => number {
  let next = -1;
  return (from) => {
    // Callers move forward. Cache misses as well as hits to avoid rescanning a suffix.
    if (next < from) {
      next = html.indexOf(character, from);
      if (next === -1) next = html.length;
    }
    return next;
  };
}

function* scanHrefs(html: string): Generator<string> {
  const nextTagEnd = nextOccurrence(html, ">");
  const nextDoubleQuote = nextOccurrence(html, '"');
  const nextSingleQuote = nextOccurrence(html, "'");
  let cursor = 0;

  while (cursor < html.length) {
    const start = html.indexOf("<", cursor);
    if (start === -1) return;
    cursor = start + 1;
    if (!matchesAsciiCaseInsensitive(html, start, "<a") || isWordCode(html.charCodeAt(start + 2))) {
      continue;
    }

    const tagEnd = nextTagEnd(start + 2);
    // Nested candidates before the same '>' see a subset of these href positions.
    cursor = tagEnd + 1;
    for (let position = start + 2; position < tagEnd; position += 1) {
      if (isWordCode(html.charCodeAt(position - 1)) ||
          !matchesAsciiCaseInsensitive(html, position, "href")) continue;
      let valueStart = position + 4;
      while (isWhitespace(html, valueStart)) valueStart += 1;
      if (html.charCodeAt(valueStart) !== 61) continue;
      valueStart += 1;
      while (isWhitespace(html, valueStart)) valueStart += 1;

      const quote = html.charCodeAt(valueStart);
      let valueEnd: number;
      if (quote === 34 || quote === 39) {
        valueEnd = (quote === 34 ? nextDoubleQuote : nextSingleQuote)(valueStart + 1);
        if (valueEnd === html.length) continue;
        cursor = valueEnd + 1;
        valueStart += 1;
      } else {
        valueEnd = valueStart;
        while (valueEnd < html.length) {
          const code = html.charCodeAt(valueEnd);
          if (isWhitespace(html, valueEnd) || code === 34 || code === 39 ||
              code === 60 || code === 62 || code === 96) break;
          valueEnd += 1;
        }
        if (valueEnd === valueStart) continue;
        cursor = valueEnd;
      }
      yield html.slice(valueStart, valueEnd);
      break;
    }
  }
}

export function extractLinksFromHtml(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  for (const rawHref of scanHrefs(html)) {
    const href = decodeHtmlEntities(rawHref.trim());
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
      decodeHtmlEntities(raw),
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
  if (redirects > MAX_REDIRECTS) {
    return {
      kind: "response",
      ok: false,
      status: 0,
      body: "",
      contentType: "",
      finalUrl: url,
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
        finalUrl: url,
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
          let nextUrl: URL;
          try {
            nextUrl = new URL(location, parsedUrl);
          } catch {
            resolve({ kind: "response", ok: false, status: 0, body: "", contentType: "", finalUrl: parsedUrl.toString() });
            return;
          }
          if (nextUrl.protocol !== "http:" && nextUrl.protocol !== "https:") {
            resolve({ kind: "response", ok: false, status: 0, body: "", contentType: "", finalUrl: parsedUrl.toString() });
            return;
          }
          const target = nextUrl.toString();
          resolve((async (): Promise<FetchResult> => {
            if (options.canFollowRedirect && !(await options.canFollowRedirect(target))) {
              return { kind: "redirect-blocked", status, target };
            }
            return fetchTextWithRedirects(target, options, redirects + 1);
          })());
          return;
        }
        if (status < 200 || status >= 300) {
          response.resume();
          resolve({ kind: "response", ok: false, status, body: "", contentType, finalUrl: parsedUrl.toString() });
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
            resolve({ kind: "response", ok: true, status, body: body.toString("utf8"), contentType, finalUrl: parsedUrl.toString() });
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
        finalUrl: url,
      });
    });

    request.end();
  });
}

/**
 * Fetches robots.txt on its own path: the body is truncated at 500 KiB and parsing continues
 * (RFC 9309 section 2.5), rather than going through the page-size skip path. Transport failures
 * are reported as `kind: "failure"` so the caller can treat them as unreachable.
 */
export async function fetchRobotsTxt(
  url: string,
  options: Pick<FetchOptions, "timeoutMs" | "userAgent">,
  maxBytes = MAX_ROBOTS_BYTES,
  redirects = 0,
): Promise<FetchResult> {
  if (redirects > MAX_REDIRECTS) return { kind: "failure", reason: "Too many redirects" };
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { kind: "failure", reason: "Invalid URL" };
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return { kind: "failure", reason: "Unsupported URL protocol" };
  }
  return new Promise((resolve) => {
    const client = parsedUrl.protocol === "https:" ? https : http;
    const request = client.request(
      parsedUrl,
      { method: "GET", headers: { "User-Agent": options.userAgent, Accept: "text/plain,*/*;q=0.8", "Accept-Encoding": "identity" } },
      (response) => {
        const status = response.statusCode ?? 0;
        const contentType = String(response.headers["content-type"] ?? "");
        response.on("error", (error: Error) => { resolve({ kind: "failure", reason: error.message }); });
        response.on("aborted", () => { resolve({ kind: "failure", reason: "Response aborted" }); });
        const location = response.headers.location;
        if (status >= 300 && status < 400 && location) {
          let nextUrl: string;
          try {
            nextUrl = new URL(location, parsedUrl).toString();
          } catch {
            resolve({ kind: "failure", reason: "Invalid redirect URL" });
            response.destroy();
            return;
          }
          resolve(fetchRobotsTxt(nextUrl, options, maxBytes, redirects + 1));
          response.destroy();
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          resolve({
            kind: "response", ok: status >= 200 && status < 300, status,
            body: Buffer.concat(chunks, bytes).toString("utf8"), contentType, finalUrl: parsedUrl.toString(),
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
    request.setTimeout(options.timeoutMs, () => { request.destroy(new Error("Request timed out")); });
    request.on("error", (error: Error) => { resolve({ kind: "failure", reason: error.message }); });
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
  options: FetchOptions,
  maxSitemaps: number,
  warnings: string[],
  isAllowed: (url: string) => boolean,
  unavailableOrigins: readonly RobotsUnavailable[],
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

    const fetched = await fetchText(sitemapUrl, options);
    if (fetched.kind === "redirect-blocked") {
      warnings.push(redirectSkipWarning(sitemapUrl, fetched.target, unavailableOrigins));
      continue;
    }
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

function queryFileNameSuffix(parsed: URL): string {
  if (!parsed.search) return "";
  const normalizedQuery = parsed.searchParams.toString();
  const hashInput = `${parsed.pathname}?${normalizedQuery}`;
  const hash = createHash("sha256").update(hashInput).digest("hex").slice(0, 8);
  const query = safeFileNameSegment(normalizedQuery.replace(/[=&]/g, "-"));
  if (query.length <= 80) return `__${query}__${hash}`;
  return `__${hash}`;
}

function mirrorPathForUrl(baseDir: string, url: string): string {
  const parsed = new URL(url);
  const rawSegments = parsed.pathname.split("/").filter(Boolean);
  const segments = rawSegments.map(safeFileNameSegment);
  const querySuffix = queryFileNameSuffix(parsed);

  if (segments.length === 0) {
    return path.join(baseDir, `index${querySuffix}.md`);
  }

  const last = segments[segments.length - 1];
  if (!last.includes(".")) {
    if (querySuffix) {
      segments[segments.length - 1] = `${last}${querySuffix}.md`;
      return path.join(baseDir, ...segments);
    }
    return path.join(baseDir, ...segments, `index${querySuffix}.md`);
  }

  segments[segments.length - 1] = `${last.replace(/\.[^.]+$/, "")}${querySuffix}.md`;
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

  const primaryQueue: QueueItem[] = [];
  const sitemapQueue: QueueItem[] = [];
  const waitingSitemapItems = new Map<string, QueueItem>();
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
      const response = await fetchRobotsTxt(new URL("/robots.txt", origin).toString(), fetchOptions);
      let failure: RobotsUnavailable | null = null;
      if (response.kind !== "response") {
        failure = { origin, kind: "error", error: response.kind === "failure" ? response.reason : "redirect blocked" };
      } else if (response.status === 429 || response.status >= 500) {
        failure = { origin, kind: "http", status: response.status };
      }
      if (failure) {
        if (origin !== startUrl.origin) robotsUnavailableOrigins.push(failure);
        return { kind: "unavailable", failure };
      }
      const body = response.kind === "response" && response.ok ? response.body : "";
      return { kind: "available", policy: parseRobots(body) };
    })();
    robotsPolicies.set(origin, pending);
    return pending;
  };
  const unavailableResult = (failure: RobotsUnavailable): CrawlResult => ({
    mode: options.mapOnly ? "map" : options.outputMode,
    startUrl: normalizedStart, outputPath: null,
    discoveredCount: 0, crawledCount: 0, skippedCount: 0, failedFetchCount: 0, warnings, discoveredUrls: [],
    robotsUnavailable: failure, robotsUnavailableOrigins,
  });
  const seedRobots = await getRobotsPolicy(startUrl.origin);
  if (seedRobots.kind === "unavailable") return unavailableResult(seedRobots.failure);
  const robots = seedRobots.policy;
  const skippedByRobots = new Set<string>();
  const isAllowed = (url: string): boolean => {
    const parsed = new URL(url);
    if (isAllowedByRobots(robots, parsed.pathname + parsed.search)) return true;
    if (!skippedByRobots.has(url)) {
      skippedByRobots.add(url);
      warnings.push(`Skipping ${url} (disallowed by robots.txt).`);
    }
    return false;
  };
  const pageFetchOptions: FetchOptions = {
    ...fetchOptions,
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
    pageFetchOptions,
    options.maxSitemaps,
    warnings,
    isAllowed,
    robotsUnavailableOrigins,
  );

  if (!enqueued.has(normalizedStart)) {
    primaryQueue.push({
      url: normalizedStart,
      fetchUrl:
        normalizeUrl(startUrl.toString(), startUrl, true) ?? normalizedStart,
      depth: 0,
      source: "seed",
    });
    enqueued.add(normalizedStart);
  }

  if (sitemapUrls.length > 0) {
    for (const url of sitemapUrls) {
      if (!shouldIncludeUrl(url, includePatterns, excludePatterns)) continue;
      if (enqueued.has(url)) continue;
      const item = {
        url,
        fetchUrl: normalizeUrl(url, startUrl, true) ?? url,
        depth: 0,
        source: "sitemap" as const,
      };
      sitemapQueue.push(item);
      waitingSitemapItems.set(url, item);
      enqueued.add(url);
    }
  }

  const converter = new PageConverter(options);
  let skippedCount = 0;

  try {
    let processedCount = 0;
    let fetches = 0;
    let failedFetchCount = 0;
    let seedSkipReason: string | undefined;

    while ((primaryQueue.length > 0 || sitemapQueue.length > 0) && processedCount < options.maxPages) {
      const fromSitemapTier = primaryQueue.length === 0;
      const item = primaryQueue.shift() ?? sitemapQueue.shift();
      if (!item) break;
      if (fromSitemapTier && item.source === "sitemap") {
        if (waitingSitemapItems.get(item.url) !== item) continue;
        waitingSitemapItems.delete(item.url);
      }
      if (visited.has(item.url)) continue;
      visited.add(item.url);

      if (item.depth > options.maxDepth) continue;
      if (!isInternalUrl(item.url, startUrl)) continue;
      if (!shouldIncludeUrl(item.url, includePatterns, excludePatterns)) continue;
      // Robots-blocked URLs count as neither failed fetches nor skipped conversions.
      if (!isAllowed(item.fetchUrl) || !isAllowed(item.url)) {
        if (item.source === "seed") seedSkipReason = "disallowed by robots.txt";
        continue;
      }

      if (fetches > 0) {
        await sleep(effectiveDelayMs);
      }
      fetches += 1;

      const fetched = await fetchText(item.fetchUrl, pageFetchOptions);
      if (fetched.kind === "redirect-blocked") {
        const targetOrigin = new URL(fetched.target).origin;
        const failure = robotsUnavailableOrigins.find(({ origin }) => origin === targetOrigin);
        if (item.url === normalizedStart && failure) return unavailableResult(failure);
        if (item.source === "seed") seedSkipReason = "redirect disallowed by robots.txt";
        warnings.push(redirectSkipWarning(item.url, fetched.target, robotsUnavailableOrigins));
        continue;
      }
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
          : await converter.convert(`${title || "page"}.html`, fetched.body).catch((error: unknown) => {
            skippedCount += 1;
            throw error;
          });
        const links = item.depth >= options.maxDepth
          ? []
          : extractLinksFromHtml(fetched.body, fetched.finalUrl);

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
          if (!isAllowed(link)) continue;
          if (!isAllowed(normalized)) continue;
          if (!shouldIncludeUrl(normalized, includePatterns, excludePatterns)) continue;
          const promoted = waitingSitemapItems.get(normalized);
          if (promoted) {
            waitingSitemapItems.delete(normalized);
            primaryQueue.push(promoted);
            continue;
          }
          if (enqueued.has(normalized) || visited.has(normalized)) continue;
          primaryQueue.push({
            url: normalized,
            fetchUrl:
              normalizeUrl(link, new URL(fetched.finalUrl), true) ?? normalized,
            depth: item.depth + 1,
            source: "link",
          });
          enqueued.add(normalized);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const reason = error instanceof ConversionTimeoutError ? message : `conversion failed: ${message}`;
        warnings.push(`Skipping ${item.url} (${reason}).`);
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
        skippedCount,
        failedFetchCount,
        seedSkipReason,
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
      skippedCount,
      failedFetchCount,
      seedSkipReason,
      robotsUnavailable: null,
      robotsUnavailableOrigins,
      warnings,
      discoveredUrls: discovered,
    };
  } finally {
    await converter.close();
  }
}
