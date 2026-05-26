-- Phase 5: FinOps budgets and alert scaffolding.

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'BUDGET_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'BUDGET_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'BUDGET_ALERT_CREATED';
ALTER TYPE "AuditTargetType" ADD VALUE IF NOT EXISTS 'BUDGET';
ALTER TYPE "AuditTargetType" ADD VALUE IF NOT EXISTS 'BUDGET_ALERT';

CREATE TYPE "BudgetPeriod" AS ENUM ('DAILY', 'MONTHLY');
CREATE TYPE "BudgetAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

CREATE TABLE "Budget" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "createdById" TEXT,
  "name" TEXT NOT NULL,
  "period" "BudgetPeriod" NOT NULL DEFAULT 'MONTHLY',
  "amountUsd" DECIMAL(12,2) NOT NULL,
  "thresholdPercent" INTEGER NOT NULL DEFAULT 80,
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BudgetAlert" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "budgetId" TEXT NOT NULL,
  "createdById" TEXT,
  "status" "BudgetAlertStatus" NOT NULL DEFAULT 'OPEN',
  "thresholdPercent" INTEGER NOT NULL,
  "amountUsd" DECIMAL(12,2) NOT NULL,
  "message" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "BudgetAlert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Budget_organizationId_workspaceId_isActive_idx" ON "Budget"("organizationId", "workspaceId", "isActive");
CREATE INDEX "Budget_createdById_idx" ON "Budget"("createdById");
CREATE INDEX "BudgetAlert_organizationId_workspaceId_status_idx" ON "BudgetAlert"("organizationId", "workspaceId", "status");
CREATE INDEX "BudgetAlert_budgetId_createdAt_idx" ON "BudgetAlert"("budgetId", "createdAt");

ALTER TABLE "Budget" ADD CONSTRAINT "Budget_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BudgetAlert" ADD CONSTRAINT "BudgetAlert_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BudgetAlert" ADD CONSTRAINT "BudgetAlert_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BudgetAlert" ADD CONSTRAINT "BudgetAlert_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BudgetAlert" ADD CONSTRAINT "BudgetAlert_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
