import { PrismaClient, RoleScope } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readEnv, readIntEnv } from "../lib/env";

let prisma: PrismaClient;

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
  ["admin:read", "View admin dashboard"]
] as const;

async function main() {
  prisma = new PrismaClient();

  await prisma.permission.createMany({
    data: permissions.map(([key, description]) => ({ key, description })),
    skipDuplicates: true
  });

  const openAiProvider =
    (await prisma.llmProvider.findFirst({
      where: { organizationId: null, key: "openai" }
    })) ??
    (await prisma.llmProvider.create({
      data: {
        key: "openai",
        name: "OpenAI",
        isEnabled: true
      }
    }));

  const chatConfig = await prisma.modelConfig.findFirst({
    where: { organizationId: null, workspaceId: null, key: "openai-chat-default" }
  });
  if (!chatConfig) {
    await prisma.modelConfig.create({
      data: {
        providerId: openAiProvider.id,
        key: "openai-chat-default",
        displayName: "OpenAI Chat Default",
        kind: "chat",
        modelName: readEnv("OPENAI_CHAT_MODEL") ?? "gpt-4o-mini",
        maxOutputTokens: 800,
        isDefault: true
      }
    });
  }

  const embeddingConfig = await prisma.modelConfig.findFirst({
    where: { organizationId: null, workspaceId: null, key: "openai-embedding-default" }
  });
  if (!embeddingConfig) {
    await prisma.modelConfig.create({
      data: {
        providerId: openAiProvider.id,
        key: "openai-embedding-default",
        displayName: "OpenAI Embedding Default",
        kind: "embedding",
        modelName: readEnv("OPENAI_EMBEDDING_MODEL") ?? "text-embedding-3-small",
        dimensions: readIntEnv("OPENAI_EMBEDDING_DIMENSIONS", 1536),
        isDefault: true
      }
    });
  }

  const demoUser = await prisma.user.upsert({
    where: { email: "demo@example.com" },
    update: {},
    create: {
      email: "demo@example.com",
      name: "Demo Owner",
      passwordHash: await bcrypt.hash("Password123!", 12)
    }
  });

  const organization = await prisma.organization.upsert({
    where: { slug: "demo-org" },
    update: {},
    create: {
      name: "Demo Organization",
      slug: "demo-org",
      createdById: demoUser.id
    }
  });

  const ownerRole =
    (await prisma.role.findFirst({
      where: {
        organizationId: organization.id,
        workspaceId: null,
        key: "owner"
      }
    })) ??
    (await prisma.role.create({
      data: {
        organizationId: organization.id,
        key: "owner",
        name: "Owner",
        scope: RoleScope.ORGANIZATION,
        isSystem: true
      }
    }));

  const permissionRows = await prisma.permission.findMany();
  await prisma.rolePermission.createMany({
    data: permissionRows.map((permission) => ({
      roleId: ownerRole.id,
      permissionId: permission.id
    })),
    skipDuplicates: true
  });

  const existingOrganizationMembership = await prisma.membership.findFirst({
    where: {
      userId: demoUser.id,
      organizationId: organization.id,
      workspaceId: null
    }
  });

  if (!existingOrganizationMembership) {
    await prisma.membership.create({
      data: {
        userId: demoUser.id,
        organizationId: organization.id,
        roleId: ownerRole.id
      }
    });
  }

  const workspace = await prisma.workspace.upsert({
    where: {
      organizationId_slug: {
        organizationId: organization.id,
        slug: "demo-workspace"
      }
    },
    update: {},
    create: {
      organizationId: organization.id,
      name: "Demo Workspace",
      slug: "demo-workspace",
      createdById: demoUser.id
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
    update: {},
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
          "admin:read"
        ].includes(permission.key)
      )
      .map((permission) => ({
        roleId: workspaceAdminRole.id,
        permissionId: permission.id
      })),
    skipDuplicates: true
  });

  await prisma.membership.upsert({
    where: {
      userId_organizationId_workspaceId: {
        userId: demoUser.id,
        organizationId: organization.id,
        workspaceId: workspace.id
      }
    },
    update: {},
    create: {
      userId: demoUser.id,
      organizationId: organization.id,
      workspaceId: workspace.id,
      roleId: workspaceAdminRole.id
    }
  });
}

main()
  .then(async () => {
    await prisma?.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma?.$disconnect();
    process.exit(1);
  });
