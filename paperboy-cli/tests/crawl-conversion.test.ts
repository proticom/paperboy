import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const fixture = fileURLToPath(new URL("./fixtures/crawl-conversion-process.mjs", import.meta.url));
const baseUrl = "http://127.0.0.1:19876";
let tempDir = "";

function runCrawl(marker: string) {
  const child = spawnSync(process.execPath, [fixture, marker, tempDir], {
    encoding: "utf8",
    timeout: 5000,
  });
  expect(child.status, child.stderr || child.error?.message).toBe(0);
  return JSON.parse(child.stdout);
}

async function readRecords() {
  return (await fs.readFile(path.join(tempDir, "crawl.jsonl"), "utf8"))
    .trim().split("\n").map((line) => JSON.parse(line));
}

describe("crawl conversion process without sockets", () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperboy-conversion-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("uses the default 512/64 MB worker heaps and preserves normal Markdown", async () => {
    const report = runCrawl("NORMAL");
    expect(report.result.crawledCount).toBe(2);
    expect(report.result.skippedCount).toBe(0);
    expect(report.result.warnings).toEqual([]);
    expect(report.workers).toHaveLength(1);
    expect(report.workers[0].limits).toMatchObject({
      maxOldGenerationSizeMb: 512,
      maxYoungGenerationSizeMb: 64,
    });
    expect((await readRecords()).map((record) => record.markdown)).toEqual([
      "BEFORE BODY\n\n[After](/after)", "AFTER BODY",
    ]);
  });

  it.each([
    { marker: "HANG", reason: "conversion timed out after 200 ms" },
    { marker: "CRASH", reason: "conversion failed: worker exited with code 7" },
    { marker: "ERROR", reason: "conversion failed: synthetic worker error" },
    { marker: "FAIL", reason: "conversion failed: synthetic conversion failure" },
    { marker: "OOM", reason: "conversion failed: Worker terminated due to reaching memory limit: JS heap out of memory" },
  ])("terminates and replaces the $marker worker while saving both normal pages with rc 0", async ({ marker, reason }) => {
    const report = runCrawl(marker);
    expect(report.elapsedMs).toBeLessThan(4000);
    expect(report.result.crawledCount).toBe(2);
    expect(report.result.skippedCount).toBe(1);
    expect(report.result.warnings).toEqual([`Skipping ${baseUrl}/broken (${reason}).`]);
    const records = await readRecords();
    expect(records.map((record) => record.url)).toEqual([`${baseUrl}/`, `${baseUrl}/after`]);
    expect(records[0].markdown).toContain("BEFORE BODY");
    expect(records[1].markdown).toContain("AFTER BODY");
    expect(report.workers).toHaveLength(2);
    const [before, after] = report.workers;
    expect(before.threadId).not.toBe(after.threadId);
    expect(records.map((record) => record.metadata.warnings[0])).toEqual([
      `worker:${before.threadId}`, `worker:${after.threadId}`,
    ]);
    expect(report.terminatedThreadIds).toEqual([before.threadId, after.threadId]);
    expect(report.workers.map((worker) => worker.currentThreadId)).toEqual([-1, -1]);
    expect(before.limits).toMatchObject({ maxOldGenerationSizeMb: 16, maxYoungGenerationSizeMb: 4 });
  });
});
