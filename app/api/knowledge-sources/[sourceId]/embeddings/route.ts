import { EmbeddingJobStatus } from "@prisma/client";
import { created, handleApiError } from "@/lib/api";
import { requireWorkspaceAccess } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { enqueueGenerateEmbeddingsForSource } from "@/lib/ingestion/queue";
import { defaultEmbeddingModel } from "@/lib/ai/openai-provider";

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

    await requireWorkspaceAccess(user.id, source.organizationId, source.workspaceId, "embedding:create");

    const job = await prisma.embeddingJob.create({
      data: {
        organizationId: source.organizationId,
        workspaceId: source.workspaceId,
        knowledgeSourceId: source.id,
        createdById: user.id,
        status: EmbeddingJobStatus.PENDING,
        model: defaultEmbeddingModel()
      }
    });

    await enqueueGenerateEmbeddingsForSource(job.id);

    await writeAuditLog({
      organizationId: source.organizationId,
      workspaceId: source.workspaceId,
      actorUserId: user.id,
      action: "EMBEDDING_JOB_STARTED",
      targetType: "EMBEDDING_JOB",
      targetId: job.id,
      metadata: { sourceId: source.id, model: job.model }
    });

    return created({ embeddingJob: job });
  } catch (error) {
    return handleApiError(error);
  }
}
