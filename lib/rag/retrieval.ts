import { resolveModelRoute } from "@/lib/ai/router";
import { recordTokenUsage } from "@/lib/ai/usage";
import { readIntEnv, readNumberEnv } from "@/lib/env";
import { logInfo } from "@/lib/observability/logger";
import { keywordFallback, retrieveSimilarChunks } from "@/lib/rag/vector-store";

export async function retrieveWorkspaceContext(input: {
  organizationId: string;
  workspaceId: string;
  userId?: string;
  query: string;
  aiRequestId?: string;
}) {
  const route = await resolveModelRoute({
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    kind: "embedding"
  });
  const embedding = await route.provider.createEmbedding(input.query, { model: route.model });

  await recordTokenUsage({
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    userId: input.userId,
    aiRequestId: input.aiRequestId,
    model: route.model,
    type: "EMBEDDING",
    usage: embedding.usage
  });

  const chunks = await retrieveSimilarChunks({
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    queryEmbedding: embedding.embedding,
    limit: readIntEnv("RAG_TOP_K", 8),
    scoreThreshold: readNumberEnv("RAG_SCORE_THRESHOLD", 0.25),
    maxContextChars: readIntEnv("RAG_MAX_CONTEXT_CHARS", 12000)
  });

  const finalChunks = chunks.length
    ? chunks
    : await keywordFallback({
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        query: input.query,
        limit: 4
      });

  logInfo("rag.retrieval.completed", {
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    count: finalChunks.length
  });

  return finalChunks;
}
