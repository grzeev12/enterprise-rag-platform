import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { isAuthDebugEnabled } from "@/lib/auth-debug";
import { getAuthSecret } from "@/lib/auth-runtime";
import { applySecurityHeaders } from "@/lib/security/headers";

const protectedPrefixes = ["/dashboard", "/onboarding", "/organizations", "/workspaces", "/admin", "/finops", "/llm-gateway"];
const authCookieCandidates = [
  { cookieName: "__Secure-authjs.session-token", salt: "authjs.session-token" },
  { cookieName: "authjs.session-token", salt: "authjs.session-token" },
  { cookieName: "__Secure-next-auth.session-token", salt: "next-auth.session-token" },
  { cookieName: "next-auth.session-token", salt: "next-auth.session-token" }
];

export default async function middleware(request: NextRequest) {
  const { nextUrl } = request;
  const pathname = nextUrl.pathname;
  const isProtected = protectedPrefixes.some((prefix) => pathname.startsWith(prefix));
  const isLoginPage = pathname === "/login";
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const correlationId = request.headers.get("x-correlation-id") ?? requestId;
  const hasSessionTokenCookie = hasAuthSessionCookie(request);
  const token = await readAuthToken(request);
  const hasToken = Boolean(token);

  if (isLoginPage && hasToken) {
    const dashboardUrl = new URL("/dashboard", nextUrl);
    logMiddlewareDecision({ pathname, hasSessionTokenCookie, authState: hasToken, isLoginPage, redirectTarget: dashboardUrl.pathname });
    return withHeaders(NextResponse.redirect(dashboardUrl), requestId, correlationId);
  }

  if (isProtected && !hasToken) {
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", `${nextUrl.pathname}${nextUrl.search}`);
    logMiddlewareDecision({ pathname, hasSessionTokenCookie, authState: hasToken, isLoginPage, redirectTarget: `${loginUrl.pathname}${loginUrl.search}` });
    return withHeaders(NextResponse.redirect(loginUrl), requestId, correlationId);
  }

  logMiddlewareDecision({ pathname, hasSessionTokenCookie, authState: hasToken, isLoginPage, redirectTarget: null });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("x-correlation-id", correlationId);
  return withHeaders(NextResponse.next({ request: { headers: requestHeaders } }), requestId, correlationId);
}

export const config = {
  matcher: ["/login", "/dashboard/:path*", "/onboarding/:path*", "/organizations/:path*", "/workspaces/:path*", "/admin/:path*", "/finops/:path*", "/llm-gateway/:path*"]
};

async function readAuthToken(request: NextRequest) {
  const secret = getAuthSecret();
  if (!secret) return null;

  for (const candidate of authCookieCandidates) {
    if (!request.cookies.has(candidate.cookieName)) continue;
    try {
      const token = await getToken({
        req: request,
        secret,
        cookieName: candidate.cookieName,
        salt: candidate.salt
      });
      if (token) return token;
    } catch {
      continue;
    }
  }

  return null;
}

function hasAuthSessionCookie(request: NextRequest) {
  return authCookieCandidates.some((candidate) => request.cookies.has(candidate.cookieName));
}

function withHeaders(response: NextResponse, requestId: string, correlationId: string) {
  applySecurityHeaders(response.headers);
  response.headers.set("x-request-id", requestId);
  response.headers.set("x-correlation-id", correlationId);
  return response;
}

function logMiddlewareDecision(input: {
  pathname: string;
  hasSessionTokenCookie: boolean;
  authState: boolean;
  isLoginPage: boolean;
  redirectTarget: string | null;
}) {
  if (!isAuthDebugEnabled()) return;

  console.log(
    JSON.stringify({
      level: "info",
      event: "auth.middleware",
      pathname: input.pathname,
      hasSessionTokenCookie: input.hasSessionTokenCookie,
      authState: input.authState,
      isLoginPage: input.isLoginPage,
      redirectTarget: input.redirectTarget,
      at: new Date().toISOString()
    })
  );
}
