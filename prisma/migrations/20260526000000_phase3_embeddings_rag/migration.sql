-- Phase 3: pgvector, embeddings, and RAG chat.
-- This migration is intended to be applied after the Phase 1/2 schema exists.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE "EmbeddingJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'PARTIALLY_COMPLETED');
CREATE TYPE "AiRequestStatus" AS ENUM ('PENDING', 'STREAMING', 'COMPLETED', 'FAILED');
CREATE TYPE "AiRequestType" AS ENUM ('CHAT_COMPLETION', 'STREAMING_CHAT_COMPLETION', 'EMBEDDING');
CREATE TYPE "ChatStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "MessageRole" AS ENUM ('SYSTEM', 'USER', 'ASSISTANT', 'TOOL');

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EMBEDDING_JOB_STARTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EMBEDDING_JOB_COMPLETED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EMBEDDING_JOB_FAILED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CHAT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CHAT_ARCHIVED';
ALTER TYPE "AuditTargetType" ADD VALUE IF NOT EXISTS 'EMBEDDING_JOB';
ALTER TYPE "AuditTargetType" ADD VALUE IF NOT EXISTS 'CHAT';

ALTER TABLE "DocumentChunk"
  ADD COLUMN "embeddingModel" TEXT,
  ADD COLUMN "embeddedAt" TIMESTAMP(3);

CREATE TABLE "ChunkEmbedding" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "documentChunkId" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "dimensions" INTEGER NOT NULL,
  "vector" vector,
  "vectorJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChunkEmbedding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmbeddingJob" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "knowledgeSourceId" TEXT,
  "documentId" TEXT,
  "createdById" TEXT,
  "status" "EmbeddingJobStatus" NOT NULL DEFAULT 'PENDING',
  "model" TEXT NOT NULL,
  "totalChunks" INTEGER NOT NULL DEFAULT 0,
  "embeddedChunks" INTEGER NOT NULL DEFAULT 0,
  "failedChunks" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmbeddingJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LlmProvider" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "baseUrl" TEXT,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LlmProvider_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ModelConfig" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "workspaceId" TEXT,
  "providerId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "modelName" TEXT NOT NULL,
  "dimensions" INTEGER,
  "maxInputTokens" INTEGER,
  "maxOutputTokens" INTEGER,
  "promptTokenCostUsd" DECIMAL(12,8),
  "completionTokenCostUsd" DECIMAL(12,8),
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ModelConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiRequest" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT,
  "providerId" TEXT,
  "model" TEXT NOT NULL,
  "type" "AiRequestType" NOT NULL,
  "status" "AiRequestStatus" NOT NULL DEFAULT 'PENDING',
  "chatId" TEXT,
  "messageId" TEXT,
  "promptTokens" INTEGER,
  "completionTokens" INTEGER,
  "totalTokens" INTEGER,
  "latencyMs" INTEGER,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TokenUsage" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT,
  "aiRequestId" TEXT,
  "model" TEXT NOT NULL,
  "type" "AiRequestType" NOT NULL,
  "promptTokens" INTEGER NOT NULL DEFAULT 0,
  "completionTokens" INTEGER NOT NULL DEFAULT 0,
  "totalTokens" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TokenUsage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Chat" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" "ChatStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Message" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "userId" TEXT,
  "role" "MessageRole" NOT NULL,
  "content" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MessageCitation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "documentChunkId" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "title" TEXT,
  "score" DOUBLE PRECISION NOT NULL,
  "quote" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageCitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChunkEmbedding_documentChunkId_key" ON "ChunkEmbedding"("documentChunkId");
