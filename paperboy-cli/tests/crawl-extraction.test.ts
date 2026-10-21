import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";

import { extractLinksFromHtml, extractTitle } from "../src/crawl.ts";

const baseUrl = "https://example.test/dir/page";

// Reference copy of master's single-pass entity decoder (post-#42), applied to reference titles and hrefs.
const REFERENCE_NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function referenceDecode(value: string): string {
  return value.replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi, (entity, dec?: string, hex?: string, name?: string) => {
    if (name !== undefined) return REFERENCE_NAMED_ENTITIES[name.toLowerCase()] ?? entity;
    const code = dec !== undefined ? Number(dec) : Number.parseInt(hex ?? "", 16);
    if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return entity;
    return String.fromCodePoint(code);
  });
}

function oldTitle(html: string, fallbackUrl: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = match?.[1]?.replace(/\s+/g, " ").trim();
  if (title) return referenceDecode(title);
  try {
    const parsed = new URL(fallbackUrl);
    if (parsed.pathname === "/" || parsed.pathname === "") return parsed.hostname;
    return parsed.pathname.split("/").filter(Boolean).slice(-1)[0] ?? parsed.hostname;
  } catch {
    return fallbackUrl;
  }
}

function oldLinks(html: string, base: string): string[] {
  const links: string[] = [];
  const pattern = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+))/gi;
  for (const match of html.matchAll(pattern)) {
    const href = referenceDecode((match[1] ?? match[2] ?? match[3] ?? "").trim());
    if (!href) continue;
    const lower = href.toLowerCase();
    if (
      lower.startsWith("#") || lower.startsWith("mailto:") ||
      lower.startsWith("tel:") || lower.startsWith("javascript:") ||
      lower.startsWith("data:")
    ) continue;
    try {
      links.push(new URL(href, base).toString());
    } catch {
      // The oracle retains the original malformed-URL handling.
    }
  }
  return links;
}

function randomHtml(seed: number, count: number): string[] {
  const alphabet = [
    "<", ">", "a", "A", "<a", "<A", "title", "TITLE", "<title",
    "</title>", "</TITLE>", "href", "HREF", "=", '"', "'", " ", "\t",
    "\n", "`", "-", "_", "x", "/", "&amp;", "#", "\u00a0", "\u2028",
    "\uFEFF", "\u017f", "\u212a", "\ud800", "\u0130",
  ];
  let state = seed;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  return Array.from({ length: count }, () => {
    const length = next() % 201;
    let html = "";
    while (html.length < length) html += alphabet[next() % alphabet.length];
    return html.slice(0, length);
  });
}

describe("crawl extraction", () => {
  it("matches the old regexes on 5,000 seeded random HTML strings", () => {
    for (const html of randomHtml(0x4e31, 5000)) {
      expect(extractTitle(html, baseUrl), JSON.stringify(html)).toBe(oldTitle(html, baseUrl));
      expect(extractLinksFromHtml(html, baseUrl), JSON.stringify(html)).toEqual(oldLinks(html, baseUrl));
    }
  });

  it("matches the old regexes around random tag contents and global match boundaries", () => {
    for (const content of randomHtml(0xfeed, 5000)) {
      const html = `<title ${content}>${content}</TITLE><a ${content} href=tail><a href=after>`;
      expect(extractTitle(html, baseUrl), JSON.stringify(html)).toBe(oldTitle(html, baseUrl));
      expect(extractLinksFromHtml(html, baseUrl), JSON.stringify(html)).toEqual(oldLinks(html, baseUrl));
    }
  });

  it.each([
    ['<a <a href=x>', ["https://example.test/dir/x"]],
    ['<a data-href=x>', ["https://example.test/dir/x"]],
    ['<abbr href=x>', []],
    ['<A HREF = "x">', ["https://example.test/dir/x"]],
    ['<a href="unclosed href=x>', ["https://example.test/dir/x"]],
    ["<a href='unclosed href=x>", ["https://example.test/dir/x"]],
    ['<a href="x>y">', ["https://example.test/dir/x%3Ey"]],
    ["<a href='x>y'>", ["https://example.test/dir/x%3Ey"]],
    ['<a href="x> <a href=y"> <a href=z>', ["https://example.test/dir/x%3E%20%3Ca%20href=y", "https://example.test/dir/z"]],
    ['<a href= > <a href=x>', ["https://example.test/dir/x"]],
    ['<a _href=x xhref=y -href=z>', ["https://example.test/dir/z"]],
    ['<a href="" href=x><a href=y>', ["https://example.test/dir/y"]],
    ['<a href=\uFEFF\u2028x>', ["https://example.test/dir/x"]],
    ['<a href=#x><a href=mailto:x><a href=tel:x><a href=javascript:x><a href=data:x><a href=/ok>', ["https://example.test/ok"]],
    ['<a href="http://["> <a href=../ok>', ["https://example.test/ok"]],
    ['<a', []],
  ])("preserves href semantics for %j", (html, expected) => {
    expect(oldLinks(html, baseUrl)).toEqual(expected);
    expect(extractLinksFromHtml(html, baseUrl)).toEqual(expected);
  });

  it.each([
    ['<title class="heading"> A\t &amp;\nB </title>', "A & B"],
    ['<TITLE>x</TITLE>', "x"],
    ['<titlex>x</title>', "x"],
    ['<title>missing', "page"],
    ['<title', "page"],
    ['<title<title>later</title>', "later"],
    ['<title>first<title>second</title>', "first<title>second"],
    ['<title>first<title>second', "page"],
    ['<title<title', "page"],
    ['<title> \t </title><title>later</title>', "page"],
    ['<title>&amp;lt;&quot;&#39;&gt;</title>', '&lt;"\'>'],
  ])("preserves title semantics for %j", (html, expected) => {
    expect(oldTitle(html, baseUrl)).toBe(expected);
    expect(extractTitle(html, baseUrl)).toBe(expected);
  });

  it("uses only the first title start even when it fails", () => {
    const prefixes = ["<title", "<TITLE", "<title>", "<titlex>", "<title attr="];
    const suffixes = ["", "<title", "<title>", "<TITLE>x", "<titlex>y"];
    for (const prefix of prefixes) {
      for (const suffix of suffixes) {
        const html = prefix + suffix;
        expect(oldTitle(html, baseUrl)).toBe("page");
        expect(extractTitle(html, baseUrl)).toBe("page");
      }
    }
  });

  it.each(["https://example.test/", "invalid URL"])("preserves the title fallback for %s", (fallback) => {
    expect(extractTitle("", fallback)).toBe(oldTitle("", fallback));
  });

  // The worst inputs for the old regexes: repeated "<title>", unclosed "<title", "<a " and "<a" with no space.
  it.each(["<title>", "<title", "<a ", "<a"])(
    "extracts a 1 MiB repeated %j body in under two seconds",
    (unit) => {
      const html = unit.repeat(Math.ceil(2 ** 20 / unit.length)).slice(0, 2 ** 20);
      const start = performance.now();
      const title = extractTitle(html, baseUrl);
      const links = extractLinksFromHtml(html, baseUrl);
      const elapsed = performance.now() - start;
      const expectedLinks = unit.includes("href")
        ? Array.from({ length: Math.floor(html.length / unit.length / 2) }, () => "https://example.test/dir/%3Ca%20href=")
        : [];
      expect(title).toBe("page");
      expect(links).toEqual(expectedLinks);
      console.info(`${JSON.stringify(unit)} (${html.length} bytes): ${elapsed.toFixed(2)} ms`);
      expect(elapsed).toBeLessThan(2000);
    },
  );
});
