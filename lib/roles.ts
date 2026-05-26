import { RoleScope } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { PermissionKey } from "@/lib/authz";

export const basePermissions: { key: PermissionKey; description: string }[] = [
  { key: "organization:read", description: "View organization details" },
  { key: "organization:update", description: "Update organization settings" },
  { key: "workspace:create", description: "Create workspaces" },
  { key: "workspace:read", description: "View workspace details" },
  { key: "workspace:update", description: "Update workspace settings" },
  { key: "workspace:delete", description: "Delete workspaces" },
  { key: "source:create", description: "Create knowledge sources" },
  { key: "source:read", description: "View knowledge sources" },
  { key: "source:delete", description: "Archive knowledge sources" },
  { key: "crawl:start", description: "Start website crawls" },
  { key: "embedding:create", description: "Generate source embeddings" },
  { key: "chat:create", description: "Create workspace chats" },
  { key: "chat:read", description: "View workspace chats" },
  { key: "member:invite", description: "Invite members" },
  { key: "member:manage", description: "Manage members and roles" },
  { key: "audit:read", description: "View audit logs" },
  { key: "admin:read", description: "View admin dashboard" },
  { key: "governance:manage", description: "Manage enterprise governance settings" }
];

export async function ensureBasePermissions() {
  await prisma.permission.createMany({
    data: basePermissions,
    skipDuplicates: true
  });
}

export async function createDefaultOrganizationRoles(organizationId: string) {
  await ensureBasePermissions();

  const ownerRole = await prisma.role.create({
    data: {
      organizationId,
      key: "owner",
      name: "Owner",
      scope: RoleScope.ORGANIZATION,
      isSystem: true
    }
  });

  const adminRole = await prisma.role.create({
    data: {
      organizationId,
      key: "admin",
      name: "Admin",
      scope: RoleScope.ORGANIZATION,
      isSystem: true
    }
  });

  const memberRole = await prisma.role.create({
    data: {
      organizationId,
      key: "member",
      name: "Member",
      scope: RoleScope.ORGANIZATION,
      isSystem: true
    }
  });

  const viewerRole = await prisma.role.create({
    data: {
      organizationId,
      key: "viewer",
      name: "Viewer",
      scope: RoleScope.ORGANIZATION,
      isSystem: true
    }
  });

  const permissions = await prisma.permission.findMany();
  const byKey = new Map(permissions.map((permission) => [permission.key, permission.id]));

  const grants: Record<string, PermissionKey[]> = {
    owner: basePermissions.map((permission) => permission.key),
    admin: [
      "organization:read",
      "workspace:create",
      "workspace:read",
      "workspace:update",
      "source:create",
      "source:read",
      "source:delete",
      "crawl:start",
      "embedding:create",
      "chat:create",
      "chat:read",
      "member:invite",
      "member:manage",
      "audit:read",
      "admin:read",
      "governance:manage"
    ],
    member: ["organization:read", "workspace:create", "workspace:read", "source:create", "source:read", "crawl:start", "embedding:create", "chat:create", "chat:read"],
    viewer: ["organization:read", "workspace:read", "source:read", "chat:read"]
  };

  const roleByKey = {
    owner: ownerRole,
    admin: adminRole,
    member: memberRole,
    viewer: viewerRole
  };

  await prisma.rolePermission.createMany({
    data: Object.entries(grants).flatMap(([roleKey, permissionKeys]) =>
      permissionKeys.flatMap((permissionKey) => {
        const permissionId = byKey.get(permissionKey);
        if (!permissionId) return [];
        return {
          roleId: roleByKey[roleKey as keyof typeof roleByKey].id,
          permissionId
        };
      })
    ),
    skipDuplicates: true
  });

  return { ownerRole, adminRole, memberRole, viewerRole };
}

export async function createDefaultWorkspaceRoles(organizationId: string, workspaceId: string) {
  await ensureBasePermissions();

  const workspaceAdminRole = await prisma.role.create({
    data: {
      organizationId,
      workspaceId,
      key: "workspace-admin",
      name: "Workspace Admin",
      scope: RoleScope.WORKSPACE,
      isSystem: true
    }
  });

  const workspaceMemberRole = await prisma.role.create({
    data: {
      organizationId,
      workspaceId,
      key: "workspace-member",
      name: "Workspace Member",
      scope: RoleScope.WORKSPACE,
      isSystem: true
    }
  });

  const permissions = await prisma.permission.findMany();
  const byKey = new Map(permissions.map((permission) => [permission.key, permission.id]));

  const grants: Record<string, PermissionKey[]> = {
    "workspace-admin": [
      "workspace:read",
      "workspace:update",
      "source:create",
      "source:read",
      "source:delete",
      "crawl:start",
      "embedding:create",
      "chat:create",
      "chat:read",
      "member:invite",
      "member:manage",
      "admin:read",
      "governance:manage"
    ],
    "workspace-member": ["workspace:read", "source:create", "source:read", "crawl:start", "embedding:create", "chat:create", "chat:read"]
  };

  const roleByKey = {
    "workspace-admin": workspaceAdminRole,
    "workspace-member": workspaceMemberRole
  };

  await prisma.rolePermission.createMany({
    data: Object.entries(grants).flatMap(([roleKey, permissionKeys]) =>
      permissionKeys.flatMap((permissionKey) => {
        const permissionId = byKey.get(permissionKey);
        if (!permissionId) return [];
        return {
          roleId: roleByKey[roleKey as keyof typeof roleByKey].id,
          permissionId
        };
      })
    ),
    skipDuplicates: true
  });

  return { workspaceAdminRole, workspaceMemberRole };
}
