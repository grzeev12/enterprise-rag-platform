# Environment Variables Checklist

For the low-cost MVP, store app-layer secrets in Vercel and worker secrets in the worker host. For enterprise Azure migration, use Azure Key Vault as the source of truth and mirror only the required app-layer values into Vercel.

## Low-Cost MVP Shared Values

Used by both Vercel and the worker:

```bash
DATABASE_URL="postgresql://<user>:<password>@<neon-host>/<database>?sslmode=require"
REDIS_URL="rediss://default:<upstash-password>@<upstash-host>:6379"
OBJECT_STORAGE_PROVIDER="azure-blob"
OBJECT_STORAGE_CONTAINER="enterprise-ai-saas-production"
AZURE_STORAGE_CONNECTION_STRING="<blob-storage-connection-string>"
OPENAI_API_KEY="<openai-api-key>"
OPENAI_CHAT_MODEL="gpt-4o-mini"
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
```

If Cloudflare R2 is implemented later:

```bash
OBJECT_STORAGE_PROVIDER="cloudflare-r2"
OBJECT_STORAGE_CONTAINER="enterprise-ai-saas-production"
R2_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"
R2_ACCESS_KEY_ID="<r2-access-key>"
R2_SECRET_ACCESS_KEY="<r2-secret-key>"
```

## Azure Migration Shared Values

Used by both Vercel and the Azure Container Apps worker after migration:

```bash
DATABASE_URL="postgresql://app_user:<password>@<server>.postgres.database.azure.com:5432/enterprise_ai_saas?schema=public&sslmode=require"
REDIS_URL="rediss://:<access-key>@<redis>.redis.cache.windows.net:6380"
OBJECT_STORAGE_PROVIDER="azure-blob"
OBJECT_STORAGE_CONTAINER="enterprise-ai-saas-production"
AZURE_STORAGE_CONNECTION_STRING="<blob-storage-connection-string>"
AZURE_STORAGE_CONTAINER_NAME="enterprise-ai-saas-production"
OPENAI_API_KEY="<openai-api-key>"
OPENAI_CHAT_MODEL="gpt-4o-mini"
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
```

## Vercel Only

```bash
AUTH_SECRET="<long-random-secret>"
AUTH_URL="https://app.example.com"
NEXT_PUBLIC_APP_URL="https://app.example.com"
```

Vercel deploys only the Next.js app. It should not run the worker Dockerfile.

## Azure Container Apps Worker Only

```bash
INGESTION_WORKER_CONCURRENCY="3"
CRAWL_CHUNK_SIZE="1200"
CRAWL_CHUNK_OVERLAP="180"
EMBEDDING_JOB_MAX_CHUNKS="1000"
```

The worker has no public ingress and is deployed from `Dockerfile.worker`.

## GitHub Deployment Secrets

Frontend deployment:

```bash
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
```

Worker deployment:

```bash
AZURE_CREDENTIALS
ACR_NAME
ACR_LOGIN_SERVER
AZURE_CONTAINER_APP_NAME
AZURE_RESOURCE_GROUP
```
