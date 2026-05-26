import { describe, expect, it, vi } from "vitest";
import { describeImageWithAi } from "../src/ai.js";

describe("describeImageWithAi", () => {
  it("returns null when AI mode is disabled", async () => {
    const result = await describeImageWithAi({
      aiConfig: { mode: "disabled" },
      apiKey: "",
      imageBytes: new Uint8Array([102, 97, 107, 101]),
      imageMimeType: "image/png",
      ocrText: "sample text",
      words: [],
    });
    expect(result).toBeNull();
  });

  it("dispatches openrouter mode via fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "A chart on a white background." } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await describeImageWithAi({
      aiConfig: {
        mode: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1",
        model: "openai/gpt-5-mini",
      },
      apiKey: "test-key",
      imageBytes: new Uint8Array([1, 2, 3]),
      imageMimeType: "image/png",
      ocrText: "Revenue chart",
      words: [{ text: "Revenue", confidence: 90, left: 0, top: 0, width: 10, height: 10 }],
    });

    expect(result).toBe("A chart on a white background.");
    expect(fetchMock).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("base64-encodes image bytes without Buffer", async () => {
    const originalBuffer = globalThis.Buffer;
    // @ts-expect-error test shim
    delete globalThis.Buffer;

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "ok" } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await describeImageWithAi({
      aiConfig: { mode: "openrouter", baseUrl: "https://openrouter.ai/api/v1", model: "m" },
      apiKey: "key",
      imageBytes: new Uint8Array([255, 0]),
      imageMimeType: "image/png",
      ocrText: "",
      words: [],
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const imageUrl = body.messages[1].content.find((part: { type: string }) => part.type === "image_url")
      ?.image_url?.url as string;
    expect(imageUrl).toBe("data:image/png;base64,/wA=");

    globalThis.Buffer = originalBuffer;
    vi.unstubAllGlobals();
  });
});
