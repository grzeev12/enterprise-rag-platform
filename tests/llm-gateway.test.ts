import { describe, expect, it } from "vitest";
import { getAiProvider, maskSecretRef } from "@/lib/ai/gateway";
import { AiProviderError } from "@/lib/ai/types";

describe("multi-LLM gateway scaffolds", () => {
  it("masks provider secret references", () => {
    expect(maskSecretRef("OPENAI_API_KEY")).toBe("OPE***KEY");
    expect(maskSecretRef(null)).toBe("Not configured");
  });

  it("returns safe scaffold adapters for future providers", async () => {
    const provider = getAiProvider("anthropic");

    await expect(provider.chatCompletion([{ role: "user", content: "hello" }])).rejects.toBeInstanceOf(
      AiProviderError
    );
    await expect(provider.healthCheck?.()).resolves.toMatchObject({
      ok: false,
      status: "UNAVAILABLE"
    });
  });
});
