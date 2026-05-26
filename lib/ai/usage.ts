import type { AiRequestType } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AiUsage } from "@/lib/ai/types";
import { logInfo } from "@/lib/observability/logger";

type RecordUsageInput = {
  organizationId: string;
  workspaceId: string;
  userId?: string | null;
  aiRequestId?: string | null;
  model: string;
  type: AiRequestType;
  usage?: AiUsage;
};

export async function recordTokenUsage(input: RecordUsageInput) {
  const promptTokens = input.usage?.promptTokens ?? 0;
  const completionTokens = input.usage?.completionTokens ?? 0;
  const totalTokens = input.usage?.totalTokens ?? promptTokens + completionTokens;

  const usage = await prisma.tokenUsage.create({
    data: {
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      userId: input.userId ?? null,
      aiRequestId: input.aiRequestId ?? null,
      model: input.model,
      type: input.type,
      promptTokens,
      completionTokens,
      totalTokens
    }
  });

  logInfo("token_usage.recorded", {
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    model: input.model,
    type: input.type,
    totalTokens
  });

  return usage;
}
