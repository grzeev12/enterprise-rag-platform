import { z } from "zod";
import { created, handleApiError } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { requireFinopsScope } from "@/lib/finops-auth";

const alertSchema = z.object({
  budgetId: z.string().cuid(),
  thresholdPercent: z.number().int().min(1).max(100),
  amountUsd: z.number().nonnegative(),
  message: z.string().trim().min(3).max(500)
});

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const input = alertSchema.parse(await request.json());
    const budget = await prisma.budget.findUnique({ where: { id: input.budgetId } });

    if (!budget) {
      return Response.json({ error: "Budget not found" }, { status: 404 });
    }

    await requireFinopsScope(user.id, budget.organizationId, budget.workspaceId);

    const alert = await prisma.budgetAlert.create({
      data: {
        organizationId: budget.organizationId,
        workspaceId: budget.workspaceId,
        budgetId: budget.id,
        createdById: user.id,
        thresholdPercent: input.thresholdPercent,
        amountUsd: input.amountUsd,
        message: input.message
      }
    });

    await writeAuditLog({
      organizationId: alert.organizationId,
      workspaceId: alert.workspaceId,
      actorUserId: user.id,
      action: "BUDGET_ALERT_CREATED",
      targetType: "BUDGET_ALERT",
      targetId: alert.id,
      metadata: { budgetId: budget.id, thresholdPercent: alert.thresholdPercent }
    });

    return created({ alert });
  } catch (error) {
    return handleApiError(error);
  }
}
