import { z } from "zod";
import { created, handleApiError, ok } from "@/lib/api";
import { requireOrganizationAccess } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { createDefaultWorkspaceRoles } from "@/lib/roles";
import { slugify } from "@/lib/utils";

const createWorkspaceSchema = z.object({
  organizationId: z.string().cuid(),
  name: z.string().trim().min(2).max(120)
});

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");

    if (!organizationId) {
      return Response.json({ error: "organizationId is required" }, { status: 400 });
    }

    await requireOrganizationAccess(user.id, organizationId, "workspace:read");

    const workspaces = await prisma.workspace.findMany({
      where: {
        organizationId,
        deletedAt: null,
        OR: [
          {
            memberships: {
              some: {
                userId: user.id,
                deletedAt: null,
                status: "ACTIVE"
              }
            }
          },
          {
            organization: {
              memberships: {
                some: {
                  userId: user.id,
                  workspaceId: null,
                  deletedAt: null,
                  status: "ACTIVE"
                }
              }
            }
          }
        ]
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        organizationId: true,
        name: true,
        slug: true,
        createdAt: true
      }
    });

    return ok({ workspaces });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const input = createWorkspaceSchema.parse(await request.json());

    await requireOrganizationAccess(user.id, input.organizationId, "workspace:create");

    const baseSlug = slugify(input.name);
    const slug = `${baseSlug || "workspace"}-${crypto.randomUUID().slice(0, 8)}`;

    const workspace = await prisma.workspace.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        slug,
        createdById: user.id
      }
    });

    const { workspaceAdminRole } = await createDefaultWorkspaceRoles(
      input.organizationId,
      workspace.id
    );

    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: input.organizationId,
        workspaceId: workspace.id,
        roleId: workspaceAdminRole.id
      }
    });

    await writeAuditLog({
      organizationId: input.organizationId,
      workspaceId: workspace.id,
      actorUserId: user.id,
      action: "WORKSPACE_CREATED",
      targetType: "WORKSPACE",
      targetId: workspace.id,
      metadata: { name: workspace.name }
    });

    return created({ workspace });
  } catch (error) {
    return handleApiError(error);
  }
}
