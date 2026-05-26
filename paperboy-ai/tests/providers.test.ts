import { describe, expect, it } from "vitest";
import { getProvider, listProvidersForSetup, PROVIDERS } from "../src/providers.js";

describe("providers", () => {
  it("getProvider falls back to disabled for unknown ids", () => {
    expect(getProvider("not-a-provider").id).toBe("disabled");
  });

  it("getProvider resolves known ids", () => {
    expect(getProvider("openai").envVar).toBe(PROVIDERS.openai.envVar);
  });

  it("listProvidersForSetup excludes disabled and includes cloud providers", () => {
    const ids = listProvidersForSetup().map((entry) => entry.id);
    expect(ids).not.toContain("disabled");
    expect(ids).toContain("openrouter");
    expect(ids).toContain("local-endpoint");
  });
});
