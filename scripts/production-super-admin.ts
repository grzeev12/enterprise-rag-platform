import { PrismaClient, RoleScope } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const permissions = [
  ["organization:read", "View organization details"],
  ["organization:update", "Update organization settings"],
  ["workspace:create", "Create workspaces"],
  ["workspace:read", "View workspace details"],
  ["workspace:update", "Update workspace settings"],
  ["workspace:delete", "Delete workspaces"],
  ["source:create", "Create knowledge sources"],
  ["source:read", "View knowledge sources"],
  ["source:delete", "Archive knowledge sources"],
  ["crawl:start", "Start website crawls"],
  ["embedding:create", "Generate source embeddings"],
  ["chat:create", "Create workspace chats"],
  ["chat:read", "View workspace chats"],
  ["member:invite", "Invite members"],
  ["member:manage", "Manage members and roles"],
  ["audit:read", "View audit logs"],
  ["admin:read", "View admin dashboard"],
  ["governance:manage", "Manage enterprise governance settings"]
] as const;

const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() || "zeev@example.com";
const name = process.env.SUPER_ADMIN_NAME?.trim() || "zeev";
const organizationName = process.env.SUPER_ADMIN_ORG_NAME?.trim() || "Default Organization";
const organizationSlug = process.env.SUPER_ADMIN_ORG_SLUG?.trim() || "default-organization";
const workspaceName = process.env.SUPER_ADMIN_WORKSPACE_NAME?.trim() || "Default Workspace";
const workspaceSlug = process.env.SUPER_ADMIN_WORKSPACE_SLUG?.trim() || "default-workspace";
const mode =
  process.env.SUPER_ADMIN_MODE === "check" || process.env.SUPER_ADMIN_MODE === "verify-password"
    ? process.env.SUPER_ADMIN_MODE
    : "seed";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  if (mode === "check" || mode === "verify-password") {
    await verifySuperAdmin();
    return;
  }

  const password = process.env.PRODUCTION_SUPER_ADMIN_PASSWORD;
  if (!password) {
    throw new Error("PRODUCTION_SUPER_ADMIN_PASSWORD is required to seed the production super admin");
  }

  await seedSuperAdmin(password);
}

async function verifySuperAdmin() {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      passwordHash: true,
      deletedAt: true,
      memberships: {
        where: { deletedAt: null, status: "ACTIVE" },
        select: {
          organization: { select: { slug: true, deletedAt: true } },
          workspace: { select: { slug: true, deletedAt: true } },
          role: { select: { key: true, name: true } }
        }
      }
    }
  });

  const organizationOwner = user?.memberships.some(
    (membership) =>
      membership.organization.slug === organizationSlug &&
      membership.organization.deletedAt === null &&
      membership.workspace === null &&
      membership.role.key === "owner"
  );
  const workspaceAdmin = user?.memberships.some(
    (membership) =>
      membership.organization.slug === organizationSlug &&
      membership.organization.deletedAt === null &&
      membership.workspace?.slug === workspaceSlug &&
      membership.workspace.deletedAt === null &&
      membership.role.key === "admin"
  );
  const passwordMatches =
    mode === "verify-password" && user?.passwordHash && process.env.PRODUCTION_SUPER_ADMIN_PASSWORD
      ? await bcrypt.compare(process.env.PRODUCTION_SUPER_ADMIN_PASSWORD, user.passwordHash)
      : undefined;

  console.log(
    JSON.stringify({
      email,
      exists: Boolean(user),
      hasPasswordHash: Boolean(user?.passwordHash),
      active: Boolean(user && user.deletedAt === null),
      organizationSlug,
      workspaceSlug,
      ownerRoleExists: Boolean(organizationOwner),
      adminWorkspaceMembershipExists: Boolean(workspaceAdmin),
      ...(mode === "verify-password" ? { passwordMatches: Boolean(passwordMatches) } : {}),
      loginShouldSucceed: Boolean(user && user.deletedAt === null && user.passwordHash && organizationOwner && workspaceAdmin && (mode === "verify-password" ? passwordMatches : true))
    })
  );
}

async function seedSuperAdmin(password: string) {
  await prisma.permission.createMany({
    data: permissions.map(([key, description]) => ({ key, description })),
    skipDuplicates: true
  });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      passwordHash,
      deletedAt: null
    },
    create: {
      email,
      name,
      passwordHash
    }
  });

  const organization = await prisma.organization.upsert({
    where: { slug: organizationSlug },
    update: {
      name: organizationName,
      deletedAt: null
    },
    create: {
      name: organizationName,
      slug: organizationSlug,
      createdById: user.id
    }
  });

  const ownerRole = await upsertRole({
    organizationId: organization.id,
    workspaceId: null,
    key: "owner",
    name: "OWNER",
    scope: RoleScope.ORGANIZATION
  });

  const permissionRows = await prisma.permission.findMany();
  await prisma.rolePermission.createMany({
    data: permissionRows.map((permission) => ({
      roleId: ownerRole.id,
      permissionId: permission.id
    })),
    skipDuplicates: true
  });

  await upsertMembership(user.id, organization.id, null, ownerRole.id);

  const workspace = await prisma.workspace.upsert({
    where: {
      organizationId_slug: {
        organizationId: organization.id,
        slug: workspaceSlug
      }
    },
    update: {
      name: workspaceName,
      deletedAt: null
    },
    create: {
      organizationId: organization.id,
      name: workspaceName,
      slug: workspaceSlug,
      createdById: user.id
    }
  });

  const adminRole = await upsertRole({
    organizationId: organization.id,
    workspaceId: workspace.id,
    key: "admin",
    name: "ADMIN",
    scope: RoleScope.WORKSPACE
  });

  await prisma.rolePermission.createMany({
    data: permissionRows.map((permission) => ({
      roleId: adminRole.id,
      permissionId: permission.id
    })),
    skipDuplicates: true
  });

  await upsertMembership(user.id, organization.id, workspace.id, adminRole.id);

  console.log(
    JSON.stringify({
      seeded: true,
      email,
      organizationSlug: organization.slug,
      workspaceSlug: workspace.slug,
      ownerRoleExists: true,
      adminWorkspaceMembershipExists: true,
      loginShouldSucceed: true
    })
  );
}

async function upsertRole(input: {
  organizationId: string;
  workspaceId: string | null;
  key: string;
  name: string;
  scope: RoleScope;
}) {
  const existing = await prisma.role.findFirst({
    where: {
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      key: input.key
    }
  });

  if (existing) {
    return prisma.role.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        scope: input.scope,
        isSystem: true,
        deletedAt: null
      }
    });
  }

  return prisma.role.create({
    data: {
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      key: input.key,
      name: input.name,
      scope: input.scope,
      isSystem: true
    }
  });
}

async function upsertMembership(userId: string, organizationId: string, workspaceId: string | null, roleId: string) {
  const existing = await prisma.membership.findFirst({
    where: { userId, organizationId, workspaceId }
  });

  if (existing) {
    await prisma.membership.update({
      where: { id: existing.id },
      data: {
        roleId,
        status: "ACTIVE",
        deletedAt: null
      }
    });
    return;
  }

  await prisma.membership.create({
    data: {
      userId,
      organizationId,
      workspaceId,
      roleId,
      status: "ACTIVE"
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : "Production super admin task failed");
    await prisma.$disconnect();
    process.exit(1);
  });
