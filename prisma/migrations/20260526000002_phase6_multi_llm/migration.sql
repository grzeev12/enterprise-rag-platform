-- Phase 6: Multi-LLM gateway routing and provider operations.

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LLM_PROVIDER_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LLM_PROVIDER_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'MODEL_CONFIG_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'MODEL_CONFIG_UPDATED';
ALTER TYPE "AuditTargetType" ADD VALUE IF NOT EXISTS 'LLM_PROVIDER';
ALTER TYPE "AuditTargetType" ADD VALUE IF NOT EXISTS 'MODEL_CONFIG';

CREATE TYPE "LlmProviderStatus" AS ENUM ('UNKNOWN', 'HEALTHY', 'DEGRADED', 'UNAVAILABLE');
CREATE TYPE "RoutingPolicy" AS ENUM ('DEFAULT', 'COST_FIRST', 'LATENCY_FIRST', 'QUALITY_FIRST', 'FALLBACK_CHAIN');

ALTER TABLE "LlmProvider"
  ADD COLUMN "apiKeySecretRef" TEXT,
  ADD COLUMN "status" "LlmProviderStatus" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "lastCheckedAt" TIMESTAMP(3),
  ADD COLUMN "lastError" TEXT,
  ADD COLUMN "timeoutMs" INTEGER NOT NULL DEFAULT 30000,
  ADD COLUMN "maxRetries" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "circuitOpen" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "circuitOpenedAt" TIMESTAMP(3);

ALTER TABLE "ModelConfig"
  ADD COLUMN "routingPolicy" "RoutingPolicy" NOT NULL DEFAULT 'DEFAULT',
  ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "qualityTier" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "expectedLatencyMs" INTEGER,
  ADD COLUMN "isAllowed" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isBlocked" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "LlmProvider_status_isEnabled_idx" ON "LlmProvider"("status", "isEnabled");
CREATE INDEX "ModelConfig_workspaceId_kind_routingPolicy_idx" ON "ModelConfig"("workspaceId", "kind", "routingPolicy");
CREATE INDEX "ModelConfig_kind_isAllowed_isBlocked_idx" ON "ModelConfig"("kind", "isAllowed", "isBlocked");
