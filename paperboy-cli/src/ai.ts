import type { PaperboyCliConfig } from "./config.js";
import { getApiKey, OPENROUTER_ENV_VAR } from "./config.js";
import type { OcrWordPosition } from "./converter.js";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

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

async function describeWithOpenRouter({
  config,
  imageBytes,
  imageMimeType,
  ocrText,
  words,
}: DescribeImageParams): Promise<string | null> {
  const apiKey = getApiKey(config.ai.apiKeyEnvVar || OPENROUTER_ENV_VAR);
  if (!apiKey) {
    throw new Error("No API key found for OpenRouter.");
  }

  const model = config.ai.model || "google/gemini-2.5-flash";
  const prompt = buildDescribePrompt(ocrText, words);
  const imageDataUrl = `data:${imageMimeType};base64,${imageBytes.toString("base64")}`;

  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
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
    throw new Error(`OpenRouter request failed (${response.status}).`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const text = parseMessageContent(json.choices?.[0]?.message?.content);
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
  if (config.ai.mode === "disabled") return null;
  if (config.ai.mode === "openrouter") return describeWithOpenRouter(params);
  if (config.ai.mode === "ollama") return describeWithOllama(params);
  return describeWithLocalEndpoint(params);
}
