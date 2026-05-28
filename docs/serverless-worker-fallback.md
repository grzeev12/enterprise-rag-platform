# Serverless Worker Fallback

The primary production worker architecture remains a separate BullMQ worker service. The serverless fallback is a low-cost MVP option that lets Vercel process small queue batches before an external worker host is available.

Endpoint:

```http
POST /api/internal/worker-tick
Authorization: Bearer <WORKER_CRON_SECRET>
```

Vercel Cron invokes configured paths with `GET` and sends the configured `CRON_SECRET` as an `Authorization` bearer token. The route supports both `GET` for Vercel Cron and `POST` for manual/internal triggering. Set `CRON_SECRET` in Vercel to the same value as `WORKER_CRON_SECRET`.

Vercel schedule:

```json
{
  "crons": [
    {
      "path": "/api/internal/worker-tick",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

Runtime limits:

- Processes at most 5 jobs per tick.
- Uses one BullMQ worker concurrency slot.
- Stops after a short serverless-safe timeout.
- Does not run infinite loops.
- Logs jobs processed, jobs failed, duration, and queue names.

Supported job types are the existing ingestion jobs:

- `crawlWebsite`
- `processCrawlPage`
- `chunkDocument`
- `generateEmbeddingsForSource`
- `generateEmbeddingForChunk`

Limitations:

- Not suitable for heavy crawling.
- Not suitable for long-running crawl or embedding jobs.
- Good for MVP testing, light ingestion, and keeping small queues moving.
- External workers are still required for scale, predictable throughput, and long jobs.

Required environment variables:

- `REDIS_URL`
- `WORKER_CRON_SECRET`
- `CRON_SECRET` set to the same value in Vercel so Vercel Cron sends the expected bearer token.

