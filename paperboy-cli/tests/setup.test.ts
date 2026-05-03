import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const promptMocks = vi.hoisted(() => ({
  select: vi.fn(),
  input: vi.fn(),
  confirm: vi.fn(),
  password: vi.fn(),
}));

vi.mock("@inquirer/prompts", () => ({
  select: promptMocks.select,
  input: promptMocks.input,
  confirm: promptMocks.confirm,
  password: promptMocks.password,
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
    promptMocks.select.mockReset();
    promptMocks.input.mockReset();
    promptMocks.confirm.mockReset();
    promptMocks.password.mockReset();
  });

  afterEach(async () => {
    delete process.env.PAPERBOY_CLI_CONFIG_DIR;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("writes deterministic setup choices to config", async () => {
    promptMocks.select.mockResolvedValueOnce("disabled");
    promptMocks.confirm.mockResolvedValueOnce(true);
    promptMocks.confirm.mockResolvedValueOnce(false);

    const setupModule = await importSetupModule();
    await setupModule.runSetup();

    const configModule = await importConfigModule();
    const config = await configModule.loadConfig();

    expect(config.ai.mode).toBe("disabled");
    expect(config.defaults.includeLayoutTable).toBe(true);
    expect(config.defaults.describeImagesWithAi).toBe(false);
  });
});
