import { ApiError } from "@/lib/api";
import { membershipHasPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";

export type AdminScope = {
  organizationId: string;
  organizationName: string;
  workspaceId: string | null;
  workspaceName: string | null;
};

export async function getAdminScopes(userId: string): Promise<AdminScope[]> {
  const memberships = await prisma.membership.findMany({
    where: {
      userId,
      deletedAt: null,
      status: "ACTIVE",
      organization: { deletedAt: null },
      OR: [{ workspaceId: null }, { workspace: { deletedAt: null } }]
    },
    include: {
      organization: true,
      workspace: true,
      role: {
        include: {
          rolePermissions: {
            include: { permission: true }
          }
        }
      }
    },
    orderBy: [{ organization: { name: "asc" } }, { workspace: { name: "asc" } }]
  });

  const scopes = memberships
    .filter((membership) => membershipHasPermission(membership, "admin:read"))
    .map((membership) => ({
      organizationId: membership.organizationId,
      organizationName: membership.organization.name,
      workspaceId: membership.workspaceId,
      workspaceName: membership.workspace?.name ?? null
    }));

  const byKey = new Map<string, AdminScope>();
  for (const scope of scopes) {
    byKey.set(`${scope.organizationId}:${scope.workspaceId ?? "org"}`, scope);
  }

  return [...byKey.values()];
}

export function resolveAdminScope(
  scopes: AdminScope[],
  requestedOrganizationId?: string | null,
  requestedWorkspaceId?: string | null
) {
  if (!scopes.length) return null;

  if (requestedOrganizationId) {
    const organizationScope = scopes.find(
      (scope) => scope.organizationId === requestedOrganizationId && scope.workspaceId === null
    );
    if (organizationScope && !requestedWorkspaceId) return organizationScope;
    if (organizationScope && requestedWorkspaceId) {
      return {
        ...organizationScope,
        workspaceId: requestedWorkspaceId,
        workspaceName: null
      };
    }

    const workspaceScope = scopes.find(
      (scope) =>
        scope.organizationId === requestedOrganizationId &&
        scope.workspaceId === requestedWorkspaceId
    );
    if (workspaceScope) return workspaceScope;
  }

  return scopes[0];
}

export async function requireAdminForWorkspace(
  userId: string,
  organizationId: string,
  workspaceId: string
) {
  const scopes = await getAdminScopes(userId);
  const allowed = scopes.some(
    (scope) =>
      scope.organizationId === organizationId &&
      (scope.workspaceId === null || scope.workspaceId === workspaceId)
  );

  if (!allowed) {
    throw new ApiError(403, "Admin access required");
  }
}

export function adminTenantWhere(scope: AdminScope) {
  return scope.workspaceId
    ? { organizationId: scope.organizationId, workspaceId: scope.workspaceId }
    : { organizationId: scope.organizationId };
}
