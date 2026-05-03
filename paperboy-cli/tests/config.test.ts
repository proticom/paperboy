import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempDir = "";

async function importConfigModule() {
  vi.resetModules();
  return import("../src/config.ts");
}

describe("config module", () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperboy-cli-config-"));
    process.env.PAPERBOY_CLI_CONFIG_DIR = tempDir;
  });

  afterEach(async () => {
    delete process.env.PAPERBOY_CLI_CONFIG_DIR;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("loads default config when no file exists", async () => {
    const configModule = await importConfigModule();
    const config = await configModule.loadConfig();

    expect(config.version).toBe(1);
    expect(config.ai.mode).toBe("disabled");
    expect(config.defaults.includeLayoutTable).toBe(true);
  });

  it("saves and reloads config", async () => {
    const configModule = await importConfigModule();
    const current = await configModule.loadConfig();
    const next = {
      ...current,
      ai: {
        ...current.ai,
        mode: "openrouter" as const,
        model: "openai/gpt-5-mini",
      },
      defaults: {
        ...current.defaults,
        describeImagesWithAi: true,
      },
    };

    await configModule.saveConfig(next);
    const loaded = await configModule.loadConfig();

    expect(loaded.ai.mode).toBe("openrouter");
    expect(loaded.defaults.describeImagesWithAi).toBe(true);
  });

  it("writes and loads dotenv API keys", async () => {
    const configModule = await importConfigModule();
    const envVar = "PAPERBOY_TEST_API_KEY";
    const value = "test-secret-value";

    await configModule.writeApiKeyToDotenv(envVar, value);
    delete process.env[envVar];

    configModule.loadDotenvFromConfigDirectory();
    expect(process.env[envVar]).toBe(value);
  });
});
