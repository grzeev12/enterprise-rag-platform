import { describe, expect, it } from "vitest";
import { MockAiProvider } from "@/lib/ai/mock-provider";

describe("AI Gateway mock provider", () => {
  it("returns deterministic embeddings and streaming text", async () => {
    const provider = new MockAiProvider([1, 2, 3]);
    await expect(provider.createEmbedding()).resolves.toMatchObject({
      embedding: [1, 2, 3],
      model: "mock-embedding"
    });

    let streamed = "";
    for await (const delta of provider.streamChatCompletion([{ role: "user", content: "hello world" }])) {
      streamed += delta.content;
    }
    expect(streamed).toContain("Mock answer");
  });
});
