-- Phase 7: enterprise governance and compliance scaffolding.

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'FEATURE_FLAG_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'AI_POLICY_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DATA_RETENTION_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMPLIANCE_SETTING_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'USER_DATA_EXPORT_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'USER_DATA_DELETE_REQUESTED';
ALTER TYPE "AuditTargetType" ADD VALUE IF NOT EXISTS 'FEATURE_FLAG';
ALTER TYPE "AuditTargetType" ADD VALUE IF NOT EXISTS 'AI_POLICY';
ALTER TYPE "AuditTargetType" ADD VALUE IF NOT EXISTS 'DATA_RETENTION_POLICY';
ALTER TYPE "AuditTargetType" ADD VALUE IF NOT EXISTS 'COMPLIANCE_SETTING';
ALTER TYPE "AuditTargetType" ADD VALUE IF NOT EXISTS 'USER_DATA_REQUEST';

CREATE TYPE "DataRetentionMode" AS ENUM ('STANDARD', 'EXTENDED', 'CUSTOM', 'LEGAL_HOLD');

CREATE TABLE "FeatureFlag" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "description" TEXT,
  "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganizationAiPolicy" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "allowedModels" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "blockedModels" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "requireCitations" BOOLEAN NOT NULL DEFAULT true,
  "allowUploads" BOOLEAN NOT NULL DEFAULT false,
  "moderationEnabled" BOOLEAN NOT NULL DEFAULT false,
  "promptInjectionMode" TEXT NOT NULL DEFAULT 'detect',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationAiPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DataRetentionPolicy" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "mode" "DataRetentionMode" NOT NULL DEFAULT 'STANDARD',
  "chatRetentionDays" INTEGER NOT NULL DEFAULT 365,
  "documentRetentionDays" INTEGER NOT NULL DEFAULT 365,
  "auditRetentionDays" INTEGER NOT NULL DEFAULT 2555,
  "legalHoldEnabled" BOOLEAN NOT NULL DEFAULT false,
  "exportEnabled" BOOLEAN NOT NULL DEFAULT true,
  "deleteEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DataRetentionPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComplianceSetting" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "region" TEXT,
  "piiLoggingEnabled" BOOLEAN NOT NULL DEFAULT false,
  "applicationInsightsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "exportRequestsEnabled" BOOLEAN NOT NULL DEFAULT true,
  "deleteRequestsEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ComplianceSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FeatureFlag_organizationId_key_key" ON "FeatureFlag"("organizationId", "key");
CREATE INDEX "FeatureFlag_organizationId_isEnabled_idx" ON "FeatureFlag"("organizationId", "isEnabled");
CREATE UNIQUE INDEX "OrganizationAiPolicy_organizationId_key" ON "OrganizationAiPolicy"("organizationId");
CREATE UNIQUE INDEX "DataRetentionPolicy_organizationId_key" ON "DataRetentionPolicy"("organizationId");
CREATE UNIQUE INDEX "ComplianceSetting_organizationId_key" ON "ComplianceSetting"("organizationId");

ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationAiPolicy" ADD CONSTRAINT "OrganizationAiPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataRetentionPolicy" ADD CONSTRAINT "DataRetentionPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComplianceSetting" ADD CONSTRAINT "ComplianceSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
