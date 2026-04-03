import { describe, it, expect } from "vitest";
import { createTurndownService } from "../src/turndown-config.js";

describe("createTurndownService", () => {
  it("returns a working turndown instance", () => {
    const service = createTurndownService();
    const result = service.turndown("<p>Hello world</p>");
    expect(result).toBe("Hello world");
  });

  it("uses atx-style headings (# syntax)", () => {
    const service = createTurndownService();
    const result = service.turndown("<h1>Title</h1><h2>Subtitle</h2>");
    expect(result).toContain("# Title");
    expect(result).toContain("## Subtitle");
  });

  it("uses fenced code blocks (triple backticks)", () => {
    const service = createTurndownService();
    const result = service.turndown("<pre><code>const x = 1;</code></pre>");
    expect(result).toContain("```");
    expect(result).toContain("const x = 1;");
  });

  it("uses dash for bullet lists", () => {
    const service = createTurndownService();
    const result = service.turndown("<ul><li>One</li><li>Two</li></ul>");
    expect(result).toContain("-   One");
    expect(result).toContain("-   Two");
  });

  it("uses asterisk for emphasis", () => {
    const service = createTurndownService();
    const result = service.turndown("<p><em>italic</em></p>");
    expect(result).toBe("*italic*");
  });

  it("strips SCRIPT tags", () => {
    const service = createTurndownService();
    const result = service.turndown(
      '<div><p>Keep this</p><script>alert("bad")</script></div>'
    );
    expect(result).toContain("Keep this");
    expect(result).not.toContain("alert");
    expect(result).not.toContain("script");
  });

  it("strips STYLE tags", () => {
    const service = createTurndownService();
    const result = service.turndown(
      "<div><p>Keep this</p><style>.foo { color: red; }</style></div>"
    );
    expect(result).toContain("Keep this");
    expect(result).not.toContain(".foo");
    expect(result).not.toContain("color");
  });

  it("strips NOSCRIPT tags", () => {
    const service = createTurndownService();
    const result = service.turndown(
      "<div><p>Keep this</p><noscript>Enable JS</noscript></div>"
    );
    expect(result).toContain("Keep this");
    expect(result).not.toContain("Enable JS");
  });

  it("handles GFM tables", () => {
    const service = createTurndownService();
    const html = `
      <table>
        <thead><tr><th>Name</th><th>Age</th></tr></thead>
        <tbody><tr><td>Alice</td><td>30</td></tr></tbody>
      </table>
    `;
    const result = service.turndown(html);
    expect(result).toContain("Name");
    expect(result).toContain("Age");
    expect(result).toContain("|");
  });

  it("handles GFM strikethrough", () => {
    const service = createTurndownService();
    const result = service.turndown("<p><del>removed</del></p>");
    expect(result).toContain("~removed~");
  });

  it("handles empty input without crashing", () => {
    const service = createTurndownService();
    const result = service.turndown("");
    expect(result).toBe("");
  });

  it("handles complex nested HTML", () => {
    const service = createTurndownService();
    const html = `
      <article>
        <h1>Article Title</h1>
        <p>Paragraph with <strong>bold</strong> and <em>italic</em>.</p>
        <ul>
          <li>Item one</li>
          <li>Item two with <a href="https://example.com">a link</a></li>
        </ul>
      </article>
    `;
    const result = service.turndown(html);
    expect(result).toContain("# Article Title");
    expect(result).toContain("**bold**");
    expect(result).toContain("*italic*");
    expect(result).toContain("-   Item one");
    expect(result).toContain("[a link](https://example.com)");
  });
});
