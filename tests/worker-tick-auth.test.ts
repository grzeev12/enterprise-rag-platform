import { describe, expect, it } from "vitest";
import { isWorkerTickAuthorized } from "@/lib/internal/worker-tick-auth";

describe("worker tick authorization", () => {
  it("accepts a matching bearer token", () => {
    expect(isWorkerTickAuthorized("Bearer test-secret", "test-secret")).toBe(true);
  });

  it("rejects missing or malformed authorization", () => {
    expect(isWorkerTickAuthorized(null, "test-secret")).toBe(false);
    expect(isWorkerTickAuthorized("Basic test-secret", "test-secret")).toBe(false);
    expect(isWorkerTickAuthorized("Bearer", "test-secret")).toBe(false);
  });

  it("rejects mismatched or missing expected secrets", () => {
    expect(isWorkerTickAuthorized("Bearer wrong-secret", "test-secret")).toBe(false);
    expect(isWorkerTickAuthorized("Bearer test-secret", undefined)).toBe(false);
  });
});

