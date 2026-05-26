# Deployment Architecture

Production is split into two deployable services plus managed infrastructure:

- GitHub hosts the source repository and runs CI.
- Vercel runs only the Next.js application layer: frontend, server components, and API routes.
- Neon PostgreSQL with pgvector is the low-cost MVP production database.
- Upstash Redis is the low-cost Redis option if the selected plan supports the Redis protocol required by BullMQ.
- Azure Blob Storage is the implemented object storage driver; Cloudflare R2 is a low-cost S3-compatible option for a future adapter.
- A separate worker runtime runs `Dockerfile.worker`; Azure Container Apps remains the future scale-up target.

The deployment plan is provider-agnostic at the app boundary:

- `DATABASE_URL` can point to local Postgres, Neon, or Azure PostgreSQL.
- `REDIS_URL` can point to local Redis, Upstash Redis, or Azure Cache for Redis.
- `OBJECT_STORAGE_PROVIDER` selects the object storage adapter. `azure-blob` is implemented. `cloudflare-r2` is documented and scaffolded for a future adapter.

The crawler, embedding, and queue workers must not run on Vercel. They are long-running background services with outbound crawling, retries, rate limits, queue consumers, blob writes, and embedding calls.

Companion docs:

- `docs/cost-optimized-mvp.md`
- `docs/infrastructure.md`
- `docs/azure-container-apps.md`
- `docs/azure-env-checklist.md`

## GitHub Repository

1. Push the project to `main`.
2. Confirm `.github/workflows/ci.yml`, `.github/workflows/frontend-ci.yml`, and `.github/workflows/worker-ci.yml` run on push and pull request.
3. Store production credentials as GitHub Actions secrets, never in local `.env.local` files.

CI is intentionally split:

- `.github/workflows/ci.yml` is the cloud-only default CI path and runs without production secrets.
- `.github/workflows/frontend-ci.yml` validates the Vercel-hosted Next.js app.
- `.github/workflows/worker-ci.yml` validates the worker service and builds the worker container image.
- `.github/workflows/production-db-migrate.yml` manually deploys Prisma migrations to Neon.
- `.github/workflows/production-verification.yml` manually verifies production readiness against Neon.
- `.github/workflows/frontend-deploy.yml` is a manual Vercel deployment path for the Next.js app.
- `.github/workflows/worker-deploy.yml` is a manual Azure Container Apps deployment path for the worker image when the project migrates to Azure-managed workers.

Default CI performs checkout, dependency install, Prisma generation, Prisma validation, typecheck, lint, tests, and a Next.js build with blank optional infrastructure variables.

Production migration and deployment workflows are manual by default so teams can wire environment approvals, protected branches, and release tagging without coupling frontend and worker releases.

## GitHub Secrets

Production operations run in GitHub Actions using GitHub Secrets. Developers should not need a local `.env.local` for production verification, migrations, or deployment checks.

Required GitHub Secrets:

```bash
DATABASE_URL="<neon-production-url>"
NEXTAUTH_SECRET="<production-auth-secret>"
OPENAI_API_KEY="<production-openai-api-key>"
```

Optional GitHub Secrets:

```bash
NEXTAUTH_URL="https://app.example.com"
REDIS_URL="rediss://default:<upstash-password>@<upstash-host>:6379"
OBJECT_STORAGE_PROVIDER="azure-blob"
OBJECT_STORAGE_CONTAINER="enterprise-ai-saas-production"
AZURE_STORAGE_CONNECTION_STRING="<blob-connection-string>"
AZURE_STORAGE_CONTAINER_NAME="enterprise-ai-saas-production"
R2_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"
R2_ACCESS_KEY_ID="<r2-access-key>"
R2_SECRET_ACCESS_KEY="<r2-secret-key>"
```

Safety rules:

- Never echo secrets in workflow steps.
- Mask secrets before running commands that may include environment details.
- Do not run migrations on every push.
- Run `Production DB Migrate` manually after review.
- Use GitHub environment approvals for the `production` environment.

## Cloud-Only Production Workflows

`CI` runs on pull requests and pushes to `main` without production secrets. It intentionally uses a placeholder `DATABASE_URL` for Prisma schema validation and blank optional infrastructure env vars for build-time safety.

`Production DB Migrate` is manual only. It:

- requires `DATABASE_URL` from GitHub Secrets
- runs Prisma generate
- runs `prisma migrate deploy`
- verifies pgvector through the production smoke-check script
- runs a safe database connectivity check without printing the URL

`Production Verification` is manual only. It:

- requires `DATABASE_URL`, `NEXTAUTH_SECRET`, and `OPENAI_API_KEY`
- runs Prisma validation
- runs tenant-aware smoke checks
- builds with production-like env values
- verifies required env presence without printing secret values

## Vercel

Deploy the web/API project to Vercel from GitHub.

Required low-cost MVP Vercel environment variables:

