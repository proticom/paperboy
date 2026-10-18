import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const converterDir = path.resolve(__dirname, "..");

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(
      `Command failed (${result.status ?? "unknown"}): ${command} ${args.join(" ")}`,
    );
  }
}

async function main() {
  console.log("1/1 Building shared converter package...");
  run("npm", ["run", "build"], converterDir);
  console.log(
    "Build complete. paperboy-site consumes @proticom/paperboy-converter from npm — no vendor step.",
  );
  console.log(
    "Workspace consumers (CLI, app, extension) already get the converter via npm workspaces.",
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
