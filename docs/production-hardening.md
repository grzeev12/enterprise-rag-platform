# Production Hardening Guide

Phase 7 adds production-readiness scaffolding without changing the application architecture. The low-cost MVP can use Vercel, Neon, Upstash-compatible Redis, and Azure Blob Storage; Azure remains the enterprise migration target.

## Security

- Middleware applies CSP, HSTS, frame, referrer, and content-type headers.
- Requests receive `x-request-id` and `x-correlation-id` headers.
- API responses and logs pass through secret redaction helpers.
- Upload validation scaffolds enforce filename, MIME type, and size limits before document ingestion is enabled.
- Retrieved RAG context is wrapped as untrusted source content to reduce prompt injection risk.
- SSRF protection blocks private, link-local, metadata, multicast, benchmark, and reserved ranges.

## Governance

Organization-level governance records are scaffolded:

- `FeatureFlag`
- `OrganizationAiPolicy`
- `DataRetentionPolicy`
- `ComplianceSetting`

The `/api/governance/[organizationId]` endpoint exposes admin-only read/update scaffolding. User export/delete requests are audit-only scaffolds until asynchronous workflows are implemented.

## Observability

- Structured logs include redaction and can carry request/correlation IDs.
- Health endpoints:
  - `/api/health/live`
  - `/api/health/ready`
- Queue health helpers expose waiting, active, delayed, completed, and failed job counts for future dashboards.
- The logger shape is OpenTelemetry and Azure Monitor ready: JSON events can be forwarded without parsing plain text.

## Resilience

- Retry and timeout helpers are available in `lib/resilience/retry.ts`.
- BullMQ failed jobs are retained for dead-letter inspection.
- Workers log job completion and failure events.
- Provider routing already skips circuit-open providers and uses fallback chains.

## Deployment Readiness

Vercel should run only the Next.js app. A separate worker runtime should run only the worker image. For the low-cost MVP, production secrets belong in Vercel environment variables and the worker host secret store. For Azure migration, use Azure Container Apps secrets, Azure Key Vault, or GitHub Actions secrets.

Before production release:

- Apply Prisma migrations to Neon PostgreSQL for the MVP, or Azure PostgreSQL after migration.
- Confirm pgvector is enabled.
- Confirm Redis uses TLS and is BullMQ-compatible if using Upstash.
- Confirm object storage container/bucket exists.
- Confirm worker ingress is disabled.
- Confirm Vercel build uses `npm run build`, which regenerates Prisma Client.
- Confirm `/api/health/ready` is healthy after secrets are configured.

## Rollback

- Roll back Vercel to the previous deployment for frontend/API issues.
- Roll back the worker host to the previous worker image tag for worker issues.
- After Azure migration, roll back Azure Container Apps to the previous worker image tag.
- Database migrations should be reviewed before production; create explicit down/rollback SQL for destructive changes.
- Keep failed BullMQ jobs for replay or inspection before purging queues.
