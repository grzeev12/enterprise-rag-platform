import { Prisma } from "@prisma/client";
import crypto from "node:crypto";
import { DEFAULT_EMBEDDING_DIMENSIONS, PGVECTOR_EMBEDDING_TYPE } from "@/lib/ai/embedding-config";
import { prisma } from "@/lib/db";
import { defaultEmbeddingDimensions } from "@/lib/ai/openai-provider";

export type RetrievedChunk = {
  chunkId: string;
  documentId: string;
  content: string;
  title: string | null;
  sourceUrl: string | null;
  chunkIndex: number;
  score: number;
};

export function toVectorLiteral(vector: number[]) {
  if (!vector.length) {
    throw new Error("Embedding vector cannot be empty");
  }
  return `[${vector.map((value) => Number(value).toFixed(8)).join(",")}]`;
}

export async function upsertChunkEmbedding(input: {
  organizationId: string;
  workspaceId: string;
  documentChunkId: string;
  model: string;
  vector: number[];
}) {
  const vectorLiteral = toVectorLiteral(input.vector);
  const dimensions = input.vector.length || defaultEmbeddingDimensions();
  if (dimensions !== DEFAULT_EMBEDDING_DIMENSIONS) {
    throw new Error(`Embedding vector dimensions must match ${PGVECTOR_EMBEDDING_TYPE}`);
  }

  await prisma.$executeRaw`
    INSERT INTO "ChunkEmbedding" (
      "id",
      "organizationId",
      "workspaceId",
      "documentChunkId",
      "model",
      "dimensions",
      "vector",
      "vectorJson",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${crypto.randomUUID()},
      ${input.organizationId},
      ${input.workspaceId},
      ${input.documentChunkId},
      ${input.model},
      ${dimensions},
      ${vectorLiteral}::vector(1536),
      ${JSON.stringify(input.vector)}::jsonb,
      now(),
      now()
    )
    ON CONFLICT ("documentChunkId")
    DO UPDATE SET
      "model" = EXCLUDED."model",
      "dimensions" = EXCLUDED."dimensions",
      "vector" = EXCLUDED."vector",
      "vectorJson" = EXCLUDED."vectorJson",
      "updatedAt" = now()
  `;

  await prisma.documentChunk.update({
    where: { id: input.documentChunkId },
    data: {
      embeddingModel: input.model,
      embeddedAt: new Date()
    }
  });
}

export async function retrieveSimilarChunks(input: {
  organizationId: string;
  workspaceId: string;
  queryEmbedding: number[];
  limit?: number;
  scoreThreshold?: number;
  maxContextChars?: number;
}) {
  const limit = input.limit ?? 8;
  const scoreThreshold = input.scoreThreshold ?? 0.25;
  const maxContextChars = input.maxContextChars ?? 12000;
  const vectorLiteral = toVectorLiteral(input.queryEmbedding);
  if (input.queryEmbedding.length !== DEFAULT_EMBEDDING_DIMENSIONS) {
    throw new Error(`Query embedding dimensions must match ${PGVECTOR_EMBEDDING_TYPE}`);
  }

  const rows = await prisma.$queryRaw<RetrievedChunk[]>`
    SELECT
      dc."id" AS "chunkId",
      dc."documentId" AS "documentId",
      dc."content" AS "content",
      d."title" AS "title",
      d."sourceUrl" AS "sourceUrl",
      dc."chunkIndex" AS "chunkIndex",
      (1 - (ce."vector" <=> ${vectorLiteral}::vector(1536)))::float AS "score"
    FROM "ChunkEmbedding" ce
    INNER JOIN "DocumentChunk" dc ON dc."id" = ce."documentChunkId"
    INNER JOIN "Document" d ON d."id" = dc."documentId"
    WHERE
      ce."organizationId" = ${input.organizationId}
      AND ce."workspaceId" = ${input.workspaceId}
      AND dc."organizationId" = ${input.organizationId}
      AND dc."workspaceId" = ${input.workspaceId}
      AND d."deletedAt" IS NULL
      AND ce."vector" IS NOT NULL
      AND (1 - (ce."vector" <=> ${vectorLiteral}::vector(1536))) >= ${scoreThreshold}
    ORDER BY ce."vector" <=> ${vectorLiteral}::vector(1536)
    LIMIT ${limit}
  `;

  const selected: RetrievedChunk[] = [];
  let size = 0;
  for (const row of rows) {
    if (size + row.content.length > maxContextChars) break;
    selected.push(row);
    size += row.content.length;
  }

  return selected;
}

export async function keywordFallback(input: {
  organizationId: string;
  workspaceId: string;
  query: string;
  limit?: number;
}) {
  const terms = input.query
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 3)
    .slice(0, 6);

  if (!terms.length) return [];

  const predicates = terms.map((term) =>
    Prisma.sql`dc."content" ILIKE ${`%${term.replaceAll("%", "\\%")}%`}`
  );

  return prisma.$queryRaw<RetrievedChunk[]>`
    SELECT
      dc."id" AS "chunkId",
      dc."documentId" AS "documentId",
      dc."content" AS "content",
      d."title" AS "title",
      d."sourceUrl" AS "sourceUrl",
      dc."chunkIndex" AS "chunkIndex",
      0.1::float AS "score"
    FROM "DocumentChunk" dc
    INNER JOIN "Document" d ON d."id" = dc."documentId"
    WHERE
      dc."organizationId" = ${input.organizationId}
      AND dc."workspaceId" = ${input.workspaceId}
      AND d."deletedAt" IS NULL
      AND (${Prisma.join(predicates, " OR ")})
    ORDER BY dc."createdAt" DESC
    LIMIT ${input.limit ?? 4}
  `;
}
