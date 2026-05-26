# Deployment Architecture

Production is split into two deployable services plus managed Azure infrastructure:

- GitHub hosts the source repository and runs CI.
- Vercel runs only the Next.js application layer: frontend, server components, and API routes.
- Azure Database for PostgreSQL Flexible Server stores relational data and future pgvector indexes.
- Azure Cache for Redis backs BullMQ.
- Azure Blob Storage stores raw crawl HTML and processed text artifacts.
- Azure Container Apps runs the isolated background worker service.
- Azure Key Vault stores production secrets.

Docker is used in two places only:

- Local development, through `docker-compose.yml`.
- Azure Container Apps deployment, through `Dockerfile.worker`.

The crawler, embedding, and queue workers must not run on Vercel. They are long-running background services with outbound crawling, retries, rate limits, queue consumers, blob writes, and embedding calls. Deploy them as Azure Container Apps from `Dockerfile.worker`.

Companion docs:

- `docs/azure-container-apps.md`
- `docs/azure-env-checklist.md`

## GitHub Repository

1. Create a private GitHub repository.
2. Push the project to `main`.
3. Confirm `.github/workflows/frontend-ci.yml` and `.github/workflows/worker-ci.yml` run on push and pull request.
4. Store deployment credentials as GitHub Actions secrets only if you later add automated deployments. The current workflow validates code but does not deploy.

CI is intentionally split:

- `.github/workflows/frontend-ci.yml` validates the Vercel-hosted Next.js app.
- `.github/workflows/worker-ci.yml` validates the worker service and builds the worker container image.
- `.github/workflows/frontend-deploy.yml` is a manual Vercel deployment path for the Next.js app.
- `.github/workflows/worker-deploy.yml` is a manual Azure Container Apps deployment path for the worker image.

Frontend CI performs install, Prisma generation, lint, typecheck, test, Prisma validate, and Next.js build.

Worker CI performs install, Prisma generation, typecheck, test, Prisma validate, and worker Docker image build.

Deployment workflows are manual by default so teams can wire environment approvals, protected branches, and release tagging without coupling frontend and worker releases.

## Vercel

Deploy the web/API project to Vercel from GitHub.

Required Vercel environment variables:

```bash
DATABASE_URL="postgresql://app_user:<password>@<pg-server>.postgres.database.azure.com:5432/enterprise_ai_saas?schema=public&sslmode=require"
AUTH_SECRET="<long-random-secret>"
AUTH_URL="https://app.example.com"
NEXT_PUBLIC_APP_URL="https://app.example.com"
REDIS_URL="rediss://:<access-key>@<redis-name>.redis.cache.windows.net:6380"
AZURE_STORAGE_CONNECTION_STRING="<blob-connection-string>"
AZURE_STORAGE_CONTAINER_NAME="enterprise-ai-saas-production"
OPENAI_API_KEY="<openai-api-key>"
OPENAI_CHAT_MODEL="gpt-4o-mini"
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
```

Notes:

- Vercel API routes enqueue crawl jobs but do not process them.
- Vercel must not build or run `Dockerfile.worker`.
- Run Prisma migrations from CI/CD or an operator workstation, not inside Vercel serverless requests.
- Keep `AUTH_URL` aligned with the production domain.
- Optional manual GitHub deployment uses `frontend-deploy.yml` and requires `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` secrets.

## Azure Database for PostgreSQL Flexible Server

Use Azure Database for PostgreSQL Flexible Server for production.

Requirements:

- PostgreSQL 16 recommended.
- Enable the `vector` extension before future embedding work.
- Require SSL connections.
- Restrict firewall/network access to Vercel outbound access strategy and Azure Container Apps environment where possible.
- Use a dedicated application user, not the server admin user.

After provisioning, run:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Then run migrations:

```bash
DATABASE_URL="postgresql://app_user:<password>@<pg-server>.postgres.database.azure.com:5432/enterprise_ai_saas?schema=public&sslmode=require" \
npm run prisma:migrate -- --name deploy
```

For production release flows, prefer:

```bash
npx prisma migrate deploy
```

