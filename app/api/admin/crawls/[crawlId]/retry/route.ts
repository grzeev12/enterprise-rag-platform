import { CrawlStatus, KnowledgeSourceStatus } from "@prisma/client";
import { created, handleApiError } from "@/lib/api";
import { requireAdminForWorkspace } from "@/lib/admin";
import { writeAuditLog } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { enqueueCrawlWebsite } from "@/lib/ingestion/queue";

type Params = {
  params: Promise<{ crawlId: string }>;
};

export async function POST(_request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser();
    const { crawlId } = await params;

    const crawl = await prisma.crawl.findFirst({
      where: {
        id: crawlId,
        status: { in: [CrawlStatus.FAILED, CrawlStatus.PARTIALLY_COMPLETED, CrawlStatus.CANCELLED] }
      },
      include: { knowledgeSource: true }
    });

    if (!crawl || crawl.knowledgeSource.deletedAt) {
      return Response.json({ error: "Retryable crawl not found" }, { status: 404 });
    }

    await requireAdminForWorkspace(user.id, crawl.organizationId, crawl.workspaceId);

    const retry = await prisma.crawl.create({
      data: {
        organizationId: crawl.organizationId,
        workspaceId: crawl.workspaceId,
        knowledgeSourceId: crawl.knowledgeSourceId,
        createdById: user.id,
        status: CrawlStatus.PENDING,
        settings: crawl.settings ?? {
          maxPages: crawl.knowledgeSource.maxPages,
          maxDepth: crawl.knowledgeSource.maxDepth,
          allowedDomains: crawl.knowledgeSource.allowedDomains,
          excludedPaths: crawl.knowledgeSource.excludedPaths,
          crawlDelayMs: crawl.knowledgeSource.crawlDelayMs
        }
      }
    });

    await prisma.knowledgeSource.update({
      where: { id: crawl.knowledgeSourceId },
      data: { status: KnowledgeSourceStatus.CRAWLING }
    });

    await enqueueCrawlWebsite(retry.id);

    await writeAuditLog({
      organizationId: crawl.organizationId,
      workspaceId: crawl.workspaceId,
      actorUserId: user.id,
      action: "CRAWL_STARTED",
      targetType: "CRAWL",
      targetId: retry.id,
      metadata: { adminRetry: true, retryOf: crawl.id, sourceId: crawl.knowledgeSourceId }
    });

    return created({ crawl: retry });
  } catch (error) {
    return handleApiError(error);
  }
}
