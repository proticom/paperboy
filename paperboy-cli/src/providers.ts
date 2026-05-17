// Provider catalog for AI-assisted features. Each provider has its own
// stable id, its own environment variable name (used to look up the API
// key in OS keychain / dotenv / process env), and a human-readable label.
//
// Adding a new provider means: (1) extend `providers` below, (2) handle
// it in src/ai.ts's describeImageWithAi switch, (3) extend the setup
// flow in src/setup.ts so the user can configure it.

export type ProviderId =
  | "disabled"
  | "openrouter"
  | "openai"
  | "anthropic"
  | "xai"
  | "ollama"
  | "local-endpoint";

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  envVar: string | null;
  defaultModel: string;
  defaultBaseUrl: string;
  needsKey: boolean;
  // Whether the provider exposes vision-capable models. Used to gate
  // describeImageWithAi where the host has to fall back gracefully.
  supportsVision: boolean;
  signupUrl?: string;
}

export const PROVIDERS: Readonly<Record<ProviderId, ProviderInfo>> = {
  disabled: {
    id: "disabled",
    label: "Deterministic only (no AI)",
    envVar: null,
    defaultModel: "",
    defaultBaseUrl: "",
    needsKey: false,
    supportsVision: false,
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter (cloud, BYO key)",
    envVar: "PAPERBOY_OPENROUTER_API_KEY",
    defaultModel: "openai/gpt-5-mini",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    needsKey: true,
    supportsVision: true,
    signupUrl: "https://openrouter.ai/keys",
  },
  openai: {
    id: "openai",
    label: "OpenAI direct (api.openai.com, BYO key)",
    envVar: "PAPERBOY_OPENAI_API_KEY",
    defaultModel: "gpt-4o-mini",
    defaultBaseUrl: "https://api.openai.com/v1",
    needsKey: true,
    supportsVision: true,
    signupUrl: "https://platform.openai.com/api-keys",
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic direct (api.anthropic.com, BYO key)",
    envVar: "PAPERBOY_ANTHROPIC_API_KEY",
    defaultModel: "claude-haiku-4-5-20251001",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    needsKey: true,
    supportsVision: true,
    signupUrl: "https://console.anthropic.com/settings/keys",
  },
  xai: {
    id: "xai",
    label: "xAI Grok (api.x.ai, BYO key)",
    envVar: "PAPERBOY_XAI_API_KEY",
    defaultModel: "grok-2-vision",
    defaultBaseUrl: "https://api.x.ai/v1",
    needsKey: true,
    supportsVision: true,
    signupUrl: "https://console.x.ai/",
  },
  ollama: {
    id: "ollama",
    label: "Ollama (local, no key)",
    envVar: null,
    defaultModel: "llama3.2:3b",
    defaultBaseUrl: "http://localhost:11434",
    needsKey: false,
    supportsVision: false,
  },
  "local-endpoint": {
    id: "local-endpoint",
    label: "Local OpenAI-compatible endpoint (LM Studio, llama.cpp, vLLM, …)",
    envVar: null,
    defaultModel: "local-model",
    defaultBaseUrl: "http://localhost:1234/v1",
    needsKey: false,
    supportsVision: false,
  },
} as const;

export function getProvider(id: string | undefined): ProviderInfo {
  const candidate = (id ?? "disabled") as ProviderId;
  return PROVIDERS[candidate] ?? PROVIDERS.disabled;
}

export function listProvidersForSetup(): ProviderInfo[] {
  // Order matters: cloud BYO-key options first (most common ask), then
  // local options, with "disabled" excluded from the choice list (the
  // setup flow surfaces it as a separate top-level option).
  return [
    PROVIDERS.openrouter,
    PROVIDERS.openai,
    PROVIDERS.anthropic,
    PROVIDERS.xai,
    PROVIDERS.ollama,
    PROVIDERS["local-endpoint"],
  ];
}
