import bcrypt from "bcryptjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyLoginResult, loginErrorMessage, safeCallbackUrl } from "@/lib/auth-login";
import { getAuthSecret, isAuthConfigured } from "@/lib/auth-runtime";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("login auth helpers", () => {
  it("maps credential failures to clear user-facing errors", () => {
    const failure = classifyLoginResult({ ok: false, error: "CredentialsSignin", status: 401 });

    expect(failure).toBe("invalid_credentials");
    expect(loginErrorMessage(failure!)).toBe("Invalid email or password.");
  });

  it("allows successful login results", () => {
    expect(classifyLoginResult({ ok: true, url: "/dashboard" })).toBeNull();
  });

  it("maps configuration and unknown failures separately", () => {
    expect(classifyLoginResult({ ok: false, error: "Configuration" })).toBe("missing_configuration");
    expect(classifyLoginResult(undefined)).toBe("server_error");
  });

  it("keeps callback redirects inside the app", () => {
    expect(safeCallbackUrl("/dashboard?tab=home")).toBe("/dashboard?tab=home");
    expect(safeCallbackUrl("https://evil.example/dashboard")).toBe("/dashboard");
    expect(safeCallbackUrl("/api/auth/signin")).toBe("/dashboard");
  });

  it("accepts AUTH_SECRET or NEXTAUTH_SECRET for production middleware compatibility", () => {
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("NEXTAUTH_SECRET", "nextauth-secret-placeholder");

    expect(getAuthSecret()).toBe("nextauth-secret-placeholder");
    expect(isAuthConfigured()).toBe(true);
  });

  it("uses the same bcrypt comparison behavior as the credentials provider", async () => {
    const password = "valid-demo-password";
    const hash = await bcrypt.hash(password, 12);

    await expect(bcrypt.compare(password, hash)).resolves.toBe(true);
    await expect(bcrypt.compare("wrong-password", hash)).resolves.toBe(false);
  });
});
