import { describe, expect, it } from "vitest";
import { isAllowedByRobots, parseRobots } from "../src/robots.ts";

describe("robots rules", () => {
  it("selects paperboy case-insensitively, shares consecutive agents and merges matching groups", () => {
    const policy = parseRobots(`User-agent: *
Disallow: /
Crawl-delay: 10
User-agent: OtherBot
User-agent: PaPeRbOy
Disallow: /private
Crawl-delay: 0.2
User-agent: paperboy
Disallow: /drafts
User-agent: unrelated
Disallow: /public
`);
    expect(isAllowedByRobots(policy, "/private/secret")).toBe(false);
    expect(isAllowedByRobots(policy, "/drafts/post")).toBe(false);
    expect(isAllowedByRobots(policy, "/public")).toBe(true);
    expect(policy.crawlDelaySeconds).toBe(0.2);
  });

  it("selects the exact product token case-insensitively", () => {
    const policy = parseRobots("User-agent: paper\nDisallow: /short\nUser-agent: PAPERBOY\nDisallow: /long");
    expect(isAllowedByRobots(policy, "/short")).toBe(true);
    expect(isAllowedByRobots(policy, "/long")).toBe(false);
  });

  it.each(["paper", "boy"])("rejects partial agent token %s", (agent) => {
    const policy = parseRobots(`User-agent: ${agent}\nDisallow: /wrong\nCrawl-delay: 8\nUser-agent: *\nDisallow: /fallback`);
    expect(isAllowedByRobots(policy, "/wrong")).toBe(true);
    expect(isAllowedByRobots(policy, "/fallback")).toBe(false);
    expect(policy.crawlDelaySeconds).toBeNull();
    expect(isAllowedByRobots(parseRobots(`User-agent: ${agent}\nDisallow: /`), "/any")).toBe(true);
  });

  it("normalizes bare wildcard Allow and Disallow rules", () => {
    expect(isAllowedByRobots(parseRobots("User-agent: *\nDisallow: *"), "/anything")).toBe(false);
    const policy = parseRobots("User-agent: *\nDisallow: /*\nAllow: *");
    expect(isAllowedByRobots(policy, "/anything")).toBe(true);
  });

  it.each([
    ["/café", "/caf%C3%A9"],
    ["/caf%c3%a9", "/café"],
    ["/enc%7Ejoe", "/enc~joe"],
    ["/enc~joe", "/enc%7ejoe"],
    ["/reserved%2fpath", "/reserved%2Fpath"],
  ])("percent-normalizes rule %s and path %s", (rule, path) => {
    expect(isAllowedByRobots(parseRobots(`User-agent: *\nDisallow: ${rule}`), path)).toBe(false);
  });

  it("keeps encoded reserved characters distinct from literal characters", () => {
    const policy = parseRobots("User-agent: *\nDisallow: /reserved%2Fpath");
    expect(isAllowedByRobots(policy, "/reserved/path")).toBe(true);
    expect(isAllowedByRobots(policy, "/reserved%2fpath")).toBe(false);
  });

  it("falls back to and merges wildcard groups", () => {
    const policy = parseRobots("User-agent: *\nDisallow: /one\nUser-agent: other\nDisallow: /three\nUser-agent: *\nDisallow: /two");
    expect(isAllowedByRobots(policy, "/one")).toBe(false);
    expect(isAllowedByRobots(policy, "/two")).toBe(false);
    expect(isAllowedByRobots(policy, "/three")).toBe(true);
  });

  it("uses the longest matching path and keeps paths case-sensitive", () => {
    const policy = parseRobots("User-agent: *\nDisallow: /private\nAllow: /private/public\nDisallow: /private/public/secret");
    expect(isAllowedByRobots(policy, "/private/post")).toBe(false);
    expect(isAllowedByRobots(policy, "/private/public/post")).toBe(true);
    expect(isAllowedByRobots(policy, "/private/public/secret/post")).toBe(false);
    expect(isAllowedByRobots(policy, "/Private/post")).toBe(true);
    expect(isAllowedByRobots(policy, "/other/private")).toBe(true);
  });

  it.each([
    "Disallow: /same\nAllow: /same",
    "Allow: /same\nDisallow: /same",
  ])("prefers Allow on equal length regardless of order (%s)", (rules) => {
    expect(isAllowedByRobots(parseRobots(`User-agent: *\n${rules}`), "/same/post")).toBe(true);
  });

  it("supports wildcards and end anchors on path plus query and escapes regex characters", () => {
    const policy = parseRobots("User-agent: *\nDisallow: /*.pdf$\nDisallow: /search?*secret\nDisallow: /a+b$");
    expect(isAllowedByRobots(policy, "/docs/report.pdf")).toBe(false);
    expect(isAllowedByRobots(policy, "/report.pdf?download=1")).toBe(true);
    expect(isAllowedByRobots(policy, "/docs/report.pdf/more")).toBe(true);
    expect(isAllowedByRobots(policy, "/search?q=secret")).toBe(false);
    expect(isAllowedByRobots(policy, "/search?q=public")).toBe(true);
    expect(isAllowedByRobots(policy, "/a+b")).toBe(false);
    expect(isAllowedByRobots(policy, "/ab")).toBe(true);
  });

  it("ignores empty Disallow and Allow without overriding other rules", () => {
    const policy = parseRobots("User-agent: *\nDisallow:\nAllow:\nDisallow: /private");
    expect(isAllowedByRobots(policy, "/")).toBe(true);
    expect(isAllowedByRobots(policy, "/private")).toBe(false);
    expect(isAllowedByRobots(parseRobots("User-agent: *\nDisallow:"), "/anything")).toBe(true);
  });

  it("ignores comments, BOM, CRLF and unknown lines including Sitemap", () => {
    const policy = parseRobots("\uFEFF # comment\r\nUser-Agent: paperboy # bot\r\nSitemap: /ignored.xml\r\nUser-agent: other\r\n\r\nDisallow: /hidden # comment\r\nCrawl-Delay: 0.25 # seconds\r\nUnknown: value\r\n");
    expect(isAllowedByRobots(policy, "/hidden/item")).toBe(false);
    expect(isAllowedByRobots(policy, "/visible")).toBe(true);
    expect(policy.crawlDelaySeconds).toBe(0.25);
  });

  it("applies no rules or delay when no agent matches", () => {
    const policy = parseRobots("Disallow: /ignored\nUser-agent: other\nDisallow: /\nCrawl-delay: 9");
    expect(isAllowedByRobots(policy, "/anything")).toBe(true);
    expect(policy.rules).toEqual([]);
    expect(policy.crawlDelaySeconds).toBeNull();
  });

  it("rejects invalid delays and uses the largest valid delay in merged groups", () => {
    const policy = parseRobots("User-agent: *\nCrawl-delay: -1\nCrawl-delay: Infinity\nCrawl-delay: 2junk\nCrawl-delay: 0.2\nUser-agent: *\nCrawl-delay: .3");
    expect(policy.crawlDelaySeconds).toBe(0.3);
    expect(parseRobots("User-agent: *\nCrawl-delay: -1").crawlDelaySeconds).toBeNull();
  });

  it("caps parsing at 500 KiB of UTF-8 text", () => {
    const prefix = "User-agent: *\nDisallow: /kept\n#";
    const padding = "é".repeat(Math.ceil((500 * 1024 - Buffer.byteLength(prefix)) / 2));
    const policy = parseRobots(`${prefix}${padding}\nDisallow: /outside\nCrawl-delay: 9`);
    expect(isAllowedByRobots(policy, "/kept")).toBe(false);
    expect(isAllowedByRobots(policy, "/outside")).toBe(true);
    expect(policy.crawlDelaySeconds).toBeNull();
  });
});
