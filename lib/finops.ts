import type { AiRequestStatus, AiRequestType, BudgetPeriod, Prisma } from "@prisma/client";
import { adminTenantWhere, type AdminScope } from "@/lib/admin";
import { prisma } from "@/lib/db";

export type FinopsFilters = {
  from?: Date;
  to?: Date;
  workspaceId?: string;
  userId?: string;
  model?: string;
};

export type FinopsUsageEvent = Prisma.TokenUsageGetPayload<{
  include: {
    workspace: true;
    aiRequest: {
      include: {
        provider: true;
        user: true;
        chat: true;
      };
    };
  };
}>;

export type FinopsBreakdownRow = {
  key: string;
  requests: number;
  tokens: number;
  costUsd: number;
};

export type FinopsSummary = {
  requestCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  embeddingTokens: number;
  embeddingCostUsd: number;
};

export type FinopsBudgetStatus = {
  id: string;
  name: string;
  workspaceName: string;
  period: BudgetPeriod;
  amountUsd: number;
  thresholdPercent: number;
  spentUsd: number;
  percentUsed: number;
  alertCount: number;
};

export type FinopsAiRequestRow = {
  id: string;
  type: AiRequestType;
  status: AiRequestStatus;
  model: string;
  totalTokens: number | null;
  createdAt: Date;
  userEmail: string | null;
  workspaceName: string;
  providerKey: string | null;
  chatTitle: string | null;
};

export type FinopsOverview = {
  summary: FinopsSummary;
  breakdown: {
    byWorkspace: FinopsBreakdownRow[];
    byUser: FinopsBreakdownRow[];
    byModel: FinopsBreakdownRow[];
    byProvider: FinopsBreakdownRow[];
    byChat: FinopsBreakdownRow[];
  };
  trends: FinopsBreakdownRow[];
  usageEvents: FinopsUsageEvent[];
  aiRequests: FinopsAiRequestRow[];
  budgets: FinopsBudgetStatus[];
  recommendations: string[];
};

const defaultPricingPerMillion: Record<string, { provider: string; prompt: number; completion: number }> = {
  "gpt-4o-mini": { provider: "openai", prompt: 0.15, completion: 0.6 },
  "text-embedding-3-small": { provider: "openai", prompt: 0.02, completion: 0 },
  "text-embedding-3-large": { provider: "openai", prompt: 0.13, completion: 0 }
};

export function defaultDateRange() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 30);
  return { from, to };
}

export function parseDateRange(searchParams: URLSearchParams | Record<string, string | undefined>) {
  const get = (key: string) =>
    searchParams instanceof URLSearchParams ? searchParams.get(key) ?? undefined : searchParams[key];
  const defaults = defaultDateRange();
  const from = get("from") ? new Date(get("from") as string) : defaults.from;
  const to = get("to") ? new Date(get("to") as string) : defaults.to;

  return {
    from: Number.isNaN(from.getTime()) ? defaults.from : from,
    to: Number.isNaN(to.getTime()) ? defaults.to : to,
    workspaceId: get("workspaceId"),
    userId: get("userId"),
    model: get("model")
  };
}

export async function getFinopsOverview(
  scope: AdminScope,
  filters: FinopsFilters = {}
): Promise<FinopsOverview> {
  const [events, budgets, aiRequests] = await Promise.all([
    getUsageEvents(scope, filters),
    prisma.budget.findMany({
      where: {
        organizationId: scope.organizationId,
        ...(scope.workspaceId ? { workspaceId: scope.workspaceId } : {}),
        isActive: true
      },
      include: { workspace: true, alerts: { orderBy: { createdAt: "desc" }, take: 3 } },
      orderBy: { createdAt: "desc" }
    }),
    prisma.aiRequest.findMany({
      where: {
        ...tenantAiRequestWhere(scope, filters),
        createdAt: dateWhere(filters),
        ...(filters.model ? { model: filters.model } : {})
      },
      include: { workspace: true, user: true, provider: true, chat: true },
      orderBy: { createdAt: "desc" },
      take: 100
    })
  ]);

  const summary = summarizeEvents(events);
  const breakdown = buildBreakdowns(events);
  const budgetStatus = budgets.map((budget) => {
    const scopedEvents = events.filter((event) => !budget.workspaceId || event.workspaceId === budget.workspaceId);
    const spent = summarizeEvents(scopedEvents).estimatedCostUsd;
    const amount = Number(budget.amountUsd);
    return {
      id: budget.id,
      name: budget.name,
      workspaceName: budget.workspace?.name ?? "Organization",
      period: budget.period,
      amountUsd: amount,
      thresholdPercent: budget.thresholdPercent,
      spentUsd: spent,
      percentUsed: amount > 0 ? Math.round((spent / amount) * 100) : 0,
      alertCount: budget.alerts.length
    };
  });

  return {
    summary,
    breakdown,
    trends: buildDailyTrends(events),
    usageEvents: events.slice(0, 100),
    aiRequests: aiRequests.map((request) => ({
      id: request.id,
      type: request.type,
      status: request.status,
      model: request.model,
      totalTokens: request.totalTokens,
      createdAt: request.createdAt,
      userEmail: request.user?.email ?? null,
      workspaceName: request.workspace.name,
      providerKey: request.provider?.key ?? null,
      chatTitle: request.chat?.title ?? null
    })),
    budgets: budgetStatus,
    recommendations: buildRecommendations(summary, breakdown)
  };
}

