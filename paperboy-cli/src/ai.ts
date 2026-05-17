import type { PaperboyCliConfig } from "./config.js";
import { getApiKey } from "./config.js";
import { PROVIDERS } from "./providers.js";
import type { OcrWordPosition } from "./converter.js";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

interface OpenRouterModelResponse {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
  architecture?: {
    input_modalities?: string[];
  };
}

export interface SetupModelChoice {
  id: string;
  title: string;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  contextLength: number;
  supportsVision: boolean;
}

export interface DescribeImageParams {
  config: PaperboyCliConfig;
  imageBytes: Buffer;
  imageMimeType: string;
  ocrText: string;
  words: OcrWordPosition[];
}

function toDollarsPerMillion(input?: string): number {
  return Math.round((parseFloat(input ?? "0") * 1_000_000) * 100) / 100;
}

export async function fetchOpenRouterModels(
  limit = 15,
): Promise<SetupModelChoice[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(OPENROUTER_MODELS_URL, {
      method: "GET",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`OpenRouter model fetch failed: ${response.status}`);
    }

    const json = (await response.json()) as { data?: OpenRouterModelResponse[] };
    const models = (json.data ?? [])
      .map((model) => {
        const id = model.id;
        const prompt = toDollarsPerMillion(model.pricing?.prompt);
        const completion = toDollarsPerMillion(model.pricing?.completion);
        const isSpecialized = /embed|audio|tts|moderation|rerank|search/i.test(id);
        const supportsVision =
          (model.architecture?.input_modalities ?? []).includes("image") ||
          /vision|vl|image/i.test(id);

        return {
          id,
          title: model.name ?? id,
          inputCostPerMillion: prompt,
          outputCostPerMillion: completion,
          contextLength: model.context_length ?? 0,
          supportsVision,
          isSpecialized,
        };
      })
      .filter((model) => model.inputCostPerMillion > 0)
      .filter((model) => !model.isSpecialized)
      .sort((left, right) => left.inputCostPerMillion - right.inputCostPerMillion)
      .slice(0, limit);

    return models;
  } finally {
    clearTimeout(timeout);
  }
}

function parseMessageContent(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        const text = (item as { text?: unknown }).text;
        return typeof text === "string" ? text : "";
      })
      .join("\n")
      .trim();
  }
  return "";
}

function buildDescribePrompt(ocrText: string, words: OcrWordPosition[]): string {
  const excerpt = ocrText.trim().slice(0, 3000);
  const topWords = words.slice(0, 40).map((word) => word.text).join(", ");
  return [
    "Describe this image for a markdown import.",
    "Return 2-4 short sentences.",
    "Be factual and cautious. Do not invent exact text that is not visible.",
    "",
    `OCR text excerpt: ${excerpt || "(none)"}`,
    `Detected words sample: ${topWords || "(none)"}`,
  ].join("\n");
}

