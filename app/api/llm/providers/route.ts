import { z } from "zod";
import { created, handleApiError, ok } from "@/lib/api";
import { getAdminScopes, resolveAdminScope } from "@/lib/admin";
import { isProviderKey, providerCatalog } from "@/lib/ai/gateway";
import { writeAuditLog } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

const providerSchema = z.object({
  organizationId: z.string().cuid(),
  key: z.string().refine(isProviderKey),
  name: z.string().trim().min(2).max(120).optional(),
  baseUrl: z.string().url().optional().nullable(),
  apiKeySecretRef: z.string().trim().min(2).max(200).optional().nullable(),
  timeoutMs: z.number().int().min(1000).max(120000).default(30000),
  maxRetries: z.number().int().min(0).max(5).default(2),
  isEnabled: z.boolean().default(true)
});

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const scopes = await getAdminScopes(user.id);
    const scope = resolveAdminScope(scopes, searchParams.get("organizationId"));
    if (!scope) return Response.json({ error: "Admin access required" }, { status: 403 });

    const providers = await prisma.llmProvider.findMany({
      where: {
        OR: [{ organizationId: scope.organizationId }, { organizationId: null }]
      },
      include: { modelConfigs: true },
      orderBy: [{ organizationId: "desc" }, { name: "asc" }]
    });

    return ok({ providers });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const input = providerSchema.parse(await request.json());
    const scopes = await getAdminScopes(user.id);
    const scope = resolveAdminScope(scopes, input.organizationId);
    if (!scope || scope.organizationId !== input.organizationId || scope.workspaceId) {
      return Response.json({ error: "Organization admin access required" }, { status: 403 });
    }

    const provider = await prisma.llmProvider.upsert({
      where: {
        organizationId_key: {
          organizationId: input.organizationId,
          key: input.key
        }
      },
      update: {
        name: input.name ?? providerCatalog[input.key].name,
        baseUrl: input.baseUrl ?? null,
        apiKeySecretRef: input.apiKeySecretRef ?? providerCatalog[input.key].envVar,
        timeoutMs: input.timeoutMs,
        maxRetries: input.maxRetries,
        isEnabled: input.isEnabled
      },
      create: {
        organizationId: input.organizationId,
        key: input.key,
        name: input.name ?? providerCatalog[input.key].name,
        baseUrl: input.baseUrl ?? null,
        apiKeySecretRef: input.apiKeySecretRef ?? providerCatalog[input.key].envVar,
        timeoutMs: input.timeoutMs,
        maxRetries: input.maxRetries,
        isEnabled: input.isEnabled
      }
    });

    await writeAuditLog({
      organizationId: provider.organizationId,
      actorUserId: user.id,
      action: "LLM_PROVIDER_UPDATED",
      targetType: "LLM_PROVIDER",
      targetId: provider.id,
      metadata: { key: provider.key, enabled: provider.isEnabled }
    });

    return created({ provider });
  } catch (error) {
    return handleApiError(error);
  }
}
