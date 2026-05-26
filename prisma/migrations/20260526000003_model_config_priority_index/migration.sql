-- Phase 6 follow-up: support workspace model routing priority ordering.

CREATE INDEX IF NOT EXISTS "ModelConfig_workspaceId_kind_priority_idx" ON "ModelConfig"("workspaceId", "kind", "priority");