CREATE INDEX "ChunkEmbedding_organizationId_workspaceId_idx" ON "ChunkEmbedding"("organizationId", "workspaceId");
CREATE INDEX "ChunkEmbedding_model_idx" ON "ChunkEmbedding"("model");
CREATE INDEX "ChunkEmbedding_vector_hnsw_idx" ON "ChunkEmbedding" USING hnsw ("vector" vector_cosine_ops);
CREATE INDEX "DocumentChunk_organizationId_workspaceId_embeddedAt_idx" ON "DocumentChunk"("organizationId", "workspaceId", "embeddedAt");
CREATE INDEX "EmbeddingJob_organizationId_workspaceId_status_idx" ON "EmbeddingJob"("organizationId", "workspaceId", "status");
CREATE INDEX "EmbeddingJob_knowledgeSourceId_createdAt_idx" ON "EmbeddingJob"("knowledgeSourceId", "createdAt");
CREATE INDEX "EmbeddingJob_documentId_idx" ON "EmbeddingJob"("documentId");
CREATE UNIQUE INDEX "LlmProvider_organizationId_key_key" ON "LlmProvider"("organizationId", "key");
CREATE INDEX "LlmProvider_organizationId_isEnabled_idx" ON "LlmProvider"("organizationId", "isEnabled");
CREATE UNIQUE INDEX "ModelConfig_organizationId_workspaceId_key_key" ON "ModelConfig"("organizationId", "workspaceId", "key");
CREATE INDEX "ModelConfig_providerId_kind_isEnabled_idx" ON "ModelConfig"("providerId", "kind", "isEnabled");
CREATE INDEX "AiRequest_organizationId_workspaceId_createdAt_idx" ON "AiRequest"("organizationId", "workspaceId", "createdAt");
CREATE INDEX "AiRequest_userId_createdAt_idx" ON "AiRequest"("userId", "createdAt");
CREATE INDEX "AiRequest_type_status_idx" ON "AiRequest"("type", "status");
CREATE INDEX "AiRequest_chatId_idx" ON "AiRequest"("chatId");
CREATE INDEX "TokenUsage_organizationId_workspaceId_createdAt_idx" ON "TokenUsage"("organizationId", "workspaceId", "createdAt");
CREATE INDEX "TokenUsage_userId_createdAt_idx" ON "TokenUsage"("userId", "createdAt");
CREATE INDEX "TokenUsage_model_createdAt_idx" ON "TokenUsage"("model", "createdAt");
CREATE INDEX "Chat_organizationId_workspaceId_userId_status_idx" ON "Chat"("organizationId", "workspaceId", "userId", "status");
CREATE INDEX "Chat_updatedAt_idx" ON "Chat"("updatedAt");
CREATE INDEX "Message_organizationId_workspaceId_chatId_createdAt_idx" ON "Message"("organizationId", "workspaceId", "chatId", "createdAt");
CREATE INDEX "Message_userId_createdAt_idx" ON "Message"("userId", "createdAt");
CREATE INDEX "MessageCitation_organizationId_workspaceId_messageId_idx" ON "MessageCitation"("organizationId", "workspaceId", "messageId");
CREATE INDEX "MessageCitation_documentChunkId_idx" ON "MessageCitation"("documentChunkId");

ALTER TABLE "ChunkEmbedding" ADD CONSTRAINT "ChunkEmbedding_documentChunkId_fkey" FOREIGN KEY ("documentChunkId") REFERENCES "DocumentChunk"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmbeddingJob" ADD CONSTRAINT "EmbeddingJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmbeddingJob" ADD CONSTRAINT "EmbeddingJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmbeddingJob" ADD CONSTRAINT "EmbeddingJob_knowledgeSourceId_fkey" FOREIGN KEY ("knowledgeSourceId") REFERENCES "KnowledgeSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmbeddingJob" ADD CONSTRAINT "EmbeddingJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmbeddingJob" ADD CONSTRAINT "EmbeddingJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LlmProvider" ADD CONSTRAINT "LlmProvider_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModelConfig" ADD CONSTRAINT "ModelConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModelConfig" ADD CONSTRAINT "ModelConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModelConfig" ADD CONSTRAINT "ModelConfig_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "LlmProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiRequest" ADD CONSTRAINT "AiRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiRequest" ADD CONSTRAINT "AiRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiRequest" ADD CONSTRAINT "AiRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiRequest" ADD CONSTRAINT "AiRequest_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "LlmProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiRequest" ADD CONSTRAINT "AiRequest_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiRequest" ADD CONSTRAINT "AiRequest_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TokenUsage" ADD CONSTRAINT "TokenUsage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TokenUsage" ADD CONSTRAINT "TokenUsage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TokenUsage" ADD CONSTRAINT "TokenUsage_aiRequestId_fkey" FOREIGN KEY ("aiRequestId") REFERENCES "AiRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MessageCitation" ADD CONSTRAINT "MessageCitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageCitation" ADD CONSTRAINT "MessageCitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageCitation" ADD CONSTRAINT "MessageCitation_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageCitation" ADD CONSTRAINT "MessageCitation_documentChunkId_fkey" FOREIGN KEY ("documentChunkId") REFERENCES "DocumentChunk"("id") ON DELETE CASCADE ON UPDATE CASCADE;
