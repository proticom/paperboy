import { execSync } from "node:child_process";
import { confirm, input, password, select } from "@inquirer/prompts";
import { fetchOpenRouterModels } from "./ai.js";
import {
  CONFIG_PATH,
  hasSecretTool,
  loadConfig,
  saveConfig,
  writeApiKeyToDotenv,
  writeApiKeyToKeychain,
  writeApiKeyToSecretTool,
  writeApiKeyToWindowsCredentialManager,
} from "./config.js";
import {
  listProvidersForSetup,
  PROVIDERS,
  type ProviderId,
  type ProviderInfo,
} from "./providers.js";

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

// Walk the user through choosing a storage backend (OS keychain when
// available, dotenv as fallback) and write the supplied key there.
async function storeProviderKey(
  provider: ProviderInfo,
  key: string,
): Promise<void> {
  if (!provider.envVar) return;
  const trimmed = key.trim();
  if (!trimmed) {
    console.log("No key entered. Skipping key storage.");
    return;
  }

  const choices: Array<{ name: string; value: string }> = [];
  if (process.platform === "darwin") {
    choices.push({
      name: "Store key in macOS Keychain (recommended)",
      value: "keychain",
    });
  }
  if (process.platform === "linux" && hasSecretTool()) {
    choices.push({
      name: "Store key in GNOME Keyring (recommended)",
      value: "secret-tool",
    });
  }
  if (process.platform === "win32") {
    choices.push({
      name: "Store key in Windows Credential Manager (recommended)",
      value: "wincred",
    });
  }
  choices.push(
    {
      name: "Save key to ~/.config/paperboy-cli/.env (plaintext)",
      value: "dotenv",
    },
    { name: "Skip for now", value: "skip" },
  );

  const storage = await select<string>({
    message: `How should ${provider.envVar} be stored?`,
    choices,
  });

  if (storage === "skip") return;

  if (storage === "keychain") {
    const ok = writeApiKeyToKeychain(provider.envVar, trimmed);
    if (!ok) {
      console.log("Failed to write to Keychain. Saved to dotenv instead.");
      await writeApiKeyToDotenv(provider.envVar, trimmed);
    }
    return;
  }
  if (storage === "secret-tool") {
    const ok = writeApiKeyToSecretTool(provider.envVar, trimmed);
    if (!ok) {
      console.log("Failed to write to secret-tool. Saved to dotenv instead.");
      await writeApiKeyToDotenv(provider.envVar, trimmed);
    }
    return;
  }
  if (storage === "wincred") {
    const ok = writeApiKeyToWindowsCredentialManager(provider.envVar, trimmed);
    if (!ok) {
      console.log(
        "Failed to write to Windows Credential Manager. Saved to dotenv instead.",
      );
      await writeApiKeyToDotenv(provider.envVar, trimmed);
    }
    return;
  }
  await writeApiKeyToDotenv(provider.envVar, trimmed);
}

async function pickOpenRouterModel(currentModel: string): Promise<string> {
  try {
    const models = await fetchOpenRouterModels(12);
    if (models.length === 0) throw new Error("No models returned.");
    const selected = await select<string>({
      message: "Choose a cloud model",
      choices: [
        ...models.map((entry) => ({
          name:
            `${entry.id}  [in ${formatCost(entry.inputCostPerMillion)}, ` +
            `out ${formatCost(entry.outputCostPerMillion)}, ` +
            `ctx ${entry.contextLength}]` +
            (entry.supportsVision ? "  vision" : ""),
          value: entry.id,
        })),
        { name: "Custom model id", value: "__custom__" },
      ],
    });
    if (selected !== "__custom__") return selected;
    return await input({
      message: "Enter model id (provider/model)",
      default: currentModel || PROVIDERS.openrouter.defaultModel,
    });
  } catch {
    return await input({
      message: "OpenRouter model id",
      default: currentModel || PROVIDERS.openrouter.defaultModel,
    });
  }
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

  const providerChoices = listProvidersForSetup().map((p) => ({
    name: p.label,
    value: p.id,
  }));

  const providerId = await select<ProviderId>({
    message: "AI provider",
    default: current.ai.mode === "disabled" ? "openrouter" : current.ai.mode,
    choices: [
      { name: "Deterministic only (no AI)", value: "disabled" as ProviderId },
      ...providerChoices,
    ],
  });

  if (providerId === "disabled") {
    next.ai.mode = "disabled";
  } else {
    const provider = PROVIDERS[providerId];
    next.ai.mode = providerId;
    next.ai.apiKeyEnvVar = provider.envVar ?? "";
    next.ai.baseUrl = provider.defaultBaseUrl;

    if (providerId === "openrouter") {
      next.ai.model = (await pickOpenRouterModel(current.ai.model)).trim();
    } else if (providerId === "ollama") {
      const model = await select<string>({
        message: "Choose local model",
        default: current.ai.model || "phi3:mini",
        choices: [
          { name: "phi3:mini (small, fast)", value: "phi3:mini" },
          { name: "llama3.2:3b (balanced)", value: "llama3.2:3b" },
          { name: "qwen2.5:3b-instruct (instruction tuned)", value: "qwen2.5:3b-instruct" },
          { name: "Custom model name", value: "__custom__" },
        ],
      });
      const resolved =
        model === "__custom__"
          ? await input({
              message: "Enter Ollama model name",
              default: current.ai.model || "phi3:mini",
            })
          : model;
      next.ai.model = resolved.trim();

      if (commandExists("ollama")) {
        const shouldPull = await confirm({
          message: `Download ${resolved} now with 'ollama pull'?`,
          default: true,
        });
        if (shouldPull) await runOllamaPull(resolved);
      } else {
        console.log("");
        console.log("Ollama is not installed. Install from https://ollama.com and rerun setup.");
      }
    } else if (providerId === "local-endpoint") {
      next.ai.baseUrl = (await input({
        message: "Local endpoint base URL",
        default: current.ai.baseUrl || provider.defaultBaseUrl,
      })).trim();
      next.ai.model = (await input({
        message: "Model id for that endpoint",
        default: current.ai.model || provider.defaultModel,
      })).trim();
    } else {
      // openai, anthropic, xai — direct cloud APIs with their own key.
      next.ai.model = (await input({
        message: `Model id for ${provider.label}`,
        default: current.ai.model || provider.defaultModel,
      })).trim();

      if (provider.needsKey && provider.envVar) {
        if (provider.signupUrl) {
          console.log("");
          console.log(`Get an API key at: ${provider.signupUrl}`);
        }
        const key = await password({
          message: `Enter your ${provider.label} API key`,
          mask: "*",
        });
        await storeProviderKey(provider, key);
      }
    }

    if (providerId === "openrouter" && provider.envVar) {
      if (provider.signupUrl) {
        console.log("");
        console.log(`Get an API key at: ${provider.signupUrl}`);
      }
      const key = await password({
        message: `Enter your ${provider.label} API key`,
        mask: "*",
      });
      await storeProviderKey(provider, key);
    }
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
  if (next.ai.model) console.log(`Model: ${next.ai.model}`);
  if (next.ai.baseUrl) console.log(`Base URL: ${next.ai.baseUrl}`);
  console.log(`Config written to ${CONFIG_PATH}`);
  console.log("");
}
