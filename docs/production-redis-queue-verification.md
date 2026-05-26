# Production Redis Queue Verification

Before deploying production workers, run the manual GitHub Actions workflow `Production Redis Queue Verify`.

The workflow uses the `REDIS_URL` GitHub Secret and masks the value before any verification step runs. It does not print Redis credentials, host credentials, cookies, tokens, or application secrets.

The verifier checks:

- `REDIS_URL` exists in GitHub Secrets.
- `REDIS_URL` uses `redis://` or `rediss://`.
- Redis accepts a protocol connection.
- BullMQ can create a temporary queue.
- BullMQ can enqueue one harmless verification job.
- A temporary worker can process that job.
- Queue counts can be inspected.
- The temporary queue can be removed.

Upstash is compatible only when `REDIS_URL` is a Redis TCP/TLS URL, usually `rediss://...`. Upstash REST URLs and QStash URLs are HTTP services and are not BullMQ backends.

If the workflow fails for an Upstash endpoint, use one of these fixes:

- Switch `REDIS_URL` to the Upstash Redis protocol endpoint.
- Use Azure Cache for Redis for BullMQ while keeping the low-cost MVP app stack.
- Add a separate queue adapter for Upstash QStash HTTP-delivered jobs.
- Use another small BullMQ-compatible managed Redis provider for the worker queue.

