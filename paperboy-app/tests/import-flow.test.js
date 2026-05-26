import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@proticom/paperboy-ai", () => ({
  describeImageWithAi: vi.fn().mockResolvedValue("DESCRIBED IMAGE"),
}));

import { describeImageWithAi } from "@proticom/paperboy-ai";
import { convertImportedFile } from "../src/scripts/converter.js";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

beforeEach(() => {
  localStorage.clear();
  describeImageWithAi.mockClear();
  describeImageWithAi.mockResolvedValue("DESCRIBED IMAGE");
});

describe("convertImportedFile", () => {
  it("passes markdown through unchanged", async () => {
    const result = await convertImportedFile({
      path: "notes.md",
      text: "# Hello\n\nWorld",
      base64: null,
      invoke: null,
    });

    expect(result.markdown).toContain("# Hello");
    expect(result.title).toBe("notes");
    expect(result.warnings).toHaveLength(0);
  });

  it("converts HTML to markdown", async () => {
    const result = await convertImportedFile({
      path: "page.html",
      text: "<h1>Heading</h1><p>Body</p>",
      base64: null,
      invoke: null,
    });

    expect(result.markdown).toContain("# Heading");
    expect(result.markdown).toContain("Body");
  });

  it("converts CSV to a markdown table", async () => {
    const result = await convertImportedFile({
      path: "data.csv",
      text: "Name,Role\nAda,Engineer",
      base64: null,
      invoke: null,
    });

    expect(result.markdown).toMatch(/\| Name \| Role \|/);
    expect(result.markdown).toContain("Ada");
  });

  it("imports PNG without AI description when provider is disabled", async () => {
    localStorage.setItem(
      "paperboy-app-ai-settings",
      JSON.stringify({ provider: "disabled", baseUrl: "", model: "" }),
    );

    const result = await convertImportedFile({
      path: "scan.png",
      text: null,
      base64: TINY_PNG_BASE64,
      invoke: null,
    });

    expect(result).toBeDefined();
    expect(describeImageWithAi).not.toHaveBeenCalled();
    expect(
      result.warnings.some(
        (warning) =>
          warning.includes("OCR") || warning.includes("No readable text"),
      ),
    ).toBe(true);
  });

  it("falls back for unsupported extensions", async () => {
    const result = await convertImportedFile({
      path: "weird.zzz",
      text: "raw",
      base64: null,
      invoke: null,
    });

    expect(result.markdown).toBe("raw");
    expect(result.warnings).toContain("Unsupported file format: .zzz");
  });

  it("wires describeImage when AI is enabled", async () => {
    localStorage.setItem(
      "paperboy-app-ai-settings",
      JSON.stringify({ provider: "openai", model: "gpt-4o-mini", baseUrl: "" }),
    );

    const invoke = vi.fn(async (cmd) => {
      if (cmd === "get_api_key") return "sk-test";
      return null;
    });

    const result = await convertImportedFile({
      path: "scan.png",
      text: null,
      base64: TINY_PNG_BASE64,
      invoke,
    });

    expect(invoke).toHaveBeenCalledWith("get_api_key", { provider: "openai" });
    expect(describeImageWithAi).toHaveBeenCalled();
    expect(describeImageWithAi).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "sk-test",
        imageMimeType: "image/png",
      }),
    );
    expect(result.markdown).toContain("DESCRIBED IMAGE");
  });
});
