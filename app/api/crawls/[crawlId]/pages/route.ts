import { CrawlPageStatus } from "@prisma/client";
import { handleApiError, ok } from "@/lib/api";
import { requireWorkspaceAccess } from "@/lib/authz";
import { requireCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

type Params = {
  params: Promise<{ crawlId: string }>;
};

export async function GET(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser();
    const { crawlId } = await params;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const crawl = await prisma.crawl.findUnique({ where: { id: crawlId } });

    if (!crawl) {
      return Response.json({ error: "Crawl not found" }, { status: 404 });
    }

    await requireWorkspaceAccess(user.id, crawl.organizationId, crawl.workspaceId, "source:read");

    const pages = await prisma.crawlPage.findMany({
      where: {
        crawlId,
        ...(status && status in CrawlPageStatus ? { status: status as CrawlPageStatus } : {})
      },
      orderBy: [{ status: "asc" }, { depth: "asc" }, { createdAt: "asc" }],
      take: 250,
      select: {
        id: true,
        url: true,
        normalizedUrl: true,
        depth: true,
        status: true,
        httpStatus: true,
        title: true,
        errorMessage: true,
        fetchedAt: true,
        processedAt: true,
        document: {
          select: {
            id: true,
            status: true,
            _count: { select: { chunks: true } }
          }
        }
      }
    });

    return ok({ pages });
  } catch (error) {
    return handleApiError(error);
  }
}
