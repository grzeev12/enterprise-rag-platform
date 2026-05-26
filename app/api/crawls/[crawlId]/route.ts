import { handleApiError, ok } from "@/lib/api";
import { requireWorkspaceAccess } from "@/lib/authz";
import { requireCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

type Params = {
  params: Promise<{ crawlId: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser();
    const { crawlId } = await params;
    const crawl = await prisma.crawl.findUnique({
      where: { id: crawlId },
      include: {
        knowledgeSource: {
          select: { id: true, name: true, baseUrl: true }
        }
      }
    });

    if (!crawl) {
      return Response.json({ error: "Crawl not found" }, { status: 404 });
    }

    await requireWorkspaceAccess(user.id, crawl.organizationId, crawl.workspaceId, "source:read");

    return ok({ crawl });
  } catch (error) {
    return handleApiError(error);
  }
}