## Azure Cache for Redis

Use Azure Cache for Redis for BullMQ.

Required app/worker variable:

```bash
REDIS_URL="rediss://:<access-key>@<redis-name>.redis.cache.windows.net:6380"
```

Notes:

- Use TLS with `rediss://`.
- The Next.js app needs Redis only to enqueue jobs.
- Azure Container Apps workers need Redis to consume jobs.
- Monitor queue length and failed jobs before increasing worker concurrency.

## Azure Blob Storage

Use Azure Blob Storage for crawl artifacts.

Required variables:

```bash
AZURE_STORAGE_CONNECTION_STRING="<connection-string>"
AZURE_STORAGE_CONTAINER_NAME="enterprise-ai-saas-production"
```

Current stored artifacts:

- `raw/{organizationId}/{workspaceId}/{crawlId}/{pageId}.html`
- `processed/{organizationId}/{workspaceId}/{crawlId}/{pageId}.txt`

Recommended production settings:

- Private container access.
- Lifecycle policy for raw crawl artifacts if retention rules permit.
- Separate containers per environment.
- Store connection strings in Azure Key Vault.

## Azure Container Apps

Build and deploy the worker service from `Dockerfile.worker`.

The worker command is:

```bash
npm run worker:ingestion
```

Required worker environment variables:

```bash
DATABASE_URL="postgresql://app_user:<password>@<pg-server>.postgres.database.azure.com:5432/enterprise_ai_saas?schema=public&sslmode=require"
REDIS_URL="rediss://:<access-key>@<redis-name>.redis.cache.windows.net:6380"
AZURE_STORAGE_CONNECTION_STRING="<blob-connection-string>"
AZURE_STORAGE_CONTAINER_NAME="enterprise-ai-saas-production"
OPENAI_API_KEY="<openai-api-key>"
INGESTION_WORKER_CONCURRENCY="3"
CRAWL_CHUNK_SIZE="1200"
CRAWL_CHUNK_OVERLAP="180"
EMBEDDING_JOB_MAX_CHUNKS="1000"
```

Deployment shape:

- One Azure Container App for the worker service.
- Scale min replicas to `0` or `1` depending on latency requirements.
- Scale max replicas based on Redis queue depth.
- Give workers outbound internet access for lawful public crawling.
- Do not expose the worker publicly.
- Use the worker pipeline, not the frontend pipeline, to build/publish worker images.
- Optional manual GitHub deployment uses `worker-deploy.yml` and requires `AZURE_CREDENTIALS`, `ACR_NAME`, `ACR_LOGIN_SERVER`, `AZURE_CONTAINER_APP_NAME`, and `AZURE_RESOURCE_GROUP` secrets.

See `docs/azure-container-apps.md` for the focused worker deployment checklist.

## Azure Key Vault

Store production secrets in Azure Key Vault:

- `DATABASE_URL`
- `REDIS_URL`
- `AUTH_SECRET`
- `AZURE_STORAGE_CONNECTION_STRING`
- `OPENAI_API_KEY`

Use managed identity for Azure Container Apps where possible. For Vercel, mirror required secrets into Vercel environment variables or integrate through your approved secret sync process.

See `docs/azure-env-checklist.md` for the full environment variable checklist.

## Local Development

Local Docker Compose mirrors Azure managed services as closely as practical:

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

Or run the worker as a local container, matching Azure Container Apps more closely:

```bash
docker compose --profile worker up --build worker
```

Use:

```bash
AZURE_STORAGE_CONNECTION_STRING="UseDevelopmentStorage=true"
AZURE_STORAGE_CONTAINER_NAME="enterprise-ai-saas"
```

## pgvector and RAG

Phase 3 adds `ChunkEmbedding.vector` as a pgvector column and creates an HNSW cosine index in `prisma/migrations/20260526000000_phase3_embeddings_rag/migration.sql`.

Local and Azure PostgreSQL both need:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Similarity search uses cosine distance:

```sql
ORDER BY "vector" <=> $queryVector
```

The application filters every retrieval query by both `organizationId` and `workspaceId`.
