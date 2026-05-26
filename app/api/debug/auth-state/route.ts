import { auth } from "@/auth";
import { authDebugNotFound, isAuthDebugEnabled } from "@/lib/auth-debug";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  if (!isAuthDebugEnabled()) return authDebugNotFound();

  try {
    const session = await auth();
    const membershipCount = session?.user?.id
      ? await prisma.membership.count({
          where: {
            userId: session.user.id,
            deletedAt: null,
            status: "ACTIVE"
          }
        })
      : 0;

    return Response.json({
      routeReachable: true,
      authenticated: Boolean(session?.user),
      userIdPresent: Boolean(session?.user?.id),
      email: session?.user?.email ?? null,
      membershipCount
    });
  } catch {
    return Response.json(
      {
        routeReachable: true,
        authenticated: false,
        userIdPresent: false,
        email: null,
        membershipCount: 0,
        authError: true
      },
      { status: 200 }
    );
  }
}
