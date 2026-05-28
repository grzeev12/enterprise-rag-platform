import { createIngestionWorker } from "@/workers/ingestion-worker";
import { readEnv } from "@/lib/env";
import { ingestionQueueName, getQueueHealth, isQueueConfigured } from "@/lib/ingestion/queue";
import { isWorkerTickAuthorized } from "@/lib/internal/worker-tick-auth";
import { logError, logInfo } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const maxJobsPerTick = 5;
const tickTimeoutMs = 45_000;

export async function GET(request: Request) {
  return runWorkerTick(request);
}

export async function POST(request: Request) {
  return runWorkerTick(request);
}

async function runWorkerTick(request: Request) {
  const startedAt = Date.now();
  const expectedSecret = readEnv("WORKER_CRON_SECRET");
  if (!isWorkerTickAuthorized(request.headers.get("authorization"), expectedSecret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isQueueConfigured()) {
    return Response.json({ error: "REDIS_URL is required for worker tick processing" }, { status: 503 });
  }

  const queueHealth = await getQueueHealth();
  if (queueHealth.waiting === 0) {
    const durationMs = Date.now() - startedAt;
    logInfo("serverless_worker_tick.noop", {
      queueNames: [ingestionQueueName],
      jobsProcessed: 0,
      jobsFailed: 0,
      durationMs
    });
    return Response.json({
      ok: true,
      mode: "serverless-worker-fallback",
      queueNames: [ingestionQueueName],
      jobsProcessed: 0,
      jobsFailed: 0,
      durationMs
    });
  }

  const previousConcurrency = process.env.INGESTION_WORKER_CONCURRENCY;
  process.env.INGESTION_WORKER_CONCURRENCY = "1";
  const worker = createIngestionWorker();
  if (previousConcurrency === undefined) {
    delete process.env.INGESTION_WORKER_CONCURRENCY;
  } else {
    process.env.INGESTION_WORKER_CONCURRENCY = previousConcurrency;
  }

  let jobsProcessed = 0;
  let jobsFailed = 0;

  try {
    await worker.waitUntilReady();
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, tickTimeoutMs);
      const finishIfDone = () => {
        if (jobsProcessed + jobsFailed >= maxJobsPerTick) {
          clearTimeout(timeout);
          resolve();
        }
      };

      worker.on("completed", (job) => {
        jobsProcessed += 1;
        logInfo("serverless_worker_tick.job_completed", {
          queueName: ingestionQueueName,
          jobId: job.id,
          jobName: job.name,
          jobsProcessed,
          jobsFailed
        });
        finishIfDone();
      });

      worker.on("failed", (job, error) => {
        jobsFailed += 1;
        logError("serverless_worker_tick.job_failed", error, {
          queueName: ingestionQueueName,
          jobId: job?.id,
          jobName: job?.name,
          jobsProcessed,
          jobsFailed
        });
        finishIfDone();
      });

      worker.on("error", (error) => {
        logError("serverless_worker_tick.worker_error", error, {
          queueName: ingestionQueueName,
          jobsProcessed,
          jobsFailed
        });
      });
    });
  } finally {
    await worker.close(true);
  }

  const durationMs = Date.now() - startedAt;
  logInfo("serverless_worker_tick.completed", {
    queueNames: [ingestionQueueName],
    jobsProcessed,
    jobsFailed,
    durationMs
  });

  return Response.json({
    ok: true,
    mode: "serverless-worker-fallback",
    queueNames: [ingestionQueueName],
    jobsProcessed,
    jobsFailed,
    durationMs,
    maxJobsPerTick
  });
}

