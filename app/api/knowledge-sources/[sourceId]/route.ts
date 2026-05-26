import { KnowledgeSourceStatus } from "@prisma/client";
import { handleApiError, ok } from "@/lib/api";
import { requireWorkspaceAccess } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

type Params = {
  params: Promise<{ sourceId: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser();
    const { sourceId } = await params;
    const source = await prisma.knowledgeSource.findFirst({
      where: { id: sourceId, deletedAt: null },
      include: {
        crawls: {
          orderBy: { createdAt: "desc" },
          take: 5
        },
        _count: {
          select: { pages: true, documents: true }
        }
      }
    });

    if (!source) {
      return Response.json({ error: "Knowledge source not found" }, { status: 404 });
    }

    await requireWorkspaceAccess(user.id, source.organizationId, source.workspaceId, "source:read");

    return ok({ source });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser();
    const { sourceId } = await params;
    const source = await prisma.knowledgeSource.findFirst({
      where: { id: sourceId, deletedAt: null }
    });

    if (!source) {
      return Response.json({ error: "Knowledge source not found" }, { status: 404 });
    }

    await requireWorkspaceAccess(user.id, source.organizationId, source.workspaceId, "source:delete");

    const archived = await prisma.knowledgeSource.update({
      where: { id: source.id },
      data: {
        status: KnowledgeSourceStatus.ARCHIVED,
        deletedAt: new Date()
      }
    });

    await writeAuditLog({
      organizationId: source.organizationId,
      workspaceId: source.workspaceId,
      actorUserId: user.id,
      action: "KNOWLEDGE_SOURCE_DELETED",
      targetType: "KNOWLEDGE_SOURCE",
      targetId: source.id,
      metadata: { name: source.name, baseUrl: source.baseUrl }
    });

    return ok({ source: archived });
  } catch (error) {
    return handleApiError(error);
  }
}
