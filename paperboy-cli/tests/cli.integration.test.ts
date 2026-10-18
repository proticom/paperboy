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

  it("prints config JSON", () => {
    const result = runCli(["config", "show"], configDir);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toEqual({ version: 1, defaults: { includeLayoutTable: true } });
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
      "--require", blockNetwork, cliPath, "convert", inputPath, "--stdout", "--no-layout-table",
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
    expect(result.stdout).toContain("PAPERBOY OFFLINE");
    expect(result.stdout).not.toContain("Warnings:");
    expect(result.stderr).toContain("Warnings:");
    expect(await fs.readFile(networkLog, "utf8").catch(() => "")).toBe("");
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
