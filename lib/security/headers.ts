import { readEnv } from "@/lib/env";

export function securityHeaders() {
  const appOrigin = readEnv("NEXT_PUBLIC_APP_URL") ?? "'self'";
  return {
    "Content-Security-Policy": [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "form-action 'self'",
      `connect-src 'self' ${appOrigin}`,
      "img-src 'self' data: blob: https:",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "upgrade-insecure-requests"
    ].join("; "),
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload"
  };
}

export function applySecurityHeaders(headers: Headers) {
  for (const [key, value] of Object.entries(securityHeaders())) {
    headers.set(key, value);
  }
}
