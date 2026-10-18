import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempDir = "";

async function importConfigModule() {
  vi.resetModules();
  return import("../src/config.ts");
}

async function importDoctorModule() {
  return import("../src/doctor.ts");
}

describe("doctor", () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperboy-cli-doctor-"));
    process.env.PAPERBOY_CLI_CONFIG_DIR = tempDir;
  });

  afterEach(async () => {
    delete process.env.PAPERBOY_CLI_CONFIG_DIR;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("includes crawl readiness checks when running offline", async () => {
    const configModule = await importConfigModule();
    await configModule.saveConfig(configModule.DEFAULT_CONFIG);

    const doctorModule = await importDoctorModule();
    const report = await doctorModule.runDoctor({ offline: true });

    const internet = report.checks.find(
      (check) => check.name === "Internet reachability",
    );
    expect(internet?.status).toBe("ok");
    expect(internet?.details).toMatch(/Skipped/);

    const smoke = report.checks.find(
      (check) => check.name === "Converter smoke test",
    );
    expect(smoke?.status).toBe("ok");
    expect(report.summary.fail).toBe(0);
    expect(report.checks.map((check) => check.name)).toEqual([
      "Node.js version", "Config path", "Config file", "Internet reachability",
      "Converter smoke test", "Proxy environment", "Output directory writable", "Platform",
    ]);

    const proxy = report.checks.find(
      (check) => check.name === "Proxy environment",
    );
    expect(proxy?.status).toBe(
      ["HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy"]
        .some((name) => process.env[name]) ? "warn" : "ok",
    );

    const writable = report.checks.find(
      (check) => check.name === "Output directory writable",
    );
    expect(writable?.status).toBe("ok");
  });
});