```bash
DATABASE_URL="postgresql://<user>:<password>@<neon-host>/<database>?sslmode=require"
AUTH_SECRET="<long-random-secret>"
AUTH_URL="https://app.example.com"
NEXT_PUBLIC_APP_URL="https://app.example.com"
REDIS_URL="rediss://default:<upstash-password>@<upstash-host>:6379"
OBJECT_STORAGE_PROVIDER="azure-blob"
OBJECT_STORAGE_CONTAINER="enterprise-ai-saas-production"
AZURE_STORAGE_CONNECTION_STRING="<blob-connection-string>"
OPENAI_API_KEY="<openai-api-key>"
OPENAI_CHAT_MODEL="gpt-4o-mini"
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
```

Notes:

- Vercel runtime env vars are configured separately from GitHub Secrets.
- Vercel should have `DATABASE_URL`, `NEXTAUTH_SECRET` or `AUTH_SECRET`, `NEXTAUTH_URL` or `AUTH_URL`, `OPENAI_API_KEY`, and any optional Redis/object-storage variables used at runtime.
- Vercel API routes enqueue crawl/index jobs but do not process them.
- Vercel must not build or run `Dockerfile.worker`.
- Run Prisma migrations from CI/CD or an operator workstation, not inside Vercel serverless requests.
- Keep `AUTH_URL` aligned with the production domain.

## Neon PostgreSQL

Use Neon PostgreSQL for the low-cost MVP database.

Requirements:

- PostgreSQL version with pgvector support.
- SSL required in the connection string.
- A pooled URL can be used for serverless app/API access if compatible with Prisma migrations; use the direct URL for migrations when Neon recommends it.
- Keep tenant isolation in application queries; Neon is a shared production database for all tenants.

Recommended connection usage:

- Vercel app runtime: use the Neon pooled connection string when available.
- Worker runtime: use the same pooled runtime URL unless long-running worker load requires a direct URL.
- Migrations: use Neon's direct connection string when possible, because migration locks and extension DDL are safer outside a transaction-pooled connection.

Enable pgvector before applying migrations:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Verify pgvector:

```sql
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
```

Run migrations without printing the secret:

```bash
DATABASE_URL="$NEON_DATABASE_URL" npx prisma migrate deploy
```

Validate Prisma against Neon:

```bash
DATABASE_URL="$NEON_DATABASE_URL" npx prisma validate
```

Build against the real production database URL:

```bash
DATABASE_URL="$NEON_DATABASE_URL" npm run build
```

Tenant verification checklist after migration:

```sql
SELECT COUNT(*) FROM "Organization";
SELECT COUNT(*) FROM "Workspace";
SELECT COUNT(*) FROM "Membership";
SELECT COUNT(*) FROM "AuditLog";
```

Application-level verification should use authenticated API/UI checks so every organization and workspace query still passes through membership filters. Do not run broad production data dumps in the terminal.

## Upstash Redis and BullMQ

Use Upstash Redis only when the selected Upstash product/plan exposes a Redis protocol endpoint compatible with BullMQ and ioredis-style connections.

Required app/worker variable:

```bash
REDIS_URL="rediss://default:<upstash-password>@<upstash-host>:6379"
```

BullMQ compatibility notes:

- BullMQ expects a Redis-compatible TCP connection and uses blocking/job coordination commands.
- Upstash REST APIs are not a drop-in BullMQ backend.
- Serverless Redis products can have connection, latency, command, or eviction limits that are acceptable for an MVP but should be load-tested before production customer onboarding.
- Keep failed jobs retained and monitor queue depth closely.

If BullMQ is not compatible with the chosen Upstash tier, use one of these alternatives:

- Run a tiny managed Redis instance from another low-cost host for the worker queue.
- Use Upstash QStash for HTTP-delivered jobs and add a queue adapter that maps ingestion jobs to signed worker endpoints.
- Move the worker queue directly to Azure Cache for Redis while keeping Neon and Vercel for the rest of the MVP.

## Object Storage

The current implemented object storage adapter is Azure Blob Storage, selected with:

```bash
OBJECT_STORAGE_PROVIDER="azure-blob"
OBJECT_STORAGE_CONTAINER="enterprise-ai-saas-production"
AZURE_STORAGE_CONNECTION_STRING="<blob-connection-string>"
```

Current stored artifacts:

- `raw/{organizationId}/{workspaceId}/{crawlId}/{pageId}.html`
- `processed/{organizationId}/{workspaceId}/{crawlId}/{pageId}.txt`

Cloudflare R2 is a valid low-cost target, but it requires a future S3-compatible adapter before enabling in production:

```bash
OBJECT_STORAGE_PROVIDER="cloudflare-r2"
OBJECT_STORAGE_CONTAINER="enterprise-ai-saas-production"
R2_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"
R2_ACCESS_KEY_ID="<r2-access-key>"
R2_SECRET_ACCESS_KEY="<r2-secret-key>"
```

Recommended production settings:

- Private buckets/containers only.
- Separate buckets/containers per environment.
- Lifecycle policies for raw crawl artifacts if retention rules permit.
- Secrets stored in Vercel, worker-host secrets, or Azure Key Vault after migration.

## Worker Runtime

The worker command is:

```bash
npm run worker:ingestion
```

