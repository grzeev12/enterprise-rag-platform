import { Worker } from "bullmq";
import {
  CrawlPageStatus,
  CrawlStatus,
  DocumentStatus,
  EmbeddingJobStatus,
  KnowledgeSourceStatus
} from "@prisma/client";
import { defaultEmbeddingModel } from "@/lib/ai/openai-provider";
import { resolveModelRoute } from "@/lib/ai/router";
import { recordTokenUsage } from "@/lib/ai/usage";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { chunkText } from "@/lib/ingestion/chunk";
import { safeFetchText } from "@/lib/ingestion/fetch";
import { extractHtml } from "@/lib/ingestion/html";
import {
  ingestionQueueName,
  redisConnection,
  enqueueChunkDocument,
  enqueueGenerateEmbeddingForChunk,
  enqueueProcessCrawlPage,
  type IngestionJobData
} from "@/lib/ingestion/queue";
import {
  isAllowedDomain,
  isExcludedPath,
  normalizeUrl,
  validatePublicHttpUrl
} from "@/lib/ingestion/safe-url";
import { fetchRobotsPolicy } from "@/lib/ingestion/robots";
import { logError, logInfo } from "@/lib/observability/logger";
import { upsertChunkEmbedding } from "@/lib/rag/vector-store";
import { uploadTextBlob } from "@/lib/storage/blob";
import { readIntEnv } from "@/lib/env";

const userAgent = "EnterpriseAISaaSBot/0.1 (+respectful crawler)";

export function createIngestionWorker() {
  return new Worker<IngestionJobData>(
    ingestionQueueName,
    async (job) => {
      if (job.data.type === "crawlWebsite") {
        await crawlWebsite(job.data.crawlId);
        return;
      }

      if (job.data.type === "processCrawlPage") {
        await processCrawlPage(job.data.crawlPageId);
        return;
      }

      if (job.data.type === "chunkDocument") {
        await chunkDocument(job.data.documentId);
        return;
      }

      if (job.data.type === "generateEmbeddingsForSource") {
        await generateEmbeddingsForSource(job.data.embeddingJobId);
        return;
      }

      if (job.data.type === "generateEmbeddingForChunk") {
        await generateEmbeddingForChunk(job.data.embeddingJobId, job.data.documentChunkId);
      }
    },
    {
      connection: redisConnection(),
      concurrency: readIntEnv("INGESTION_WORKER_CONCURRENCY", 3)
    }
  );
}

