# Enterprise AI SaaS Foundation

This project implements the multi-tenant SaaS foundation, safe website ingestion, embeddings, pgvector indexing, RAG chat, admin operations, FinOps, multi-LLM routing, and enterprise hardening scaffolds.

## Deployment Architecture

Low-cost MVP production targets:

- GitHub for source control and CI
- Vercel for only the Next.js application layer
- Neon PostgreSQL with pgvector for relational data and vector indexes
- Upstash Redis for queue transport when BullMQ compatibility is acceptable for the selected plan
- Azure Blob Storage or Cloudflare R2 for raw crawl HTML and processed text artifacts
- A small separate worker runtime for the isolated background worker service
- Vercel and worker-host environment secrets

Azure readiness is retained for enterprise migration:

- Azure Database for PostgreSQL Flexible Server can replace Neon later.
- Azure Cache for Redis can replace Upstash later.
- Azure Blob Storage remains the implemented object storage driver; Cloudflare R2 is scaffolded as a future S3-compatible adapter option.
- Azure Container Apps remains the recommended scale-up target for workers.
- Azure Key Vault remains the enterprise secret-management target.

Docker is used for local development and for packaging the worker image. The Next.js app enqueues ingestion and embedding jobs; workers do not run on Vercel. The worker service is packaged with [Dockerfile.worker](/Users/zeevgrinberg/Documents/Search/Dockerfile.worker) and can run on a low-cost worker host now, then move to Azure Container Apps later.

See [deployment docs](/Users/zeevgrinberg/Documents/Search/docs/deployment.md), [cost-optimized MVP architecture](/Users/zeevgrinberg/Documents/Search/docs/cost-optimized-mvp.md), [infrastructure abstraction notes](/Users/zeevgrinberg/Documents/Search/docs/infrastructure.md), [Azure Container Apps guide](/Users/zeevgrinberg/Documents/Search/docs/azure-container-apps.md), and [Azure environment checklist](/Users/zeevgrinberg/Documents/Search/docs/azure-env-checklist.md) for deployment setup.
See [production hardening](/Users/zeevgrinberg/Documents/Search/docs/production-hardening.md) and [incident recovery](/Users/zeevgrinberg/Documents/Search/docs/incident-recovery.md) for enterprise readiness notes.

## Cloud-Only Production Operations

Production validation and database operations run in GitHub Actions, not from a developer laptop. No local `.env.local` is required for production.

Required GitHub Secrets:

- `DATABASE_URL`: Neon production database URL. Prefer the direct URL for migrations if Neon provides both direct and pooled URLs.
- `NEXTAUTH_SECRET`: production Auth.js/NextAuth secret. The workflows map it to `AUTH_SECRET`.
- `OPENAI_API_KEY`: production OpenAI key for build-time/runtime readiness checks.

Optional GitHub Secrets:

