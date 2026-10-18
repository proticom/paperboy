import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CONFIG_PATH } from "./config.js";

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

const SCHEME_PREFIX = /^\s*[a-z][a-z0-9+.-]*:\/\//i;

/** Replace proxy userinfo with `***@`. Never throws. */
export function redactProxyValue(value: string): string {
  try {
    const url = new URL(value);
    if (url.username || url.password) {
      return redactAuthorityUserinfo(value);
    }
    // WHATWG accepts `user:secret@host` as an opaque URL with empty userinfo.
    // Treat that as unparsed so the credentials still get redacted.
    const at = value.indexOf("@");
    const schemeSlashes = value.search(/:\/\//);
    if (at >= 0 && (schemeSlashes < 0 || schemeSlashes > at)) {
      return redactUnparsedUserinfo(value);
    }
    return value;
  } catch {
    return redactUnparsedUserinfo(value);
  }
}

/** Parsed URL: redact only the authority userinfo, not a later `@` in the path. */
function redactAuthorityUserinfo(value: string): string {
  const scheme = SCHEME_PREFIX.exec(value);
  if (!scheme) return redactUnparsedUserinfo(value);
  const schemeEnd = scheme[0].length;
  const rest = value.slice(schemeEnd);
  const authorityEnd = indexOfAuthorityEnd(rest);
  const authority = rest.slice(0, authorityEnd);
  const at = authority.lastIndexOf("@");
  if (at < 0) return value;
  return `${value.slice(0, schemeEnd)}***@${authority.slice(at + 1)}${rest.slice(authorityEnd)}`;
}

function indexOfAuthorityEnd(authorityAndRest: string): number {
  const slash = authorityAndRest.indexOf("/");
  const query = authorityAndRest.indexOf("?");
  const hash = authorityAndRest.indexOf("#");
  let end = authorityAndRest.length;
  for (const index of [slash, query, hash]) {
    if (index >= 0 && index < end) end = index;
  }
  return end;
}

/** Unparsed value: per comma-separated entry, keep scheme:// or leading space. */
function redactUnparsedUserinfo(value: string): string {
  return value
    .split(",")
    .map((entry) => {
      const at = entry.lastIndexOf("@");
      if (at < 0) return entry;
      const scheme = SCHEME_PREFIX.exec(entry);
      const keepEnd = scheme
        ? scheme[0].length
        : (/^\s*/.exec(entry)?.[0].length ?? 0);
      return `${entry.slice(0, keepEnd)}***@${entry.slice(at + 1)}`;
    })
    .join(",");
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
  ).map((name) => `${name}=${redactProxyValue(process.env[name] ?? "")}`);
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

  checks.push(...(await checkCrawlReadiness(options)));

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
