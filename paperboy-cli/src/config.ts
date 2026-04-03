import { execSync } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";

export type AiMode = "disabled" | "ollama" | "local-endpoint" | "openrouter";

export interface PaperboyCliConfig {
  version: number;
  ai: {
    mode: AiMode;
    model: string;
    baseUrl: string;
    apiKeyEnvVar: string;
  };
  defaults: {
    includeLayoutTable: boolean;
    describeImagesWithAi: boolean;
  };
}

export const OPENROUTER_ENV_VAR = "PAPERBOY_OPENROUTER_API_KEY";
const CONFIG_DIRECTORY_OVERRIDE = process.env.PAPERBOY_CLI_CONFIG_DIR?.trim();
export const CONFIG_DIRECTORY = CONFIG_DIRECTORY_OVERRIDE
  ? path.resolve(CONFIG_DIRECTORY_OVERRIDE)
  : path.join(os.homedir(), ".config", "paperboy-cli");
export const CONFIG_PATH = path.join(CONFIG_DIRECTORY, "config.json");
export const DOTENV_PATH = path.join(CONFIG_DIRECTORY, ".env");

export const DEFAULT_CONFIG: PaperboyCliConfig = {
  version: 1,
  ai: {
    mode: "disabled",
    model: "openai/gpt-5-mini",
    baseUrl: "http://localhost:11434",
    apiKeyEnvVar: OPENROUTER_ENV_VAR,
  },
  defaults: {
    includeLayoutTable: true,
    describeImagesWithAi: false,
  },
};

export async function ensureConfigDirectory(): Promise<void> {
  await fs.mkdir(CONFIG_DIRECTORY, { recursive: true });
}

export async function loadConfig(): Promise<PaperboyCliConfig> {
  await ensureConfigDirectory();
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<PaperboyCliConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      ai: {
        ...DEFAULT_CONFIG.ai,
        ...(parsed.ai ?? {}),
      },
      defaults: {
        ...DEFAULT_CONFIG.defaults,
        ...(parsed.defaults ?? {}),
      },
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(config: PaperboyCliConfig): Promise<void> {
  await ensureConfigDirectory();
  await fs.writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function loadDotenvFromConfigDirectory(): void {
  try {
    const envText = fsSync.readFileSync(DOTENV_PATH, "utf8");
    const parsed = dotenv.parse(envText);
    for (const [key, value] of Object.entries(parsed)) {
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // No local dotenv file is fine.
  }
}

export async function writeApiKeyToDotenv(
  envVarName: string,
  key: string,
): Promise<void> {
  await ensureConfigDirectory();
  let lines: string[] = [];
  try {
    lines = (await fs.readFile(DOTENV_PATH, "utf8")).split(/\r?\n/);
  } catch {
    lines = [];
  }

  const sanitized = key.replace(/\r?\n/g, "").trim();
  const record = `${envVarName}=${sanitized}`;
  let replaced = false;

  lines = lines.map((line) => {
    if (line.startsWith(`${envVarName}=`)) {
      replaced = true;
      return record;
    }
    return line;
  });

  if (!replaced) {
    lines.push(record);
  }

  const nextContent = `${lines.filter(Boolean).join("\n")}\n`;
  await fs.writeFile(DOTENV_PATH, nextContent, "utf8");
  process.env[envVarName] = sanitized;
}

export function writeApiKeyToKeychain(envVarName: string, key: string): boolean {
  if (process.platform !== "darwin") return false;
  try {
    execSync(
      `security add-generic-password -a "$USER" -s "${envVarName}" -w "${key.replace(/"/g, '\\"')}" -U`,
      { stdio: "pipe" },
    );
    return true;
  } catch {
    return false;
  }
}

export function hasSecretTool(): boolean {
  if (process.platform !== "linux") return false;
  try {
    execSync("which secret-tool", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export function writeApiKeyToSecretTool(
  envVarName: string,
  key: string,
): boolean {
  if (!hasSecretTool()) return false;
  try {
    execSync(
      `printf "%s" "${key.replace(/"/g, '\\"')}" | secret-tool store --label="Paperboy ${envVarName}" service paperboy-cli account ${envVarName}`,
      { stdio: "pipe", shell: "/bin/sh" },
    );
    return true;
  } catch {
    return false;
  }
}

function readApiKeyFromKeychain(envVarName: string): string {
  if (process.platform !== "darwin") return "";
  try {
    return execSync(
      `security find-generic-password -a "$USER" -s "${envVarName}" -w`,
      { stdio: "pipe", encoding: "utf8" },
    ).trim();
  } catch {
    return "";
  }
}

function readApiKeyFromSecretTool(envVarName: string): string {
  if (!hasSecretTool()) return "";
  try {
    return execSync(
      `secret-tool lookup service paperboy-cli account ${envVarName}`,
      { stdio: "pipe", encoding: "utf8", shell: "/bin/sh" },
    ).trim();
  } catch {
    return "";
  }
}

export function getApiKey(envVarName = OPENROUTER_ENV_VAR): string {
  if (process.env[envVarName]) return process.env[envVarName] ?? "";

  const keychainValue = readApiKeyFromKeychain(envVarName);
  if (keychainValue) return keychainValue;

  const secretToolValue = readApiKeyFromSecretTool(envVarName);
  if (secretToolValue) return secretToolValue;

  try {
    const envText = fsSync.readFileSync(DOTENV_PATH, "utf8");
    const parsed = dotenv.parse(envText);
    return parsed[envVarName] ?? "";
  } catch {
    return "";
  }
}
