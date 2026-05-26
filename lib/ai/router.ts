import type { ModelConfig, RoutingPolicy } from "@prisma/client";
import { AiProviderError, type AiProvider, type ChatMessage, type StreamDelta } from "@/lib/ai/types";
import { getAiProvider, isProviderKey, type ProviderKey } from "@/lib/ai/gateway";
import { defaultChatModel, defaultEmbeddingModel } from "@/lib/ai/openai-provider";
import { azureOpenAiDeployment, preferredProviderKey } from "@/lib/ai/provider-config";
import { prisma } from "@/lib/db";
import { logError, logInfo } from "@/lib/observability/logger";

export type ResolvedModelRoute = {
  providerId?: string | null;
  providerKey: ProviderKey;
  provider: AiProvider;
  model: string;
  config?: ModelConfig & {
    provider: {
      id: string;
      key: string;
      baseUrl: string | null;
      apiKeySecretRef: string | null;
      timeoutMs: number;
      maxRetries: number;
      circuitOpen: boolean;
      isEnabled: boolean;
    };
  };
  fallbackChain: ResolvedModelRoute[];
};

export async function resolveModelRoute(input: {
  organizationId: string;
  workspaceId: string;
  kind: "chat" | "embedding";
  routingPolicy?: RoutingPolicy | null;
}): Promise<ResolvedModelRoute> {
  const configs = await prisma.modelConfig.findMany({
    where: {
      kind: input.kind,
      isEnabled: true,
      isAllowed: true,
      isBlocked: false,
      OR: [
        { organizationId: input.organizationId, workspaceId: input.workspaceId },
        { organizationId: input.organizationId, workspaceId: null },
        { organizationId: null, workspaceId: null }
      ],
      provider: {
        isEnabled: true,
        circuitOpen: false
      }
    },
    include: { provider: true },
    orderBy: [{ isDefault: "desc" }, { priority: "asc" }, { createdAt: "asc" }]
  });

  const policy = input.routingPolicy ?? configs[0]?.routingPolicy ?? "DEFAULT";
  const sorted = sortConfigsForPolicy(configs, policy);
  const routes = sorted.flatMap((config) => {
    if (!isProviderKey(config.provider.key)) return [];
    return [toRoute(config)];
  });

  if (!routes.length) {
    return fallbackOpenAiRoute(input.kind);
  }

  return { ...routes[0], fallbackChain: routes.slice(1) };
}

export async function streamChatWithFallback(input: {
  route: ResolvedModelRoute;
  messages: ChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<AsyncIterable<StreamDelta> & { route: ResolvedModelRoute }> {
  const attempts = [input.route, ...input.route.fallbackChain];
  let lastError: unknown;

  for (const route of attempts) {
    try {
      const stream = route.provider.streamChatCompletion(input.messages, {
        model: route.model,
        temperature: input.temperature,
        maxOutputTokens: input.maxOutputTokens
      });
      logInfo("ai_gateway.route_selected", {
        provider: route.providerKey,
        model: route.model,
        fallback: route !== input.route
      });
      return Object.assign(stream, { route });
    } catch (error) {
      lastError = error;
      logError("ai_gateway.route_failed", error, {
        provider: route.providerKey,
        model: route.model
      });
    }
  }

  throw normalizeGatewayError(lastError);
}

export async function checkProviderHealth(providerId: string) {
  const providerRow = await prisma.llmProvider.findUnique({ where: { id: providerId } });
  if (!providerRow || !isProviderKey(providerRow.key)) {
    throw new AiProviderError("Provider not found", "PROVIDER_NOT_FOUND", "Provider not found.");
  }

  const provider = getAiProvider(providerRow.key, providerRow);
  const health = provider.healthCheck
    ? await provider.healthCheck()
    : { ok: true, status: "HEALTHY" as const };

  await prisma.llmProvider.update({
    where: { id: providerId },
    data: {
      status: health.status,
      lastCheckedAt: new Date(),
      lastError: health.ok ? null : health.safeMessage ?? "Health check failed"
    }
  });

  return health;
}

function sortConfigsForPolicy<T extends ModelConfig>(configs: T[], policy: RoutingPolicy) {
  const copy = [...configs];
  if (policy === "COST_FIRST") {
    return copy.sort((a, b) => Number(a.promptTokenCostUsd ?? 0) - Number(b.promptTokenCostUsd ?? 0));
  }
  if (policy === "LATENCY_FIRST") {
    return copy.sort((a, b) => (a.expectedLatencyMs ?? 999999) - (b.expectedLatencyMs ?? 999999));
  }
  if (policy === "QUALITY_FIRST") {
    return copy.sort((a, b) => b.qualityTier - a.qualityTier);
  }
  return copy;
}

function toRoute(config: NonNullable<ResolvedModelRoute["config"]>): ResolvedModelRoute {
  const providerKey = config.provider.key as ProviderKey;
  return {
    providerId: config.providerId,
    providerKey,
    provider: getAiProvider(providerKey, config.provider),
    model: config.modelName,
    config,
    fallbackChain: []
  };
}

function fallbackOpenAiRoute(kind: "chat" | "embedding"): ResolvedModelRoute {
  const providerKey = preferredProviderKey();
  const azureDeployment = azureOpenAiDeployment();
  return {
    providerKey,
    provider: getAiProvider(providerKey),
    model: providerKey === "azure-openai" && azureDeployment
      ? azureDeployment
      : kind === "chat" ? defaultChatModel() : defaultEmbeddingModel(),
    fallbackChain: []
  };
}

function normalizeGatewayError(error: unknown) {
  if (error instanceof AiProviderError) return error;
  if (error instanceof Error) {
    return new AiProviderError(error.message, "AI_GATEWAY_ERROR", "The AI gateway could not complete the request.");
  }
  return new AiProviderError("Unknown AI gateway error", "AI_GATEWAY_ERROR", "The AI gateway could not complete the request.");
}
