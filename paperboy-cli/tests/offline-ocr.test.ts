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

    for (let run = 0; run < 2; run += 1) {
      const result = spawnSync(process.execPath, [
        "--require", preload, cliPath, "convert", inputPath, "--stdout", "--json", "--no-layout-table",
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
        markdown: "## OCR Text\n\nPAPERBOY OFFLINE",
        warnings: ["OCR runs locally and may take longer on large images."],
      });
      const files = await fs.readdir(tempDir);
      expect(files.filter((file) => /\.traineddata(?:\.gz)?$/.test(file))).toEqual([]);
      expect(files.includes("network.log")).toBe(false);
    }
  });
});
