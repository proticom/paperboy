import { execSync } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import {
  getProvider,
  PROVIDERS,
  type ProviderId,
} from "./providers.js";

// Kept as the canonical AI mode label across config files. New provider ids
// (openai, anthropic, xai) join the older ones; existing configs that use
// "openrouter" / "ollama" / "local-endpoint" / "disabled" continue to load
// unchanged.
export type AiMode = ProviderId;

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

// Retained for backward compatibility with code that pre-dates the provider
// catalog (older imports). Prefer PROVIDERS.openrouter.envVar in new code.
export const OPENROUTER_ENV_VAR = PROVIDERS.openrouter.envVar ?? "";

const CONFIG_DIRECTORY_OVERRIDE = process.env.PAPERBOY_CLI_CONFIG_DIR?.trim();
export const CONFIG_DIRECTORY = CONFIG_DIRECTORY_OVERRIDE
  ? path.resolve(CONFIG_DIRECTORY_OVERRIDE)
  : path.join(os.homedir(), ".config", "paperboy-cli");
export const CONFIG_PATH = path.join(CONFIG_DIRECTORY, "config.json");
export const DOTENV_PATH = path.join(CONFIG_DIRECTORY, ".env");

// Service name used in every OS credential store. Per-provider entries get
// the provider's env var as the account/key name (e.g. "PAPERBOY_OPENAI_API_KEY").
const KEYCHAIN_SERVICE = "paperboy-cli";

export const DEFAULT_CONFIG: PaperboyCliConfig = {
  version: 1,
  ai: {
    mode: "disabled",
    model: PROVIDERS.openrouter.defaultModel,
    baseUrl: PROVIDERS.openrouter.defaultBaseUrl,
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

// --- macOS Keychain ----------------------------------------------------

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

// --- Linux Secret Service (libsecret-tools) ---------------------------

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
      `printf "%s" "${key.replace(/"/g, '\\"')}" | secret-tool store --label="Paperboy ${envVarName}" service ${KEYCHAIN_SERVICE} account ${envVarName}`,
      { stdio: "pipe", shell: "/bin/sh" },
    );
    return true;
  } catch {
    return false;
  }
}

function readApiKeyFromSecretTool(envVarName: string): string {
  if (!hasSecretTool()) return "";
  try {
    return execSync(
      `secret-tool lookup service ${KEYCHAIN_SERVICE} account ${envVarName}`,
      { stdio: "pipe", encoding: "utf8", shell: "/bin/sh" },
    ).trim();
  } catch {
    return "";
  }
}

// --- Windows Credential Manager (PowerShell-based) --------------------
//
// Windows has no built-in CLI for arbitrary secret read/write (cmdkey only
// goes one direction). We shell out to PowerShell with a one-liner that
// uses the legacy Win32 credential APIs. The credential target is
// "paperboy-cli/<ENVVAR>" so multiple providers can coexist without
// collisions, and the credential type is Generic.

function isWindows(): boolean {
  return process.platform === "win32";
}

function runPowerShell(script: string): string {
  return execSync(`powershell -NoLogo -NoProfile -Command "${script.replace(/"/g, '\\"')}"`, {
    stdio: "pipe",
    encoding: "utf8",
  }).trim();
}

export function writeApiKeyToWindowsCredentialManager(
  envVarName: string,
  key: string,
): boolean {
  if (!isWindows()) return false;
  const target = `${KEYCHAIN_SERVICE}/${envVarName}`;
  // `cmdkey /add` is the only built-in write surface and is sufficient for
  // Generic credentials. The password is read back via the PowerShell path
  // below (cmdkey itself cannot return passwords).
  try {
    execSync(
      `cmdkey /generic:"${target}" /user:"${envVarName}" /pass:"${key.replace(/"/g, '\\"')}"`,
      { stdio: "pipe" },
    );
    return true;
  } catch {
    return false;
  }
}

function readApiKeyFromWindowsCredentialManager(envVarName: string): string {
  if (!isWindows()) return "";
  const target = `${KEYCHAIN_SERVICE}/${envVarName}`;
  // Minimal P/Invoke to CredReadW so we can actually pull the password
  // back out of the Vault.
  const script = `
    Add-Type -Namespace PaperboyCred -Name Native -MemberDefinition @'
      [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential, CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
      public struct CREDENTIAL {
        public uint Flags; public uint Type; public string TargetName; public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public uint CredentialBlobSize; public System.IntPtr CredentialBlob;
        public uint Persist; public uint AttributeCount; public System.IntPtr Attributes;
        public string TargetAlias; public string UserName;
      }
      [System.Runtime.InteropServices.DllImport("Advapi32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode, SetLastError = true)]
      public static extern bool CredReadW(string target, uint type, uint flags, out System.IntPtr credentialPtr);
      [System.Runtime.InteropServices.DllImport("Advapi32.dll", SetLastError = true)]
      public static extern void CredFree(System.IntPtr cred);
'@ -ErrorAction SilentlyContinue;
    $ptr = [System.IntPtr]::Zero;
    if ([PaperboyCred.Native]::CredReadW('${target.replace(/'/g, "''")}', 1, 0, [ref]$ptr)) {
      $cred = [System.Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type]'PaperboyCred.Native+CREDENTIAL');
      $bytes = New-Object byte[] $cred.CredentialBlobSize;
      [System.Runtime.InteropServices.Marshal]::Copy($cred.CredentialBlob, $bytes, 0, $cred.CredentialBlobSize);
      [PaperboyCred.Native]::CredFree($ptr);
      [System.Text.Encoding]::Unicode.GetString($bytes);
    }
  `.replace(/\s+/g, " ");
  try {
    return runPowerShell(script);
  } catch {
    return "";
  }
}

// --- Unified read/write -----------------------------------------------

// Provider-aware key lookup. Falls back across env > OS vault > dotenv so
// every reasonable storage choice the user might have picked just works.
export function getApiKey(envVarName: string): string {
  if (!envVarName) return "";
  if (process.env[envVarName]) return process.env[envVarName] ?? "";

  if (process.platform === "darwin") {
    const v = readApiKeyFromKeychain(envVarName);
    if (v) return v;
  }
  if (process.platform === "linux") {
    const v = readApiKeyFromSecretTool(envVarName);
    if (v) return v;
  }
  if (process.platform === "win32") {
    const v = readApiKeyFromWindowsCredentialManager(envVarName);
    if (v) return v;
  }

  try {
    const envText = fsSync.readFileSync(DOTENV_PATH, "utf8");
    const parsed = dotenv.parse(envText);
    return parsed[envVarName] ?? "";
  } catch {
    return "";
  }
}

export function getApiKeyForProvider(providerId: string): string {
  const provider = getProvider(providerId);
  return provider.envVar ? getApiKey(provider.envVar) : "";
}