- `NEXTAUTH_URL`
- `REDIS_URL`
- `OBJECT_STORAGE_PROVIDER`
- `OBJECT_STORAGE_CONTAINER`
- `AZURE_STORAGE_CONNECTION_STRING`
- `AZURE_STORAGE_CONTAINER_NAME`
- `R2_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

Workflows:

- `CI`: runs automatically on pull requests and pushes to `main`; it uses blank optional infrastructure values and does not require secrets.
- `Production DB Migrate`: manual only; runs `prisma migrate deploy`, verifies pgvector, and runs safe DB connectivity checks.
- `Production Verification`: manual only; validates Prisma, runs tenant-aware smoke checks, and builds with production-like env.

Vercel still needs runtime environment variables configured separately in the Vercel dashboard: `DATABASE_URL`, `NEXTAUTH_SECRET` or `AUTH_SECRET`, `NEXTAUTH_URL` or `AUTH_URL`, `OPENAI_API_KEY`, and optional Redis/object-storage variables.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui-style primitives
- Auth.js / NextAuth
- Prisma
- PostgreSQL with pgvector locally, Neon PostgreSQL for low-cost production, Azure PostgreSQL for enterprise scale-up
- Redis locally, Upstash Redis for low-cost production when BullMQ-compatible, Azure Cache for Redis for enterprise scale-up
- Provider-neutral object storage boundary, implemented with Azure Blob Storage and Azurite locally; Cloudflare R2 is scaffolded for a future adapter
- OpenAI-compatible AI Gateway foundation
- Docker Compose

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables:

```bash
cp .env.example .env
```

3. Start infrastructure:

```bash
docker compose up -d
```

4. Create the database schema:

```bash
npm run prisma:migrate -- --name init
```

5. Seed demo data:

```bash
npm run seed
```

6. Start the app:

```bash
npm run dev
```

7. Start the ingestion worker in a second terminal:

```bash
npm run worker:ingestion
```

To run the worker as a local container instead:

```bash
docker compose --profile worker up --build worker
```

Open http://localhost:3000.

## Demo Account

- Email: `demo@example.com`
- Password: `Password123!`

## Useful Commands

```bash
npm run prisma:generate
npm run typecheck
npm run build
npm run worker:ingestion
npm run build:worker-image
```

## Phase 1 Scope

Implemented:

- Email/password-ready Auth.js setup
- OAuth-ready Prisma auth models
- Organizations, workspaces, memberships, roles, permissions
- Tenant-aware access helpers
- RBAC permission helpers
- Protected dashboard shell
- Organization and workspace creation
- Audit logs for organization/workspace creation
- Docker Compose for Postgres, Redis, and Azurite
- Website knowledge sources
- Safe public URL validation
- Background website crawling through BullMQ
- robots.txt-aware crawl policy
- HTML text extraction and document chunking
- Crawl status and page result UI
- Embedding jobs and pgvector-backed chunk indexing
- Workspace-scoped RAG chat with streaming responses and citations

Enterprise scaffolds:

- Feature flags and organization AI policy records
- Data retention, export/delete request, and legal hold scaffolds
- Health/readiness endpoints
- CSP/security headers and secret-safe logging
- Rate limiting, retry, timeout, upload validation, and dead-letter scaffolds
- Azure Monitor/OpenTelemetry-ready structured logs

## Knowledge Ingestion Worker

Website crawling runs outside the request lifecycle using BullMQ and Redis.

The API creates a `Crawl` record, enqueues `crawlWebsite`, and returns immediately. The worker then:

1. Loads the workspace-scoped knowledge source.
2. Fetches and parses `robots.txt`.
3. Discovers URLs from the start page and sitemap when available.
4. Enqueues `processCrawlPage` jobs for allowed pages.
5. Extracts readable text into `Document` records.
6. Enqueues `chunkDocument` jobs.
7. Stores chunks in `DocumentChunk` for a later embedding/vector phase.

Run the worker with:

```bash
npm run worker:ingestion
```

## Crawler Safety Rules

The crawler is intentionally lawful and conservative:

- Only `http` and `https` URLs are accepted.
- localhost, `127.0.0.1`, `0.0.0.0`, private IP ranges, link-local IPs, cloud metadata IPs, and internal hostnames are blocked.
- DNS is resolved before crawling and private/internal addresses are rejected.
- Redirects are manually followed and revalidated.
- `robots.txt` disallow rules are respected.
- `crawl-delay` is honored when present.
- Crawls enforce max pages, max depth, response timeout, and response size limits.
- Only configured allowed domains are crawled.
- Excluded paths are skipped.
- CAPTCHAs, authentication, paywalls, bot protection, and blocked robots paths are not bypassed.

## Ingestion Environment Variables

```bash
REDIS_URL="redis://localhost:6379"
AZURE_STORAGE_CONNECTION_STRING="UseDevelopmentStorage=true"
AZURE_STORAGE_CONTAINER_NAME="enterprise-ai-saas"
OPENAI_API_KEY=""
OPENAI_CHAT_MODEL="gpt-4o-mini"
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
OPENAI_EMBEDDING_DIMENSIONS="1536"
RAG_TOP_K="8"
RAG_SCORE_THRESHOLD="0.25"
RAG_MAX_CONTEXT_CHARS="12000"
INGESTION_WORKER_CONCURRENCY="3"
CRAWL_CHUNK_SIZE="1200"
CRAWL_CHUNK_OVERLAP="180"
EMBEDDING_JOB_MAX_CHUNKS="1000"
```

## Embeddings and RAG Chat

Phase 3 adds an OpenAI-first AI Gateway foundation for:

- embeddings
- chat completion
- streaming chat completion

After crawling and chunking a website source, open the source page and use `Generate embeddings / index source`. The ingestion worker will enqueue embedding jobs, call the embedding provider, store vectors in PostgreSQL with pgvector, and record basic token usage.

Chat runs at `/chat`. The send flow is:

1. Store user message.
2. Embed the user query.
3. Retrieve top matching chunks using cosine similarity.
4. Build a grounded prompt.
5. Stream the assistant answer.
6. Store the assistant message, citations, AI request, and token usage.

Unknown answers return: `I could not find that in the available sources.`

Local/Neon/Azure PostgreSQL must enable pgvector:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

For Neon production, use the pooled connection string in Vercel and the direct connection string for migrations when Neon provides both. Verify pgvector before deployment with:

```sql
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
```

The Phase 3 SQL migration is:

```bash
prisma/migrations/20260526000000_phase3_embeddings_rag/migration.sql
```

Known limitations:

- OpenAI is the only implemented provider.
- Azure OpenAI, Anthropic, Gemini, Mistral, Cohere, and Groq are adapter-ready but not implemented.
- FinOps is limited to basic token usage records.
- Retry UI is scaffolded but not fully implemented.
- No advanced prompt governance or evals yet.

## CI and Deployment Pipelines

No production secrets should be committed. Use `.env.example` for names and placeholder values only; put real values in Vercel, the worker host, Azure Key Vault, Azure Container Apps secrets, or GitHub Actions secrets.

Frontend pipeline: `.github/workflows/frontend-ci.yml`

It validates the Vercel-hosted Next.js application layer:

- install
- Prisma generate
- lint
- typecheck
- test
- Prisma validate
- Next.js build

Frontend deployment pipeline: `.github/workflows/frontend-deploy.yml`

- manual Vercel deployment
- uses Vercel project secrets
- does not build or deploy worker containers

Worker pipeline: `.github/workflows/worker-ci.yml`

It validates the isolated worker service:

- install
- Prisma generate
- typecheck
- test
- Prisma validate
- worker Docker image build

Worker deployment pipeline: `.github/workflows/worker-deploy.yml`

- manual Azure Container Apps deployment path for future scale-up
- builds and pushes `Dockerfile.worker`
- updates only the worker Container App
