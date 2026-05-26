import { type NextRequest } from "next/server";
import { authDebugNotFound, isAuthDebugEnabled } from "@/lib/auth-debug";
import { readEnv } from "@/lib/env";

export const runtime = "nodejs";

const authCookieHints = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token"
];

export async function GET(request: NextRequest) {
  if (!isAuthDebugEnabled()) {
    return authDebugNotFound();
  }

  const cookieNames = request.cookies.getAll().map((cookie) => cookie.name).sort();
  const hasAuthCookies = cookieNames.some((name) =>
    authCookieHints.some((hint) => name === hint || name.endsWith(`.${hint}`))
  );

  return Response.json({
    routeReachable: true,
    hasAuthCookies,
    cookieNames,
    authUrlConfigured: Boolean(readEnv("AUTH_URL")),
    nextAuthUrlConfigured: Boolean(readEnv("NEXTAUTH_URL")),
    authSecretConfigured: Boolean(readEnv("AUTH_SECRET")),
    nextAuthSecretConfigured: Boolean(readEnv("NEXTAUTH_SECRET")),
    appUrl: readEnv("NEXT_PUBLIC_APP_URL") ?? readEnv("AUTH_URL") ?? readEnv("NEXTAUTH_URL") ?? null
  });
}
