import { Queue, type JobsOptions } from "bullmq";
import { readEnv, requireEnv } from "@/lib/env";

export const ingestionQueueName = "knowledge-ingestion";

export type CrawlWebsiteJob = {
  type: "crawlWebsite";
  crawlId: string;
};

export type ProcessCrawlPageJob = {
  type: "processCrawlPage";
  crawlPageId: string;
};

export type ChunkDocumentJob = {
  type: "chunkDocument";
  documentId: string;
};

export type GenerateEmbeddingsForSourceJob = {
  type: "generateEmbeddingsForSource";
  embeddingJobId: string;
};

export type GenerateEmbeddingForChunkJob = {
  type: "generateEmbeddingForChunk";
  embeddingJobId: string;
  documentChunkId: string;
};

export type IngestionJobData =
  | CrawlWebsiteJob
  | ProcessCrawlPageJob
  | ChunkDocumentJob
  | GenerateEmbeddingsForSourceJob
  | GenerateEmbeddingForChunkJob;

let queue: Queue<IngestionJobData> | null = null;

export function redisConnection() {
  const rawUrl = requireEnv("REDIS_URL", "background queues");
  const url = new URL(rawUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined,
    username: url.username || undefined,
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null
  };
}

export function isQueueConfigured() {
  return Boolean(readEnv("REDIS_URL"));
}

export function getIngestionQueue() {
  if (!queue) {
    queue = new Queue<IngestionJobData>(ingestionQueueName, {
      connection: redisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000
        },
        removeOnComplete: 500,
        removeOnFail: 1000
      }
    });
  }

  return queue;
}

export async function enqueueCrawlWebsite(crawlId: string, options: JobsOptions = {}) {
  return getIngestionQueue().add("crawlWebsite", { type: "crawlWebsite", crawlId }, options);
}

export async function enqueueProcessCrawlPage(crawlPageId: string, options: JobsOptions = {}) {
  return getIngestionQueue().add("processCrawlPage", { type: "processCrawlPage", crawlPageId }, options);
}

export async function enqueueChunkDocument(documentId: string, options: JobsOptions = {}) {
  return getIngestionQueue().add("chunkDocument", { type: "chunkDocument", documentId }, options);
}

export async function enqueueGenerateEmbeddingsForSource(
  embeddingJobId: string,
  options: JobsOptions = {}
) {
  return getIngestionQueue().add(
    "generateEmbeddingsForSource",
    { type: "generateEmbeddingsForSource", embeddingJobId },
    options
  );
}

export async function enqueueGenerateEmbeddingForChunk(
  embeddingJobId: string,
  documentChunkId: string,
  options: JobsOptions = {}
) {
  return getIngestionQueue().add(
    "generateEmbeddingForChunk",
    { type: "generateEmbeddingForChunk", embeddingJobId, documentChunkId },
    options
  );
}
