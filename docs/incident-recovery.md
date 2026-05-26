# Incident Recovery Notes

## App Degradation

1. Check Vercel deployment health and recent build logs.
2. Check `/api/health/live` and `/api/health/ready`.
3. Inspect structured logs by `x-correlation-id`.
4. Roll back Vercel if the issue started after a frontend/API deploy.

## Worker Degradation

1. Check the active worker host status. For the low-cost MVP this may be a small container/VM service; after migration it is Azure Container Apps.
2. Review worker logs for `worker.job_failed` events.
3. Inspect BullMQ failed jobs; failed jobs are retained as the dead-letter scaffold.
4. Scale workers only after Redis and PostgreSQL are healthy.
5. Roll back the worker image tag if failures started after a worker deploy.

## AI Provider Degradation

1. Use the LLM gateway health check.
2. Disable a degraded provider or open its circuit.
3. Confirm fallback chain contains an enabled model.
4. Review FinOps usage to detect runaway retries.

## Data Requests

Export/delete user data endpoints are audit scaffolds. Before enabling automation, verify legal hold, retention policy, and workspace membership scope.
