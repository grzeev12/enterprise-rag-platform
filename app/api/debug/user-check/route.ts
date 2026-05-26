import { type NextRequest } from "next/server";
import { authDebugNotFound, isAuthDebugEnabled } from "@/lib/auth-debug";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isAuthDebugEnabled()) return authDebugNotFound();

  const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase();
  if (!email) {
    return Response.json({ error: "email is required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      deletedAt: true,
      passwordHash: true,
      memberships: {
        where: { deletedAt: null, status: "ACTIVE" },
        select: {
          workspaceId: true,
          role: { select: { key: true, name: true, scope: true } }
        }
      }
    }
  });

  return Response.json({
    exists: Boolean(user),
    active: Boolean(user && user.deletedAt === null),
    hasPasswordHash: Boolean(user?.passwordHash),
    organizationMembershipCount: user?.memberships.filter((membership) => membership.workspaceId === null).length ?? 0,
    workspaceMembershipCount: user?.memberships.filter((membership) => membership.workspaceId !== null).length ?? 0,
    roles: user?.memberships.map((membership) => ({
      key: membership.role.key,
      name: membership.role.name,
      scope: membership.role.scope
    })) ?? []
  });
}
