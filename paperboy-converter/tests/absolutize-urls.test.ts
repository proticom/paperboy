import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";

import { absolutizeUrls } from "../src/helpers.js";

const baseUrl = "https://example.org/articles/current?old=1#old";

describe("absolutizeUrls", () => {
  it.each([
    ["/root?q=1#part", "https://example.org/root?q=1#part"],
    ["../x", "https://example.org/x"],
    ["x", "https://example.org/articles/x"],
    ["//cdn.example.org/image.png", "https://cdn.example.org/image.png"],
    ["?q=1#part", "https://example.org/articles/current?q=1#part"],
  ])("resolves href and src %s", (value, expected) => {
    const { document } = parseHTML(`<a href="${value}">Link</a><img src="${value}">`);

    absolutizeUrls(document, baseUrl);

    expect(document.querySelector("a")?.getAttribute("href")).toBe(expected);
    expect(document.querySelector("img")?.getAttribute("src")).toBe(expected);
  });

  it("uses an HTTP base scheme for protocol-relative URLs", () => {
    const { document } = parseHTML('<img src="//cdn.example.org/image.png">');

    absolutizeUrls(document, "http://example.org/article");

    expect(document.querySelector("img")?.getAttribute("src"))
      .toBe("http://cdn.example.org/image.png");
  });

  it("resolves srcset candidates and preserves descriptors and data URLs", () => {
    const { document } = parseHTML('<picture><source srcset="/small.png 320w, ../wide.png 640w"><img srcset="image.png, //cdn.example.org/large.png 2x, data:image/png;base64,AAAA 3x"></picture>');

    absolutizeUrls(document, baseUrl);

    expect(document.querySelector("source")?.getAttribute("srcset"))
      .toBe("https://example.org/small.png 320w, https://example.org/wide.png 640w");
    expect(document.querySelector("img")?.getAttribute("srcset"))
      .toBe("https://example.org/articles/image.png, https://cdn.example.org/large.png 2x, data:image/png;base64,AAAA 3x");
    const once = document.toString();
    absolutizeUrls(document, baseUrl);
    expect(document.toString()).toBe(once);
  });

  it.each([
    "#part", "mailto:reader@example.org", "tel:+15550100",
    "data:image/png;base64,AAAA", "javascript:void(0)",
    "https://EXAMPLE.org:443/a/../image.png", "ftp://example.org/image.png",
    "//[invalid", "http://[invalid", "", "  #part", " MAILTO:reader@example.org ",
  ])("leaves %j untouched without throwing", (value) => {
    const { document } = parseHTML(`<a href="${value}">Link</a><img src="${value}">`);
    const before = document.toString();

    absolutizeUrls(document, baseUrl);

    expect(document.toString()).toBe(before);
  });

  it.each(["", "not a URL", "//example.org"])("ignores invalid base %j without throwing", (base) => {
    const { document } = parseHTML('<a href="/root">Link</a><img src="../image.png" srcset="/small.png 1x, /large.png 2x">');
    const before = document.toString();

    absolutizeUrls(document, base);

    expect(document.toString()).toBe(before);
  });
});
