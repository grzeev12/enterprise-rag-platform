import { KnowledgeSourceStatus, KnowledgeSourceType } from "@prisma/client";
import { z } from "zod";
import { created, handleApiError, ok } from "@/lib/api";
import { requireWorkspaceAccess } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/current-user";
import { validatePublicHttpUrl } from "@/lib/ingestion/safe-url";
import { prisma } from "@/lib/db";

const createWebsiteSourceSchema = z.object({
  organizationId: z.string().cuid(),
  workspaceId: z.string().cuid(),
  name: z.string().trim().min(2).max(160),
  baseUrl: z.string().url(),
  allowedDomains: z.array(z.string().trim().min(1)).max(10).optional(),
  excludedPaths: z.array(z.string().trim()).max(50).optional(),
  maxPages: z.number().int().min(1).max(500).default(50),
  maxDepth: z.number().int().min(0).max(5).default(2),
  crawlDelayMs: z.number().int().min(500).max(60_000).default(1000)
});

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");
    const workspaceId = searchParams.get("workspaceId");

    if (!organizationId || !workspaceId) {
      return Response.json({ error: "organizationId and workspaceId are required" }, { status: 400 });
    }

    await requireWorkspaceAccess(user.id, organizationId, workspaceId, "source:read");

    const sources = await prisma.knowledgeSource.findMany({
      where: {
        organizationId,
        workspaceId,
        deletedAt: null
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        baseUrl: true,
        maxPages: true,
        maxDepth: true,
        lastCrawledAt: true,
        createdAt: true,
        _count: {
          select: { crawls: true, pages: true, documents: true }
        }
      }
    });

    return ok({ sources });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const input = createWebsiteSourceSchema.parse(await request.json());

    await requireWorkspaceAccess(user.id, input.organizationId, input.workspaceId, "source:create");

    const safeUrl = await validatePublicHttpUrl(input.baseUrl);
    const allowedDomains = [...new Set([safeUrl.hostname, ...(input.allowedDomains ?? [])])];

    const source = await prisma.knowledgeSource.create({
      data: {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        createdById: user.id,
        type: KnowledgeSourceType.WEBSITE,
        status: KnowledgeSourceStatus.READY,
        name: input.name,
        baseUrl: safeUrl.normalizedUrl,
        allowedDomains,
        excludedPaths: input.excludedPaths?.filter(Boolean) ?? [],
        maxPages: input.maxPages,
        maxDepth: input.maxDepth,
        crawlDelayMs: input.crawlDelayMs
      }
    });

    await writeAuditLog({
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      actorUserId: user.id,
      action: "KNOWLEDGE_SOURCE_CREATED",
      targetType: "KNOWLEDGE_SOURCE",
      targetId: source.id,
      metadata: { baseUrl: source.baseUrl, name: source.name }
    });

    return created({ source });
  } catch (error) {
    return handleApiError(error);
  }
}
