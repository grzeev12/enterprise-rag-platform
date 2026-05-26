import { describe, expect, it } from "vitest";
import { toVectorLiteral } from "@/lib/rag/vector-store";

describe("pgvector helpers", () => {
  it("formats vectors for pgvector consistently", () => {
    expect(toVectorLiteral([0.123456789, -1, 2])).toBe("[0.12345679,-1.00000000,2.00000000]");
  });

  it("rejects empty vectors", () => {
    expect(() => toVectorLiteral([])).toThrow("Embedding vector cannot be empty");
  });
});
