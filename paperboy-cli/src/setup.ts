import { execSync } from "node:child_process";
import { confirm, input, password, select } from "@inquirer/prompts";
import { fetchOpenRouterModels } from "./ai.js";
import {
  CONFIG_PATH,
  DEFAULT_CONFIG,
  OPENROUTER_ENV_VAR,
  hasSecretTool,
  loadConfig,
  saveConfig,
  writeApiKeyToDotenv,
  writeApiKeyToKeychain,
  writeApiKeyToSecretTool,
} from "./config.js";

type SetupMode = "disabled" | "ollama-download" | "local-endpoint" | "openrouter";

function commandExists(command: string): boolean {
  try {
    execSync(`which ${command}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function formatCost(cost: number): string {
  return cost > 0 ? `$${cost.toFixed(2)}/M` : "unknown";
}

async function runOllamaPull(model: string): Promise<void> {
  execSync(`ollama pull ${model}`, { stdio: "inherit" });
}

export async function runSetup(): Promise<void> {
  const current = await loadConfig();
  const next = {
    ...current,
    ai: { ...current.ai },
    defaults: { ...current.defaults },
  };

  console.log("");
  console.log("Paperboy CLI Setup");
  console.log("------------------");
  console.log("Choose how optional AI features should run.");
  console.log("");

  const mode = await select<SetupMode>({
    message: "AI mode",
    default:
      current.ai.mode === "disabled"
        ? "disabled"
        : current.ai.mode === "ollama"
          ? "ollama-download"
          : current.ai.mode,
    choices: [
      { name: "Deterministic only (no AI)", value: "disabled" },
      { name: "Download local model with Ollama", value: "ollama-download" },
      { name: "Use existing local endpoint", value: "local-endpoint" },
      { name: "Use cloud API key (OpenRouter)", value: "openrouter" },
    ],
  });

  if (mode === "disabled") {
    next.ai.mode = "disabled";
  }

  if (mode === "ollama-download") {
    const model = await select<string>({
      message: "Choose local model to use",
      default: current.ai.model || "phi3:mini",
      choices: [
        { name: "phi3:mini (small, fast)", value: "phi3:mini" },
        { name: "llama3.2:3b (balanced)", value: "llama3.2:3b" },
        { name: "qwen2.5:3b-instruct (instruction tuned)", value: "qwen2.5:3b-instruct" },
        { name: "Custom model name", value: "__custom__" },
      ],
    });

    const resolvedModel =
      model === "__custom__"
        ? await input({
            message: "Enter Ollama model name",
            default: current.ai.model || "phi3:mini",
          })
        : model;

    const hasOllama = commandExists("ollama");
    if (!hasOllama) {
      console.log("");
      console.log("Ollama is not installed. Install from https://ollama.com and rerun setup.");
      console.log("Saving config anyway so Paperboy CLI knows which model you want.");
    } else {
      const shouldPull = await confirm({
        message: `Download ${resolvedModel} now with 'ollama pull'?`,
        default: true,
      });
      if (shouldPull) {
        console.log("");
        await runOllamaPull(resolvedModel);
      }
    }

    next.ai.mode = "ollama";
    next.ai.baseUrl = "http://localhost:11434";
    next.ai.model = resolvedModel;
  }

  if (mode === "local-endpoint") {
    const baseUrl = await input({
      message: "Local endpoint base URL",
      default: current.ai.baseUrl || "http://localhost:1234",
    });
    const model = await input({
      message: "Model id for that endpoint",
      default: current.ai.model || "local-model",
    });

    next.ai.mode = "local-endpoint";
    next.ai.baseUrl = baseUrl.trim();
    next.ai.model = model.trim();
  }

  if (mode === "openrouter") {
    let model = current.ai.model || DEFAULT_CONFIG.ai.model;

    try {
      const models = await fetchOpenRouterModels(12);
      if (models.length > 0) {
        const selected = await select<string>({
          message: "Choose a cloud model",
          choices: [
            ...models.map((entry) => ({
              name:
                `${entry.id}  [in ${formatCost(entry.inputCostPerMillion)}, out ${formatCost(entry.outputCostPerMillion)}, ctx ${entry.contextLength}]` +
                (entry.supportsVision ? "  vision" : ""),
              value: entry.id,
            })),
            { name: "Custom model id", value: "__custom__" },
          ],
        });
        model =
          selected === "__custom__"
            ? await input({
                message: "Enter model id (provider/model)",
                default: current.ai.model || "openai/gpt-5-mini",
              })
            : selected;
      }
    } catch {
      model = await input({
        message: "OpenRouter model id",
        default: current.ai.model || "openai/gpt-5-mini",
      });
    }

    const storageChoices: Array<{ name: string; value: string }> = [];
    if (process.platform === "darwin") {
      storageChoices.push({ name: "Store key in macOS Keychain (recommended)", value: "keychain" });
    }
    if (process.platform === "linux" && hasSecretTool()) {
      storageChoices.push({ name: "Store key in GNOME Keyring (recommended)", value: "secret-tool" });
    }
    storageChoices.push(
      { name: "Save key to ~/.config/paperboy-cli/.env (plaintext)", value: "dotenv" },
      { name: "Skip for now", value: "skip" },
    );

    const storage = await select<string>({
      message: `How should ${OPENROUTER_ENV_VAR} be stored?`,
      choices: storageChoices,
    });

    if (storage !== "skip") {
      const key = await password({
        message: "Enter your OpenRouter API key",
        mask: "*",
      });
      if (!key.trim()) {
        console.log("No key entered. Skipping key storage.");
      } else if (storage === "keychain") {
        const ok = writeApiKeyToKeychain(OPENROUTER_ENV_VAR, key.trim());
        if (!ok) {
          console.log("Failed to write to Keychain. Saved to dotenv instead.");
          await writeApiKeyToDotenv(OPENROUTER_ENV_VAR, key.trim());
        }
      } else if (storage === "secret-tool") {
        const ok = writeApiKeyToSecretTool(OPENROUTER_ENV_VAR, key.trim());
        if (!ok) {
          console.log("Failed to write to secret-tool. Saved to dotenv instead.");
          await writeApiKeyToDotenv(OPENROUTER_ENV_VAR, key.trim());
        }
      } else {
        await writeApiKeyToDotenv(OPENROUTER_ENV_VAR, key.trim());
      }
    }

    next.ai.mode = "openrouter";
    next.ai.model = model.trim();
    next.ai.apiKeyEnvVar = OPENROUTER_ENV_VAR;
  }

  next.defaults.includeLayoutTable = await confirm({
    message: "Include OCR text-position table by default?",
    default: current.defaults.includeLayoutTable,
  });

  next.defaults.describeImagesWithAi = await confirm({
    message: "Try AI image description by default (when configured)?",
    default: current.defaults.describeImagesWithAi && next.ai.mode !== "disabled",
  });

  await saveConfig(next);

  console.log("");
  console.log("Setup complete.");
  console.log(`Mode: ${next.ai.mode}`);
  console.log(`Model: ${next.ai.model}`);
  console.log(`Config written to ${CONFIG_PATH}`);
  console.log("");
}
