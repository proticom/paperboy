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
    expect(config.defaults.includeLayoutTable).toBe(true);
  });

  it("saves and reloads config", async () => {
    const configModule = await importConfigModule();
    const current = await configModule.loadConfig();
    const next = {
      ...current,
      defaults: {
        ...current.defaults,
        includeLayoutTable: false,
      },
    };

    await configModule.saveConfig(next);
    const loaded = await configModule.loadConfig();

    expect(loaded).toEqual({
      version: 1,
      defaults: { includeLayoutTable: false },
    });
  });

  it("ignores legacy AI settings and unknown keys", async () => {
    const configModule = await importConfigModule();
    await fs.writeFile(configModule.CONFIG_PATH, JSON.stringify({
      version: 1,
      ai: { mode: "removed-provider" },
      defaults: { includeLayoutTable: false, describeImagesWithAi: true },
      unknown: true,
    }));

    expect(await configModule.loadConfig()).toEqual({
      version: 1,
      defaults: { includeLayoutTable: false },
    });
  });
});
