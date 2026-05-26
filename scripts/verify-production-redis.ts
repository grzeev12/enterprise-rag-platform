import { Queue, QueueEvents, Worker } from "bullmq";

type VerificationJob = {
  check: "production-redis-queue";
  createdAt: string;
};

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  fail("REDIS_URL is required for Redis queue verification.");
}

const parsedUrl = new URL(redisUrl);
if (parsedUrl.protocol !== "redis:" && parsedUrl.protocol !== "rediss:") {
  fail("REDIS_URL must use redis:// or rediss://. HTTP/REST Upstash URLs are not BullMQ-compatible.");
}

const provider = detectProvider(parsedUrl.hostname);
const queueName = `production-queue-verification-${Date.now()}`;
const connection = {
  host: parsedUrl.hostname,
  port: Number(parsedUrl.port || 6379),
  username: parsedUrl.username || undefined,
  password: parsedUrl.password || undefined,
  tls: parsedUrl.protocol === "rediss:" ? {} : undefined,
  maxRetriesPerRequest: null
};

const queue = new Queue<VerificationJob>(queueName, {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: false
  }
});
const events = new QueueEvents(queueName, { connection });
const worker = new Worker<VerificationJob>(
  queueName,
  async (job) => {
    if (job.data.check !== "production-redis-queue") {
      throw new Error("Unexpected verification job payload.");
    }
    return {
      processed: true,
      jobId: job.id
    };
  },
  {
    connection,
    concurrency: 1
  }
);

try {
  console.log(`Redis provider detected: ${provider}`);
  console.log("Connecting to Redis without printing connection details...");

  const client = (await queue.client) as unknown as { ping: () => Promise<string> };
  await client.ping();
  console.log("Redis connection verified.");

  await events.waitUntilReady();
  await worker.waitUntilReady();
  console.log("BullMQ queue and worker are ready.");

  const job = await queue.add("verification", {
    check: "production-redis-queue",
    createdAt: new Date().toISOString()
  });
  console.log("Test job enqueued.");

  const result = await job.waitUntilFinished(events, 30_000);
  if (!result || result.processed !== true) {
    throw new Error("Verification job completed with an unexpected result.");
  }
  console.log("Test job processed successfully.");

  const counts = await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
  console.log(
    JSON.stringify({
      queueVerified: true,
      waiting: counts.waiting,
      active: counts.active,
      completed: counts.completed,
      failed: counts.failed,
      delayed: counts.delayed
    })
  );
} catch (error) {
  const message = sanitizeError(error);
  console.error(`Redis queue verification failed: ${message}`);
  if (provider === "upstash") {
    console.error(
      "Recommended fix: use an Upstash Redis TCP/TLS endpoint with a rediss:// REDIS_URL, or switch queues to Azure Cache for Redis / another BullMQ-compatible Redis provider. Upstash REST and QStash URLs are not BullMQ backends."
    );
  }
  process.exitCode = 1;
} finally {
  await Promise.allSettled([worker.close(), events.close(), queue.obliterate({ force: true }), queue.close()]);
}

function detectProvider(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "redis") return "local";
  if (host.includes("upstash.io")) return "upstash";
  if (host.includes("redis.cache.windows.net")) return "azure";
  return "generic";
}

function sanitizeError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  let sanitized = raw;
  if (redisUrl) {
    sanitized = sanitized.replaceAll(redisUrl, "[REDACTED_REDIS_URL]");
  }
  sanitized = sanitized.replaceAll(parsedUrl.password, "[REDACTED_PASSWORD]");
  sanitized = sanitized.replaceAll(parsedUrl.username, "[REDACTED_USERNAME]");
  return sanitized;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
