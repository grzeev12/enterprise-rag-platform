import type { AiProvider, ChatMessage, EmbeddingResult } from "@/lib/ai/types";

export class MockAiProvider implements AiProvider {
  key = "mock";

  constructor(private embedding: number[] = [0.1, 0.2, 0.3]) {}

  async chatCompletion(messages: ChatMessage[]) {
    return {
      content: `Mock answer: ${messages.at(-1)?.content.slice(0, 40) ?? ""}`,
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
    };
  }

  async *streamChatCompletion(messages: ChatMessage[]) {
    const content = `Mock answer: ${messages.at(-1)?.content.slice(0, 40) ?? ""}`;
    yield { content, usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
  }

  async createEmbedding(): Promise<EmbeddingResult> {
    return {
      embedding: this.embedding,
      model: "mock-embedding",
      usage: { promptTokens: 3, totalTokens: 3 }
    };
  }
}
