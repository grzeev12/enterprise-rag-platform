# Cost-Optimized MVP Architecture

The MVP should stay cheap while preserving clean migration paths to Azure.

## Recommended MVP Stack

- Vercel: Next.js app, API routes, server components, and streaming chat.
- Neon PostgreSQL: relational data plus pgvector indexes.
- Upstash Redis: queue transport only if the selected plan supports BullMQ-compatible Redis protocol connections.
- Azure Blob Storage: implemented object storage driver for crawl artifacts.
- Cloudflare R2: future low-cost object storage option through the provider adapter boundary.
- Small worker host: a separate always-on container/VM process running `npm run worker:ingestion`.

## Why This Shape

- Vercel keeps the web/API deployment simple and cheap.
- Neon avoids running a managed database server before enterprise traffic exists.
- Upstash can reduce Redis cost for early usage, but BullMQ compatibility must be tested with the actual plan.
- A small worker runtime prevents long-running crawler and embedding jobs from fighting Vercel serverless limits.
- The app still uses standard `DATABASE_URL`, `REDIS_URL`, and object storage abstractions, so Azure migration is a configuration and deployment change rather than an architecture rewrite.

## BullMQ and Upstash Decision

BullMQ is the current queue implementation. It expects a Redis protocol endpoint, not an HTTP-only REST API.

Use Upstash only if:

- `REDIS_URL` is a `rediss://` Redis protocol endpoint.
- BullMQ can create workers, delayed jobs, retries, and failed-job retention in staging.
- Queue depth and job latency stay acceptable under crawler/indexing load.

If this fails, keep the MVP cheap by choosing one of:

- A tiny managed Redis instance from another provider.
- Upstash QStash plus a new queue adapter that delivers signed HTTP jobs to a protected worker endpoint.
- Azure Cache for Redis only for queues, while the rest of the MVP remains Vercel plus Neon.

## Azure Migration Later

When enterprise requirements justify it:

- Move Neon to Azure Database for PostgreSQL Flexible Server with pgvector.
- Move Redis queues to Azure Cache for Redis.
- Deploy the worker image to Azure Container Apps.
- Move secrets into Azure Key Vault.
- Keep the same Prisma schema, BullMQ job names, and worker entrypoint.

## Cost Controls

- Keep worker concurrency low by default.
- Limit crawl pages, crawl depth, response size, and embedding batch size.
- Use lifecycle policies for raw crawl artifacts.
- Track token usage before enabling larger models.
- Keep staging data small and isolated from production.
