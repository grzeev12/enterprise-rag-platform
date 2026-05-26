import { HealthCheckButton, ProviderForm } from "@/components/llm/provider-actions";
import { ModelForm } from "@/components/llm/model-form";
import { StatusBadge } from "@/components/knowledge/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminScopes, resolveAdminScope } from "@/lib/admin";
import { maskSecretRef } from "@/lib/ai/gateway";
import { requireCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

type GatewayPageProps = {
  searchParams: Promise<{ organizationId?: string }>;
};

export default async function LlmGatewayPage({ searchParams }: GatewayPageProps) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const scope = resolveAdminScope(await getAdminScopes(user.id), params.organizationId);

  if (!scope || scope.workspaceId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">LLM gateway</h1>
          <p className="mt-2 text-sm text-muted-foreground">Organization owner or admin access is required.</p>
        </div>
      </div>
    );
  }

  const [providers, models, workspaces, usageEvents] = await Promise.all([
    prisma.llmProvider.findMany({
      where: { OR: [{ organizationId: scope.organizationId }, { organizationId: null }] },
      include: { modelConfigs: true },
      orderBy: [{ organizationId: "desc" }, { name: "asc" }]
    }),
    prisma.modelConfig.findMany({
      where: { OR: [{ organizationId: scope.organizationId }, { organizationId: null }] },
      include: { provider: true, workspace: true },
      orderBy: [{ kind: "asc" }, { priority: "asc" }]
    }),
    prisma.workspace.findMany({
      where: { organizationId: scope.organizationId, deletedAt: null },
      orderBy: { name: "asc" }
    }),
    prisma.tokenUsage.findMany({
      where: { organizationId: scope.organizationId },
      include: { aiRequest: { include: { provider: true } } },
      orderBy: { createdAt: "desc" },
      take: 1000
    })
  ]);

  const usageByModel = aggregateUsage(usageEvents, (event) => event.model);
  const usageByProvider = aggregateUsage(usageEvents, (event) => event.aiRequest?.provider?.key ?? "openai");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">LLM gateway</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Provider health, workspace model routing, fallback design, and model usage for {scope.organizationName}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Provider configuration</CardTitle>
          <CardDescription>Secrets are stored as environment or Key Vault references and shown masked.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ProviderForm organizationId={scope.organizationId} />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Secret</TableHead>
                <TableHead>Timeout</TableHead>
                <TableHead>Circuit</TableHead>
                <TableHead>Health</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providers.map((provider) => (
                <TableRow key={provider.id}>
                  <TableCell>
                    <p className="font-medium">{provider.name}</p>
                    <p className="text-xs text-muted-foreground">{provider.key}</p>
                  </TableCell>
                  <TableCell><StatusBadge status={provider.isEnabled ? provider.status : "BLOCKED"} /></TableCell>
                  <TableCell>{maskSecretRef(provider.apiKeySecretRef)}</TableCell>
                  <TableCell>{provider.timeoutMs}ms / {provider.maxRetries} retries</TableCell>
                  <TableCell><StatusBadge status={provider.circuitOpen ? "FAILED" : "READY"} /></TableCell>
                  <TableCell>{provider.organizationId ? <HealthCheckButton providerId={provider.id} /> : "Global"}</TableCell>
                </TableRow>
              ))}
              {!providers.length ? <EmptyRow columns={6} label="No providers configured." /> : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Model routing</CardTitle>
          <CardDescription>Configure workspace models, routing policies, fallback priority, and allow/block status.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ModelForm organizationId={scope.organizationId} providers={providers.map((provider) => ({ id: provider.id, name: provider.name }))} workspaces={workspaces} />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Routing</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {models.map((model) => (
                <TableRow key={model.id}>
                  <TableCell>
                    <p className="font-medium">{model.displayName}</p>
                    <p className="text-xs text-muted-foreground">{model.modelName} / {model.kind}</p>
                  </TableCell>
                  <TableCell>{model.provider.name}</TableCell>
                  <TableCell>{model.workspace?.name ?? (model.organizationId ? "Organization" : "Global")}</TableCell>
                  <TableCell>{model.routingPolicy.toLowerCase().replaceAll("_", " ")}</TableCell>
                  <TableCell>{model.priority}</TableCell>
                  <TableCell><StatusBadge status={model.isBlocked ? "BLOCKED" : model.isEnabled ? "READY" : "ARCHIVED"} /></TableCell>
                </TableRow>
              ))}
              {!models.length ? <EmptyRow columns={6} label="No models configured." /> : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Fallback design</CardTitle>
            <CardDescription>Routes are selected by policy, then priority, with circuit-open providers skipped.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Default uses the configured default model and then lower priority models.</p>
            <p>Cost-first sorts by prompt token cost, latency-first sorts by expected latency, and quality-first sorts by quality tier.</p>
            <p>Fallback-chain preserves the explicit priority order for controlled failover.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Usage by model</CardTitle>
            <CardDescription>Current token volume by model for this organization.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Requests</TableHead>
                  <TableHead>Tokens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usageByModel.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="font-medium">{row.key}</TableCell>
                    <TableCell>{row.requests.toLocaleString()}</TableCell>
                    <TableCell>{row.tokens.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {!usageByModel.length ? <EmptyRow columns={3} label="No model usage yet." /> : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Usage by provider</CardTitle>
            <CardDescription>Provider-level volume, including fallback-routed requests.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Requests</TableHead>
                  <TableHead>Tokens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usageByProvider.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="font-medium">{row.key}</TableCell>
                    <TableCell>{row.requests.toLocaleString()}</TableCell>
                    <TableCell>{row.tokens.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {!usageByProvider.length ? <EmptyRow columns={3} label="No provider usage yet." /> : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function aggregateUsage<T>(events: T[], keyForEvent: (event: T) => string) {
  const rows = new Map<string, { key: string; requests: number; tokens: number }>();
  for (const event of events) {
    const key = keyForEvent(event);
    const current = rows.get(key) ?? { key, requests: 0, tokens: 0 };
    current.requests += 1;
    current.tokens += "totalTokens" in (event as object) ? Number((event as { totalTokens: number }).totalTokens) : 0;
    rows.set(key, current);
  }
  return [...rows.values()].sort((a, b) => b.tokens - a.tokens);
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
