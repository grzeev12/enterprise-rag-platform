import { CrawlStatus, KnowledgeSourceStatus } from "@prisma/client";
import { created, handleApiError } from "@/lib/api";
import { requireWorkspaceAccess } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { enqueueCrawlWebsite } from "@/lib/ingestion/queue";

type Params = {
  params: Promise<{ sourceId: string }>;
};

export async function POST(_request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser();
    const { sourceId } = await params;
    const source = await prisma.knowledgeSource.findFirst({
      where: { id: sourceId, deletedAt: null }
    });

    if (!source) {
      return Response.json({ error: "Knowledge source not found" }, { status: 404 });
    }

    await requireWorkspaceAccess(user.id, source.organizationId, source.workspaceId, "crawl:start");

    const crawl = await prisma.crawl.create({
      data: {
        organizationId: source.organizationId,
        workspaceId: source.workspaceId,
        knowledgeSourceId: source.id,
        createdById: user.id,
        status: CrawlStatus.PENDING,
        settings: {
          maxPages: source.maxPages,
          maxDepth: source.maxDepth,
          allowedDomains: source.allowedDomains,
          excludedPaths: source.excludedPaths,
          crawlDelayMs: source.crawlDelayMs
        }
      }
    });

    await prisma.knowledgeSource.update({
      where: { id: source.id },
      data: { status: KnowledgeSourceStatus.CRAWLING }
    });

    await enqueueCrawlWebsite(crawl.id);

    await writeAuditLog({
      organizationId: source.organizationId,
      workspaceId: source.workspaceId,
      actorUserId: user.id,
      action: "CRAWL_STARTED",
      targetType: "CRAWL",
      targetId: crawl.id,
      metadata: { sourceId: source.id, baseUrl: source.baseUrl }
    });

    return created({ crawl });
  } catch (error) {
    return handleApiError(error);
  }
}
