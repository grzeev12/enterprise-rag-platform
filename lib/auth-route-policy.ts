const protectedPrefixes = ["/dashboard", "/onboarding", "/organizations", "/workspaces", "/admin", "/finops", "/llm-gateway"];

export type AuthRouteDecision =
  | {
      action: "allow";
      redirectTarget: null;
    }
  | {
      action: "redirect";
      redirectTarget: string;
    };

export function isProtectedAppPath(pathname: string) {
  return protectedPrefixes.some((prefix) => pathname.startsWith(prefix));
}

export function decideAuthRoute(pathname: string, authenticated: boolean): AuthRouteDecision {
  if (pathname.startsWith("/api/auth") || pathname.startsWith("/api/debug")) {
    return { action: "allow", redirectTarget: null };
  }

  if (pathname === "/") {
    return { action: "redirect", redirectTarget: authenticated ? "/dashboard" : "/login" };
  }

  if (pathname === "/login") {
    return authenticated ? { action: "redirect", redirectTarget: "/dashboard" } : { action: "allow", redirectTarget: null };
  }

  if (isProtectedAppPath(pathname) && !authenticated) {
    return { action: "redirect", redirectTarget: `/login?callbackUrl=${encodeURIComponent(pathname)}` };
  }

  return { action: "allow", redirectTarget: null };
}

