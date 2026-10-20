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
  it.each([
    ["v20.17.1", false],
    ["v20.18.0", true],
    ["v22.0.0", true],
    ["v18.20.0", false],
  ])("checks Node.js version %s", async (version, expected) => {
    const doctorModule = await importDoctorModule();
    expect(doctorModule.isSupportedNodeVersion(version)).toBe(expected);
  });

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperboy-cli-doctor-"));
    process.env.PAPERBOY_CLI_CONFIG_DIR = tempDir;
  });

  afterEach(async () => {
    delete process.env.PAPERBOY_CLI_CONFIG_DIR;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("includes crawl readiness checks when running offline", async () => {
    const configModule = await importConfigModule();
    await configModule.saveConfig(configModule.DEFAULT_CONFIG);

    const doctorModule = await importDoctorModule();
    const report = await doctorModule.runDoctor({ offline: true });

    const internet = report.checks.find(
      (check) => check.name === "Internet reachability",
    );
    expect(internet?.status).toBe("ok");
    expect(internet?.details).toMatch(/Skipped/);

    const smoke = report.checks.find(
      (check) => check.name === "Converter smoke test",
    );
    expect(smoke?.status).toBe("ok");
    expect(report.summary.fail).toBe(0);
    expect(report.checks.map((check) => check.name)).toEqual([
      "Node.js version", "Config path", "Config file", "Internet reachability",
      "Converter smoke test", "Proxy environment", "Output directory writable", "Platform",
    ]);

    const proxy = report.checks.find(
      (check) => check.name === "Proxy environment",
    );
    expect(proxy?.status).toBe(
      ["HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy"]
        .some((name) => process.env[name]) ? "warn" : "ok",
    );

    const writable = report.checks.find(
      (check) => check.name === "Output directory writable",
    );
    expect(writable?.status).toBe("ok");
  });

  it("reports missing config as ok while using defaults", async () => {
    vi.resetModules();
    const doctorModule = await importDoctorModule();
    const report = await doctorModule.runDoctor({ offline: true });
    const configFile = report.checks.find((check) => check.name === "Config file");

    expect(configFile?.status).toBe("ok");
    expect(configFile?.details).toBe(
      "No config file; using defaults (run `paperboy-cli setup` to customize)",
    );
  });

  it("redacts proxy credentials in the proxy environment check", async () => {
    const names = [
      "HTTP_PROXY",
      "HTTPS_PROXY",
      "NO_PROXY",
      "http_proxy",
      "https_proxy",
      "no_proxy",
    ];
    const saved = new Map(names.map((name) => [name, process.env[name]]));
    try {
      for (const name of names) delete process.env[name];
      process.env.HTTPS_PROXY = "http://user:secret@proxy.example:8080";

      const configModule = await importConfigModule();
      await configModule.saveConfig(configModule.DEFAULT_CONFIG);
      const doctorModule = await importDoctorModule();
      const report = await doctorModule.runDoctor({ offline: true });
      const proxy = report.checks.find(
        (check) => check.name === "Proxy environment",
      );
      expect(proxy?.details).toContain("***@");
      expect(proxy?.details).not.toContain("user");
      expect(proxy?.details).not.toContain("secret");

      process.env.HTTPS_PROXY = "http://cnUo1:12/cnPo1@proxy.qa.test:8080";
      const qaReport = await doctorModule.runDoctor({ offline: true });
      const qaProxy = qaReport.checks.find(
        (check) => check.name === "Proxy environment",
      );
      expect(qaProxy?.details).toContain("***@");
      expect(qaProxy?.details).not.toContain("cnUo1");
      expect(qaProxy?.details).not.toContain("cnPo1");
    } finally {
      for (const name of names) {
        const previous = saved.get(name);
        if (previous === undefined) delete process.env[name];
        else process.env[name] = previous;
      }
    }
  });
});