For the low-cost MVP, run the worker as a separate service on a small always-on container/VM platform. It must receive the same `DATABASE_URL`, `REDIS_URL`, object storage variables, and OpenAI variables as the app, plus worker tuning variables:

```bash
INGESTION_WORKER_CONCURRENCY="3"
CRAWL_CHUNK_SIZE="1200"
CRAWL_CHUNK_OVERLAP="180"
EMBEDDING_JOB_MAX_CHUNKS="1000"
```

Deployment rules:

- Do not expose the worker publicly unless you intentionally implement an HTTP queue adapter such as QStash.
- Give workers outbound internet access for lawful public crawling.
- Scale worker count only after Redis and PostgreSQL are healthy.
- Keep the worker pipeline separate from the Vercel pipeline.

## Azure Migration Path

Azure readiness is preserved. When the MVP outgrows low-cost services:

- Replace Neon with Azure Database for PostgreSQL Flexible Server.
- Replace Upstash or alternate Redis with Azure Cache for Redis.
- Keep Azure Blob Storage or migrate object storage through the provider adapter boundary.
- Deploy `Dockerfile.worker` to Azure Container Apps.
- Move production secrets to Azure Key Vault.

Azure production equivalents:

```bash
DATABASE_URL="postgresql://app_user:<password>@<pg-server>.postgres.database.azure.com:5432/enterprise_ai_saas?schema=public&sslmode=require"
REDIS_URL="rediss://:<access-key>@<redis-name>.redis.cache.windows.net:6380"
OBJECT_STORAGE_PROVIDER="azure-blob"
OBJECT_STORAGE_CONTAINER="enterprise-ai-saas-production"
AZURE_STORAGE_CONNECTION_STRING="<blob-connection-string>"
```

See `docs/azure-container-apps.md` and `docs/azure-env-checklist.md` for the focused Azure checklist.

## Local Development

Local Docker Compose mirrors production service categories as closely as practical:

- Postgres with pgvector image
- Redis
- Azurite Blob Storage emulator
- Optional worker service built from `Dockerfile.worker`

Start local infrastructure:

```bash
docker compose up -d
```

Run the worker directly on the host:

```bash
npm run worker:dev
```

Or run the worker as a local container:

```bash
docker compose --profile worker up --build worker
```

Use:

```bash
OBJECT_STORAGE_PROVIDER="azure-blob"
OBJECT_STORAGE_CONTAINER="enterprise-ai-saas"
AZURE_STORAGE_CONNECTION_STRING="UseDevelopmentStorage=true"
AZURE_STORAGE_CONTAINER_NAME="enterprise-ai-saas"
```

## pgvector and RAG

Phase 3 adds `ChunkEmbedding.vector` as a dimensioned `vector(1536)` pgvector column and creates an HNSW cosine index in `prisma/migrations/20260526000000_phase3_embeddings_rag/migration.sql`.

Local, Neon, and Azure PostgreSQL all need:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Similarity search uses cosine distance:

```sql
ORDER BY "vector" <=> $queryVector
```

The default embedding model is OpenAI `text-embedding-3-small`, which produces 1536-dimensional vectors. Keep this env value aligned with the database column and index:

```bash
OPENAI_EMBEDDING_DIMENSIONS="1536"
```

The application filters every retrieval query by both `organizationId` and `workspaceId`.

## Failed Neon Migration Recovery

If Neon recorded `20260526000000_phase3_embeddings_rag` as failed with `ERROR: type "AuditAction" does not exist` or `ERROR: column does not have dimensions`, do not reset or drop the production database.

The `AuditAction` error means the database started from a migration history that was missing the Phase 1/2 baseline. The dimension error means the embedding column was created as bare `vector` before the HNSW index was created; the migration now uses `vector(1536)`.

Use the dedicated recovery workflow only when all of these are true:

- Neon reports Prisma error `P3009`.
- The failed migration is `20260526000000_phase3_embeddings_rag`.
- The failure happened before the migration completed successfully.
- You have reviewed the migration logs and confirmed that no production reset or destructive action is needed.

Recovery flow after deploying the migration fix:

1. Open GitHub Actions.
2. Confirm the `DATABASE_URL` GitHub Secret points at the intended Neon production database. Prefer the direct Neon URL for migrations when available.
3. Run the manual `Production Migration Resolve` workflow.
4. Enter `ROLLBACK_FAILED_PHASE3` when prompted for confirmation.
5. The workflow runs `prisma migrate resolve --rolled-back 20260526000000_phase3_embeddings_rag`, then `prisma migrate deploy`.
6. Run the manual `Production Verification` workflow.

Equivalent operator command, if a break-glass environment already has `DATABASE_URL` injected without printing it:

```bash
npx prisma migrate resolve --rolled-back 20260526000000_phase3_embeddings_rag
npx prisma migrate deploy
```

If `migrate deploy` then reports that early Phase 3 objects already exist, the failed attempt left partial DDL behind. The Phase 3 migration now safely tolerates pre-created Phase 3 enum types and `DocumentChunk` embedding columns. Do not drop tables or data. Escalate before manually removing any database object.
