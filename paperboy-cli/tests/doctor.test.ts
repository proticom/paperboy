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

  it("reports healthy summary for deterministic mode", async () => {
    const configModule = await importConfigModule();
    await configModule.saveConfig({
      ...configModule.DEFAULT_CONFIG,
      ai: {
        ...configModule.DEFAULT_CONFIG.ai,
        mode: "disabled",
      },
    });

    const doctorModule = await importDoctorModule();
    const report = await doctorModule.runDoctor();

    expect(report.summary.fail).toBe(0);
    expect(report.checks.some((check) => check.name === "Node.js version")).toBe(true);
    expect(report.checks.some((check) => check.name === "Configured AI mode")).toBe(true);
  });

  it("reports missing key failure in openrouter mode", async () => {
    const configModule = await importConfigModule();
    const envVarName = "PAPERBOY_TEST_KEY_DOES_NOT_EXIST";
    await configModule.saveConfig({
      ...configModule.DEFAULT_CONFIG,
      ai: {
        ...configModule.DEFAULT_CONFIG.ai,
        mode: "openrouter",
        apiKeyEnvVar: envVarName,
      },
    });
    delete process.env[envVarName];

    const doctorModule = await importDoctorModule();
    const report = await doctorModule.runDoctor();
    const keyCheck = report.checks.find(
      (check) => check.name === "OpenRouter API key",
    );

    expect(keyCheck?.status).toBe("fail");
    expect(report.summary.fail).toBeGreaterThan(0);
  });
});
