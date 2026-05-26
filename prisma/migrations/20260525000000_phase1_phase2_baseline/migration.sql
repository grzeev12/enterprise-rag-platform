-- Phase 1/2 baseline: SaaS foundation and knowledge ingestion.
-- This migration exists so fresh production databases can run every later phase in order.

CREATE TYPE "AuditAction" AS ENUM (
  'USER_SIGNED_UP',
  'ORGANIZATION_CREATED',
  'WORKSPACE_CREATED',
  'USER_INVITED',
  'USER_PROFILE_UPDATED',
  'KNOWLEDGE_SOURCE_CREATED',
  'KNOWLEDGE_SOURCE_DELETED',
  'CRAWL_STARTED',
  'CRAWL_COMPLETED',
  'CRAWL_FAILED'
);

CREATE TYPE "AuditTargetType" AS ENUM (
  'USER',
  'ORGANIZATION',
  'WORKSPACE',
  'MEMBERSHIP',
  'KNOWLEDGE_SOURCE',
  'CRAWL'
);

CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED');
CREATE TYPE "RoleScope" AS ENUM ('ORGANIZATION', 'WORKSPACE');
CREATE TYPE "KnowledgeSourceType" AS ENUM ('WEBSITE', 'DOCUMENT_UPLOAD');
CREATE TYPE "KnowledgeSourceStatus" AS ENUM (
  'PENDING',
  'READY',
  'CRAWLING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'PARTIALLY_COMPLETED',
  'ARCHIVED'
);
CREATE TYPE "CrawlStatus" AS ENUM (
  'PENDING',
  'CRAWLING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'PARTIALLY_COMPLETED',
  'CANCELLED'
);
CREATE TYPE "CrawlPageStatus" AS ENUM (
  'PENDING',
  'FETCHING',
  'FETCHED',
  'PROCESSING',
  'PROCESSED',
  'FAILED',
  'SKIPPED',
  'BLOCKED'
);
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'PROCESSING', 'CHUNKED', 'FAILED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "name" TEXT,
  "email" TEXT NOT NULL,
  "emailVerified" TIMESTAMP(3),
  "image" TEXT,
  "passwordHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Account" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "refresh_token" TEXT,
  "access_token" TEXT,
  "expires_at" INTEGER,
  "token_type" TEXT,
  "scope" TEXT,
  "id_token" TEXT,
  "session_state" TEXT,
  CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "sessionToken" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expires" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VerificationToken" (
  "identifier" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expires" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "Organization" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Workspace" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Membership" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "roleId" TEXT NOT NULL,
  "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
  "invitedEmail" TEXT,
  "invitedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Role" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "workspaceId" TEXT,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "scope" "RoleScope" NOT NULL,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Permission" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RolePermission" (
  "roleId" TEXT NOT NULL,
  "permissionId" TEXT NOT NULL,
  CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId", "permissionId")
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "workspaceId" TEXT,
  "actorUserId" TEXT,
  "action" "AuditAction" NOT NULL,
  "targetType" "AuditTargetType" NOT NULL,
  "targetId" TEXT NOT NULL,
  "metadata" JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeSource" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "type" "KnowledgeSourceType" NOT NULL,
  "status" "KnowledgeSourceStatus" NOT NULL DEFAULT 'PENDING',
  "name" TEXT NOT NULL,
  "baseUrl" TEXT NOT NULL,
  "allowedDomains" TEXT[] NOT NULL,
  "excludedPaths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "maxPages" INTEGER NOT NULL DEFAULT 50,
  "maxDepth" INTEGER NOT NULL DEFAULT 2,
  "crawlDelayMs" INTEGER NOT NULL DEFAULT 1000,
  "lastCrawledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "KnowledgeSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Crawl" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "knowledgeSourceId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "status" "CrawlStatus" NOT NULL DEFAULT 'PENDING',
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "pagesDiscovered" INTEGER NOT NULL DEFAULT 0,
  "pagesFetched" INTEGER NOT NULL DEFAULT 0,
  "pagesProcessed" INTEGER NOT NULL DEFAULT 0,
  "pagesFailed" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "settings" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Crawl_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrawlPage" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "knowledgeSourceId" TEXT NOT NULL,
  "crawlId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "normalizedUrl" TEXT NOT NULL,
  "depth" INTEGER NOT NULL,
  "status" "CrawlPageStatus" NOT NULL DEFAULT 'PENDING',
  "httpStatus" INTEGER,
  "contentType" TEXT,
  "title" TEXT,
  "metaDescription" TEXT,
  "canonicalUrl" TEXT,
  "errorMessage" TEXT,
  "fetchedAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrawlPage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Document" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "knowledgeSourceId" TEXT NOT NULL,
  "crawlId" TEXT,
  "crawlPageId" TEXT,
  "createdById" TEXT NOT NULL,
  "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
  "sourceUrl" TEXT,
  "title" TEXT,
  "metaDescription" TEXT,
  "canonicalUrl" TEXT,
  "language" TEXT,
  "rawStorageKey" TEXT,
  "textStorageKey" TEXT,
  "textContent" TEXT NOT NULL,
  "contentHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentChunk" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "chunkIndex" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "tokenEstimate" INTEGER NOT NULL,
  "metadata" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");
CREATE INDEX "Account_userId_idx" ON "Account"("userId");
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE INDEX "Organization_createdById_idx" ON "Organization"("createdById");
CREATE INDEX "Organization_deletedAt_idx" ON "Organization"("deletedAt");
CREATE UNIQUE INDEX "Workspace_organizationId_slug_key" ON "Workspace"("organizationId", "slug");
CREATE INDEX "Workspace_organizationId_idx" ON "Workspace"("organizationId");
CREATE INDEX "Workspace_createdById_idx" ON "Workspace"("createdById");
CREATE INDEX "Workspace_deletedAt_idx" ON "Workspace"("deletedAt");
CREATE UNIQUE INDEX "Membership_userId_organizationId_workspaceId_key" ON "Membership"("userId", "organizationId", "workspaceId");
CREATE INDEX "Membership_organizationId_workspaceId_idx" ON "Membership"("organizationId", "workspaceId");
CREATE INDEX "Membership_roleId_idx" ON "Membership"("roleId");
CREATE INDEX "Membership_deletedAt_idx" ON "Membership"("deletedAt");
CREATE UNIQUE INDEX "Role_organizationId_workspaceId_key_key" ON "Role"("organizationId", "workspaceId", "key");
CREATE INDEX "Role_organizationId_idx" ON "Role"("organizationId");
CREATE INDEX "Role_workspaceId_idx" ON "Role"("workspaceId");
CREATE INDEX "Role_deletedAt_idx" ON "Role"("deletedAt");
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");
CREATE INDEX "AuditLog_workspaceId_createdAt_idx" ON "AuditLog"("workspaceId", "createdAt");
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
CREATE INDEX "KnowledgeSource_organizationId_workspaceId_status_idx" ON "KnowledgeSource"("organizationId", "workspaceId", "status");
CREATE INDEX "KnowledgeSource_workspaceId_deletedAt_idx" ON "KnowledgeSource"("workspaceId", "deletedAt");
CREATE INDEX "KnowledgeSource_createdById_idx" ON "KnowledgeSource"("createdById");
CREATE INDEX "KnowledgeSource_deletedAt_idx" ON "KnowledgeSource"("deletedAt");
CREATE INDEX "Crawl_organizationId_workspaceId_status_idx" ON "Crawl"("organizationId", "workspaceId", "status");
CREATE INDEX "Crawl_knowledgeSourceId_createdAt_idx" ON "Crawl"("knowledgeSourceId", "createdAt");
CREATE INDEX "Crawl_createdById_idx" ON "Crawl"("createdById");
CREATE UNIQUE INDEX "CrawlPage_crawlId_normalizedUrl_key" ON "CrawlPage"("crawlId", "normalizedUrl");
CREATE INDEX "CrawlPage_organizationId_workspaceId_status_idx" ON "CrawlPage"("organizationId", "workspaceId", "status");
CREATE INDEX "CrawlPage_knowledgeSourceId_status_idx" ON "CrawlPage"("knowledgeSourceId", "status");
CREATE INDEX "CrawlPage_crawlId_status_idx" ON "CrawlPage"("crawlId", "status");
CREATE UNIQUE INDEX "Document_crawlPageId_key" ON "Document"("crawlPageId");
CREATE INDEX "Document_organizationId_workspaceId_status_idx" ON "Document"("organizationId", "workspaceId", "status");
CREATE INDEX "Document_knowledgeSourceId_status_idx" ON "Document"("knowledgeSourceId", "status");
CREATE INDEX "Document_crawlId_idx" ON "Document"("crawlId");
CREATE INDEX "Document_createdById_idx" ON "Document"("createdById");
CREATE INDEX "Document_deletedAt_idx" ON "Document"("deletedAt");
CREATE UNIQUE INDEX "DocumentChunk_documentId_chunkIndex_key" ON "DocumentChunk"("documentId", "chunkIndex");
CREATE INDEX "DocumentChunk_organizationId_workspaceId_idx" ON "DocumentChunk"("organizationId", "workspaceId");
CREATE INDEX "DocumentChunk_documentId_idx" ON "DocumentChunk"("documentId");

ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Role" ADD CONSTRAINT "Role_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Role" ADD CONSTRAINT "Role_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Crawl" ADD CONSTRAINT "Crawl_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Crawl" ADD CONSTRAINT "Crawl_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Crawl" ADD CONSTRAINT "Crawl_knowledgeSourceId_fkey" FOREIGN KEY ("knowledgeSourceId") REFERENCES "KnowledgeSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Crawl" ADD CONSTRAINT "Crawl_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CrawlPage" ADD CONSTRAINT "CrawlPage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrawlPage" ADD CONSTRAINT "CrawlPage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrawlPage" ADD CONSTRAINT "CrawlPage_knowledgeSourceId_fkey" FOREIGN KEY ("knowledgeSourceId") REFERENCES "KnowledgeSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrawlPage" ADD CONSTRAINT "CrawlPage_crawlId_fkey" FOREIGN KEY ("crawlId") REFERENCES "Crawl"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_knowledgeSourceId_fkey" FOREIGN KEY ("knowledgeSourceId") REFERENCES "KnowledgeSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_crawlId_fkey" FOREIGN KEY ("crawlId") REFERENCES "Crawl"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_crawlPageId_fkey" FOREIGN KEY ("crawlPageId") REFERENCES "CrawlPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
