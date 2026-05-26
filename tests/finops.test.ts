import { describe, expect, it } from "vitest";
import { estimateUsageCostUsd, formatUsd } from "@/lib/finops";

describe("FinOps cost helpers", () => {
  it("estimates OpenAI chat cost from token usage", () => {
    const cost = estimateUsageCostUsd({
      model: "gpt-4o-mini",
      promptTokens: 1_000_000,
      completionTokens: 1_000_000
    });

    expect(cost).toBeCloseTo(0.75);
  });

  it("formats small estimated costs with useful precision", () => {
    expect(formatUsd(0.00042)).toBe("$0.0004");
  });
});
