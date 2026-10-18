import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface PaperboyCliConfig {
  version: number;
  defaults: {
    includeLayoutTable: boolean;
  };
}

const CONFIG_DIRECTORY_OVERRIDE = process.env.PAPERBOY_CLI_CONFIG_DIR?.trim();
export const CONFIG_DIRECTORY = CONFIG_DIRECTORY_OVERRIDE
  ? path.resolve(CONFIG_DIRECTORY_OVERRIDE)
  : path.join(os.homedir(), ".config", "paperboy-cli");
export const CONFIG_PATH = path.join(CONFIG_DIRECTORY, "config.json");

export const DEFAULT_CONFIG: PaperboyCliConfig = {
  version: 1,
  defaults: {
    includeLayoutTable: true,
  },
};

export async function ensureConfigDirectory(): Promise<void> {
  await fs.mkdir(CONFIG_DIRECTORY, { recursive: true });
}

export async function loadConfig(): Promise<PaperboyCliConfig> {
  await ensureConfigDirectory();
  const config = {
    ...DEFAULT_CONFIG,
    defaults: { ...DEFAULT_CONFIG.defaults },
  };
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return config;
    if ("version" in parsed && typeof parsed.version === "number") {
      config.version = parsed.version;
    }
    if (
      "defaults" in parsed &&
      typeof parsed.defaults === "object" &&
      parsed.defaults !== null &&
      "includeLayoutTable" in parsed.defaults &&
      typeof parsed.defaults.includeLayoutTable === "boolean"
    ) {
      config.defaults.includeLayoutTable = parsed.defaults.includeLayoutTable;
    }
  } catch {
    return config;
  }
  return config;
}

export async function saveConfig(config: PaperboyCliConfig): Promise<void> {
  await ensureConfigDirectory();
  await fs.writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
