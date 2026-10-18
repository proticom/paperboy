import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const promptMocks = vi.hoisted(() => ({
  confirm: vi.fn(),
}));

vi.mock("@inquirer/prompts", () => ({
  confirm: promptMocks.confirm,
}));

let tempDir = "";

async function importSetupModule() {
  vi.resetModules();
  return import("../src/setup.ts");
}

async function importConfigModule() {
  return import("../src/config.ts");
}

describe("setup flow", () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperboy-cli-setup-"));
    process.env.PAPERBOY_CLI_CONFIG_DIR = tempDir;
    promptMocks.confirm.mockReset();
  });

  afterEach(async () => {
    delete process.env.PAPERBOY_CLI_CONFIG_DIR;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("writes the OCR layout choice to config", async () => {
    promptMocks.confirm.mockResolvedValueOnce(false);

    const setupModule = await importSetupModule();
    await setupModule.runSetup();

    const configModule = await importConfigModule();
    const config = await configModule.loadConfig();

    expect(config).toEqual({
      version: 1,
      defaults: { includeLayoutTable: false },
    });
    expect(JSON.parse(await fs.readFile(configModule.CONFIG_PATH, "utf8"))).toEqual(config);
  });
});