export async function getUsageEvents(
  scope: AdminScope,
  filters: FinopsFilters = {}
): Promise<FinopsUsageEvent[]> {
  return prisma.tokenUsage.findMany({
    where: {
      ...tenantWhere(scope, filters),
      createdAt: dateWhere(filters),
      ...(filters.userId ? { userId: filters.userId } : {}),
      ...(filters.model ? { model: filters.model } : {})
    },
    include: {
      workspace: true,
      aiRequest: {
        include: {
          provider: true,
          user: true,
          chat: true
        }
      }
    },
    orderBy: { createdAt: "desc" },
    take: 5000
  });
}

export function estimateUsageCostUsd(event: {
  model: string;
  promptTokens: number;
  completionTokens: number;
  aiRequest?: { provider?: { key: string } | null } | null;
}) {
  const pricing = defaultPricingPerMillion[event.model] ?? {
    provider: event.aiRequest?.provider?.key ?? "openai",
    prompt: 0,
    completion: 0
  };

  return ((event.promptTokens * pricing.prompt) + (event.completionTokens * pricing.completion)) / 1_000_000;
}

export function providerForEvent(event: FinopsUsageEvent) {
  return event.aiRequest?.provider?.key ?? defaultPricingPerMillion[event.model]?.provider ?? "openai";
}

function summarizeEvents(events: FinopsUsageEvent[]): FinopsSummary {
  const promptTokens = events.reduce((sum, event) => sum + event.promptTokens, 0);
  const completionTokens = events.reduce((sum, event) => sum + event.completionTokens, 0);
  const totalTokens = events.reduce((sum, event) => sum + event.totalTokens, 0);
  const estimatedCostUsd = events.reduce((sum, event) => sum + estimateUsageCostUsd(event), 0);

  return {
    requestCount: events.length,
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostUsd,
    embeddingTokens: events
      .filter((event) => event.type === "EMBEDDING")
      .reduce((sum, event) => sum + event.totalTokens, 0),
    embeddingCostUsd: events
      .filter((event) => event.type === "EMBEDDING")
      .reduce((sum, event) => sum + estimateUsageCostUsd(event), 0)
  };
}

function buildBreakdowns(events: FinopsUsageEvent[]): FinopsOverview["breakdown"] {
  return {
    byWorkspace: aggregate(events, (event) => event.workspace.name),
    byUser: aggregate(events, (event) => event.aiRequest?.user?.email ?? event.userId ?? "System"),
    byModel: aggregate(events, (event) => event.model),
    byProvider: aggregate(events, providerForEvent),
    byChat: aggregate(events, (event) => event.aiRequest?.chat?.title ?? "No chat").slice(0, 10)
  };
}

function buildDailyTrends(events: FinopsUsageEvent[]): FinopsBreakdownRow[] {
  return aggregate(events, (event) => event.createdAt.toISOString().slice(0, 10)).sort((a, b) =>
    a.key.localeCompare(b.key)
  );
}

function aggregate(
  events: FinopsUsageEvent[],
  keyForEvent: (event: FinopsUsageEvent) => string
): FinopsBreakdownRow[] {
  const rows = new Map<string, FinopsBreakdownRow>();
  for (const event of events) {
    const key = keyForEvent(event);
    const current = rows.get(key) ?? { key, requests: 0, tokens: 0, costUsd: 0 };
    current.requests += 1;
    current.tokens += event.totalTokens;
    current.costUsd += estimateUsageCostUsd(event);
    rows.set(key, current);
  }

  return [...rows.values()].sort((a, b) => b.costUsd - a.costUsd);
}

function buildRecommendations(
  summary: ReturnType<typeof summarizeEvents>,
  breakdown: ReturnType<typeof buildBreakdowns>
) {
  const recommendations = [
    "Set workspace-level budgets for high-volume teams.",
    "Review failed AI requests before increasing budget thresholds."
  ];
  if (summary.embeddingCostUsd > summary.estimatedCostUsd * 0.5) {
    recommendations.push("Embedding cost dominates this period; consider batching indexing and avoiding duplicate source re-indexes.");
  }
  if (breakdown.byModel.length > 1) {
    recommendations.push("Compare model-level spend before adding routing policies in the multi-LLM phase.");
  }
  return recommendations;
}

function tenantWhere(scope: AdminScope, filters: FinopsFilters): Prisma.TokenUsageWhereInput {
  const base = adminTenantWhere(scope);
  return {
    organizationId: base.organizationId,
    workspaceId: filters.workspaceId ?? base.workspaceId
  };
}

function tenantAiRequestWhere(scope: AdminScope, filters: FinopsFilters): Prisma.AiRequestWhereInput {
  const base = adminTenantWhere(scope);
  return {
    organizationId: base.organizationId,
    workspaceId: filters.workspaceId ?? base.workspaceId
  };
}

function dateWhere(filters: FinopsFilters) {
  return {
    gte: filters.from,
    lte: filters.to
  };
}

export function formatUsd(value: number) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 4 : 2
  }).format(value);
}
