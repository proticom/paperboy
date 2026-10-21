import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const cliPath = path.join(process.cwd(), "dist", "cli.js");
const blockNetwork = fileURLToPath(new URL("./fixtures/block-network.cjs", import.meta.url));
const robotsUnavailable = fileURLToPath(new URL("./fixtures/robots-unavailable.cjs", import.meta.url));
const conversionFailure = fileURLToPath(new URL("./fixtures/conversion-failure.cjs", import.meta.url));

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

// Swaps in the controlled conversion worker and shortens the 30 s conversion timeout (tests/fixtures/conversion-failure.cjs).
function runCliWithConversionFailure(args: string[], configDir: string) {
  return runCliAsync(args, configDir, ["--require", conversionFailure]);
}

function runCliAsync(args: string[], configDir: string, nodeArgs: string[] = []): Promise<{
  status: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...nodeArgs, cliPath, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, PAPERBOY_CLI_CONFIG_DIR: configDir },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

async function startCrawlServer(): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server = http.createServer((req, res) => {
    if (req.url === "/json") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end("{}");
      return;
    }
    if (req.url === "/missing") {
      res.statusCode = 404;
      res.end("missing");
      return;
    }
    if (req.url === "/error") {
      res.statusCode = 500;
      res.end("error");
      return;
    }
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end("<html><head><title>Home</title></head><body><p>Healthy page content.</p><a href=\"/missing\">Missing</a></body></html>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

async function startFailureCrawlServer(): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    res.statusCode = 200;
    res.setHeader("content-type", "text/html; charset=utf-8");
    if (pathname === "/") {
      res.end('<p>Healthy seed.</p><a href="/oversize">Oversize</a><a href="/bad-gzip">Bad gzip</a><a href="/zstd">Zstd</a>');
    } else if (pathname === "/oversize") {
      res.end("<p>" + "x".repeat(9 * 1024 * 1024) + "</p>");
    } else if (pathname === "/bad-gzip") {
      res.setHeader("content-encoding", "gzip");
      res.end("not gzip");
    } else if (pathname === "/zstd") {
      res.setHeader("content-encoding", "zstd-bogus");
      res.end("<p>body</p>");
    } else if (pathname === "/conv-hang" || pathname === "/conv-error") {
      res.end(pathname === "/conv-hang" ? "HANG" : "ERROR");
    } else if (pathname === "/conv-parent") {
      res.end('<p>Parent has enough words for the minimum content filter.</p><a href="/conv-error-child">Child</a>');
    } else if (pathname === "/conv-error-child") {
      res.end("ERROR");
    } else {
      res.statusCode = 404;
      res.end("missing");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
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

  it.each([
    { flags: [], scenario: "page", status: "503", reason: "HTTP 503" },
    { flags: ["--json"], scenario: "page", status: "429", reason: "HTTP 429" },
    { flags: ["--map"], scenario: "page", status: "error", reason: "ECONNRESET" },
    { flags: ["--map", "--json"], scenario: "page", status: "503", reason: "HTTP 503" },
    { flags: [], scenario: "seed", status: "503", reason: "HTTP 503" },
    { flags: ["--json"], scenario: "seed", status: "error", reason: "ECONNRESET" },
    { flags: ["--map"], scenario: "seed", status: "429", reason: "HTTP 429" },
    { flags: ["--map", "--json"], scenario: "seed", status: "503", reason: "HTTP 503" },
  ])("reports cross-origin robots failures without changing page exit codes ($scenario, $flags)", async ({ flags, scenario, status, reason }) => {
    const requestLog = path.join(tempDir, "requests.log");
    const outputPath = path.join(tempDir, "crawl.md");
    const origin = "http://127.0.0.1:12345";
    const targetOrigin = "http://localhost:23456";
    const result = spawnSync(process.execPath, [
      "--require", robotsUnavailable, cliPath, "crawl", origin, "--rate-limit-ms", "0", "--min-content-words", "1", "-o", outputPath, ...flags,
    ], {
      cwd: tempDir,
      env: {
        ...process.env,
        PAPERBOY_CLI_CONFIG_DIR: configDir,
        PAPERBOY_TEST_ROBOTS_SCENARIO: scenario,
        PAPERBOY_TEST_ROBOTS_STATUS: status,
        PAPERBOY_TEST_REQUEST_LOG: requestLog,
      },
      encoding: "utf8", timeout: 10000,
    });
    const fatal = scenario === "seed";
    const unavailable = status === "error"
      ? { origin: targetOrigin, kind: "error", error: "ECONNRESET" }
      : { origin: targetOrigin, kind: "http", status: Number(status) };
    expect(result.status, result.stderr).toBe(fatal ? 1 : 0);
    const errorLine = fatal
      ? `Error: robots.txt for ${targetOrigin} is unavailable (${reason}); per RFC 9309 the site is treated as fully disallowed.\n`
      : `Error: robots.txt for ${targetOrigin} is unavailable (${reason}); per RFC 9309 pages on that host were treated as disallowed.\n`;
    if (fatal || flags.includes("--json")) {
      expect(result.stderr).toBe(errorLine);
    } else {
      // #41 prints the warnings block on stderr in human mode; the robots error is still printed exactly once.
      expect(result.stderr.startsWith(errorLine)).toBe(true);
      expect(result.stderr.match(/^Error: /gm)).toHaveLength(1);
      expect(result.stderr).toContain(`\nWarnings:\n- Skipping ${origin}/offhost2 (redirect to ${targetOrigin}/`);
      expect(result.stderr).toContain(`- Skipping ${origin}/offhost3 (redirect to ${targetOrigin}/`);
    }
    const requests = (await fs.readFile(requestLog, "utf8")).trim().split("\n");
    expect(requests).toEqual([
      `${origin}/robots.txt`, `${origin}/sitemap.xml`, `${origin}/`,
      ...(fatal ? [] : [`${origin}/offhost2`]),
      `${targetOrigin}/robots.txt`,
      ...(fatal ? [] : [`${origin}/next`, `${origin}/offhost3`]),
    ]);
    if (fatal) expect(await fs.readdir(tempDir)).toEqual(["config", "requests.log"]);
    else expect(await fs.readFile(outputPath, "utf8")).toContain(flags.includes("--json") && flags.includes("--map") ? `"url": "${origin}/next"` : `${origin}/next`);
    if (flags.includes("--json")) {
      const report = JSON.parse(result.stdout);
      expect(report.robotsUnavailableOrigins).toEqual([unavailable]);
      expect(report.robotsUnavailable).toEqual(fatal ? unavailable : null);
      expect(report.discoveredUrls.map((page: { url: string }) => page.url)).toEqual(fatal ? [] : [`${origin}/`, `${origin}/next`]);
      expect(report.outputPath).toBe(fatal ? null : outputPath);
    }
  });

  it.each([
    { flags: [], status: "503", reason: "HTTP 503" },
    { flags: ["--json"], status: "503", reason: "HTTP 503" },
    { flags: ["--map"], status: "429", reason: "HTTP 429" },
    { flags: ["--map", "--json"], status: "error", reason: "ECONNRESET" },
  ])("reports unavailable robots on stderr and exits 1 ($status, $flags)", async ({ flags, status, reason }) => {
    const requestLog = path.join(tempDir, "requests.log");
    const outputPath = path.join(tempDir, "crawl.md");
    const origin = "http://127.0.0.1:12345";
    const result = spawnSync(process.execPath, [
      "--require", robotsUnavailable, cliPath, "crawl", origin, "-o", outputPath, ...flags,
    ], {
      cwd: tempDir,
      env: {
        ...process.env,
        PAPERBOY_CLI_CONFIG_DIR: configDir,
        PAPERBOY_TEST_ROBOTS_STATUS: status,
        PAPERBOY_TEST_REQUEST_LOG: requestLog,
      },
      encoding: "utf8",
      timeout: 10000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toBe(`Error: robots.txt for ${origin} is unavailable (${reason}); per RFC 9309 the site is treated as fully disallowed.\n`);
    expect(await fs.readFile(requestLog, "utf8")).toBe("/robots.txt\n");
    expect(await fs.readdir(tempDir)).toEqual(["config", "requests.log"]);
    if (flags.includes("--json")) {
      const report = JSON.parse(result.stdout);
      expect(report.robotsUnavailable).toEqual(status === "error"
        ? { origin, kind: "error", error: "ECONNRESET" }
        : { origin, kind: "http", status: Number(status) });
      expect(report.crawledCount).toBe(0);
      expect(report.discoveredUrls).toEqual([]);
    } else {
      expect(result.stdout).toContain(flags.includes("--map") ? "Discovered 0 URLs." : "Crawled 0 pages");
    }
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

  it("converts empty HTML and writes an empty markdown file", async () => {
    const inputPath = path.join(tempDir, "empty.html");
    await fs.writeFile(inputPath, "", "utf8");

    const result = runCli(["convert", inputPath], configDir);
    expect(result.status, result.stderr).toBe(0);
    expect(await fs.readFile(path.join(tempDir, "empty.md"), "utf8")).toBe("");
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

  it("returns an error for a 404 seed and keeps warnings off stdout", async () => {
    const server = await startCrawlServer();
    try {
      const result = await runCliAsync([
        "crawl", `${server.baseUrl}/missing`, "--max-depth", "0", "-o", path.join(tempDir, "404.md"),
        "--rate-limit-ms", "0", "--timeout-ms", "3000",
      ], configDir);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Error: no pages were crawled from");
      expect(result.stderr).toContain("(HTTP 404)");
      expect(result.stdout).not.toContain("Warnings:");
    } finally { await server.close(); }
  });

  it("returns an error for a 500 seed", async () => {
    const server = await startCrawlServer();
    try {
      const result = await runCliAsync([
        "crawl", `${server.baseUrl}/error`, "--max-depth", "0", "-o", path.join(tempDir, "500.md"),
        "--rate-limit-ms", "0", "--timeout-ms", "3000",
      ], configDir);
      expect(result.status).toBe(1);
    } finally { await server.close(); }
  });

  it("returns an error when the seed is non-HTML", async () => {
    const server = await startCrawlServer();
    try {
      const textResult = await runCliAsync([
        "crawl", `${server.baseUrl}/json`, "--max-depth", "0", "-o", path.join(tempDir, "json.md"),
        "--rate-limit-ms", "0", "--timeout-ms", "3000",
      ], configDir);
      expect(textResult.status).toBe(1);
      expect(textResult.stderr).toContain("Error: no pages were crawled from");
      expect(textResult.stderr).toContain("the seed was skipped (non-HTML content type: application/json)");

      const jsonResult = await runCliAsync([
        "crawl", `${server.baseUrl}/json`, "--max-depth", "0", "--json", "-o", path.join(tempDir, "json.jsonl"),
        "--rate-limit-ms", "0", "--timeout-ms", "3000",
      ], configDir);
      expect(jsonResult.status).toBe(1);
      expect(JSON.parse(jsonResult.stdout).seedSkipReason).toContain("non-HTML content type");
      expect(jsonResult.stdout).not.toContain("Error:");
    } finally { await server.close(); }
  });

  it.each([
    { path: "/oversize", reason: "response larger than 8388608 bytes" },
    { path: "/bad-gzip", reason: "unsupported or invalid content-encoding: gzip" },
    { path: "/zstd", reason: "unsupported or invalid content-encoding: zstd-bogus" },
  ])("reports a $path seed fetch failure in human and JSON modes", async ({ path: seedPath, reason }) => {
    const server = await startFailureCrawlServer();
    try {
      for (const flags of [[], ["--json"]]) {
        const result = await runCliAsync([
          "crawl", `${server.baseUrl}${seedPath}`, "--max-depth", "0", "--rate-limit-ms", "0",
          "--timeout-ms", "3000", "-o", path.join(tempDir, `${seedPath.slice(1)}-${flags.length}.out`), ...flags,
        ], configDir);
        expect(result.status).toBe(1);
        const errorLine = result.stderr.split("\n").some((line) => line.startsWith("Error: no pages were crawled from") && line.includes(reason));
        if (flags.includes("--json")) {
          // As for every failed crawl since #41, --json keeps stderr free of the Error: line; the reason is in the JSON.
          expect(errorLine).toBe(false);
          const report = JSON.parse(result.stdout);
          expect(report.seedSkipReason).toContain(reason);
          expect(report.skippedCount).toBe(1);
          expect(report.failedFetchCount).toBe(0);
        } else {
          expect(errorLine).toBe(true);
          expect(result.stdout).not.toMatch(/^Error: /m);
        }
      }
    } finally { await server.close(); }
  });

  it("keeps a successful CLI crawl when child fetches fail", async () => {
    const server = await startFailureCrawlServer();
    try {
      const result = await runCliAsync([
        "crawl", server.baseUrl, "--max-depth", "1", "--rate-limit-ms", "0", "--timeout-ms", "3000",
        "-o", path.join(tempDir, "children.md"),
      ], configDir);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Crawled 1 pages");
      expect(result.stderr).toContain("Skipping");
      expect(result.stderr).toContain("response larger than 8388608 bytes");
      expect(result.stderr).toContain("unsupported or invalid content-encoding: gzip");
      expect(result.stderr).toContain("unsupported or invalid content-encoding: zstd-bogus");
    } finally { await server.close(); }
  });

  it.each([
    { seed: "/conv-hang", reason: "conversion timed out after 30000 ms" },
    { seed: "/conv-error", reason: "conversion failed: synthetic worker error" },
  ])("reports a $seed conversion failure in human and JSON modes", async ({ seed, reason }) => {
    const server = await startFailureCrawlServer();
    try {
      for (const flags of [[], ["--json"]]) {
        const result = await runCliWithConversionFailure([
          "crawl", `${server.baseUrl}${seed}`, "--max-depth", "0", "--rate-limit-ms", "0", "--timeout-ms", "3000",
          "--min-content-words", "1", "-o", path.join(tempDir, `${seed.slice(1)}-${flags.length}.out`), ...flags,
        ], configDir);
        expect(result.status).toBe(1);
        if (flags.includes("--json")) {
          const report = JSON.parse(result.stdout);
          expect(result.stderr).not.toMatch(/^Error: /m);
          expect(report.seedSkipReason).toBe(reason);
          expect(report.skippedCount).toBe(1);
          expect(report.failedFetchCount).toBe(0);
          expect(report.crawledCount).toBe(0);
        } else {
          expect(result.stderr.split("\n").some((line) => line.startsWith("Error: no pages were crawled from") && line.includes(reason))).toBe(true);
          expect(result.stdout).not.toMatch(/^Error: /m);
        }
      }
    } finally { await server.close(); }
  });

  it("keeps a successful CLI crawl when a child conversion fails", async () => {
    const server = await startFailureCrawlServer();
    try {
      const child = await runCliWithConversionFailure([
        "crawl", `${server.baseUrl}/conv-parent`, "--max-depth", "1", "--rate-limit-ms", "0", "--timeout-ms", "3000",
        "--min-content-words", "1", "-o", path.join(tempDir, "conversion-child.md"),
      ], configDir);
      expect(child.status).toBe(0);
      expect(child.stdout).toContain("Crawled 1 pages");
      expect(child.stderr).toContain("conversion failed: synthetic worker error");
    } finally { await server.close(); }
  });

  it("returns an error for a closed port", async () => {
    const server = await startCrawlServer();
    const closedUrl = server.baseUrl;
    await server.close();
    const result = await runCliAsync([
      "crawl", closedUrl, "--max-depth", "0", "-o", path.join(tempDir, "closed.md"),
      "--rate-limit-ms", "0", "--timeout-ms", "3000",
    ], configDir);
    expect(result.status).toBe(1);
  });

  it("keeps a healthy crawl successful and sends link warnings to stderr", async () => {
    const server = await startCrawlServer();
    try {
      const result = await runCliAsync([
        "crawl", server.baseUrl, "--max-depth", "1", "-o", path.join(tempDir, "healthy.md"),
        "--rate-limit-ms", "0", "--timeout-ms", "3000",
      ], configDir);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Crawled 1 pages");
      expect(result.stderr).toContain("(HTTP 404)");
    } finally { await server.close(); }
  });

  it("keeps an include-pattern crawl with no pages successful", async () => {
    const server = await startCrawlServer();
    try {
      const result = await runCliAsync([
        "crawl", server.baseUrl, "--include-patterns", "zzz", "-o", path.join(tempDir, "filtered.md"),
        "--rate-limit-ms", "0", "--timeout-ms", "3000",
      ], configDir);
      expect(result.status).toBe(0);
    } finally { await server.close(); }
  });

  it("reports failed fetches in JSON without an extra error line", async () => {
    const server = await startCrawlServer();
    try {
      const result = await runCliAsync([
        "crawl", `${server.baseUrl}/missing`, "--max-depth", "0", "--json", "-o", path.join(tempDir, "404.jsonl"),
        "--rate-limit-ms", "0", "--timeout-ms", "3000",
      ], configDir);
      expect(result.status).toBe(1);
      expect(JSON.parse(result.stdout).failedFetchCount).toBeGreaterThanOrEqual(1);
      expect(result.stdout).not.toContain("Error:");
    } finally { await server.close(); }
  });
});
