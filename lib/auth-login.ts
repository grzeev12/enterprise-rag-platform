export type LoginFailureKind = "invalid_credentials" | "missing_configuration" | "server_error";

export type LoginResultLike = {
  ok?: boolean;
  error?: string | null;
  status?: number;
  url?: string | null;
} | undefined;

export function safeCallbackUrl(rawCallbackUrl: string | null, fallback = "/dashboard") {
  if (!rawCallbackUrl) return fallback;

  try {
    const parsed = new URL(rawCallbackUrl, "https://app.local");
    if (parsed.origin !== "https://app.local") return fallback;
    if (parsed.pathname.startsWith("/api/auth")) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function classifyLoginResult(result: LoginResultLike): LoginFailureKind | null {
  if (!result) return "server_error";
  if (result.ok && !result.error) return null;
  if (result.error === "CredentialsSignin" || result.status === 401) return "invalid_credentials";
  if (result.error === "Configuration") return "missing_configuration";
  return result.error ? "server_error" : null;
}

export function loginErrorMessage(kind: LoginFailureKind) {
  if (kind === "invalid_credentials") {
    return "Invalid email or password.";
  }
  if (kind === "missing_configuration") {
    return "Sign in is not configured correctly. Please contact an administrator.";
  }
  return "We could not sign you in right now. Please try again.";
}
