import { confirm } from "@inquirer/prompts";
import { CONFIG_PATH, loadConfig, saveConfig } from "./config.js";

export async function runSetup(): Promise<void> {
  const config = await loadConfig();
  config.defaults.includeLayoutTable = await confirm({
    message: "Include OCR text-position table by default?",
    default: config.defaults.includeLayoutTable,
  });
  await saveConfig(config);
  process.stdout.write(`Setup complete. Config written to ${CONFIG_PATH}\n`);
}
