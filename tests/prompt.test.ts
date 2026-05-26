import { describe, expect, it } from "vitest";
import { buildRagMessages, groundedSystemPrompt } from "@/lib/rag/prompt";

describe("grounded RAG prompt", () => {
  it("requires source-grounded answers and refusal when missing", () => {
    expect(groundedSystemPrompt).toContain("Use only the provided context");
    expect(groundedSystemPrompt).toContain("I could not find that in the available sources.");

    const messages = buildRagMessages("What is supported?", [
      {
        chunkId: "chunk_1",
        documentId: "doc_1",
        content: "Supported feature: website crawling.",
        title: "Docs",
        sourceUrl: "https://example.com/docs",
        chunkIndex: 0,
        score: 0.9
      }
    ]);

    expect(messages[1].content).toContain("[1] Docs");
    expect(messages[1].content).toContain("What is supported?");
  });
});
