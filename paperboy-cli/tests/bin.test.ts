import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const cliPath = path.join(process.cwd(), "dist", "cli.js");

describe("bin", () => {
  it("installs the three command names and prints Usage: paperboy-cli", async () => {
    const packageJson = JSON.parse(
      await fs.readFile(path.join(process.cwd(), "package.json"), "utf8"),
    ) as { bin: Record<string, string> };

    expect(packageJson.bin).toEqual({
      paperboy: "./dist/cli.js",
      "paperboy-cli": "./dist/cli.js",
      "paperboy-dispatch": "./dist/cli.js",
    });

    const result = spawnSync(process.execPath, [cliPath, "--help"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage: paperboy-cli");
  });
});