// All OpenAI-compatible providers (OpenRouter, OpenAI, xAI, local
// LM-Studio/llama.cpp servers) share the /v1/chat/completions wire
// format. This helper handles the common case so we don't duplicate
// it per provider.
async function describeViaOpenAiCompatible({
  baseUrl,
  apiKey,
  model,
  imageBytes,
  imageMimeType,
  ocrText,
  words,
  providerLabel,
  authHeader,
}: {
  baseUrl: string;
  apiKey: string | null;
  model: string;
  imageBytes: Buffer;
  imageMimeType: string;
  ocrText: string;
  words: OcrWordPosition[];
  providerLabel: string;
  authHeader?: Record<string, string>;
}): Promise<string | null> {
  const prompt = buildDescribePrompt(ocrText, words);
  const imageDataUrl = `data:${imageMimeType};base64,${imageBytes.toString("base64")}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(authHeader ?? {}),
  };
  if (apiKey && !authHeader) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 220,
      messages: [
        {
          role: "system",
          content:
            "You write concise image descriptions for markdown conversions. Be precise and avoid hallucination.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`${providerLabel} request failed (${response.status}).`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const text = parseMessageContent(json.choices?.[0]?.message?.content);
  return text.length > 0 ? text : null;
}

async function describeWithOpenRouter(params: DescribeImageParams): Promise<string | null> {
  const provider = PROVIDERS.openrouter;
  const apiKey = getApiKey(provider.envVar ?? "");
  if (!apiKey) throw new Error("No API key found for OpenRouter.");
  return describeViaOpenAiCompatible({
    baseUrl: params.config.ai.baseUrl || provider.defaultBaseUrl,
    apiKey,
    model: params.config.ai.model || provider.defaultModel,
    imageBytes: params.imageBytes,
    imageMimeType: params.imageMimeType,
    ocrText: params.ocrText,
    words: params.words,
    providerLabel: "OpenRouter",
  });
}

async function describeWithOpenAi(params: DescribeImageParams): Promise<string | null> {
  const provider = PROVIDERS.openai;
  const apiKey = getApiKey(provider.envVar ?? "");
  if (!apiKey) throw new Error("No API key found for OpenAI.");
  return describeViaOpenAiCompatible({
    baseUrl: params.config.ai.baseUrl || provider.defaultBaseUrl,
    apiKey,
    model: params.config.ai.model || provider.defaultModel,
    imageBytes: params.imageBytes,
    imageMimeType: params.imageMimeType,
    ocrText: params.ocrText,
    words: params.words,
    providerLabel: "OpenAI",
  });
}

async function describeWithXai(params: DescribeImageParams): Promise<string | null> {
  const provider = PROVIDERS.xai;
  const apiKey = getApiKey(provider.envVar ?? "");
  if (!apiKey) throw new Error("No API key found for xAI.");
  return describeViaOpenAiCompatible({
    baseUrl: params.config.ai.baseUrl || provider.defaultBaseUrl,
    apiKey,
    model: params.config.ai.model || provider.defaultModel,
    imageBytes: params.imageBytes,
    imageMimeType: params.imageMimeType,
    ocrText: params.ocrText,
    words: params.words,
    providerLabel: "xAI",
  });
}

// Anthropic's Messages API has a different shape than OpenAI's: requires
// x-api-key + anthropic-version headers, image content is base64-typed,
// and the response is keyed under `content` rather than `choices`.
async function describeWithAnthropic({
  config,
  imageBytes,
  imageMimeType,
  ocrText,
  words,
}: DescribeImageParams): Promise<string | null> {
  const provider = PROVIDERS.anthropic;
  const apiKey = getApiKey(provider.envVar ?? "");
  if (!apiKey) throw new Error("No API key found for Anthropic.");

  const baseUrl = config.ai.baseUrl || provider.defaultBaseUrl;
  const model = config.ai.model || provider.defaultModel;
  const prompt = buildDescribePrompt(ocrText, words);

  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 220,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: imageMimeType,
                data: imageBytes.toString("base64"),
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic request failed (${response.status}).`);
  }

  const json = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = (json.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n")
    .trim();
  return text.length > 0 ? text : null;
}

async function describeWithOllama({
  config,
  ocrText,
  words,
}: DescribeImageParams): Promise<string | null> {
  const baseUrl = config.ai.baseUrl || "http://localhost:11434";
  const model = config.ai.model || "llama3.2:3b";
  const prompt = buildDescribePrompt(ocrText, words);

  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed (${response.status}).`);
  }

  const json = (await response.json()) as { response?: string };
  const text = (json.response ?? "").trim();
  return text.length > 0 ? text : null;
}

async function describeWithLocalEndpoint({
  config,
  ocrText,
  words,
}: DescribeImageParams): Promise<string | null> {
  const baseUrl = config.ai.baseUrl || "http://localhost:1234";
  const model = config.ai.model;
  if (!model) {
    throw new Error("No model configured for local endpoint.");
  }

  const prompt = buildDescribePrompt(ocrText, words);
  const response = await fetch(
    `${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 220,
        messages: [
          {
            role: "system",
            content:
              "You write concise image descriptions for markdown conversions. Be precise and avoid hallucination.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Local endpoint request failed (${response.status}).`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const text = parseMessageContent(json.choices?.[0]?.message?.content);
  return text.length > 0 ? text : null;
}

export async function describeImageWithAi(
  params: DescribeImageParams,
): Promise<string | null> {
  const { config } = params;
  switch (config.ai.mode) {
    case "disabled":
      return null;
    case "openrouter":
      return describeWithOpenRouter(params);
    case "openai":
      return describeWithOpenAi(params);
    case "anthropic":
      return describeWithAnthropic(params);
    case "xai":
      return describeWithXai(params);
    case "ollama":
      return describeWithOllama(params);
    case "local-endpoint":
      return describeWithLocalEndpoint(params);
    default:
      return null;
  }
}
