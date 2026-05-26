import { RoutingPolicy } from "@prisma/client";
import { z } from "zod";
import { created, handleApiError, ok } from "@/lib/api";
import { getAdminScopes, resolveAdminScope } from "@/lib/admin";
import { writeAuditLog } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

const modelSchema = z.object({
  organizationId: z.string().cuid(),
  workspaceId: z.string().cuid().optional().nullable(),
  providerId: z.string().cuid(),
  key: z.string().trim().min(2).max(120),
  displayName: z.string().trim().min(2).max(160),
  kind: z.enum(["chat", "embedding"]),
  modelName: z.string().trim().min(2).max(160),
  routingPolicy: z.nativeEnum(RoutingPolicy).default(RoutingPolicy.DEFAULT),
  priority: z.number().int().min(1).max(1000).default(100),
  qualityTier: z.number().int().min(1).max(5).default(3),
  expectedLatencyMs: z.number().int().min(1).max(300000).optional().nullable(),
  isDefault: z.boolean().default(false),
  isEnabled: z.boolean().default(true),
  isAllowed: z.boolean().default(true),
  isBlocked: z.boolean().default(false)
});

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const scope = resolveAdminScope(
      await getAdminScopes(user.id),
      searchParams.get("organizationId"),
      searchParams.get("workspaceId")
    );
    if (!scope) return Response.json({ error: "Admin access required" }, { status: 403 });

    const models = await prisma.modelConfig.findMany({
      where: {
        OR: [
          { organizationId: scope.organizationId, ...(scope.workspaceId ? { workspaceId: scope.workspaceId } : {}) },
          { organizationId: null, workspaceId: null }
        ]
      },
      include: { provider: true },
      orderBy: [{ kind: "asc" }, { priority: "asc" }, { displayName: "asc" }]
    });

    return ok({ models });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const input = modelSchema.parse(await request.json());
    const scope = resolveAdminScope(await getAdminScopes(user.id), input.organizationId, input.workspaceId);
    if (!scope || scope.organizationId !== input.organizationId) {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const provider = await prisma.llmProvider.findFirst({
      where: {
        id: input.providerId,
        OR: [{ organizationId: input.organizationId }, { organizationId: null }]
      }
    });
    if (!provider) return Response.json({ error: "Provider not found" }, { status: 404 });

    const modelData = {
      providerId: input.providerId,
      displayName: input.displayName,
      kind: input.kind,
      modelName: input.modelName,
      routingPolicy: input.routingPolicy,
      priority: input.priority,
      qualityTier: input.qualityTier,
      expectedLatencyMs: input.expectedLatencyMs ?? null,
      isDefault: input.isDefault,
      isEnabled: input.isEnabled,
      isAllowed: input.isAllowed,
      isBlocked: input.isBlocked
    };
    const existing = await prisma.modelConfig.findFirst({
      where: {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId ?? null,
        key: input.key
      }
    });
    const model = existing
      ? await prisma.modelConfig.update({ where: { id: existing.id }, data: modelData })
      : await prisma.modelConfig.create({
          data: {
            organizationId: input.organizationId,
            workspaceId: input.workspaceId ?? null,
            key: input.key,
            ...modelData
          }
        });

    await writeAuditLog({
      organizationId: model.organizationId,
      workspaceId: model.workspaceId,
      actorUserId: user.id,
      action: "MODEL_CONFIG_UPDATED",
      targetType: "MODEL_CONFIG",
      targetId: model.id,
      metadata: { key: model.key, modelName: model.modelName, routingPolicy: model.routingPolicy }
    });

    return created({ model });
  } catch (error) {
    return handleApiError(error);
  }
}