async function main() {
  const worker = createIngestionWorker();
  console.log(`Ingestion worker listening on ${ingestionQueueName}`);

  const shutdown = async () => {
    await worker.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (process.argv[1]?.includes("ingestion-worker")) {
  void main().catch((error) => {
    logError("ingestion_worker.start_failed", error);
    process.exit(1);
  });
}

async function crawlWebsite(crawlId: string) {
  const crawl = await prisma.crawl.findUnique({
    where: { id: crawlId },
    include: { knowledgeSource: true }
  });

  if (!crawl || crawl.knowledgeSource.deletedAt) return;

  await prisma.crawl.update({
    where: { id: crawlId },
    data: { status: CrawlStatus.CRAWLING, startedAt: new Date(), errorMessage: null }
  });
  await prisma.knowledgeSource.update({
    where: { id: crawl.knowledgeSourceId },
    data: { status: KnowledgeSourceStatus.CRAWLING }
  });

  try {
    const base = await validatePublicHttpUrl(crawl.knowledgeSource.baseUrl);
    const robots = await fetchRobotsPolicy(base.origin, userAgent);
    const queue: { url: string; depth: number }[] = [{ url: base.normalizedUrl, depth: 0 }];
    const seen = new Set<string>();
    const sitemapUrls = await discoverSitemapUrls(base.origin, robots.sitemaps);

    for (const sitemapUrl of sitemapUrls) {
      queue.push({ url: sitemapUrl, depth: 0 });
    }

    while (queue.length && seen.size < crawl.knowledgeSource.maxPages) {
      const current = queue.shift();
      if (!current || seen.has(current.url) || current.depth > crawl.knowledgeSource.maxDepth) {
        continue;
      }

      const currentUrl = new URL(current.url);
      if (
        !isAllowedDomain(currentUrl, crawl.knowledgeSource.allowedDomains) ||
        isExcludedPath(currentUrl, crawl.knowledgeSource.excludedPaths)
      ) {
        continue;
      }

      seen.add(current.url);

      const page = await prisma.crawlPage.upsert({
        where: {
          crawlId_normalizedUrl: {
            crawlId,
            normalizedUrl: current.url
          }
        },
        update: {},
        create: {
          organizationId: crawl.organizationId,
          workspaceId: crawl.workspaceId,
          knowledgeSourceId: crawl.knowledgeSourceId,
          crawlId,
          url: current.url,
          normalizedUrl: current.url,
          depth: current.depth,
          status: robots.isAllowed(current.url) ? CrawlPageStatus.PENDING : CrawlPageStatus.BLOCKED,
          errorMessage: robots.isAllowed(current.url) ? null : "Blocked by robots.txt"
        }
      });

      if (!robots.isAllowed(current.url)) {
        continue;
      }

      await enqueueProcessCrawlPage(page.id, {
        delay: Math.max(robots.crawlDelayMs ?? 0, crawl.knowledgeSource.crawlDelayMs)
      });

      if (current.depth < crawl.knowledgeSource.maxDepth) {
        const links = await discoverPageLinks(current.url);
        for (const link of links) {
          if (seen.size + queue.length >= crawl.knowledgeSource.maxPages) break;
          const normalized = normalizeUrl(link);
          if (!seen.has(normalized)) {
            queue.push({ url: normalized, depth: current.depth + 1 });
          }
        }
      }
    }

    await updateCrawlRollup(crawlId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown crawl failure";
    await prisma.crawl.update({
      where: { id: crawlId },
      data: {
        status: CrawlStatus.FAILED,
        completedAt: new Date(),
        errorMessage: message
      }
    });
    await prisma.knowledgeSource.update({
      where: { id: crawl.knowledgeSourceId },
      data: { status: KnowledgeSourceStatus.FAILED }
    });
    await writeAuditLog({
      organizationId: crawl.organizationId,
      workspaceId: crawl.workspaceId,
      actorUserId: crawl.createdById,
      action: "CRAWL_FAILED",
      targetType: "CRAWL",
      targetId: crawl.id,
      metadata: { error: message }
    });
    throw error;
  }
}

async function generateEmbeddingsForSource(embeddingJobId: string) {
  const job = await prisma.embeddingJob.findUnique({
    where: { id: embeddingJobId }
  });
  if (!job) return;

  logInfo("embedding_job.started", {
    embeddingJobId,
    organizationId: job.organizationId,
    workspaceId: job.workspaceId
  });

  await prisma.embeddingJob.update({
    where: { id: embeddingJobId },
    data: { status: EmbeddingJobStatus.PROCESSING, startedAt: new Date(), errorMessage: null }
  });

  try {
    const chunks = await prisma.documentChunk.findMany({
      where: {
        organizationId: job.organizationId,
        workspaceId: job.workspaceId,
        embeddedAt: null,
        document: {
          deletedAt: null,
          ...(job.knowledgeSourceId ? { knowledgeSourceId: job.knowledgeSourceId } : {}),
          ...(job.documentId ? { id: job.documentId } : {})
        }
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: readIntEnv("EMBEDDING_JOB_MAX_CHUNKS", 1000)
    });

    await prisma.embeddingJob.update({
      where: { id: embeddingJobId },
      data: { totalChunks: chunks.length }
    });

    if (!chunks.length) {
      await finalizeEmbeddingJob(embeddingJobId);
      return;
    }

    for (const chunk of chunks) {
      await enqueueGenerateEmbeddingForChunk(embeddingJobId, chunk.id);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown embedding job failure";
    logError("embedding_job.failed", error, { embeddingJobId });
    await prisma.embeddingJob.update({
      where: { id: embeddingJobId },
      data: {
        status: EmbeddingJobStatus.FAILED,
        errorMessage: message,
        completedAt: new Date()
      }
    });
    await writeAuditLog({
      organizationId: job.organizationId,
      workspaceId: job.workspaceId,
      actorUserId: job.createdById,
      action: "EMBEDDING_JOB_FAILED",
      targetType: "EMBEDDING_JOB",
      targetId: job.id,
      metadata: { error: message }
    });
    throw error;
  }
}

async function generateEmbeddingForChunk(embeddingJobId: string, documentChunkId: string) {
  const [job, chunk] = await Promise.all([
    prisma.embeddingJob.findUnique({ where: { id: embeddingJobId } }),
    prisma.documentChunk.findUnique({
      where: { id: documentChunkId },
      include: { document: true }
    })
  ]);

  if (!job || !chunk || chunk.organizationId !== job.organizationId || chunk.workspaceId !== job.workspaceId) {
    return;
  }

  try {
    const route = await resolveModelRoute({
      organizationId: job.organizationId,
      workspaceId: job.workspaceId,
      kind: "embedding"
    });
    const model = job.model || route.model || defaultEmbeddingModel();
    const aiRequest = await prisma.aiRequest.create({
      data: {
        organizationId: job.organizationId,
        workspaceId: job.workspaceId,
        userId: job.createdById ?? null,
        providerId: route.providerId ?? null,
        model,
        type: "EMBEDDING",
        status: "PENDING",
        metadata: { embeddingJobId, documentChunkId }
      }
    });

    const result = await route.provider.createEmbedding(chunk.content, { model });
    await upsertChunkEmbedding({
      organizationId: job.organizationId,
      workspaceId: job.workspaceId,
      documentChunkId,
      model: result.model,
      vector: result.embedding
    });

    await prisma.aiRequest.update({
      where: { id: aiRequest.id },
      data: {
        status: "COMPLETED",
        promptTokens: result.usage?.promptTokens ?? 0,
        totalTokens: result.usage?.totalTokens ?? result.usage?.promptTokens ?? 0
      }
    });
    await recordTokenUsage({
      organizationId: job.organizationId,
      workspaceId: job.workspaceId,
      userId: job.createdById,
      aiRequestId: aiRequest.id,
      model: result.model,
      type: "EMBEDDING",
      usage: result.usage
    });

    await prisma.embeddingJob.update({
      where: { id: embeddingJobId },
      data: { embeddedChunks: { increment: 1 } }
    });
  } catch (error) {
    logError("embedding_chunk.failed", error, { embeddingJobId, documentChunkId });
    await prisma.embeddingJob.update({
      where: { id: embeddingJobId },
      data: { failedChunks: { increment: 1 }, errorMessage: "Some chunks failed to embed" }
    });
    throw error;
  } finally {
    await finalizeEmbeddingJob(embeddingJobId);
  }
}

async function finalizeEmbeddingJob(embeddingJobId: string) {
  const job = await prisma.embeddingJob.findUnique({ where: { id: embeddingJobId } });
  if (!job) return;
  if (job.totalChunks > 0 && job.embeddedChunks + job.failedChunks < job.totalChunks) return;

  const status =
    job.failedChunks > 0 && job.embeddedChunks > 0
      ? EmbeddingJobStatus.PARTIALLY_COMPLETED
      : job.failedChunks > 0
        ? EmbeddingJobStatus.FAILED
        : EmbeddingJobStatus.COMPLETED;

  await prisma.embeddingJob.update({
    where: { id: embeddingJobId },
    data: { status, completedAt: new Date() }
  });

  logInfo("embedding_job.completed", {
    embeddingJobId,
    status,
    embeddedChunks: job.embeddedChunks,
    failedChunks: job.failedChunks
  });

  await writeAuditLog({
    organizationId: job.organizationId,
    workspaceId: job.workspaceId,
    actorUserId: job.createdById,
    action: status === EmbeddingJobStatus.FAILED ? "EMBEDDING_JOB_FAILED" : "EMBEDDING_JOB_COMPLETED",
    targetType: "EMBEDDING_JOB",
    targetId: job.id,
    metadata: { status, embeddedChunks: job.embeddedChunks, failedChunks: job.failedChunks }
  });
}

async function processCrawlPage(crawlPageId: string) {
  const page = await prisma.crawlPage.findUnique({
    where: { id: crawlPageId },
    include: { knowledgeSource: true, crawl: true }
  });

  if (!page || page.status === CrawlPageStatus.BLOCKED) return;

  await prisma.crawlPage.update({
    where: { id: crawlPageId },
    data: { status: CrawlPageStatus.FETCHING, errorMessage: null }
  });

  try {
    if (!page.knowledgeSource.allowedDomains.length) {
      throw new Error("No allowed domains configured");
    }

    const response = await safeFetchText(page.url, {
      timeoutMs: 10000,
      maxBytes: 1_500_000,
      userAgent
    });

    const contentType = response.contentType ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      await prisma.crawlPage.update({
        where: { id: crawlPageId },
        data: {
          status: CrawlPageStatus.SKIPPED,
          httpStatus: response.status,
          contentType,
          fetchedAt: new Date(),
          errorMessage: "Skipped non-HTML response"
        }
      });
      await updateCrawlRollup(page.crawlId);
      return;
    }

    const extracted = extractHtml(response.body, response.finalUrl);
    const rawStorageKey = `raw/${page.organizationId}/${page.workspaceId}/${page.crawlId}/${page.id}.html`;
    const textStorageKey = `processed/${page.organizationId}/${page.workspaceId}/${page.crawlId}/${page.id}.txt`;

    await uploadTextBlob(rawStorageKey, response.body, "text/html; charset=utf-8");
    await uploadTextBlob(textStorageKey, extracted.text, "text/plain; charset=utf-8");

    const updatedPage = await prisma.crawlPage.update({
      where: { id: crawlPageId },
      data: {
        status: CrawlPageStatus.FETCHED,
        httpStatus: response.status,
        contentType,
        title: extracted.title,
        metaDescription: extracted.metaDescription,
        canonicalUrl: extracted.canonicalUrl,
        fetchedAt: new Date()
      }
    });

    const document = await prisma.document.upsert({
      where: { crawlPageId },
      update: {
        status: DocumentStatus.PROCESSING,
        title: extracted.title,
        metaDescription: extracted.metaDescription,
        canonicalUrl: extracted.canonicalUrl,
        language: extracted.language,
        textContent: extracted.text,
        contentHash: extracted.contentHash,
        rawStorageKey,
        textStorageKey
      },
      create: {
        organizationId: page.organizationId,
        workspaceId: page.workspaceId,
        knowledgeSourceId: page.knowledgeSourceId,
        crawlId: page.crawlId,
        crawlPageId: page.id,
        createdById: page.crawl.createdById,
        status: DocumentStatus.PROCESSING,
        sourceUrl: updatedPage.normalizedUrl,
        title: extracted.title,
        metaDescription: extracted.metaDescription,
        canonicalUrl: extracted.canonicalUrl,
        language: extracted.language,
        textContent: extracted.text,
        contentHash: extracted.contentHash,
        rawStorageKey,
        textStorageKey
      }
    });

    await prisma.crawlPage.update({
      where: { id: crawlPageId },
      data: { status: CrawlPageStatus.PROCESSING }
    });

    await enqueueChunkDocument(document.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown page failure";
    await prisma.crawlPage.update({
      where: { id: crawlPageId },
      data: {
        status: CrawlPageStatus.FAILED,
        errorMessage: message,
        fetchedAt: new Date()
      }
    });
    await updateCrawlRollup(page.crawlId);
    throw error;
  }
}

async function chunkDocument(documentId: string) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: { crawlPage: true, crawl: true }
  });

  if (!document || document.deletedAt) return;

  try {
    const chunks = chunkText(
      document.textContent,
      readIntEnv("CRAWL_CHUNK_SIZE", 1200),
      readIntEnv("CRAWL_CHUNK_OVERLAP", 180)
    );

    await prisma.$transaction(async (tx) => {
      await tx.documentChunk.deleteMany({ where: { documentId: document.id } });
      if (chunks.length) {
        await tx.documentChunk.createMany({
          data: chunks.map((chunk) => ({
            organizationId: document.organizationId,
            workspaceId: document.workspaceId,
            documentId: document.id,
            chunkIndex: chunk.index,
            content: chunk.content,
            tokenEstimate: chunk.tokenEstimate,
            metadata: {
              sourceUrl: document.sourceUrl,
              title: document.title,
              crawlId: document.crawlId,
              documentId: document.id,
              chunkIndex: chunk.index
            }
          }))
        });
      }
      await tx.document.update({
        where: { id: document.id },
        data: { status: DocumentStatus.CHUNKED }
      });
      if (document.crawlPageId) {
        await tx.crawlPage.update({
          where: { id: document.crawlPageId },
          data: { status: CrawlPageStatus.PROCESSED, processedAt: new Date() }
        });
      }
    });

    if (document.crawlId) {
      await updateCrawlRollup(document.crawlId);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown chunking failure";
    await prisma.document.update({
      where: { id: document.id },
      data: { status: DocumentStatus.FAILED }
    });
    if (document.crawlPageId) {
      await prisma.crawlPage.update({
        where: { id: document.crawlPageId },
        data: { status: CrawlPageStatus.FAILED, errorMessage: message }
      });
    }
    if (document.crawlId) {
      await updateCrawlRollup(document.crawlId);
    }
    throw error;
  }
}

async function updateCrawlRollup(crawlId: string) {
  const crawl = await prisma.crawl.findUnique({
    where: { id: crawlId },
    include: { knowledgeSource: true }
  });
  if (!crawl) return;

  const pages = await prisma.crawlPage.groupBy({
    by: ["status"],
    where: { crawlId },
    _count: true
  });

  const count = (status: CrawlPageStatus) =>
    pages.find((page) => page.status === status)?._count ?? 0;

  const pagesDiscovered = pages.reduce((sum, page) => sum + page._count, 0);
  const pagesFetched =
    count(CrawlPageStatus.FETCHED) +
    count(CrawlPageStatus.PROCESSING) +
    count(CrawlPageStatus.PROCESSED);
  const pagesProcessed = count(CrawlPageStatus.PROCESSED);
  const pagesFailed =
    count(CrawlPageStatus.FAILED) + count(CrawlPageStatus.BLOCKED) + count(CrawlPageStatus.SKIPPED);
  const active =
    count(CrawlPageStatus.PENDING) +
    count(CrawlPageStatus.FETCHING) +
    count(CrawlPageStatus.FETCHED) +
    count(CrawlPageStatus.PROCESSING);

  let status = crawl.status;
  if (pagesDiscovered === 0) {
    status = CrawlStatus.FAILED;
  } else if (active === 0) {
    status = pagesProcessed > 0 && pagesFailed > 0 ? CrawlStatus.PARTIALLY_COMPLETED : pagesProcessed > 0 ? CrawlStatus.COMPLETED : CrawlStatus.FAILED;
  } else {
    status = CrawlStatus.PROCESSING;
  }

  const terminal =
    status === CrawlStatus.COMPLETED ||
    status === CrawlStatus.PARTIALLY_COMPLETED ||
    status === CrawlStatus.FAILED;

  await prisma.crawl.update({
    where: { id: crawlId },
    data: {
      status,
      pagesDiscovered,
      pagesFetched,
      pagesProcessed,
      pagesFailed,
      completedAt: terminal ? new Date() : null
    }
  });

  await prisma.knowledgeSource.update({
    where: { id: crawl.knowledgeSourceId },
    data: {
      status:
        status === CrawlStatus.COMPLETED
          ? KnowledgeSourceStatus.COMPLETED
          : status === CrawlStatus.PARTIALLY_COMPLETED
            ? KnowledgeSourceStatus.PARTIALLY_COMPLETED
            : status === CrawlStatus.FAILED
              ? KnowledgeSourceStatus.FAILED
              : KnowledgeSourceStatus.PROCESSING,
      lastCrawledAt: terminal ? new Date() : crawl.knowledgeSource.lastCrawledAt
    }
  });

  if (terminal && crawl.status !== status) {
    await writeAuditLog({
      organizationId: crawl.organizationId,
      workspaceId: crawl.workspaceId,
      actorUserId: crawl.createdById,
      action: status === CrawlStatus.FAILED ? "CRAWL_FAILED" : "CRAWL_COMPLETED",
      targetType: "CRAWL",
      targetId: crawl.id,
      metadata: { pagesDiscovered, pagesProcessed, pagesFailed, status }
    });
  }
}

async function discoverPageLinks(url: string) {
  try {
    const response = await safeFetchText(url, {
      timeoutMs: 8000,
      maxBytes: 1_500_000,
      userAgent
    });
    if (!response.contentType?.includes("text/html")) return [];
    return extractHtml(response.body, response.finalUrl).links;
  } catch {
    return [];
  }
}

async function discoverSitemapUrls(origin: string, declaredSitemaps: string[]) {
  const sitemapUrls = declaredSitemaps.length ? declaredSitemaps : [new URL("/sitemap.xml", origin).toString()];
  const urls = new Set<string>();

  for (const sitemapUrl of sitemapUrls.slice(0, 5)) {
    try {
      const response = await safeFetchText(sitemapUrl, {
        timeoutMs: 5000,
        maxBytes: 500_000,
        userAgent
      });
      const matches = response.body.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi);
      for (const match of matches) {
        urls.add(normalizeUrl(match[1]));
        if (urls.size >= 100) break;
      }
    } catch {
      continue;
    }
  }

  return [...urls];
}
