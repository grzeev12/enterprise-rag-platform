import { auth } from "@/auth";
import { authDebugNotFound, isAuthDebugEnabled } from "@/lib/auth-debug";

export const runtime = "nodejs";

export async function GET() {
  if (!isAuthDebugEnabled()) return authDebugNotFound();

  const session = await auth().catch(() => null);
  const authenticated = Boolean(session?.user);

  return Response.json({
    authenticated,
    canAccessDashboard: authenticated,
    dashboardRoute: "/dashboard",
    redirectTarget: authenticated ? "/dashboard" : "/login?callbackUrl=/dashboard"
  });
}
