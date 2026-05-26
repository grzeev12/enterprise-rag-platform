# Infrastructure Abstractions

The platform should depend on provider-neutral contracts and environment variables where possible. This keeps the low-cost MVP portable and preserves Azure readiness.

## Database

Application contract:

```bash
DATABASE_URL
```

Supported targets:

- Local Docker Postgres with pgvector.
- Neon PostgreSQL with pgvector for low-cost MVP production.
- Azure Database for PostgreSQL Flexible Server with pgvector for enterprise deployment.

Provider-specific behavior should stay outside application code. Prisma reads only `DATABASE_URL`.

## Queue

Application contract:

```bash
REDIS_URL
```

Current implementation:

- BullMQ using Redis protocol connections.

Supported targets:

- Local Docker Redis.
- Upstash Redis if BullMQ-compatible for the selected plan.
- Azure Cache for Redis for enterprise deployment.

Future queue adapter extension point:

- Keep job payloads stable.
- Introduce a `QUEUE_PROVIDER` only when adding a non-Redis backend such as Upstash QStash.
- Map existing jobs (`crawlWebsite`, `processCrawlPage`, `chunkDocument`, `generateEmbeddingsForSource`, `generateEmbeddingForChunk`) to the new provider.

## Object Storage

Application contract:

```bash
OBJECT_STORAGE_PROVIDER
OBJECT_STORAGE_CONTAINER
```

Implemented provider:

- `azure-blob`

Azure Blob compatibility variables:

```bash
AZURE_STORAGE_CONNECTION_STRING
AZURE_STORAGE_CONTAINER_NAME
```

Scaffolded future provider:

- `cloudflare-r2`

R2 variables reserved for the future adapter:

```bash
R2_ENDPOINT
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
```

Do not enable `OBJECT_STORAGE_PROVIDER="cloudflare-r2"` in production until an S3-compatible adapter is implemented and tested.

## Workers

Application contract:

- The Vercel app enqueues jobs.
- A separate worker runtime consumes jobs.
- The same `Dockerfile.worker` should run on any container host.

Low-cost MVP targets:

- Small always-on container/VM platform.
- Manual process manager on a small VM for early internal demos.

Enterprise target:

- Azure Container Apps with private ingress disabled and queue-based scaling.

## Secrets

Low-cost MVP:

- Vercel environment variables for app-layer secrets.
- Worker-host secret store for worker variables.

Enterprise:

- Azure Key Vault as source of truth.
- Vercel receives only app-layer mirrored secrets.
- Azure Container Apps reads worker secrets through managed identity or Key Vault references.
