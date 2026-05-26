import type { AuditAction, AuditTargetType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

type AuditInput = {
  organizationId?: string | null;
  workspaceId?: string | null;
  actorUserId?: string | null;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function writeAuditLog(input: AuditInput) {
  return prisma.auditLog.create({
    data: {
      organizationId: input.organizationId ?? null,
      workspaceId: input.workspaceId ?? null,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null
    }
  });
}
