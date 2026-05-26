import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";

export type PermissionKey =
  | "organization:read"
  | "organization:update"
  | "workspace:create"
  | "workspace:read"
  | "workspace:update"
  | "workspace:delete"
  | "source:create"
  | "source:read"
  | "source:delete"
  | "crawl:start"
  | "embedding:create"
  | "chat:create"
  | "chat:read"
  | "member:invite"
  | "member:manage"
  | "audit:read"
  | "admin:read"
  | "governance:manage";

export async function getOrganizationMembership(userId: string, organizationId: string) {
  return prisma.membership.findFirst({
    where: {
      userId,
      organizationId,
      workspaceId: null,
      deletedAt: null,
      status: "ACTIVE",
      organization: { deletedAt: null }
    },
    include: {
      role: {
        include: {
          rolePermissions: {
            include: { permission: true }
          }
        }
      }
    }
  });
}

export function assertSameTenant(
  resource: { organizationId: string; workspaceId?: string | null },
  expected: { organizationId: string; workspaceId?: string | null }
) {
  if (resource.organizationId !== expected.organizationId) {
    throw new ApiError(404, "Resource not found");
  }
  if (expected.workspaceId && resource.workspaceId !== expected.workspaceId) {
    throw new ApiError(404, "Resource not found");
  }
}

export async function getWorkspaceMembership(
  userId: string,
  organizationId: string,
  workspaceId: string
) {
  return prisma.membership.findFirst({
    where: {
      userId,
      organizationId,
      workspaceId,
      deletedAt: null,
      status: "ACTIVE",
      organization: { deletedAt: null },
      workspace: { deletedAt: null }
    },
    include: {
      role: {
        include: {
          rolePermissions: {
            include: { permission: true }
          }
        }
      }
    }
  });
}

export function membershipHasPermission(
  membership:
    | Awaited<ReturnType<typeof getOrganizationMembership>>
    | Awaited<ReturnType<typeof getWorkspaceMembership>>,
  permission: PermissionKey
) {
  return Boolean(
    membership?.role.rolePermissions.some(
      (rolePermission) => rolePermission.permission.key === permission
    )
  );
}

export async function requireOrganizationAccess(
  userId: string,
  organizationId: string,
  permission?: PermissionKey
) {
  const membership = await getOrganizationMembership(userId, organizationId);

  if (!membership) {
    throw new ApiError(404, "Organization not found");
  }

  if (permission && !membershipHasPermission(membership, permission)) {
    throw new ApiError(403, "Insufficient organization permission");
  }

  return membership;
}

export async function requireWorkspaceAccess(
  userId: string,
  organizationId: string,
  workspaceId: string,
  permission?: PermissionKey
) {
  const workspaceMembership = await getWorkspaceMembership(userId, organizationId, workspaceId);
  const organizationMembership = await getOrganizationMembership(userId, organizationId);
  const membership = workspaceMembership ?? organizationMembership;

  if (!membership) {
    throw new ApiError(404, "Workspace not found");
  }

  if (permission && !membershipHasPermission(membership, permission)) {
    throw new ApiError(403, "Insufficient workspace permission");
  }

  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      organizationId,
      deletedAt: null
    }
  });

  if (!workspace) {
    throw new ApiError(404, "Workspace not found");
  }

  return { membership, workspace };
}
