import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const cliPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const preload = fileURLToPath(new URL("./fixtures/block-network.cjs", import.meta.url));
let tempDir = "";

describe("offline image OCR", () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperboy-offline-ocr-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("ships non-empty gzip language data in the build", async () => {
    const data = await fs.readFile(new URL("../dist/lang/eng.traineddata.gz", import.meta.url));
    expect([...data.subarray(0, 2)]).toEqual([0x1f, 0x8b]);
    expect(gunzipSync(data).byteLength).toBeGreaterThan(0);
  });

  it("blocks network access inside Node workers", async () => {
    const networkLog = path.join(tempDir, "network.log");
    const result = spawnSync(process.execPath, [
      "--require", preload, "--eval",
      `new (require('node:worker_threads').Worker)(
        "fetch('https://example.invalid/eng.traineddata.gz')", { eval: true }
      )`,
    ], {
      cwd: tempDir,
      env: { ...process.env, PAPERBOY_TEST_NETWORK_LOG: networkLog },
      encoding: "utf8",
      timeout: 10000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Network access blocked by offline OCR test");
    expect(await fs.readFile(networkLog, "utf8")).toBe("https://example.invalid/eng.traineddata.gz\n");
  });

  it("converts an image with no network requests or cwd language cache", async () => {
    const inputPath = path.join(tempDir, "scan.png");
    const networkLog = path.join(tempDir, "network.log");
    await fs.copyFile(new URL("./fixtures/offline-ocr.png", import.meta.url), inputPath);

    for (const flags of [[], ["--no-layout-table"]]) {
      const result = spawnSync(process.execPath, [
        "--require", preload, cliPath, "convert", inputPath, "--stdout", "--json", ...flags,
      ], {
        cwd: tempDir,
        env: {
          ...process.env,
          PAPERBOY_CLI_CONFIG_DIR: path.join(tempDir, "config"),
          PAPERBOY_TEST_NETWORK_LOG: networkLog,
        },
        encoding: "utf8",
        timeout: 30000,
      });

      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      const converted: unknown = JSON.parse(result.stdout);
      expect(converted).toMatchObject({
        markdown: "PAPERBOY OFFLINE",
        warnings: ["OCR runs locally and may take longer on large images."],
      });
      const files = await fs.readdir(tempDir);
      expect(files.filter((file) => /\.traineddata(?:\.gz)?$/.test(file))).toEqual([]);
      expect(files.includes("network.log")).toBe(false);
    }
  });

  it.each([
    { fixture: "ocr-lists.png", lines: [
      "Supply list", "« Notebook", "« Water bottle", "« Spare cable", "Name:", "Email:",
      "Receipt", "Tea 2.50", "Bread 3.25", "Total 5.75",
    ] },
    { fixture: "ocr-code.png", lines: [
      "function count (items) {", "let total = 0;", "for (const item of items) {", "total += item;",
      "}", "return total;", "}", "const size = count (items);",
    ] },
    { fixture: "ocr-codes.png", lines: [
      "SKU-7284", "https://example.org/help/42", "help@example.org", "v4.2.1", "2027-04-18", "$5",
    ] },
    { fixture: "ocr-pipes.png", lines: [
      "| name | team | city |", "| erin | ops | leeds |", "| omar | dev | parma |", "| lina | ux | turin |",
    ] },
    { fixture: "ocr-heading.png", lines: [
      "Community Library", "Annual Service Review", "This report covers the work completed this year.",
      "The team improved service across every branch.",
    ] },
    { fixture: "ocr-table.png", lines: [
      "Name Role City Start", "Eva Stone Operator Dublin 2024", "Milan Reed Analyst Bergen 2020",
    ] },
  ])("preserves real OCR line structure and complete text in $fixture offline", async ({ fixture, lines }) => {
    const inputPath = fileURLToPath(new URL(`./fixtures/${fixture}`, import.meta.url));
    const networkLog = path.join(tempDir, "network.log");
    const result = spawnSync(process.execPath, [
      "--require", preload, cliPath, "convert", inputPath, "--stdout", "--json",
    ], {
      cwd: tempDir,
      env: { ...process.env, PAPERBOY_CLI_CONFIG_DIR: path.join(tempDir, "config"), PAPERBOY_TEST_NETWORK_LOG: networkLog },
      encoding: "utf8", timeout: 30000,
    });
    expect(result.status, result.stderr).toBe(0);
    const converted = JSON.parse(result.stdout);
    expect(converted.markdown.split("\n").filter(Boolean)).toEqual(lines);
    if (fixture === "ocr-heading.png") {
      expect(converted.markdown).toBe("Community Library\nAnnual Service Review\n\nThis report covers the work completed this year.\nThe team improved service across every branch.");
    }
    expect((await fs.readdir(tempDir)).filter((file) => /network|traineddata/.test(file))).toEqual([]);
  });

});
