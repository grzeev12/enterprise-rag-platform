import { EmbeddingJobStatus } from "@prisma/client";
import { created, handleApiError } from "@/lib/api";
import { requireAdminForWorkspace } from "@/lib/admin";
import { defaultEmbeddingModel } from "@/lib/ai/openai-provider";
import { writeAuditLog } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { enqueueGenerateEmbeddingsForSource } from "@/lib/ingestion/queue";

type Params = {
  params: Promise<{ jobId: string }>;
};

export async function POST(_request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser();
    const { jobId } = await params;

    const failedJob = await prisma.embeddingJob.findFirst({
      where: {
        id: jobId,
        status: { in: [EmbeddingJobStatus.FAILED, EmbeddingJobStatus.PARTIALLY_COMPLETED] }
      },
      include: {
        knowledgeSource: true,
        document: true
      }
    });

    if (!failedJob) {
      return Response.json({ error: "Retryable embedding job not found" }, { status: 404 });
    }

    await requireAdminForWorkspace(user.id, failedJob.organizationId, failedJob.workspaceId);

    const retry = await prisma.embeddingJob.create({
      data: {
        organizationId: failedJob.organizationId,
        workspaceId: failedJob.workspaceId,
        knowledgeSourceId: failedJob.knowledgeSourceId,
        documentId: failedJob.documentId,
        createdById: user.id,
        status: EmbeddingJobStatus.PENDING,
        model: failedJob.model || defaultEmbeddingModel()
      }
    });

    await enqueueGenerateEmbeddingsForSource(retry.id);

    await writeAuditLog({
      organizationId: failedJob.organizationId,
      workspaceId: failedJob.workspaceId,
      actorUserId: user.id,
      action: "EMBEDDING_JOB_STARTED",
      targetType: "EMBEDDING_JOB",
      targetId: retry.id,
      metadata: {
        adminRetry: true,
        retryOf: failedJob.id,
        sourceId: failedJob.knowledgeSourceId,
        documentId: failedJob.documentId
      }
    });

    return created({ embeddingJob: retry });
  } catch (error) {
    return handleApiError(error);
  }
}
