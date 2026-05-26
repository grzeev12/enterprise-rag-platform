import { z } from "zod";
import { created, handleApiError, ok } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { createDefaultOrganizationRoles } from "@/lib/roles";
import { slugify } from "@/lib/utils";

const organizationSchema = z.object({
  name: z.string().trim().min(2).max(120)
});

export async function GET() {
  try {
    const user = await requireCurrentUser();

    const organizations = await prisma.organization.findMany({
      where: {
        deletedAt: null,
        memberships: {
          some: {
            userId: user.id,
            workspaceId: null,
            deletedAt: null,
            status: "ACTIVE"
          }
        }
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        _count: {
          select: { workspaces: true, memberships: true }
        }
      }
    });

    return ok({ organizations });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const input = organizationSchema.parse(await request.json());
    const baseSlug = slugify(input.name);
    const slug = `${baseSlug || "organization"}-${crypto.randomUUID().slice(0, 8)}`;

    const organization = await prisma.$transaction(async (tx) => {
      const createdOrg = await tx.organization.create({
        data: {
          name: input.name,
          slug,
          createdById: user.id
        }
      });

      await tx.permission.createMany({
        data: [
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
          { key: "admin:read", description: "View admin dashboard" }
        ],
        skipDuplicates: true
      });

      return createdOrg;
    });

    const { ownerRole } = await createDefaultOrganizationRoles(organization.id);

    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        roleId: ownerRole.id
      }
    });

    await writeAuditLog({
      organizationId: organization.id,
      actorUserId: user.id,
      action: "ORGANIZATION_CREATED",
      targetType: "ORGANIZATION",
      targetId: organization.id,
      metadata: { name: organization.name }
    });

    return created({ organization });
  } catch (error) {
    return handleApiError(error);
  }
}
