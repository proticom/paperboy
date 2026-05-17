import { spawnSync } from "node:child_process";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const converterDir = path.resolve(__dirname, "..");
const workspaceDir = path.resolve(converterDir, "..");

const SHARED_PACKAGE_NAME = "@proticom/paperboy-converter";
// Only paperboy-site needs a packed tarball — it lives in a separate Git repo
// (deployed to Vercel) and can't see the monorepo. The CLI, app, widget, and
// extension are npm workspaces members that symlink the converter directly.
const TARBALL_CONSUMERS = ["paperboy-site"];

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

async function main() {
  console.log("1/5 Building shared converter package...");
  run("npm", ["run", "build"], converterDir);

  console.log("2/5 Packing shared converter tarball...");
  const packJson = runCapture("npm", ["pack", "--json"], converterDir);
  const parsed = JSON.parse(packJson);
  const tarballFileName = parsed?.[0]?.filename;
  if (!tarballFileName) {
    throw new Error("Could not determine tarball filename from `npm pack --json`.");
  }
  console.log(`Packed ${tarballFileName}`);

  console.log("3/5 Copying tarball into paperboy-site/ ...");
  const sitePath = path.join(workspaceDir, "paperboy-site", tarballFileName);
  const sourcePath = path.join(converterDir, tarballFileName);
  await copyFile(sourcePath, sitePath);
  console.log(`Copied ${tarballFileName} -> paperboy-site/`);

  console.log("4/5 Updating paperboy-site converter reference...");
  await updateSiteTarballDependency(tarballFileName);

  console.log("5/5 Installing paperboy-site dependencies...");
  run(
    "npm",
    ["install", "--legacy-peer-deps"],
    path.join(workspaceDir, "paperboy-site"),
  );

  console.log("Sync complete.");
  console.log(
    "Workspace consumers (CLI, app, widget, extension) already get the converter via npm workspaces — no copy step needed.",
  );
}

async function updateSiteTarballDependency(tarballFileName) {
  const packageJsonPath = path.join(workspaceDir, "paperboy-site", "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const desiredValue = `file:${tarballFileName}`;
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
    console.log(`Updated paperboy-site/package.json -> ${desiredValue}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
