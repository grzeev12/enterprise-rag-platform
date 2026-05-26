import { describe, expect, it } from "vitest";
import { validateEnvironment } from "@/lib/env-validation";

describe("health and environment validation", () => {
  it("reports missing app runtime variables without throwing", () => {
    const result = validateEnvironment("app");

    expect(result).toHaveProperty("ok");
    expect(Array.isArray(result.missing)).toBe(true);
  });
});
