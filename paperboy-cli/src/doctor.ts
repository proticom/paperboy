import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  CONFIG_PATH,
  DOTENV_PATH,
  getApiKey,
  hasSecretTool,
  loadConfig,
  type PaperboyCliConfig,
} from "./config.js";

type CheckStatus = "ok" | "warn" | "fail";

interface DoctorCheck {
  name: string;
  status: CheckStatus;
  details: string;
}

export interface DoctorReport {
  checks: DoctorCheck[];
  summary: {
    ok: number;
    warn: number;
    fail: number;
  };
}

export interface DoctorOptions {
  /** Skip checks that need outbound network access. */
  offline?: boolean;
}

const PROXY_ENV_VARS = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
];

function commandExists(command: string): boolean {
  try {
    execSync(`which ${command}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function parseMajorVersion(version: string): number {
  const major = Number(version.replace(/^v/, "").split(".")[0] ?? "0");
  return Number.isFinite(major) ? major : 0;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 4000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function checkAiMode(config: PaperboyCliConfig): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];

  if (config.ai.mode === "disabled") {
    checks.push({
      name: "AI mode",
      status: "ok",
      details: "AI is disabled (deterministic conversion only).",
    });
    return checks;
  }

  if (config.ai.mode === "ollama") {
    const hasOllama = commandExists("ollama");
    checks.push({
      name: "Ollama binary",
      status: hasOllama ? "ok" : "fail",
      details: hasOllama
        ? "Found `ollama` in PATH."
        : "Missing `ollama` in PATH. Install from https://ollama.com.",
    });

    const base = config.ai.baseUrl || "http://localhost:11434";
    try {
      const response = await fetchWithTimeout(
        `${base.replace(/\/+$/, "")}/api/tags`,
      );
      checks.push({
        name: "Ollama endpoint",
        status: response.ok ? "ok" : "warn",
        details: response.ok
          ? `Reachable at ${base}.`
          : `Endpoint responded with ${response.status}.`,
      });
    } catch {
      checks.push({
        name: "Ollama endpoint",
        status: "warn",
        details: `Could not reach ${base}. Start Ollama if AI descriptions are needed.`,
      });
    }

    return checks;
  }

  if (config.ai.mode === "local-endpoint") {
    const base = config.ai.baseUrl;
    const modelsUrl = `${base.replace(/\/+$/, "")}/v1/models`;
    try {
      const response = await fetchWithTimeout(modelsUrl);
      checks.push({
        name: "Local endpoint",
        status: response.ok ? "ok" : "warn",
        details: response.ok
          ? `Reachable at ${modelsUrl}.`
          : `Endpoint responded with ${response.status}.`,
      });
    } catch {
      checks.push({
        name: "Local endpoint",
        status: "warn",
        details: `Could not reach ${modelsUrl}.`,
      });
    }

    checks.push({
      name: "Local model id",
      status: config.ai.model ? "ok" : "fail",
      details: config.ai.model
        ? `Configured model: ${config.ai.model}`
        : "No local model configured.",
    });
    return checks;
  }

  const envVarName = config.ai.apiKeyEnvVar || "PAPERBOY_OPENROUTER_API_KEY";
  const key = getApiKey(envVarName);
  checks.push({
    name: "OpenRouter API key",
    status: key ? "ok" : "fail",
    details: key
      ? `Found key in configured storage (${envVarName}).`
      : `Missing API key (${envVarName}). Run 'paperboy-cli setup'.`,
  });

  if (key) {
    try {
      const response = await fetchWithTimeout(
        "https://openrouter.ai/api/v1/models",
        {
          headers: {
            Authorization: `Bearer ${key}`,
          },
        },
      );
      checks.push({
        name: "OpenRouter connectivity",
        status: response.ok ? "ok" : "warn",
        details: response.ok
          ? "OpenRouter models endpoint reachable."
          : `OpenRouter responded with ${response.status}.`,
      });
    } catch {
      checks.push({
        name: "OpenRouter connectivity",
        status: "warn",
        details: "Could not reach OpenRouter models endpoint.",
      });
    }
  }

  return checks;
}

async function checkCrawlReadiness(
  options: DoctorOptions,
): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];

  if (options.offline) {
    checks.push({
      name: "Internet reachability",
      status: "ok",
      details: "Skipped (--offline).",
    });
  } else {
    try {
      const response = await fetchWithTimeout(
        "https://example.com",
        { method: "HEAD" },
        4000,
      );
      checks.push({
        name: "Internet reachability",
        status: response.ok ? "ok" : "warn",
        details: response.ok
          ? "https://example.com responded OK."
          : `https://example.com responded with ${response.status}.`,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      checks.push({
        name: "Internet reachability",
        status: "warn",
        details: `Could not reach https://example.com: ${reason}`,
      });
    }
  }

  try {
    const { convertToMarkdown } = await import("@proticom/paperboy-converter");
    const result = await convertToMarkdown(
      "doctor.html",
      "<h1>doctor</h1>",
      undefined,
    );
    const ok =
      typeof result?.markdown === "string" && result.markdown.includes("doctor");
    checks.push({
      name: "Converter smoke test",
      status: ok ? "ok" : "fail",
      details: ok
        ? "@proticom/paperboy-converter converts a tiny HTML sample."
        : "Converter loaded but did not produce expected markdown.",
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    checks.push({
      name: "Converter smoke test",
      status: "fail",
      details: `Could not load @proticom/paperboy-converter: ${reason}`,
    });
  }

  const setProxies = PROXY_ENV_VARS.filter(
    (name) => typeof process.env[name] === "string" && process.env[name] !== "",
  ).map((name) => `${name}=${process.env[name]}`);
  checks.push({
    name: "Proxy environment",
    status: setProxies.length > 0 ? "warn" : "ok",
    details:
      setProxies.length > 0
        ? `Outbound traffic may route through a proxy: ${setProxies.join(", ")}`
        : "No HTTP(S)_PROXY env vars set.",
  });

  const probe = path.join(
    process.cwd(),
    `.paperboy-doctor-${randomUUID()}.tmp`,
  );
  try {
    await fs.writeFile(probe, "ok");
    await fs.unlink(probe);
    checks.push({
      name: "Output directory writable",
      status: "ok",
      details: `${process.cwd()} is writable.`,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    checks.push({
      name: "Output directory writable",
      status: "fail",
      details: `Cannot write to ${process.cwd()}: ${reason}`,
    });
  }

  return checks;
}

export async function runDoctor(
  options: DoctorOptions = {},
): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];
  const nodeMajor = parseMajorVersion(process.version);
  checks.push({
    name: "Node.js version",
    status: nodeMajor >= 20 ? "ok" : "fail",
    details: `Detected ${process.version}; requires >= v20.`,
  });

  checks.push({
    name: "Config path",
    status: "ok",
    details: CONFIG_PATH,
  });

  checks.push({
    name: "Dotenv path",
    status: "ok",
    details: DOTENV_PATH,
  });

  try {
    await fs.access(CONFIG_PATH);
    checks.push({
      name: "Config file",
      status: "ok",
      details: "Found config file.",
    });
  } catch {
    checks.push({
      name: "Config file",
      status: "warn",
      details: "Config file not found yet. Run `paperboy-cli setup`.",
    });
  }

  const config = await loadConfig();
  checks.push({
    name: "Configured AI mode",
    status: "ok",
    details: config.ai.mode,
  });

  checks.push(...(await checkAiMode(config)));
  checks.push(...(await checkCrawlReadiness(options)));

  if (process.platform === "darwin") {
    checks.push({
      name: "macOS Keychain support",
      status: commandExists("security") ? "ok" : "warn",
      details: commandExists("security")
        ? "Keychain CLI is available."
        : "Keychain CLI is unavailable.",
    });
  }

  if (process.platform === "linux") {
    checks.push({
      name: "Linux secret-tool support",
      status: hasSecretTool() ? "ok" : "warn",
      details: hasSecretTool()
        ? "secret-tool is available."
        : "secret-tool is unavailable; dotenv fallback is used.",
    });
  }

  checks.push({
    name: "Platform",
    status: "ok",
    details: `${os.platform()} ${os.release()} (${os.arch()})`,
  });

  const summary = checks.reduce(
    (acc, check) => {
      acc[check.status] += 1;
      return acc;
    },
    { ok: 0, warn: 0, fail: 0 },
  );

  return { checks, summary };
}

export function printDoctorReport(report: DoctorReport): void {
  const statusSymbol: Record<CheckStatus, string> = {
    ok: "OK",
    warn: "WARN",
    fail: "FAIL",
  };

  console.log("");
  console.log("Paperboy CLI Doctor");
  console.log("-------------------");
  for (const check of report.checks) {
    console.log(`${statusSymbol[check.status].padEnd(4)} ${check.name}: ${check.details}`);
  }
  console.log("");
  console.log(
    `Summary: ${report.summary.ok} ok, ${report.summary.warn} warnings, ${report.summary.fail} failures`,
  );
  console.log("");
}
