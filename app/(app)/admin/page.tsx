import Link from "next/link";
import { RetryAction } from "@/components/admin/retry-actions";
import { StatusBadge } from "@/components/knowledge/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminTenantWhere, getAdminScopes, resolveAdminScope } from "@/lib/admin";
import { isAiProviderConfigured } from "@/lib/ai/provider-config";
import { requireCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { readEnv } from "@/lib/env";
import { getQueueHealth, isQueueConfigured } from "@/lib/ingestion/queue";
import { isObjectStorageConfigured } from "@/lib/storage/blob";

type AdminPageProps = {
  searchParams: Promise<{
    organizationId?: string;
    workspaceId?: string;
  }>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const scopes = await getAdminScopes(user.id);
  const activeScope = resolveAdminScope(scopes, params.organizationId, params.workspaceId);

  if (!activeScope) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Admin dashboard</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Admin permissions are required to view tenant operations.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Access blocked</CardTitle>
            <CardDescription>Your account does not have owner or admin access.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const tenantWhere = adminTenantWhere(activeScope);
  const membershipWhere = activeScope.workspaceId
    ? { organizationId: activeScope.organizationId, workspaceId: activeScope.workspaceId, deletedAt: null }
    : { organizationId: activeScope.organizationId, deletedAt: null };

  const [
    stats,
    memberships,
    workspaces,
    sources,
    crawls,
    embeddingJobs,
    auditLogs,
    failedAiRequests,
    queueHealth
  ] = await Promise.all([
    getAdminStats(tenantWhere),
    prisma.membership.findMany({
      where: membershipWhere,
      include: { user: true, role: true, workspace: true },
      orderBy: { createdAt: "desc" },
      take: 25
    }),
    prisma.workspace.findMany({
      where: activeScope.workspaceId
        ? { organizationId: activeScope.organizationId, id: activeScope.workspaceId, deletedAt: null }
        : { organizationId: activeScope.organizationId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 25
    }),
    prisma.knowledgeSource.findMany({
      where: { ...tenantWhere, deletedAt: null },
      include: {
        workspace: true,
        crawls: { orderBy: { createdAt: "desc" }, take: 1 },
        embeddingJobs: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { pages: true, documents: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 25
    }),
    prisma.crawl.findMany({
      where: tenantWhere,
      include: { workspace: true, knowledgeSource: true },
      orderBy: { createdAt: "desc" },
      take: 25
    }),
    prisma.embeddingJob.findMany({
      where: tenantWhere,
      include: { workspace: true, knowledgeSource: true, document: true },
      orderBy: { createdAt: "desc" },
      take: 25
    }),
    prisma.auditLog.findMany({
      where: tenantWhere,
      include: { actor: true, workspace: true },
      orderBy: { createdAt: "desc" },
      take: 30
    }),
    prisma.aiRequest.findMany({
      where: { ...tenantWhere, status: "FAILED" },
      include: { user: true, workspace: true },
      orderBy: { createdAt: "desc" },
      take: 10
    }),
    getAdminQueueHealth()
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Admin dashboard</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tenant operations for {activeScope.organizationName}
            {activeScope.workspaceName ? ` / ${activeScope.workspaceName}` : ""}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {scopes.map((scope) => (
            <Button
              asChild
              key={`${scope.organizationId}:${scope.workspaceId ?? "org"}`}
              size="sm"
              variant={
                scope.organizationId === activeScope.organizationId &&
                scope.workspaceId === activeScope.workspaceId
                  ? "default"
                  : "outline"
              }
            >
              <Link
                href={
                  scope.workspaceId
                    ? `/admin?organizationId=${scope.organizationId}&workspaceId=${scope.workspaceId}`
                    : `/admin?organizationId=${scope.organizationId}`
                }
              >
                {scope.workspaceName ?? scope.organizationName}
              </Link>
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Users" value={stats.users} />
        <MetricCard label="Workspaces" value={stats.workspaces} />
        <MetricCard label="Sources" value={stats.sources} />
        <MetricCard label="Failed ops" value={stats.failedOperations} tone={stats.failedOperations ? "danger" : "normal"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>System health</CardTitle>
          <CardDescription>Configuration readiness for runtime services.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <HealthItem label="Database" ready detail="Connected for this request" />
          <HealthItem label="Redis queue" ready={isQueueConfigured()} detail="Required for crawl and index retries" />
          <HealthItem label="Object storage" ready={isObjectStorageConfigured()} detail="Required for page storage" />
          <HealthItem label="AI provider" ready={isAiProviderConfigured()} detail="Azure OpenAI or OpenAI is required for embeddings and chat" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Queue operations</CardTitle>
          <CardDescription>Background worker queue state for crawling, processing, chunking, and indexing.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4 xl:grid-cols-9">
          <QueueMetric label="Provider" value={queueHealth.provider ?? "Not configured"} />
          <QueueMetric
            label="Serverless worker fallback"
            value={queueHealth.serverlessWorkerFallbackEnabled ? "Enabled" : "Disabled"}
          />
          <QueueMetric label="Waiting" value={queueHealth.waiting} />
          <QueueMetric label="Active" value={queueHealth.active} />
          <QueueMetric label="Delayed" value={queueHealth.delayed} />
          <QueueMetric label="Completed" value={queueHealth.completed} />
          <QueueMetric label="Failed" value={queueHealth.failed} tone={queueHealth.failed ? "danger" : "normal"} />
          <QueueMetric label="Paused" value={queueHealth.paused ? "Yes" : "No"} />
          <QueueMetric label="Worker heartbeat" value={queueHealth.workerHeartbeatAt ? formatDate(new Date(queueHealth.workerHeartbeatAt)) : "None"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Users and memberships</CardTitle>
          <CardDescription>Active tenant users, roles, and workspace assignments.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {memberships.map((membership) => (
                <TableRow key={membership.id}>
                  <TableCell>
                    <p className="font-medium">{membership.user.name ?? "Unnamed user"}</p>
                    <p className="text-xs text-muted-foreground">{membership.user.email}</p>
                  </TableCell>
                  <TableCell>{membership.role.name}</TableCell>
                  <TableCell>{membership.workspace?.name ?? "Organization"}</TableCell>
                  <TableCell><StatusBadge status={membership.status} /></TableCell>
                  <TableCell>{formatDate(membership.createdAt)}</TableCell>
                </TableRow>
              ))}
              {!memberships.length ? <EmptyRow columns={5} label="No memberships found." /> : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workspaces</CardTitle>
          <CardDescription>Workspace inventory and tenant boundaries.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workspaces.map((workspace) => (
                <TableRow key={workspace.id}>
                  <TableCell className="font-medium">{workspace.name}</TableCell>
                  <TableCell>{workspace.slug}</TableCell>
                  <TableCell>{formatDate(workspace.createdAt)}</TableCell>
                  <TableCell><StatusBadge status={workspace.deletedAt ? "ARCHIVED" : "ACTIVE"} /></TableCell>
                </TableRow>
              ))}
              {!workspaces.length ? <EmptyRow columns={4} label="No workspaces found." /> : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Knowledge sources</CardTitle>
          <CardDescription>Crawl and indexing status by source.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Pages</TableHead>
                <TableHead>Documents</TableHead>
                <TableHead>Latest crawl</TableHead>
                <TableHead>Latest index</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((source) => (
                <TableRow key={source.id}>
                  <TableCell>
                    <p className="font-medium">{source.name}</p>
                    <p className="max-w-md truncate text-xs text-muted-foreground">{source.baseUrl}</p>
                  </TableCell>
                  <TableCell>{source.workspace.name}</TableCell>
                  <TableCell><StatusBadge status={source.status} /></TableCell>
                  <TableCell>{source._count.pages}</TableCell>
                  <TableCell>{source._count.documents}</TableCell>
                  <TableCell>{source.crawls[0] ? <StatusBadge status={source.crawls[0].status} /> : "None"}</TableCell>
                  <TableCell>{source.embeddingJobs[0] ? <StatusBadge status={source.embeddingJobs[0].status} /> : "None"}</TableCell>
                </TableRow>
              ))}
              {!sources.length ? <EmptyRow columns={7} label="No knowledge sources found." /> : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Crawl jobs</CardTitle>
            <CardDescription>Recent website crawl activity and retry controls.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Processed</TableHead>
                  <TableHead>Failed</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {crawls.map((crawl) => (
                  <TableRow key={crawl.id}>
                    <TableCell>
                      <p className="font-medium">{crawl.knowledgeSource.name}</p>
                      <p className="text-xs text-muted-foreground">{crawl.workspace.name}</p>
                    </TableCell>
                    <TableCell><StatusBadge status={crawl.status} /></TableCell>
                    <TableCell>{crawl.pagesProcessed}/{crawl.pagesDiscovered}</TableCell>
                    <TableCell>{crawl.pagesFailed}</TableCell>
                    <TableCell>{formatDate(crawl.createdAt)}</TableCell>
                    <TableCell>{isRetryable(crawl.status) ? <RetryAction id={crawl.id} type="crawl" /> : "None"}</TableCell>
                  </TableRow>
                ))}
                {!crawls.length ? <EmptyRow columns={6} label="No crawl jobs found." /> : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Index jobs</CardTitle>
            <CardDescription>Embedding job status and retry controls.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Target</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Embedded</TableHead>
                  <TableHead>Failed</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {embeddingJobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>
                      <p className="font-medium">{job.knowledgeSource?.name ?? job.document?.title ?? "Document"}</p>
                      <p className="text-xs text-muted-foreground">{job.workspace.name}</p>
                    </TableCell>
                    <TableCell><StatusBadge status={job.status} /></TableCell>
                    <TableCell>{job.embeddedChunks}/{job.totalChunks}</TableCell>
                    <TableCell>{job.failedChunks}</TableCell>
                    <TableCell>{formatDate(job.createdAt)}</TableCell>
                    <TableCell>{isRetryable(job.status) ? <RetryAction id={job.id} type="embedding" /> : "None"}</TableCell>
                  </TableRow>
                ))}
                {!embeddingJobs.length ? <EmptyRow columns={6} label="No indexing jobs found." /> : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Audit logs</CardTitle>
            <CardDescription>Recent audited tenant actions.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">{log.action.toLowerCase().replaceAll("_", " ")}</TableCell>
                    <TableCell>{log.actor?.email ?? "System"}</TableCell>
                    <TableCell>{log.targetType.toLowerCase()} {shortId(log.targetId)}</TableCell>
                    <TableCell>{formatDate(log.createdAt)}</TableCell>
                  </TableRow>
                ))}
                {!auditLogs.length ? <EmptyRow columns={4} label="No audit logs found." /> : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Security events</CardTitle>
            <CardDescription>Failed AI requests and operational errors visible to this admin scope.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failedAiRequests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>
                      <p className="font-medium">{request.type.toLowerCase().replaceAll("_", " ")}</p>
                      <p className="max-w-sm truncate text-xs text-muted-foreground">{request.errorMessage ?? request.errorCode ?? "Failed request"}</p>
                    </TableCell>
                    <TableCell>{request.user?.email ?? "System"}</TableCell>
                    <TableCell>{request.model}</TableCell>
                    <TableCell>{formatDate(request.createdAt)}</TableCell>
                  </TableRow>
                ))}
                {!failedAiRequests.length ? <EmptyRow columns={4} label="No failed AI requests found." /> : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

async function getAdminStats(where: { organizationId: string; workspaceId?: string }) {
  const membershipWhere = where.workspaceId
    ? { organizationId: where.organizationId, workspaceId: where.workspaceId, deletedAt: null }
    : { organizationId: where.organizationId, deletedAt: null };
  const workspaceWhere = where.workspaceId
    ? { organizationId: where.organizationId, id: where.workspaceId, deletedAt: null }
    : { organizationId: where.organizationId, deletedAt: null };

  const [users, workspaces, sources, failedCrawls, failedEmbeddings, failedAiRequests] =
    await Promise.all([
      prisma.membership.count({ where: membershipWhere }),
      prisma.workspace.count({ where: workspaceWhere }),
      prisma.knowledgeSource.count({ where: { ...where, deletedAt: null } }),
      prisma.crawl.count({ where: { ...where, status: { in: ["FAILED", "PARTIALLY_COMPLETED", "CANCELLED"] } } }),
      prisma.embeddingJob.count({ where: { ...where, status: { in: ["FAILED", "PARTIALLY_COMPLETED"] } } }),
      prisma.aiRequest.count({ where: { ...where, status: "FAILED" } })
    ]);

  return {
    users,
    workspaces,
    sources,
    failedOperations: failedCrawls + failedEmbeddings + failedAiRequests
  };
}

async function getAdminQueueHealth() {
  if (!isQueueConfigured()) {
    return {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      paused: false,
      provider: null,
      workerHeartbeatAt: null,
      serverlessWorkerFallbackEnabled: isServerlessWorkerFallbackEnabled()
    };
  }

  try {
    const health = await getQueueHealth();
    return {
      ...health,
      workerHeartbeatAt: health.workerHeartbeat?.at ?? null,
      serverlessWorkerFallbackEnabled: isServerlessWorkerFallbackEnabled()
    };
  } catch {
    return {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      paused: false,
      provider: "unreachable",
      workerHeartbeatAt: null,
      serverlessWorkerFallbackEnabled: isServerlessWorkerFallbackEnabled()
    };
  }
}

function isServerlessWorkerFallbackEnabled() {
  return Boolean(readEnv("WORKER_CRON_SECRET"));
}

function MetricCard({ label, value, tone = "normal" }: { label: string; value: number; tone?: "normal" | "danger" }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className={tone === "danger" ? "text-destructive" : ""}>{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function QueueMetric({ label, value, tone = "normal" }: { label: string; value: string | number; tone?: "normal" | "danger" }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={tone === "danger" ? "mt-1 text-sm font-semibold text-destructive" : "mt-1 text-sm font-semibold"}>
        {value}
      </p>
    </div>
  );
}

function HealthItem({ label, ready, detail }: { label: string; ready: boolean; detail: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{label}</p>
        <StatusBadge status={ready ? "READY" : "FAILED"} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function EmptyRow({ columns, label }: { columns: number; label: string }) {
  return (
    <TableRow>
      <TableCell className="py-8 text-center text-muted-foreground" colSpan={columns}>
        {label}
      </TableCell>
    </TableRow>
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function shortId(id: string) {
  return id.length > 10 ? `${id.slice(0, 6)}...${id.slice(-4)}` : id;
}

function isRetryable(status: string) {
  return status === "FAILED" || status === "PARTIALLY_COMPLETED" || status === "CANCELLED";
}
