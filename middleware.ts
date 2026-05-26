import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const protectedPrefixes = ["/dashboard", "/onboarding", "/organizations", "/workspaces", "/admin"];

export default async function middleware(request: NextRequest) {
  const { nextUrl } = request;
  const isProtected = protectedPrefixes.some((prefix) => nextUrl.pathname.startsWith(prefix));
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET
  });

  if (isProtected && !token) {
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"]
};
