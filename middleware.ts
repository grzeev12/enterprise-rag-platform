import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getAuthSecret } from "@/lib/auth-runtime";
import { applySecurityHeaders } from "@/lib/security/headers";

const protectedPrefixes = ["/dashboard", "/onboarding", "/organizations", "/workspaces", "/admin", "/finops", "/llm-gateway"];

export default async function middleware(request: NextRequest) {
  const { nextUrl } = request;
  const isProtected = protectedPrefixes.some((prefix) => nextUrl.pathname.startsWith(prefix));
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const correlationId = request.headers.get("x-correlation-id") ?? requestId;
  const token = await getToken({
    req: request,
    secret: getAuthSecret()
  });

  if (isProtected && !token) {
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    const response = NextResponse.redirect(loginUrl);
    applySecurityHeaders(response.headers);
    response.headers.set("x-request-id", requestId);
    response.headers.set("x-correlation-id", correlationId);
    return response;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("x-correlation-id", correlationId);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  applySecurityHeaders(response.headers);
  response.headers.set("x-request-id", requestId);
  response.headers.set("x-correlation-id", correlationId);
  return response;
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"]
};
