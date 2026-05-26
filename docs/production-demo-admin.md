# Production Demo Admin

Use this only when a temporary production demo login is intentionally needed.

Workflow:

```bash
.github/workflows/production-demo-admin.yml
```

Required GitHub Secrets:

```bash
DATABASE_URL
DEMO_ADMIN_PASSWORD
```

Set `DEMO_ADMIN_PASSWORD` to the temporary password agreed for production testing. The password is never committed and is hashed with the same bcrypt logic used by the credentials auth provider.

Manual usage:

1. Run `Production Demo Admin` with `mode=check`.
2. If the output shows `exists: false` or `hasPasswordHash: false`, run it again with `mode=seed`.
3. Run it once more with `mode=verify-password`.
4. Confirm the output shows:

```json
{
  "exists": true,
  "hasPasswordHash": true,
  "active": true,
  "organizationOwner": true,
  "workspaceAdmin": true,
  "passwordMatches": true
}
```

The seed path is idempotent. It upserts:

- `demo@example.com`
- `Demo Organization`
- `Demo Workspace`
- organization `owner` role membership
- workspace `workspace-admin` role membership

Do not use this workflow to manage permanent customer or staff accounts.
