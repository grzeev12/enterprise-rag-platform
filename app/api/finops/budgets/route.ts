import { BudgetPeriod } from "@prisma/client";
import { z } from "zod";
import { created, handleApiError, ok } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { requireFinopsScope } from "@/lib/finops-auth";

const budgetSchema = z.object({
  organizationId: z.string().cuid(),
  workspaceId: z.string().cuid().optional().nullable(),
  name: z.string().trim().min(2).max(120),
  period: z.nativeEnum(BudgetPeriod).default(BudgetPeriod.MONTHLY),
  amountUsd: z.number().positive().max(10_000_000),
  thresholdPercent: z.number().int().min(1).max(100).default(80),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional().nullable()
});

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const scope = await requireFinopsScope(
      user.id,
      searchParams.get("organizationId"),
      searchParams.get("workspaceId")
    );

    const budgets = await prisma.budget.findMany({
      where: {
        organizationId: scope.organizationId,
        ...(scope.workspaceId ? { workspaceId: scope.workspaceId } : {})
      },
      include: { workspace: true, alerts: { orderBy: { createdAt: "desc" }, take: 5 } },
      orderBy: { createdAt: "desc" }
    });

    return ok({ budgets });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const input = budgetSchema.parse(await request.json());
    const scope = await requireFinopsScope(user.id, input.organizationId, input.workspaceId);

    const budget = await prisma.budget.create({
      data: {
        organizationId: scope.organizationId,
        workspaceId: input.workspaceId ?? null,
        createdById: user.id,
        name: input.name,
        period: input.period,
        amountUsd: input.amountUsd,
        thresholdPercent: input.thresholdPercent,
        startsAt: input.startsAt ? new Date(input.startsAt) : new Date(),
        endsAt: input.endsAt ? new Date(input.endsAt) : null
      }
    });

    await writeAuditLog({
      organizationId: budget.organizationId,
      workspaceId: budget.workspaceId,
      actorUserId: user.id,
      action: "BUDGET_CREATED",
      targetType: "BUDGET",
      targetId: budget.id,
      metadata: { name: budget.name, amountUsd: budget.amountUsd.toString() }
    });

    return created({ budget });
  } catch (error) {
    return handleApiError(error);
  }
}
