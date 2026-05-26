import { BudgetPeriod } from "@prisma/client";
import { z } from "zod";
import { handleApiError, ok } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { requireFinopsScope } from "@/lib/finops-auth";

const updateBudgetSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  period: z.nativeEnum(BudgetPeriod).optional(),
  amountUsd: z.number().positive().max(10_000_000).optional(),
  thresholdPercent: z.number().int().min(1).max(100).optional(),
  isActive: z.boolean().optional()
});

type Params = {
  params: Promise<{ budgetId: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser();
    const { budgetId } = await params;
    const input = updateBudgetSchema.parse(await request.json());
    const budget = await prisma.budget.findUnique({ where: { id: budgetId } });

    if (!budget) {
      return Response.json({ error: "Budget not found" }, { status: 404 });
    }

    await requireFinopsScope(user.id, budget.organizationId, budget.workspaceId);

    const updated = await prisma.budget.update({
      where: { id: budget.id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.period ? { period: input.period } : {}),
        ...(input.amountUsd ? { amountUsd: input.amountUsd } : {}),
        ...(input.thresholdPercent ? { thresholdPercent: input.thresholdPercent } : {}),
        ...(typeof input.isActive === "boolean" ? { isActive: input.isActive } : {})
      }
    });

    await writeAuditLog({
      organizationId: updated.organizationId,
      workspaceId: updated.workspaceId,
      actorUserId: user.id,
      action: "BUDGET_UPDATED",
      targetType: "BUDGET",
      targetId: updated.id,
      metadata: input
    });

    return ok({ budget: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
