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

const demoEmail = process.env.DEMO_ADMIN_EMAIL?.trim().toLowerCase() || "demo@example.com";
const demoOrgSlug = process.env.DEMO_ADMIN_ORG_SLUG?.trim() || "demo-org";
const demoWorkspaceSlug = process.env.DEMO_ADMIN_WORKSPACE_SLUG?.trim() || "demo-workspace";
const mode =
  process.env.DEMO_ADMIN_MODE === "check" || process.env.DEMO_ADMIN_MODE === "verify-password"
    ? process.env.DEMO_ADMIN_MODE
    : "seed";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  if (mode === "check" || mode === "verify-password") {
    await checkDemoAdmin();
    return;
  }

  const password = process.env.DEMO_ADMIN_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error("DEMO_ADMIN_PASSWORD must be set to seed the production demo admin");
  }

  await seedDemoAdmin(password);
}

async function checkDemoAdmin() {
  const user = await prisma.user.findUnique({
    where: { email: demoEmail },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      deletedAt: true,
      memberships: {
        where: { deletedAt: null, status: "ACTIVE" },
        select: {
          organization: { select: { slug: true, deletedAt: true } },
          workspace: { select: { slug: true, deletedAt: true } },
          role: { select: { key: true } }
        }
      }
    }
  });

  const organizationMembership = user?.memberships.some(
    (membership) =>
      membership.organization.slug === demoOrgSlug &&
      membership.organization.deletedAt === null &&
      membership.workspace === null &&
      membership.role.key === "owner"
  );
  const workspaceMembership = user?.memberships.some(
    (membership) =>
      membership.organization.slug === demoOrgSlug &&
      membership.organization.deletedAt === null &&
      membership.workspace?.slug === demoWorkspaceSlug &&
      membership.workspace.deletedAt === null &&
      membership.role.key === "workspace-admin"
  );
  const passwordMatches =
    mode === "verify-password" && user?.passwordHash && process.env.DEMO_ADMIN_PASSWORD
      ? await bcrypt.compare(process.env.DEMO_ADMIN_PASSWORD, user.passwordHash)
      : undefined;

  console.log(
    JSON.stringify({
      email: demoEmail,
      exists: Boolean(user),
      hasPasswordHash: Boolean(user?.passwordHash),
      active: Boolean(user && user.deletedAt === null),
      organizationOwner: Boolean(organizationMembership),
      workspaceAdmin: Boolean(workspaceMembership),
      ...(mode === "verify-password" ? { passwordMatches: Boolean(passwordMatches) } : {})
    })
  );
}

async function seedDemoAdmin(password: string) {
  await prisma.permission.createMany({
    data: permissions.map(([key, description]) => ({ key, description })),
    skipDuplicates: true
  });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email: demoEmail },
    update: {
      name: "Demo Owner",
      passwordHash,
      deletedAt: null
    },
    create: {
      email: demoEmail,
      name: "Demo Owner",
      passwordHash
    }
  });

  const organization = await prisma.organization.upsert({
    where: { slug: demoOrgSlug },
    update: { deletedAt: null },
    create: {
      name: "Demo Organization",
      slug: demoOrgSlug,
      createdById: user.id
    }
  });

  const existingOwnerRole = await prisma.role.findFirst({
    where: {
      organizationId: organization.id,
      workspaceId: null,
      key: "owner"
    }
  });
  const ownerRole = existingOwnerRole
    ? await prisma.role.update({
        where: { id: existingOwnerRole.id },
        data: {
          name: "Owner",
          scope: RoleScope.ORGANIZATION,
          isSystem: true,
          deletedAt: null
        }
      })
    : await prisma.role.create({
        data: {
          organizationId: organization.id,
          key: "owner",
          name: "Owner",
          scope: RoleScope.ORGANIZATION,
          isSystem: true
        }
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
        slug: demoWorkspaceSlug
      }
    },
    update: { deletedAt: null },
    create: {
      organizationId: organization.id,
      name: "Demo Workspace",
      slug: demoWorkspaceSlug,
      createdById: user.id
    }
  });

  const workspaceAdminRole = await prisma.role.upsert({
    where: {
      organizationId_workspaceId_key: {
        organizationId: organization.id,
        workspaceId: workspace.id,
        key: "workspace-admin"
      }
    },
    update: {
      name: "Workspace Admin",
      scope: RoleScope.WORKSPACE,
      isSystem: true,
      deletedAt: null
    },
    create: {
      organizationId: organization.id,
      workspaceId: workspace.id,
      key: "workspace-admin",
      name: "Workspace Admin",
      scope: RoleScope.WORKSPACE,
      isSystem: true
    }
  });

  await prisma.rolePermission.createMany({
    data: permissionRows
      .filter((permission) =>
        [
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
          "admin:read",
          "governance:manage"
        ].includes(permission.key)
      )
      .map((permission) => ({
        roleId: workspaceAdminRole.id,
        permissionId: permission.id
      })),
    skipDuplicates: true
  });

  await upsertMembership(user.id, organization.id, workspace.id, workspaceAdminRole.id);

  console.log(
    JSON.stringify({
      seeded: true,
      email: demoEmail,
      organizationSlug: organization.slug,
      workspaceSlug: workspace.slug,
      organizationOwner: true,
      workspaceAdmin: true
    })
  );
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
    console.error(error instanceof Error ? error.message : "Production demo admin task failed");
    await prisma.$disconnect();
    process.exit(1);
  });
