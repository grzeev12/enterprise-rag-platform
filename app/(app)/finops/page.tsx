import Link from "next/link";
import { BudgetForm } from "@/components/finops/budget-form";
import { StatusBadge } from "@/components/knowledge/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminScopes, resolveAdminScope } from "@/lib/admin";
import { requireCurrentUser } from "@/lib/current-user";
import {
  estimateUsageCostUsd,
  formatUsd,
  getFinopsOverview,
  parseDateRange,
  type FinopsAiRequestRow,
  type FinopsBudgetStatus,
  type FinopsBreakdownRow,
  type FinopsOverview,
  type FinopsUsageEvent
} from "@/lib/finops";
import { prisma } from "@/lib/db";

type FinopsPageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

export default async function FinopsPage({ searchParams }: FinopsPageProps) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const scopes = await getAdminScopes(user.id);
  const scope = resolveAdminScope(scopes, params.organizationId, params.workspaceId);

  if (!scope) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">FinOps</h1>
          <p className="mt-2 text-sm text-muted-foreground">Owner or admin access is required.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Access blocked</CardTitle>
            <CardDescription>Your account cannot view AI usage or cost data.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const filters = parseDateRange(params);
  const overview: FinopsOverview = await getFinopsOverview(scope, filters);
  const [workspaces, users, models] = await Promise.all([
    prisma.workspace.findMany({
      where: scope.workspaceId
        ? { id: scope.workspaceId, organizationId: scope.organizationId, deletedAt: null }
        : { organizationId: scope.organizationId, deletedAt: null },
      orderBy: { name: "asc" }
    }),
    prisma.membership.findMany({
      where: {
        organizationId: scope.organizationId,
        ...(scope.workspaceId ? { workspaceId: scope.workspaceId } : {}),
        deletedAt: null
      },
      include: { user: true },
      orderBy: { user: { email: "asc" } }
    }),
    prisma.tokenUsage.findMany({
      where: {
        organizationId: scope.organizationId,
        ...(scope.workspaceId ? { workspaceId: scope.workspaceId } : {})
      },
      distinct: ["model"],
      select: { model: true },
      orderBy: { model: "asc" }
    })
  ]);

  const query = new URLSearchParams({
    organizationId: scope.organizationId,
    ...(scope.workspaceId ? { workspaceId: scope.workspaceId } : {}),
    ...(params.from ? { from: params.from } : {}),
    ...(params.to ? { to: params.to } : {}),
    ...(params.userId ? { userId: params.userId } : {}),
    ...(params.model ? { model: params.model } : {})
  });
  type WorkspaceOption = (typeof workspaces)[number];
  type MembershipOption = (typeof users)[number];
  type ModelOption = (typeof models)[number];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">FinOps</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            AI usage and estimated cost for {scope.organizationName}
            {scope.workspaceName ? ` / ${scope.workspaceName}` : ""}.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/api/finops/export?${query.toString()}`}>Export CSV</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter by date, workspace, user, or model.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-6 md:items-end">
            <input name="organizationId" type="hidden" value={scope.organizationId} />
            <div className="space-y-1">
              <Label htmlFor="from">From</Label>
              <Input id="from" name="from" type="date" defaultValue={toDateInput(filters.from)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to">To</Label>
              <Input id="to" name="to" type="date" defaultValue={toDateInput(filters.to)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="workspaceId">Workspace</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" id="workspaceId" name="workspaceId" defaultValue={filters.workspaceId ?? scope.workspaceId ?? ""}>
                <option value="">All</option>
                {workspaces.map((workspace: WorkspaceOption) => (
                  <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="userId">User</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" id="userId" name="userId" defaultValue={filters.userId ?? ""}>
                <option value="">All</option>
                {users.map((membership: MembershipOption) => (
                  <option key={membership.id} value={membership.userId}>{membership.user.email}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="model">Model</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" id="model" name="model" defaultValue={filters.model ?? ""}>
                <option value="">All</option>
                {models.map((model: ModelOption) => (
                  <option key={model.model} value={model.model}>{model.model}</option>
                ))}
              </select>
            </div>
            <Button type="submit">Apply</Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard label="Estimated cost" value={formatUsd(overview.summary.estimatedCostUsd)} />
        <KpiCard label="Total tokens" value={overview.summary.totalTokens.toLocaleString()} />
        <KpiCard label="AI requests" value={overview.summary.requestCount.toLocaleString()} />
        <KpiCard label="Embedding cost" value={formatUsd(overview.summary.embeddingCostUsd)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <BreakdownCard title="Cost by workspace" rows={overview.breakdown.byWorkspace} />
        <BreakdownCard title="Cost by model" rows={overview.breakdown.byModel} />
        <BreakdownCard title="Top users" rows={overview.breakdown.byUser.slice(0, 10)} />
        <BreakdownCard title="Top chats" rows={overview.breakdown.byChat.slice(0, 10)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Crawl and indexing estimates</CardTitle>
          <CardDescription>Embedding token spend is tracked; crawler infrastructure estimates are reserved for the Azure operations meter.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <EstimateItem label="Embedding tokens" value={overview.summary.embeddingTokens.toLocaleString()} />
          <EstimateItem label="Embedding cost" value={formatUsd(overview.summary.embeddingCostUsd)} />
          <EstimateItem label="Crawler compute" value="Scaffolded" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daily usage trend</CardTitle>
          <CardDescription>Estimated daily cost and token volume.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {overview.trends.map((day: FinopsBreakdownRow) => (
              <div className="grid gap-2 md:grid-cols-[120px_1fr_120px] md:items-center" key={day.key}>
                <p className="text-sm font-medium">{day.key}</p>
                <div className="h-2 rounded bg-muted">
                  <div className="h-2 rounded bg-primary" style={{ width: `${barWidth(day.costUsd, overview.trends)}%` }} />
                </div>
                <p className="text-sm text-muted-foreground">{formatUsd(day.costUsd)}</p>
              </div>
            ))}
            {!overview.trends.length ? <p className="text-sm text-muted-foreground">No usage in this period.</p> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Budget status</CardTitle>
          <CardDescription>Create and monitor budget guardrails. Alerts are scaffolded for later notification delivery.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <BudgetForm organizationId={scope.organizationId} workspaceId={scope.workspaceId} />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Spend</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overview.budgets.map((budget: FinopsBudgetStatus) => (
                <TableRow key={budget.id}>
                  <TableCell className="font-medium">{budget.name}</TableCell>
                  <TableCell>{budget.workspaceName}</TableCell>
                  <TableCell>{budget.period.toLowerCase()}</TableCell>
                  <TableCell>{formatUsd(budget.spentUsd)} / {formatUsd(budget.amountUsd)}</TableCell>
                  <TableCell>
                    <StatusBadge status={budget.percentUsed >= budget.thresholdPercent ? "FAILED" : "READY"} />
                    <span className="ml-2 text-sm text-muted-foreground">{budget.percentUsed}% used</span>
                  </TableCell>
                </TableRow>
              ))}
              {!overview.budgets.length ? <EmptyRow columns={5} label="No budgets configured." /> : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Usage events</CardTitle>
            <CardDescription>Recent token usage events for this tenant scope.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Workspace</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead>Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.usageEvents.slice(0, 20).map((event: FinopsUsageEvent) => (
                  <TableRow key={event.id}>
                    <TableCell>{formatDate(event.createdAt)}</TableCell>
                    <TableCell>{event.workspace.name}</TableCell>
                    <TableCell>{event.model}</TableCell>
                    <TableCell>{event.totalTokens.toLocaleString()}</TableCell>
                    <TableCell>{formatUsd(estimateUsageCostUsd(event))}</TableCell>
                  </TableRow>
                ))}
                {!overview.usageEvents.length ? <EmptyRow columns={5} label="No usage events found." /> : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI request analytics</CardTitle>
            <CardDescription>Recent AI requests, status, and latency.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Request</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Tokens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.aiRequests.slice(0, 20).map((request: FinopsAiRequestRow) => (
                  <TableRow key={request.id}>
                    <TableCell>
                      <p className="font-medium">{request.type.toLowerCase().replaceAll("_", " ")}</p>
                      <p className="text-xs text-muted-foreground">{request.model}</p>
                    </TableCell>
                    <TableCell><StatusBadge status={request.status} /></TableCell>
                    <TableCell>{request.userEmail ?? "System"}</TableCell>
                    <TableCell>{request.totalTokens?.toLocaleString() ?? "Pending"}</TableCell>
                  </TableRow>
                ))}
                {!overview.aiRequests.length ? <EmptyRow columns={4} label="No AI requests found." /> : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cost optimization recommendations</CardTitle>
          <CardDescription>Scaffolded guidance before advanced routing and governance phases.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {overview.recommendations.map((recommendation: string) => (
              <li key={recommendation}>{recommendation}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle>{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function BreakdownCard({ title, rows }: { title: string; rows: { key: string; requests: number; tokens: number; costUsd: number }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Requests, tokens, and estimated cost.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Requests</TableHead>
              <TableHead>Tokens</TableHead>
              <TableHead>Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row: FinopsBreakdownRow) => (
              <TableRow key={row.key}>
                <TableCell className="font-medium">{row.key}</TableCell>
                <TableCell>{row.requests.toLocaleString()}</TableCell>
                <TableCell>{row.tokens.toLocaleString()}</TableCell>
                <TableCell>{formatUsd(row.costUsd)}</TableCell>
              </TableRow>
            ))}
            {!rows.length ? <EmptyRow columns={4} label="No usage found." /> : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function EstimateItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
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

function toDateInput(date?: Date) {
  return date?.toISOString().slice(0, 10);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function barWidth(value: number, rows: { costUsd: number }[]) {
  const max = Math.max(...rows.map((row) => row.costUsd), 0);
  if (!max) return 0;
  return Math.max(4, Math.round((value / max) * 100));
}
