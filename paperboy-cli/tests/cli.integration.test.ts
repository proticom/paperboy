import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const cliPath = path.join(process.cwd(), "dist", "cli.js");
const blockNetwork = fileURLToPath(new URL("./fixtures/block-network.cjs", import.meta.url));

function runCli(args: string[], configDir: string) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PAPERBOY_CLI_CONFIG_DIR: configDir,
    },
    encoding: "utf8",
  });
}

let tempDir = "";
let configDir = "";

describe("cli integration", () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperboy-cli-it-"));
    configDir = path.join(tempDir, "config");
    await fs.mkdir(configDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("rejects unknown config sub-commands", () => {
    const result = runCli(["config", "foo"], configDir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unknown command 'foo'");
  });

  it.each(["2abc", "1.9", "1e3"])('rejects invalid --max-pages value "%s" before crawling', (value) => {
    const result = runCli(["crawl", "http://127.0.0.1:1", "--max-pages", value], configDir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`max-pages must be a positive integer. Got: '${value}'.`);
  });

  it("still rejects zero max pages", () => {
    const result = runCli(["crawl", "http://127.0.0.1:1", "--max-pages", "0"], configDir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("max-pages must be a positive integer. Got: '0'.");
  });

  it.each([
    ["--max-pages", "positive integer"],
    ["--max-depth", "zero or a positive integer"],
    ["--min-content-words", "zero or a positive integer"],
    ["--rate-limit-ms", "zero or a positive integer"],
    ["--timeout-ms", "positive integer"],
    ["--max-sitemaps", "positive integer"],
  ])("rejects %s above the 32-bit timeout limit", (option, message) => {
    const result = runCli(["crawl", "http://127.0.0.1:1", option, "2147483648"], configDir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`${option.slice(2)} must be at most 2147483647. Got: '2147483648'.`);
    expect(result.stderr).not.toContain(`must be ${message}`);
  });

  it("accepts zero max depth and reaches the network path", () => {
    const result = runCli(["crawl", "http://127.0.0.1:1", "--max-depth", "0"], configDir);
    expect(result.stderr).not.toContain("max-depth must be zero or a positive integer.");
  });

  it("prints config JSON", () => {
    const result = runCli(["config", "show"], configDir);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toEqual({ version: 1, defaults: { includeLayoutTable: false } });
  });

  it("runs doctor in JSON mode", () => {
    const result = runCli(["doctor", "--json", "--offline"], configDir);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.checks.find((check: { name: string }) => check.name === "Converter smoke test")?.status).toBe("ok");
    expect(parsed.summary.fail).toBe(0);
  });

  it("rejects the removed image description flag", () => {
    const result = runCli(["convert", "scan.png", "--describe-image"], configDir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("error: unknown option '--describe-image'");
  });

  it("converts file and writes markdown output", async () => {
    const inputPath = path.join(tempDir, "dispatch.txt");
    await fs.writeFile(inputPath, "Local\nEdition", "utf8");

    const result = runCli(["convert", inputPath], configDir);
    expect(result.status).toBe(0);

    const outputPath = path.join(tempDir, "dispatch.md");
    const markdown = await fs.readFile(outputPath, "utf8");
    expect(markdown).toBe("Local\nEdition");
  });

  it("creates missing parent directories for -o output", async () => {
    const inputPath = path.join(tempDir, "scan.txt");
    await fs.writeFile(inputPath, "Morning edition", "utf8");
    const outputPath = path.join(tempDir, "nested", "deeper", "out.md");

    const result = runCli(["convert", inputPath, "-o", outputPath], configDir);
    expect(result.status).toBe(0);

    const markdown = await fs.readFile(outputPath, "utf8");
    expect(markdown).toBe("Morning edition");
  });

  it("prints convert --stdout warnings on stderr", async () => {
    const inputPath = path.join(tempDir, "scan.png");
    await fs.copyFile(new URL("./fixtures/offline-ocr.png", import.meta.url), inputPath);
    const networkLog = path.join(tempDir, "network.log");

    const result = spawnSync(process.execPath, [
      "--require", blockNetwork, cliPath, "convert", inputPath, "--stdout",
    ], {
      cwd: tempDir,
      env: {
        ...process.env,
        PAPERBOY_CLI_CONFIG_DIR: configDir,
        PAPERBOY_TEST_NETWORK_LOG: networkLog,
      },
      encoding: "utf8",
      timeout: 30000,
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("PAPERBOY OFFLINE\n");
    expect(result.stdout).not.toContain("Warnings:");
    expect(result.stderr).toContain("Warnings:");
    expect(await fs.readFile(networkLog, "utf8").catch(() => "")).toBe("");
  });

  it("documents --ocr-layout and hides the deprecated switch", () => {
    const result = runCli(["convert", "--help"], configDir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("--ocr-layout");
    expect(result.stdout).toContain("--no-ocr-layout");
    expect(result.stdout).toContain("Include the OCR word-position table for image conversion");
    expect(result.stdout).not.toContain("--no-layout-table");
  });

  it.each([
    { flags: [], configured: undefined, table: false },
    { flags: ["--ocr-layout"], configured: undefined, table: true },
    { flags: ["--no-layout-table"], configured: undefined, table: false },
    { flags: ["--no-ocr-layout"], configured: undefined, table: false },
    { flags: ["--no-ocr-layout"], configured: true, table: false },
    { flags: ["--ocr-layout", "--no-ocr-layout"], configured: true, table: false },
    { flags: ["--no-ocr-layout", "--ocr-layout"], configured: true, table: false },
    { flags: [], configured: true, table: true },
    { flags: ["--no-layout-table"], configured: true, table: false },
    { flags: ["--ocr-layout"], configured: false, table: true },
    { flags: ["--ocr-layout", "--no-layout-table"], configured: true, table: false },
    { flags: ["--no-layout-table", "--ocr-layout"], configured: true, table: false },
  ])("wires OCR layout options %j", async ({ flags, configured, table }) => {
    if (configured !== undefined) {
      await fs.writeFile(path.join(configDir, "config.json"), JSON.stringify({
        version: 1, defaults: { includeLayoutTable: configured },
      }));
    }
    const fixture = fileURLToPath(new URL("./fixtures/offline-ocr.png", import.meta.url));
    const result = runCli(["convert", fixture, "--stdout", "--json", ...flags], configDir);
    expect(result.status, result.stderr).toBe(0);
    const { markdown } = JSON.parse(result.stdout);
    expect(markdown).toBe(table
      ? "PAPERBOY OFFLINE\n\n## Text Positioning\n\n| Text | Confidence | Left | Top | Width | Height |\n| --- | ---: | ---: | ---: | ---: | ---: |\n| PAPERBOY | 96.0 | 24 | 42 | 236 | 37 |\n| OFFLINE | 96.0 | 275 | 42 | 188 | 37 |"
      : "PAPERBOY OFFLINE");
  });

  it("converts file with stdout JSON output", async () => {
    const inputPath = path.join(tempDir, "note.txt");
    await fs.writeFile(inputPath, "Hello world", "utf8");

    const result = runCli(["convert", inputPath, "--stdout", "--json"], configDir);
    expect(result.status).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.inputPath).toBe(inputPath);
    expect(parsed.outputPath).toBeNull();
    expect(parsed.markdown).toBe("Hello world");
    expect(parsed.warnings).toEqual([]);
  });
});
