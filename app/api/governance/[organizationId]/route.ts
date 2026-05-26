import { z } from "zod";
import { handleApiError, ok } from "@/lib/api";
import { requireOrganizationAccess } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { ensureOrganizationGovernance } from "@/lib/governance";

const governanceSchema = z.object({
  allowedModels: z.array(z.string()).max(50).optional(),
  blockedModels: z.array(z.string()).max(50).optional(),
  requireCitations: z.boolean().optional(),
  moderationEnabled: z.boolean().optional(),
  chatRetentionDays: z.number().int().min(1).max(3650).optional(),
  legalHoldEnabled: z.boolean().optional(),
  applicationInsightsEnabled: z.boolean().optional()
});

type Params = {
  params: Promise<{ organizationId: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser();
    const { organizationId } = await params;
    await requireOrganizationAccess(user.id, organizationId, "admin:read");
    const governance = await ensureOrganizationGovernance(organizationId);
    return ok(governance);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser();
    const { organizationId } = await params;
    const input = governanceSchema.parse(await request.json());
    await requireOrganizationAccess(user.id, organizationId, "governance:manage");
    await ensureOrganizationGovernance(organizationId);

    const [aiPolicy, retention, compliance] = await Promise.all([
      prisma.organizationAiPolicy.update({
        where: { organizationId },
        data: {
          ...(input.allowedModels ? { allowedModels: input.allowedModels } : {}),
          ...(input.blockedModels ? { blockedModels: input.blockedModels } : {}),
          ...(typeof input.requireCitations === "boolean" ? { requireCitations: input.requireCitations } : {}),
          ...(typeof input.moderationEnabled === "boolean" ? { moderationEnabled: input.moderationEnabled } : {})
        }
      }),
      prisma.dataRetentionPolicy.update({
        where: { organizationId },
        data: {
          ...(input.chatRetentionDays ? { chatRetentionDays: input.chatRetentionDays } : {}),
          ...(typeof input.legalHoldEnabled === "boolean" ? { legalHoldEnabled: input.legalHoldEnabled } : {})
        }
      }),
      prisma.complianceSetting.update({
        where: { organizationId },
        data: {
          ...(typeof input.applicationInsightsEnabled === "boolean"
            ? { applicationInsightsEnabled: input.applicationInsightsEnabled }
            : {})
        }
      })
    ]);

    await writeAuditLog({
      organizationId,
      actorUserId: user.id,
      action: "AI_POLICY_UPDATED",
      targetType: "AI_POLICY",
      targetId: aiPolicy.id,
      metadata: { updatedFields: Object.keys(input) }
    });

    return ok({ aiPolicy, retention, compliance });
  } catch (error) {
    return handleApiError(error);
  }
}
