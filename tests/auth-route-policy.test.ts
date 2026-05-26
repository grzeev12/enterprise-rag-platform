import { describe, expect, it } from "vitest";
import { decideAuthRoute } from "@/lib/auth-route-policy";

describe("auth route policy", () => {
  it("redirects unauthenticated dashboard requests to login", () => {
    expect(decideAuthRoute("/dashboard", false)).toEqual({
      action: "redirect",
      redirectTarget: "/login?callbackUrl=%2Fdashboard"
    });
  });

  it("redirects authenticated login requests to dashboard", () => {
    expect(decideAuthRoute("/login", true)).toEqual({
      action: "redirect",
      redirectTarget: "/dashboard"
    });
  });

  it("allows authenticated dashboard requests", () => {
    expect(decideAuthRoute("/dashboard", true)).toEqual({
      action: "allow",
      redirectTarget: null
    });
  });

  it("redirects authenticated root requests to dashboard", () => {
    expect(decideAuthRoute("/", true)).toEqual({
      action: "redirect",
      redirectTarget: "/dashboard"
    });
  });

  it("does not create an authenticated dashboard loop", () => {
    const loginDecision = decideAuthRoute("/login", true);
    expect(loginDecision).toEqual({ action: "redirect", redirectTarget: "/dashboard" });
    if (loginDecision.action !== "redirect") {
      throw new Error("Expected login to redirect");
    }
    expect(decideAuthRoute(loginDecision.redirectTarget, true)).toEqual({
      action: "allow",
      redirectTarget: null
    });
  });
});