describe("redactProxyValue", () => {
  it("redacts userinfo and leaves values without credentials unchanged", async () => {
    const { redactProxyValue } = await import("../src/doctor.ts");

    expect(redactProxyValue("http://user:secret@proxy.example:8080")).toBe(
      "http://***@proxy.example:8080",
    );
    expect(redactProxyValue("http://user@proxy.example:8080")).toBe(
      "http://***@proxy.example:8080",
    );
    expect(redactProxyValue("http://proxy.example:8080")).toBe(
      "http://proxy.example:8080",
    );
    expect(
      redactProxyValue("localhost,127.0.0.1,.example.com"),
    ).toBe("localhost,127.0.0.1,.example.com");

    const malformed = [
      "user:secret@proxy.example:8080",
      "http://user:p@ss@host.example",
      "::not a url::",
      "",
    ];
    for (const value of malformed) {
      const redacted = redactProxyValue(value);
      expect(redacted).not.toContain("user");
      expect(redacted).not.toContain("secret");
      expect(redacted).not.toContain("p@ss");
    }
    expect(redactProxyValue("user:secret@proxy.example:8080")).toBe(
      "***@proxy.example:8080",
    );
    expect(redactProxyValue("http://user:p@ss@host.example")).toBe(
      "http://***@host.example",
    );
    expect(redactProxyValue("::not a url::")).toBe("::not a url::");
    expect(redactProxyValue("")).toBe("");

    expect(
      redactProxyValue("http://user:secret@proxy.example:8080/a@b"),
    ).toBe("http://***@proxy.example:8080/a@b");
    expect(
      redactProxyValue("socks5://user:secret@proxy.example:1080"),
    ).toBe("socks5://***@proxy.example:1080");
    expect(redactProxyValue("http://user:pa/ss@host.example")).toBe(
      "http://***@host.example",
    );
    expect(redactProxyValue("user:pa ss@host.example")).toBe(
      "***@host.example",
    );

    for (const value of [
      "http://user:secret@proxy.example:8080/a@b",
      "socks5://user:secret@proxy.example:1080",
      "http://user:pa/ss@host.example",
      "user:pa ss@host.example",
    ]) {
      const redacted = redactProxyValue(value);
      expect(redacted).not.toContain("user");
      expect(redacted).not.toContain("secret");
      expect(redacted).not.toContain("pa/ss");
      expect(redacted).not.toContain("pa ss");
    }

    const ambiguous = [
      ["http://u:12/p@h.example", "http://***@h.example", "u", "12/p"],
      ["http://u:12#p@h.example", "http://***@h.example", "u", "12#p"],
      ["http://u:34?p@h.example", "http://***@h.example", "u", "34?p"],
      [
        "http://cnUo1:12/cnPo1@proxy.qa.test:8080",
        "http://***@proxy.qa.test:8080",
        "cnUo1",
        "cnPo1",
      ],
    ] as const;
    for (const [value, expected, username, password] of ambiguous) {
      const redacted = redactProxyValue(value);
      expect(redacted).toBe(expected);
      expect(redacted).not.toContain(username);
      expect(redacted).not.toContain(password);
    }

    const lf = "http://proxy.example:8080\nhttp://a:b@second.example:8080";
    expect(redactProxyValue(lf)).toBe(
      "http://proxy.example:8080\nhttp://***@second.example:8080",
    );
    expect(redactProxyValue(lf)).not.toContain("a:b");

    const crlf = "http://proxy.example:8080\r\nhttp://a:b@second.example:8080";
    expect(redactProxyValue(crlf)).toBe(
      "http://proxy.example:8080\r\nhttp://***@second.example:8080",
    );
    expect(redactProxyValue(crlf)).not.toContain("a:b");

    const both =
      "http://a:b@first.example:8080\nhttp://c:d@second.example:8080";
    expect(redactProxyValue(both)).toBe(
      "http://***@first.example:8080\nhttp://***@second.example:8080",
    );
    expect(redactProxyValue(both)).not.toContain("a:b");
    expect(redactProxyValue(both)).not.toContain("c:d");

    expect(redactProxyValue("http://proxy.example:8080/a@b")).toBe(
      "http://***@b",
    );
  });
});
