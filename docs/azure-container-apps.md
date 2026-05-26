# Azure Container Apps Worker Deployment Guide

The worker service is deployed separately from Vercel. It consumes BullMQ jobs from Azure Cache for Redis, writes crawl artifacts to Azure Blob Storage, and talks to Azure PostgreSQL.

## Build Target

Use the worker Dockerfile only:

```bash
docker build -f Dockerfile.worker -t <acr-login-server>/enterprise-ai-saas-worker:<tag> .
```

Do not use this Dockerfile for Vercel.

## Required Azure Resources

- Azure Container Apps environment
- Azure Container Registry
- Azure Database for PostgreSQL Flexible Server with pgvector enabled
- Azure Cache for Redis with TLS
- Azure Blob Storage container
- Azure Key Vault for secrets

## Required Container App Settings

Set these as Container App secrets or Key Vault references:

```bash
DATABASE_URL
REDIS_URL
AZURE_STORAGE_CONNECTION_STRING
AZURE_STORAGE_CONTAINER_NAME
OPENAI_API_KEY
OPENAI_CHAT_MODEL
OPENAI_EMBEDDING_MODEL
INGESTION_WORKER_CONCURRENCY
CRAWL_CHUNK_SIZE
CRAWL_CHUNK_OVERLAP
EMBEDDING_JOB_MAX_CHUNKS
```

## Runtime Shape

- Ingress: disabled
- Command: image default command
- Public endpoint: none
- Min replicas: `0` or `1`
- Max replicas: based on queue volume
- Scaling signal: Redis queue length, when configured

## Manual GitHub Deployment

Use `.github/workflows/worker-deploy.yml`.

Required GitHub secrets:

```bash
AZURE_CREDENTIALS
ACR_NAME
ACR_LOGIN_SERVER
AZURE_CONTAINER_APP_NAME
AZURE_RESOURCE_GROUP
```

The workflow builds `Dockerfile.worker`, pushes the image to ACR, and updates only the Azure Container App worker.
