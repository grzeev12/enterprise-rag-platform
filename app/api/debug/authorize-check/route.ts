import { authorizeCredentials } from "@/lib/auth-credentials";
import { authDebugNotFound, isAuthDebugEnabled } from "@/lib/auth-debug";

export const runtime = "nodejs";

const debugEmail = "zeev@example.com";
const debugPassword = "zeev123";

export async function POST() {
  if (!isAuthDebugEnabled()) return authDebugNotFound();

  const result = await authorizeCredentials({
    email: debugEmail,
    password: debugPassword
  });

  if (!result.authorized) {
    return Response.json({
      authorized: false,
      reason: result.reason,
      userIdPresent: false,
      email: result.email ?? debugEmail
    });
  }

  return Response.json({
    authorized: true,
    reason: "authorized",
    userIdPresent: Boolean(result.user.id),
    email: result.user.email
  });
}
