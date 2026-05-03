import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const converterDir = path.resolve(__dirname, "..");
const workspaceDir = path.resolve(converterDir, "..");

const SHARED_PACKAGE_NAME = "@proticom/paperboy-converter";
const TARBALL_CONSUMERS = [
  "paperboy-site",
  "paperboy-app",
  "paperboy-widget",
  "paperboy-ext",
];

function run(command, args, cwd, extraOptions = {}) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    ...extraOptions,
  });
  if (result.status !== 0) {
    throw new Error(
      `Command failed (${result.status ?? "unknown"}): ${command} ${args.join(" ")}`,
    );
  }
}

function runCapture(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const stderr = result.stderr || "";
    throw new Error(
      `Command failed (${result.status ?? "unknown"}): ${command} ${args.join(" ")}\n${stderr}`,
    );
  }
  return result.stdout;
}

async function updateTarballDependency(packageDirName, tarballFileName) {
  const packageDir = path.join(workspaceDir, packageDirName);
  const packageJsonPath = path.join(packageDir, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const desiredValue = `file:../paperboy-converter/${tarballFileName}`;

  if (packageJson.dependencies?.[SHARED_PACKAGE_NAME] !== desiredValue) {
    packageJson.dependencies = {
      ...(packageJson.dependencies ?? {}),
      [SHARED_PACKAGE_NAME]: desiredValue,
    };
    await writeFile(
      packageJsonPath,
      `${JSON.stringify(packageJson, null, 2)}\n`,
      "utf8",
    );
    console.log(`Updated ${packageDirName}/package.json -> ${desiredValue}`);
  }
}

async function main() {
  console.log("1/6 Building shared converter package...");
  run("npm", ["run", "build"], converterDir);

  console.log("2/6 Packing shared converter tarball...");
  const packJson = runCapture("npm", ["pack", "--json"], converterDir);
  const parsed = JSON.parse(packJson);
  const tarballFileName = parsed?.[0]?.filename;
  if (!tarballFileName) {
    throw new Error("Could not determine tarball filename from `npm pack --json`.");
  }
  console.log(`Packed ${tarballFileName}`);

  console.log("3/6 Updating consumer package references...");
  for (const consumer of TARBALL_CONSUMERS) {
    await updateTarballDependency(consumer, tarballFileName);
  }

  console.log("4/6 Installing updated dependencies...");
  run("npm", ["install"], path.join(workspaceDir, "paperboy-cli"));
  run("npm", ["install"], path.join(workspaceDir, "paperboy-app"));
  run("npm", ["install", "--legacy-peer-deps"], path.join(workspaceDir, "paperboy-site"));
  run("npm", ["install"], path.join(workspaceDir, "paperboy-widget"));
  run("npm", ["install"], path.join(workspaceDir, "paperboy-ext"));

  console.log("5/6 Refreshing generated bundles...");
  run("npm", ["run", "build:converter"], path.join(workspaceDir, "paperboy-app"));
  run("npm", ["run", "build"], path.join(workspaceDir, "paperboy-widget"));
  run("npm", ["run", "build"], path.join(workspaceDir, "paperboy-ext"));

  console.log("6/6 Sync complete.");
  console.log(
    "Shared converter is now propagated to CLI, app, site, widget, and extension.",
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
